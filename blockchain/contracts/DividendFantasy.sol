// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DividendFantasy
 * @notice All-in-one contract for NBA fantasy player trading with AMM + dividends
 * @dev Manages multiple player pools, each with constant product AMM (x*y=k)
 *
 * Architecture:
 * - Each player has a virtual AMM pool (virtualShares, virtualCash)
 * - Users buy/sell shares of players using MockUSDC
 * - 1.5% fee on every trade: 67% to dividend pool, 33% to protocol
 * - Weekly dividends: 20% base (all holders) + 80% outperformers
 */
contract DividendFantasy is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============== STRUCTS ==============

    struct Player {
        string name;
        string symbol;
        string playerId;        // External ID (e.g., NBA API ID)
        uint256 virtualShares;  // AMM virtual share reserve
        uint256 virtualCash;    // AMM virtual cash reserve
        uint256 totalShares;    // Total shares outstanding (held by users)
        uint256 projectedPoints; // Season projection (scaled 1e6)
        bool active;
    }

    struct WeeklyPerformance {
        uint256 actualPoints;   // Actual fantasy points (scaled 1e6)
        uint256 projectedPoints; // Weekly projection (scaled 1e6)
        int256 outperformance;   // (actual - projected) / projected (scaled 1e18)
    }

    struct WeeklyDividend {
        uint256 totalPool;
        uint256 basePool;           // 20%
        uint256 outperformerPool;   // 80%
        uint256 totalPositiveOutperf;
        bool distributed;
    }

    // ============== STATE ==============

    IERC20 public paymentToken; // MockUSDC

    // Players
    uint256 public playerCount;
    mapping(uint256 => Player) public players; // playerId index => Player
    mapping(string => uint256) public playerIdToIndex; // external ID => index

    // Holdings: playerIndex => user => shares (scaled 1e6)
    mapping(uint256 => mapping(address => uint256)) public holdings;

    // Snapshot: week-end holdings to prevent dividend gaming
    // week => playerIdx => user => shares at end of that week
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public weekEndHoldings;
    // playerIdx => user => last week that was snapshotted
    mapping(uint256 => mapping(address => uint256)) public lastSnapshotWeek;
    // week => playerIdx => totalShares at distribution time
    mapping(uint256 => mapping(uint256 => uint256)) public weekEndTotalShares;

    // Player existence check (avoids zero-collision on playerIdToIndex)
    mapping(string => bool) public playerIdExists;

    // Fees
    uint256 public constant FEE_BPS = 150; // 1.5%
    uint256 public constant DIVIDEND_FEE_BPS = 6700; // 67% of fee to dividends
    uint256 public constant BPS = 10000;

    // Fee tracking
    uint256 public totalWeeklyFees;
    address public protocolFeeRecipient;

    // Trading pause (used during dividend distribution window)
    bool public tradingPaused;

    // Emergency controls
    bool public killed;  // Permanent shutdown — disables everything except emergency exit
    mapping(address => bool) public blacklisted; // Banned addresses

    // Allowlist — when enabled, only approved wallets can buy
    bool public allowlistEnabled;
    mapping(address => bool) public allowlisted;

    // Dividends
    uint256 public currentWeek;
    mapping(uint256 => mapping(uint256 => WeeklyPerformance)) public weeklyPerformance; // week => playerIdx => perf
    mapping(uint256 => WeeklyDividend) public weeklyDividends; // week => dividend info
    mapping(uint256 => mapping(address => bool)) public hasClaimed; // week => user => claimed
    mapping(uint256 => mapping(uint256 => bool)) public outperformerEligible; // week => playerIdx => eligible for 80% pool

    // ============== EVENTS ==============

    event PlayerAdded(uint256 indexed index, string name, string symbol);
    event Buy(uint256 indexed playerIndex, address indexed buyer, uint256 shares, uint256 cost, uint256 fee);
    event Sell(uint256 indexed playerIndex, address indexed seller, uint256 shares, uint256 revenue, uint256 fee);
    event DividendsDistributed(uint256 indexed week, uint256 totalPool, uint256 basePool, uint256 outperformerPool);
    event DividendClaimed(uint256 indexed week, address indexed user, uint256 amount);
    event WeekAdvanced(uint256 newWeek);
    event TradingPaused(bool paused);
    event EmergencyShutdown(uint256 timestamp);
    event EmergencyDrain(address indexed to, uint256 amount);
    event EmergencyExit(address indexed user, uint256 totalRefund);
    event AddressBlacklisted(address indexed user, bool banned);
    event ForceLiquidation(address indexed user, uint256 indexed playerIndex, uint256 shares, uint256 refund);
    event PlayerPoolReset(uint256 indexed playerIndex, uint256 newShares, uint256 newCash);
    event AllowlistEnabled(bool enabled);
    event AllowlistUpdated(address indexed user, bool allowed);

    // ============== CONSTRUCTOR ==============

    constructor(address _paymentToken, address _protocolFeeRecipient) Ownable(msg.sender) {
        paymentToken = IERC20(_paymentToken);
        protocolFeeRecipient = _protocolFeeRecipient;
        currentWeek = 1;
    }

    // ============== ADMIN: ADD PLAYERS ==============

    /**
     * @notice Add a batch of players (owner only)
     * @param _names Array of player names
     * @param _symbols Array of token symbols
     * @param _playerIds Array of external IDs
     * @param _projectedPoints Array of season projections (scaled 1e6)
     * @param _initialShares Initial virtual shares per pool (scaled 1e6)
     * @param _initialCash Initial virtual cash per pool (scaled 1e6)
     */
    function addPlayers(
        string[] calldata _names,
        string[] calldata _symbols,
        string[] calldata _playerIds,
        uint256[] calldata _projectedPoints,
        uint256 _initialShares,
        uint256 _initialCash
    ) external onlyOwner {
        require(
            _names.length == _symbols.length &&
            _names.length == _playerIds.length &&
            _names.length == _projectedPoints.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < _names.length; i++) {
            uint256 idx = playerCount;
            players[idx] = Player({
                name: _names[i],
                symbol: _symbols[i],
                playerId: _playerIds[i],
                virtualShares: _initialShares,
                virtualCash: _initialCash,
                totalShares: 0,
                projectedPoints: _projectedPoints[i],
                active: true
            });
            playerIdToIndex[_playerIds[i]] = idx;
            playerIdExists[_playerIds[i]] = true;
            playerCount++;

            emit PlayerAdded(idx, _names[i], _symbols[i]);
        }
    }

    // ============== SNAPSHOT HELPERS ==============

    /**
     * @notice Lazily snapshot a user's holdings for all past weeks they missed
     * @dev Called before any buy/sell to lock in week-end balances
     */
    function _snapshotHoldings(uint256 _playerIdx, address _user) internal {
        uint256 snapped = lastSnapshotWeek[_playerIdx][_user];
        uint256 upTo = currentWeek - 1;
        if (snapped < upTo && currentWeek > 1) {
            uint256 currentHolding = holdings[_playerIdx][_user];
            for (uint256 w = snapped + 1; w <= upTo; w++) {
                weekEndHoldings[w][_playerIdx][_user] = currentHolding;
            }
            lastSnapshotWeek[_playerIdx][_user] = upTo;
        }
    }

    // ============== AMM: TRADING ==============

    /**
     * @notice Get current price for a player (scaled 1e6)
     */
    function getPrice(uint256 _playerIdx) public view returns (uint256) {
        Player storage p = players[_playerIdx];
        return (p.virtualCash * 1e6) / p.virtualShares;
    }

    /**
     * @notice Quote: cost to buy shares (before fee)
     */
    function getBuyCost(uint256 _playerIdx, uint256 _sharesOut) public view returns (uint256) {
        Player storage p = players[_playerIdx];
        require(_sharesOut > 0 && _sharesOut < p.virtualShares / 2, "Invalid amount");

        uint256 newShares = p.virtualShares - _sharesOut;
        // Rearranged to avoid overflow: cost = (virtualCash * sharesOut) / newShares
        // Derived from: k = virtualShares * virtualCash, newCash = k / newShares
        // cost = newCash - virtualCash = (virtualCash * sharesOut) / newShares
        uint256 cost = (p.virtualCash * _sharesOut) / newShares;
        return cost;
    }

    /**
     * @notice Quote: revenue from selling shares (before fee)
     */
    function getSellRevenue(uint256 _playerIdx, uint256 _sharesIn) public view returns (uint256) {
        Player storage p = players[_playerIdx];
        require(_sharesIn > 0, "Invalid amount");

        uint256 newShares = p.virtualShares + _sharesIn;
        // Rearranged to avoid overflow: revenue = (virtualCash * sharesIn) / newShares
        // Derived from: k = virtualShares * virtualCash, newCash = k / newShares
        // revenue = virtualCash - newCash = (virtualCash * sharesIn) / newShares
        uint256 revenue = (p.virtualCash * _sharesIn) / newShares;
        return revenue;
    }

    /**
     * @notice Buy player shares
     * @param _playerIdx Player index
     * @param _sharesOut Number of shares to buy (scaled 1e6)
     * @param _maxCost Max willing to pay (slippage protection)
     */
    function buy(uint256 _playerIdx, uint256 _sharesOut, uint256 _maxCost) external nonReentrant {
        require(!killed, "Contract shut down");
        require(!tradingPaused, "Trading paused");
        require(!blacklisted[msg.sender], "Address banned");
        require(!allowlistEnabled || allowlisted[msg.sender], "Not on allowlist");
        require(_playerIdx < playerCount, "Invalid player");
        Player storage p = players[_playerIdx];
        require(p.active, "Player not active");

        uint256 cost = getBuyCost(_playerIdx, _sharesOut);
        uint256 fee = (cost * FEE_BPS) / BPS;
        uint256 totalCost = cost + fee;
        require(totalCost <= _maxCost, "Slippage exceeded");

        // Take payment
        paymentToken.safeTransferFrom(msg.sender, address(this), totalCost);

        // Distribute fee
        uint256 dividendFee = (fee * DIVIDEND_FEE_BPS) / BPS;
        uint256 protocolFee = fee - dividendFee;
        totalWeeklyFees += dividendFee;

        if (protocolFee > 0) {
            paymentToken.safeTransfer(protocolFeeRecipient, protocolFee);
        }

        // Snapshot holdings before modification
        _snapshotHoldings(_playerIdx, msg.sender);

        // Update AMM
        p.virtualShares -= _sharesOut;
        p.virtualCash += cost;
        p.totalShares += _sharesOut;

        // Credit shares to buyer
        holdings[_playerIdx][msg.sender] += _sharesOut;

        emit Buy(_playerIdx, msg.sender, _sharesOut, totalCost, fee);
    }

    /**
     * @notice Sell player shares
     * @param _playerIdx Player index
     * @param _sharesIn Number of shares to sell (scaled 1e6)
     * @param _minRevenue Min to receive (slippage protection)
     */
    function sell(uint256 _playerIdx, uint256 _sharesIn, uint256 _minRevenue) external nonReentrant {
        require(!killed, "Contract shut down");
        require(!tradingPaused, "Trading paused");
        // Note: blacklisted users CAN sell (so they're not trapped), just can't buy
        require(_playerIdx < playerCount, "Invalid player");
        require(holdings[_playerIdx][msg.sender] >= _sharesIn, "Insufficient shares");

        uint256 revenue = getSellRevenue(_playerIdx, _sharesIn);
        uint256 fee = (revenue * FEE_BPS) / BPS;
        uint256 netRevenue = revenue - fee;
        require(netRevenue >= _minRevenue, "Slippage exceeded");

        // Distribute fee
        uint256 dividendFee = (fee * DIVIDEND_FEE_BPS) / BPS;
        uint256 protocolFee = fee - dividendFee;
        totalWeeklyFees += dividendFee;

        if (protocolFee > 0) {
            paymentToken.safeTransfer(protocolFeeRecipient, protocolFee);
        }

        // Snapshot holdings before modification
        _snapshotHoldings(_playerIdx, msg.sender);

        // Update AMM
        Player storage p = players[_playerIdx];
        p.virtualShares += _sharesIn;
        p.virtualCash -= revenue;
        p.totalShares -= _sharesIn;

        // Debit shares from seller
        holdings[_playerIdx][msg.sender] -= _sharesIn;

        // Pay seller
        paymentToken.safeTransfer(msg.sender, netRevenue);

        emit Sell(_playerIdx, msg.sender, _sharesIn, netRevenue, fee);
    }

    // ============== DIVIDENDS ==============

    /**
     * @notice Set weekly performance for multiple players (batch)
     * @param _playerIdxs Array of player indices
     * @param _actualPoints Array of actual points (scaled 1e6)
     */
    function setWeeklyPerformanceBatch(
        uint256[] calldata _playerIdxs,
        uint256[] calldata _actualPoints
    ) external onlyOwner {
        require(_playerIdxs.length == _actualPoints.length, "Length mismatch");

        for (uint256 i = 0; i < _playerIdxs.length; i++) {
            uint256 idx = _playerIdxs[i];
            Player storage p = players[idx];

            // Weekly projection = season / 17 weeks
            uint256 weeklyProjection = p.projectedPoints / 17;

            int256 outperformance = 0;
            if (weeklyProjection > 0) {
                outperformance = (int256(_actualPoints[i]) - int256(weeklyProjection)) * 1e18 / int256(weeklyProjection);
            }

            weeklyPerformance[currentWeek][idx] = WeeklyPerformance({
                actualPoints: _actualPoints[i],
                projectedPoints: weeklyProjection,
                outperformance: outperformance
            });
        }
    }

    /**
     * @notice Set which players are eligible for the outperformer pool (top 30%, sorted off-chain)
     * @param _playerIdxs Array of eligible player indices (only these get the 80% pool)
     */
    function setOutperformerEligible(uint256[] calldata _playerIdxs) external onlyOwner {
        for (uint256 i = 0; i < _playerIdxs.length; i++) {
            outperformerEligible[currentWeek][_playerIdxs[i]] = true;
        }
    }

    /**
     * @notice Distribute dividends for current week
     */
    function distributeDividends() external onlyOwner {
        WeeklyDividend storage wd = weeklyDividends[currentWeek];
        require(!wd.distributed, "Already distributed");
        require(totalWeeklyFees > 0, "No fees");

        wd.totalPool = totalWeeklyFees;
        wd.basePool = (totalWeeklyFees * 2000) / BPS; // 20%
        wd.outperformerPool = totalWeeklyFees - wd.basePool; // 80%

        uint256 totalPositive = 0;
        for (uint256 i = 0; i < playerCount; i++) {
            // Snapshot each player's totalShares at distribution time
            weekEndTotalShares[currentWeek][i] = players[i].totalShares;

            int256 op = weeklyPerformance[currentWeek][i].outperformance;
            if (op > 0 && outperformerEligible[currentWeek][i]) totalPositive += uint256(op);
        }
        wd.totalPositiveOutperf = totalPositive;
        wd.distributed = true;

        emit DividendsDistributed(currentWeek, wd.totalPool, wd.basePool, wd.outperformerPool);
    }

    /**
     * @notice Advance to next week
     */
    function advanceWeek() external onlyOwner {
        require(weeklyDividends[currentWeek].distributed, "Distribute first");
        currentWeek++;
        totalWeeklyFees = 0;
        tradingPaused = false; // Auto-unpause after distribution cycle
        emit WeekAdvanced(currentWeek);
    }

    /**
     * @notice Pause/unpause trading (use during dividend distribution window)
     */
    function setTradingPaused(bool _paused) external onlyOwner {
        tradingPaused = _paused;
        emit TradingPaused(_paused);
    }

    /**
     * @notice Calculate dividend for a user for a week
     */
    function calculateDividend(uint256 _week, address _user) public view returns (uint256) {
        WeeklyDividend storage wd = weeklyDividends[_week];
        if (!wd.distributed) return 0;

        uint256 baseDividend = 0;
        uint256 outperformerDividend = 0;
        uint256 totalUserShares = 0;
        uint256 totalAllShares = 0;

        for (uint256 i = 0; i < playerCount; i++) {
            // Use snapshotted week-end holdings (prevents gaming by buying before claim)
            uint256 userShares = lastSnapshotWeek[i][_user] >= _week
                ? weekEndHoldings[_week][i][_user]
                : holdings[i][_user];
            uint256 playerTotal = weekEndTotalShares[_week][i];

            totalUserShares += userShares;
            totalAllShares += playerTotal;

            int256 op = weeklyPerformance[_week][i].outperformance;
            if (op > 0 && outperformerEligible[_week][i] && wd.totalPositiveOutperf > 0 && playerTotal > 0) {
                uint256 playerPool = (wd.outperformerPool * uint256(op)) / wd.totalPositiveOutperf;
                outperformerDividend += (playerPool * userShares) / playerTotal;
            }
        }

        if (totalAllShares > 0) {
            baseDividend = (wd.basePool * totalUserShares) / totalAllShares;
        }

        return baseDividend + outperformerDividend;
    }

    /**
     * @notice Claim dividend for a week
     */
    function claimDividend(uint256 _week) external nonReentrant {
        require(!killed, "Contract shut down - use emergencyExit");
        require(weeklyDividends[_week].distributed, "Not distributed");
        require(!hasClaimed[_week][msg.sender], "Already claimed");

        uint256 dividend = calculateDividend(_week, msg.sender);
        require(dividend > 0, "No dividend");

        // Cap to contract balance to prevent insolvency
        uint256 balance = paymentToken.balanceOf(address(this));
        if (dividend > balance) {
            dividend = balance;
        }

        hasClaimed[_week][msg.sender] = true;
        paymentToken.safeTransfer(msg.sender, dividend);

        emit DividendClaimed(_week, msg.sender, dividend);
    }

    /**
     * @notice Claim dividends for multiple weeks
     */
    function claimMultipleWeeks(uint256[] calldata _weeks) external nonReentrant {
        require(!killed, "Contract shut down - use emergencyExit");
        uint256 total = 0;
        for (uint256 i = 0; i < _weeks.length; i++) {
            uint256 w = _weeks[i];
            if (weeklyDividends[w].distributed && !hasClaimed[w][msg.sender]) {
                uint256 d = calculateDividend(w, msg.sender);
                if (d > 0) {
                    hasClaimed[w][msg.sender] = true;
                    total += d;
                }
            }
        }
        require(total > 0, "No dividends");

        // Cap to contract balance to prevent insolvency
        uint256 balance = paymentToken.balanceOf(address(this));
        if (total > balance) {
            total = balance;
        }

        paymentToken.safeTransfer(msg.sender, total);
    }

    // ============== EMERGENCY CONTROLS ==============

    /**
     * @notice PERMANENT kill switch — disables all trading and claims
     * @dev Cannot be undone. Users can still call emergencyExit() to withdraw.
     */
    function emergencyShutdown() external onlyOwner {
        killed = true;
        tradingPaused = true;
        emit EmergencyShutdown(block.timestamp);
    }

    /**
     * @notice Fair exit: user sells ALL their shares at current market price
     * @dev Only available after emergency shutdown. Sells each holding through AMM.
     */
    function emergencyExit() external nonReentrant {
        require(killed, "Not in emergency mode");

        uint256 totalRefund = 0;

        for (uint256 i = 0; i < playerCount; i++) {
            uint256 userShares = holdings[i][msg.sender];
            if (userShares == 0) continue;

            // Calculate fair market value via AMM
            Player storage p = players[i];
            uint256 newShares = p.virtualShares + userShares;
            uint256 revenue = (p.virtualCash * userShares) / newShares;

            // Update AMM state
            p.virtualShares = newShares;
            p.virtualCash -= revenue;
            p.totalShares -= userShares;

            // Clear holdings
            holdings[i][msg.sender] = 0;

            totalRefund += revenue;
        }

        require(totalRefund > 0, "Nothing to withdraw");

        // Cap to actual balance
        uint256 bal = paymentToken.balanceOf(address(this));
        if (totalRefund > bal) {
            totalRefund = bal;
        }

        paymentToken.safeTransfer(msg.sender, totalRefund);
        emit EmergencyExit(msg.sender, totalRefund);
    }

    /**
     * @notice Owner drains all D-Bucks from the contract
     * @dev Nuclear option — use when contract needs to be fully abandoned
     */
    function emergencyDrain(address _to) external onlyOwner {
        require(_to != address(0), "Invalid address");
        uint256 bal = paymentToken.balanceOf(address(this));
        require(bal > 0, "Nothing to drain");
        paymentToken.safeTransfer(_to, bal);
        emit EmergencyDrain(_to, bal);
    }

    /**
     * @notice Ban/unban an address from trading
     * @dev Banned users can still sell (so they're not trapped) but can't buy
     */
    function setBlacklist(address _user, bool _banned) external onlyOwner {
        blacklisted[_user] = _banned;
        emit AddressBlacklisted(_user, _banned);
    }

    /**
     * @notice Force liquidate a user's position for a specific player
     * @dev Sells their shares at current AMM price and refunds them
     */
    function forceLiquidate(address _user, uint256 _playerIdx) external onlyOwner {
        require(_playerIdx < playerCount, "Invalid player");
        uint256 userShares = holdings[_playerIdx][_user];
        require(userShares > 0, "No holdings");

        // Snapshot before modification
        _snapshotHoldings(_playerIdx, _user);

        // Calculate fair value via AMM
        Player storage p = players[_playerIdx];
        uint256 newShares = p.virtualShares + userShares;
        uint256 revenue = (p.virtualCash * userShares) / newShares;

        // Update AMM
        p.virtualShares = newShares;
        p.virtualCash -= revenue;
        p.totalShares -= userShares;

        // Clear holdings
        holdings[_playerIdx][_user] = 0;

        // Refund user (no fee on forced liquidation)
        uint256 bal = paymentToken.balanceOf(address(this));
        uint256 refund = revenue > bal ? bal : revenue;
        if (refund > 0) {
            paymentToken.safeTransfer(_user, refund);
        }

        emit ForceLiquidation(_user, _playerIdx, userShares, refund);
    }

    /**
     * @notice Reset a player's AMM pool back to initial values
     * @dev Use if a pool gets manipulated. Does NOT affect user holdings.
     * @param _playerIdx Player to reset
     * @param _newShares New virtual shares (e.g., 1000e6)
     * @param _newCash New virtual cash (e.g., 10000e6)
     */
    function resetPlayerPool(uint256 _playerIdx, uint256 _newShares, uint256 _newCash) external onlyOwner {
        require(_playerIdx < playerCount, "Invalid player");
        Player storage p = players[_playerIdx];
        p.virtualShares = _newShares;
        p.virtualCash = _newCash;
        emit PlayerPoolReset(_playerIdx, _newShares, _newCash);
    }

    /**
     * @notice Deactivate/reactivate a specific player
     * @dev Deactivated players can't be bought but can still be sold
     */
    function setPlayerActive(uint256 _playerIdx, bool _active) external onlyOwner {
        require(_playerIdx < playerCount, "Invalid player");
        players[_playerIdx].active = _active;
    }

    /**
     * @notice Skip current week — advance without distributing dividends
     * @dev Use when weekly data is bad or missing. Fees roll over to next week.
     */
    function skipWeek() external onlyOwner {
        // Mark as distributed (with zero pools) so advanceWeek can proceed
        WeeklyDividend storage wd = weeklyDividends[currentWeek];
        if (!wd.distributed) {
            wd.distributed = true;
            // totalPool stays 0 — no one can claim for this week
            // totalWeeklyFees carry over to next week
        }
        currentWeek++;
        tradingPaused = false;
        emit WeekAdvanced(currentWeek);
    }

    // ============== ALLOWLIST ==============

    /**
     * @notice Toggle allowlist on/off (owner only)
     * @param _enabled True to restrict buys to allowlisted addresses
     */
    function setAllowlistEnabled(bool _enabled) external onlyOwner {
        allowlistEnabled = _enabled;
        emit AllowlistEnabled(_enabled);
    }

    /**
     * @notice Add or remove a single address from the allowlist
     */
    function setAllowlist(address _user, bool _allowed) external onlyOwner {
        allowlisted[_user] = _allowed;
        emit AllowlistUpdated(_user, _allowed);
    }

    /**
     * @notice Batch add/remove addresses from the allowlist
     */
    function setAllowlistBatch(address[] calldata _users, bool _allowed) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            allowlisted[_users[i]] = _allowed;
            emit AllowlistUpdated(_users[i], _allowed);
        }
    }

    // ============== VIEW FUNCTIONS ==============

    /**
     * @notice Get full buy quote
     */
    function getBuyQuote(uint256 _playerIdx, uint256 _sharesOut) external view returns (
        uint256 cost, uint256 fee, uint256 total, uint256 newPrice
    ) {
        cost = getBuyCost(_playerIdx, _sharesOut);
        fee = (cost * FEE_BPS) / BPS;
        total = cost + fee;
        Player storage p = players[_playerIdx];
        uint256 newShares = p.virtualShares - _sharesOut;
        uint256 newCash = p.virtualCash + cost;
        newPrice = (newCash * 1e6) / newShares;
    }

    /**
     * @notice Get full sell quote
     */
    function getSellQuote(uint256 _playerIdx, uint256 _sharesIn) external view returns (
        uint256 revenue, uint256 fee, uint256 net, uint256 newPrice
    ) {
        revenue = getSellRevenue(_playerIdx, _sharesIn);
        fee = (revenue * FEE_BPS) / BPS;
        net = revenue - fee;
        Player storage p = players[_playerIdx];
        uint256 newShares = p.virtualShares + _sharesIn;
        uint256 newCash = p.virtualCash - revenue;
        newPrice = (newCash * 1e6) / newShares;
    }

    /**
     * @notice Get user's portfolio (all holdings)
     */
    function getPortfolio(address _user) external view returns (
        uint256[] memory playerIdxs,
        uint256[] memory shares,
        uint256[] memory values
    ) {
        // Count non-zero holdings
        uint256 count = 0;
        for (uint256 i = 0; i < playerCount; i++) {
            if (holdings[i][_user] > 0) count++;
        }

        playerIdxs = new uint256[](count);
        shares = new uint256[](count);
        values = new uint256[](count);

        uint256 j = 0;
        for (uint256 i = 0; i < playerCount; i++) {
            uint256 h = holdings[i][_user];
            if (h > 0) {
                playerIdxs[j] = i;
                shares[j] = h;
                // Value = shares * current price
                values[j] = (h * getPrice(i)) / 1e6;
                j++;
            }
        }
    }

    /**
     * @notice Get unclaimed dividends for a user
     */
    function getUnclaimedDividends(address _user) external view returns (uint256 total, uint256 weekCount) {
        total = 0;
        weekCount = 0;
        for (uint256 w = 1; w <= currentWeek; w++) {
            if (weeklyDividends[w].distributed && !hasClaimed[w][_user]) {
                uint256 d = calculateDividend(w, _user);
                if (d > 0) {
                    total += d;
                    weekCount++;
                }
            }
        }
    }

    /**
     * @notice Get all player info for frontend
     */
    function getAllPlayers() external view returns (
        string[] memory names,
        string[] memory symbols,
        uint256[] memory prices,
        uint256[] memory totalSharesArr
    ) {
        names = new string[](playerCount);
        symbols = new string[](playerCount);
        prices = new uint256[](playerCount);
        totalSharesArr = new uint256[](playerCount);

        for (uint256 i = 0; i < playerCount; i++) {
            names[i] = players[i].name;
            symbols[i] = players[i].symbol;
            prices[i] = getPrice(i);
            totalSharesArr[i] = players[i].totalShares;
        }
    }
}
