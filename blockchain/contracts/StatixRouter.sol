// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IPlayerPool.sol";
import "./PoolFactory.sol";
/**
 * @title StatixRouter
 * @notice Single entry point for all user trades. Users approve Router once for DBucks.
 *         Routes buy/sell calls to individual PlayerPool contracts.
 *         Holds global controls: kill switch, trading pause, blacklist, allowlist.
 *         Stores configurable fee parameters that pools read at trade time.
 */
contract StatixRouter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============== STATE ==============

    IERC20 public paymentToken;     // DBucks
    PoolFactory public factory;
    address public protocolFeeRecipient;

    // Configurable fee parameters (readable by pools)
    uint256 public feeBps = 150;            // 1.5% total fee (max 500 = 5%)
    uint256 public dividendFeeBps = 6700;   // 67% of fee to dividends (max 10000 = 100%)

    // Global controls
    bool public killed;
    bool public tradingPaused;
    mapping(address => bool) public blacklisted;
    bool public allowlistEnabled;
    mapping(address => bool) public allowlisted;

    // ============== EVENTS ==============

    event Buy(uint256 indexed poolIndex, address indexed buyer, uint256 shares, uint256 cost, uint256 fee);
    event Sell(uint256 indexed poolIndex, address indexed seller, uint256 shares, uint256 revenue, uint256 fee);
    event EmergencyShutdown(uint256 timestamp);
    event EmergencyDrain(address indexed to, uint256 amount);
    event EmergencyExit(address indexed user, uint256 totalRefund);
    event ForceLiquidation(address indexed user, uint256 indexed poolIndex, uint256 shares, uint256 refund);
    event PlayerPoolReset(uint256 indexed poolIndex, uint256 newShares, uint256 newCash);
    event TradingPaused(bool paused);
    event AddressBlacklisted(address indexed user, bool banned);
    event AllowlistEnabled(bool enabled);
    event AllowlistUpdated(address indexed user, bool allowed);
    event FeeBpsUpdated(uint256 oldBps, uint256 newBps);
    event DividendFeeBpsUpdated(uint256 oldBps, uint256 newBps);
    event ProtocolFeeRecipientUpdated(address oldRecipient, address newRecipient);

    // ============== CONSTRUCTOR ==============

    constructor(
        address _paymentToken,
        address _factory,
        address _protocolFeeRecipient
    ) Ownable(msg.sender) {
        paymentToken = IERC20(_paymentToken);
        factory = PoolFactory(_factory);
        protocolFeeRecipient = _protocolFeeRecipient;
    }

    // ============== FEE CONFIGURATION ==============

    /**
     * @notice Update the total fee percentage charged on trades.
     * @param _feeBps New fee in basis points (e.g. 150 = 1.5%). Max 500 (5%).
     */
    function setFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 500, "Fee too high (max 5%)");
        uint256 old = feeBps;
        feeBps = _feeBps;
        emit FeeBpsUpdated(old, _feeBps);
    }

    /**
     * @notice Update the share of fees that go to the dividend pool (vs protocol).
     * @param _dividendFeeBps Portion in basis points (e.g. 6700 = 67%). Max 10000 (100%).
     */
    function setDividendFeeBps(uint256 _dividendFeeBps) external onlyOwner {
        require(_dividendFeeBps <= 10000, "Cannot exceed 100%");
        uint256 old = dividendFeeBps;
        dividendFeeBps = _dividendFeeBps;
        emit DividendFeeBpsUpdated(old, _dividendFeeBps);
    }

    /**
     * @notice Update the protocol fee recipient address.
     */
    function setProtocolFeeRecipient(address _recipient) external onlyOwner {
        require(_recipient != address(0), "Zero address");
        address old = protocolFeeRecipient;
        protocolFeeRecipient = _recipient;
        emit ProtocolFeeRecipientUpdated(old, _recipient);
    }

    // ============== TRADING ==============

    /**
     * @notice Buy player shares. User must have approved Router for DBucks.
     * @param _poolIndex Pool index in factory registry
     * @param _sharesOut Number of shares to buy (scaled 1e6)
     * @param _maxCost Max willing to pay (slippage protection)
     */
    function buy(uint256 _poolIndex, uint256 _sharesOut, uint256 _maxCost) external nonReentrant {
        require(!killed, "Contract shut down");
        require(!tradingPaused, "Trading paused");
        require(!blacklisted[msg.sender], "Address banned");
        require(!allowlistEnabled || allowlisted[msg.sender], "Not on allowlist");

        address poolAddr = factory.pools(_poolIndex);
        require(poolAddr != address(0), "Invalid pool");

        IPlayerPool pool = IPlayerPool(poolAddr);

        // Calculate cost first so we know how much to transfer
        uint256 rawCost = pool.getBuyCost(_sharesOut);
        uint256 fee = (rawCost * feeBps) / 10000;
        uint256 totalCost = rawCost + fee;
        require(totalCost <= _maxCost, "Slippage exceeded");

        // Transfer DBucks from user to pool
        paymentToken.safeTransferFrom(msg.sender, poolAddr, totalCost);

        // Execute buy — pool sends fees to hub and back to router
        (uint256 actualCost, uint256 dividendFee, uint256 protocolFee) = pool.executeBuy(msg.sender, _sharesOut, _maxCost);

        // Forward protocol fee to recipient
        if (protocolFee > 0) {
            paymentToken.safeTransfer(protocolFeeRecipient, protocolFee);
        }

        emit Buy(_poolIndex, msg.sender, _sharesOut, actualCost, dividendFee + protocolFee);
    }

    /**
     * @notice Sell player shares. Pool pays seller directly.
     * @param _poolIndex Pool index in factory registry
     * @param _sharesIn Number of shares to sell (scaled 1e6)
     * @param _minRevenue Min to receive (slippage protection)
     */
    function sell(uint256 _poolIndex, uint256 _sharesIn, uint256 _minRevenue) external nonReentrant {
        require(!killed, "Contract shut down");
        require(!tradingPaused, "Trading paused");
        // Blacklisted users CAN sell (not trapped), just can't buy

        address poolAddr = factory.pools(_poolIndex);
        require(poolAddr != address(0), "Invalid pool");

        IPlayerPool pool = IPlayerPool(poolAddr);

        // Execute sell — pool pays seller directly, sends fees to hub and router
        (uint256 netRevenue, uint256 dividendFee, uint256 protocolFee) = pool.executeSell(msg.sender, _sharesIn, _minRevenue);

        // Forward protocol fee to recipient
        if (protocolFee > 0) {
            paymentToken.safeTransfer(protocolFeeRecipient, protocolFee);
        }

        emit Sell(_poolIndex, msg.sender, _sharesIn, netRevenue, dividendFee + protocolFee);
    }

    // ============== EMERGENCY CONTROLS ==============

    function emergencyShutdown() external onlyOwner {
        killed = true;
        tradingPaused = true;
        emit EmergencyShutdown(block.timestamp);
    }

    /**
     * @notice Fair exit: user sells ALL positions across all pools at AMM price.
     *         Only available after emergency shutdown.
     */
    function emergencyExit() external nonReentrant {
        require(killed, "Not in emergency mode");

        uint256 totalRefund = 0;
        uint256 count = factory.poolCount();

        for (uint256 i = 0; i < count; i++) {
            address poolAddr = factory.pools(i);
            if (poolAddr == address(0)) continue;

            IPlayerPool pool = IPlayerPool(poolAddr);
            if (pool.holdings(msg.sender) == 0) continue;

            uint256 refund = pool.emergencyExitUser(msg.sender);
            totalRefund += refund;
        }

        require(totalRefund > 0, "Nothing to withdraw");

        // Router received refunds from pools, forward to user
        paymentToken.safeTransfer(msg.sender, totalRefund);
        emit EmergencyExit(msg.sender, totalRefund);
    }

    /**
     * @notice Drain all funds from all pools and the router itself to a safe address.
     *         Only available after emergency shutdown.
     */
    function emergencyDrain(address _to) external onlyOwner {
        require(killed, "Must shutdown first");
        require(_to != address(0), "Invalid address");

        uint256 totalDrained = 0;

        // Drain from all pools
        uint256 count = factory.poolCount();
        for (uint256 i = 0; i < count; i++) {
            address poolAddr = factory.pools(i);
            if (poolAddr == address(0)) continue;
            uint256 drained = IPlayerPool(poolAddr).drain(address(this));
            totalDrained += drained;
        }

        // Drain router's own balance (including what just arrived from pools)
        uint256 routerBal = paymentToken.balanceOf(address(this));
        if (routerBal > 0) {
            paymentToken.safeTransfer(_to, routerBal);
            totalDrained = routerBal; // total sent to _to
        }

        require(totalDrained > 0, "Nothing to drain");
        emit EmergencyDrain(_to, totalDrained);
    }

    function forceLiquidate(address _user, uint256 _poolIndex) external onlyOwner {
        address poolAddr = factory.pools(_poolIndex);
        require(poolAddr != address(0), "Invalid pool");

        IPlayerPool pool = IPlayerPool(poolAddr);
        (uint256 shares, uint256 refund) = pool.forceLiquidate(_user);

        // Router received refund from pool, forward to user (no fee on forced liquidation)
        if (refund > 0) {
            paymentToken.safeTransfer(_user, refund);
        }

        emit ForceLiquidation(_user, _poolIndex, shares, refund);
    }

    function resetPlayerPool(uint256 _poolIndex, uint256 _newShares, uint256 _newCash) external onlyOwner {
        address poolAddr = factory.pools(_poolIndex);
        require(poolAddr != address(0), "Invalid pool");
        IPlayerPool(poolAddr).resetPool(_newShares, _newCash);
        emit PlayerPoolReset(_poolIndex, _newShares, _newCash);
    }

    function setPlayerActive(uint256 _poolIndex, bool _active) external onlyOwner {
        address poolAddr = factory.pools(_poolIndex);
        require(poolAddr != address(0), "Invalid pool");
        IPlayerPool(poolAddr).setActive(_active);
    }

    // ============== GLOBAL CONTROLS ==============

    function setTradingPaused(bool _paused) external onlyOwner {
        tradingPaused = _paused;
        emit TradingPaused(_paused);
    }

    function setBlacklist(address _user, bool _banned) external onlyOwner {
        blacklisted[_user] = _banned;
        emit AddressBlacklisted(_user, _banned);
    }

    function setAllowlistEnabled(bool _enabled) external onlyOwner {
        allowlistEnabled = _enabled;
        emit AllowlistEnabled(_enabled);
    }

    function setAllowlist(address _user, bool _allowed) external onlyOwner {
        allowlisted[_user] = _allowed;
        emit AllowlistUpdated(_user, _allowed);
    }

    function setAllowlistBatch(address[] calldata _users, bool _allowed) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            allowlisted[_users[i]] = _allowed;
            emit AllowlistUpdated(_users[i], _allowed);
        }
    }

    // ============== VIEW FUNCTIONS ==============

    function getPrice(uint256 _poolIndex) external view returns (uint256) {
        address poolAddr = factory.pools(_poolIndex);
        require(poolAddr != address(0), "Invalid pool");
        return IPlayerPool(poolAddr).getPrice();
    }

    function getBuyQuote(uint256 _poolIndex, uint256 _sharesOut) external view returns (
        uint256 cost, uint256 fee, uint256 total, uint256 newPrice
    ) {
        address poolAddr = factory.pools(_poolIndex);
        require(poolAddr != address(0), "Invalid pool");
        IPlayerPool pool = IPlayerPool(poolAddr);

        cost = pool.getBuyCost(_sharesOut);
        fee = (cost * feeBps) / 10000;
        total = cost + fee;
        uint256 newShares = pool.virtualShares() - _sharesOut;
        uint256 newCash = pool.virtualCash() + cost;
        newPrice = (newCash * 1e6) / newShares;
    }

    function getSellQuote(uint256 _poolIndex, uint256 _sharesIn) external view returns (
        uint256 revenue, uint256 fee, uint256 net, uint256 newPrice
    ) {
        address poolAddr = factory.pools(_poolIndex);
        require(poolAddr != address(0), "Invalid pool");
        IPlayerPool pool = IPlayerPool(poolAddr);

        revenue = pool.getSellRevenue(_sharesIn);
        fee = (revenue * feeBps) / 10000;
        net = revenue - fee;
        uint256 newShares = pool.virtualShares() + _sharesIn;
        uint256 newCash = pool.virtualCash() - revenue;
        newPrice = (newCash * 1e6) / newShares;
    }

    function getHoldings(uint256 _poolIndex, address _user) external view returns (uint256) {
        address poolAddr = factory.pools(_poolIndex);
        if (poolAddr == address(0)) return 0;
        return IPlayerPool(poolAddr).holdings(_user);
    }

    function getPortfolio(address _user) external view returns (
        uint256[] memory poolIdxs,
        uint256[] memory shares,
        uint256[] memory values
    ) {
        uint256 count = factory.poolCount();

        // Count non-zero holdings
        uint256 held = 0;
        for (uint256 i = 0; i < count; i++) {
            address poolAddr = factory.pools(i);
            if (poolAddr != address(0) && IPlayerPool(poolAddr).holdings(_user) > 0) {
                held++;
            }
        }

        poolIdxs = new uint256[](held);
        shares = new uint256[](held);
        values = new uint256[](held);

        uint256 j = 0;
        for (uint256 i = 0; i < count; i++) {
            address poolAddr = factory.pools(i);
            if (poolAddr == address(0)) continue;
            IPlayerPool pool = IPlayerPool(poolAddr);
            uint256 h = pool.holdings(_user);
            if (h > 0) {
                poolIdxs[j] = i;
                shares[j] = h;
                values[j] = (h * pool.getPrice()) / 1e6;
                j++;
            }
        }
    }

    /**
     * @notice Paginated portfolio — scan pools[_offset .. _offset+_limit) for user holdings.
     */
    function getPortfolioPaginated(address _user, uint256 _offset, uint256 _limit) external view returns (
        uint256[] memory poolIdxs,
        uint256[] memory sharesArr,
        uint256[] memory valuesArr
    ) {
        uint256 count = factory.poolCount();
        uint256 end = _offset + _limit;
        if (end > count) end = count;

        // First pass: count holdings in range
        uint256 held = 0;
        for (uint256 i = _offset; i < end; i++) {
            address poolAddr = factory.pools(i);
            if (poolAddr != address(0) && IPlayerPool(poolAddr).holdings(_user) > 0) {
                held++;
            }
        }

        poolIdxs = new uint256[](held);
        sharesArr = new uint256[](held);
        valuesArr = new uint256[](held);

        uint256 j = 0;
        for (uint256 i = _offset; i < end; i++) {
            address poolAddr = factory.pools(i);
            if (poolAddr == address(0)) continue;
            IPlayerPool pool = IPlayerPool(poolAddr);
            uint256 h = pool.holdings(_user);
            if (h > 0) {
                poolIdxs[j] = i;
                sharesArr[j] = h;
                valuesArr[j] = (h * pool.getPrice()) / 1e6;
                j++;
            }
        }
    }

    function getAllPlayers() external view returns (
        string[] memory names,
        string[] memory symbols,
        uint256[] memory prices,
        uint256[] memory totalSharesArr
    ) {
        uint256 count = factory.poolCount();
        names = new string[](count);
        symbols = new string[](count);
        prices = new uint256[](count);
        totalSharesArr = new uint256[](count);

        for (uint256 i = 0; i < count; i++) {
            address poolAddr = factory.pools(i);
            if (poolAddr == address(0)) continue;
            IPlayerPool pool = IPlayerPool(poolAddr);
            names[i] = pool.name();
            symbols[i] = pool.symbol();
            prices[i] = pool.getPrice();
            totalSharesArr[i] = pool.totalShares();
        }
    }

    /**
     * @notice Paginated player list — returns players[_offset .. _offset+_limit).
     */
    function getAllPlayersPaginated(uint256 _offset, uint256 _limit) external view returns (
        string[] memory names,
        string[] memory symbols,
        uint256[] memory prices,
        uint256[] memory totalSharesArr
    ) {
        uint256 count = factory.poolCount();
        uint256 end = _offset + _limit;
        if (end > count) end = count;
        uint256 size = end > _offset ? end - _offset : 0;

        names = new string[](size);
        symbols = new string[](size);
        prices = new uint256[](size);
        totalSharesArr = new uint256[](size);

        for (uint256 i = 0; i < size; i++) {
            address poolAddr = factory.pools(_offset + i);
            if (poolAddr == address(0)) continue;
            IPlayerPool pool = IPlayerPool(poolAddr);
            names[i] = pool.name();
            symbols[i] = pool.symbol();
            prices[i] = pool.getPrice();
            totalSharesArr[i] = pool.totalShares();
        }
    }
}
