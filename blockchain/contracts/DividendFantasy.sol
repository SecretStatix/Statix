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

    // Fees
    uint256 public constant FEE_BPS = 150; // 1.5%
    uint256 public constant DIVIDEND_FEE_BPS = 6700; // 67% of fee to dividends
    uint256 public constant BPS = 10000;

    // Fee tracking
    uint256 public totalWeeklyFees;
    address public protocolFeeRecipient;

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
            playerCount++;

            emit PlayerAdded(idx, _names[i], _symbols[i]);
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
        emit WeekAdvanced(currentWeek);
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
            uint256 userShares = holdings[i][_user];
            uint256 playerTotal = players[i].totalShares;

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
        require(weeklyDividends[_week].distributed, "Not distributed");
        require(!hasClaimed[_week][msg.sender], "Already claimed");

        uint256 dividend = calculateDividend(_week, msg.sender);
        require(dividend > 0, "No dividend");

        hasClaimed[_week][msg.sender] = true;
        paymentToken.safeTransfer(msg.sender, dividend);

        emit DividendClaimed(_week, msg.sender, dividend);
    }

    /**
     * @notice Claim dividends for multiple weeks
     */
    function claimMultipleWeeks(uint256[] calldata _weeks) external nonReentrant {
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
        paymentToken.safeTransfer(msg.sender, total);
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
