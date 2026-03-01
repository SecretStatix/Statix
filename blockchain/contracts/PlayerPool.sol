// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IPlayerPool.sol";

/**
 * @title PlayerPool
 * @notice Per-player AMM pool. One deployed per player via PoolFactory.
 *         Constant product AMM (x*y=k), same math as original DividendFantasy.
 *
 * Access control:
 *   - Only Router can call executeBuy/executeSell/emergency functions
 *   - Only DividendHub can call snapshot functions
 *   - Views are public
 */
contract PlayerPool is IPlayerPool {
    using SafeERC20 for IERC20;

    // ============== CONSTANTS ==============

    uint256 public constant FEE_BPS = 150;          // 1.5%
    uint256 public constant DIVIDEND_FEE_BPS = 6700; // 67% of fee -> dividends
    uint256 public constant BPS = 10000;

    // ============== IMMUTABLES ==============

    IERC20 public immutable paymentToken;  // DBucks
    address public immutable router;
    address public immutable dividendHub;

    // ============== STATE ==============

    string public override name;
    string public override symbol;
    string public override playerId;
    uint256 public override projectedPoints;

    uint256 public override virtualShares;
    uint256 public override virtualCash;
    uint256 public override totalShares;
    bool public override active;

    // Holdings: user => shares (scaled 1e6)
    mapping(address => uint256) public override holdings;

    // Snapshots: week => user => shares at end of that week
    mapping(uint256 => mapping(address => uint256)) public override weekEndHoldings;
    // user => last week that was snapshotted
    mapping(address => uint256) public override lastSnapshotWeek;

    // ============== MODIFIERS ==============

    modifier onlyRouter() {
        require(msg.sender == router, "Only router");
        _;
    }

    modifier onlyHub() {
        require(msg.sender == dividendHub, "Only hub");
        _;
    }

    // ============== CONSTRUCTOR ==============

    constructor(
        address _paymentToken,
        address _router,
        address _dividendHub,
        string memory _name,
        string memory _symbol,
        string memory _playerId,
        uint256 _projectedPoints,
        uint256 _initialShares,
        uint256 _initialCash
    ) {
        paymentToken = IERC20(_paymentToken);
        router = _router;
        dividendHub = _dividendHub;
        name = _name;
        symbol = _symbol;
        playerId = _playerId;
        projectedPoints = _projectedPoints;
        virtualShares = _initialShares;
        virtualCash = _initialCash;
        active = true;
    }

    // ============== SNAPSHOT (lazy) ==============

    function _snapshotHoldings(address _user, uint256 _currentWeek) internal {
        uint256 snapped = lastSnapshotWeek[_user];
        uint256 upTo = _currentWeek - 1;
        if (snapped < upTo && _currentWeek > 1) {
            uint256 currentHolding = holdings[_user];
            for (uint256 w = snapped + 1; w <= upTo; w++) {
                weekEndHoldings[w][_user] = currentHolding;
            }
            lastSnapshotWeek[_user] = upTo;
        }
    }

    // ============== VIEWS ==============

    function getPrice() public view override returns (uint256) {
        return (virtualCash * 1e6) / virtualShares;
    }

    function getBuyCost(uint256 _sharesOut) public view override returns (uint256) {
        require(_sharesOut > 0 && _sharesOut < virtualShares / 2, "Invalid amount");
        uint256 newShares = virtualShares - _sharesOut;
        return (virtualCash * _sharesOut) / newShares;
    }

    function getSellRevenue(uint256 _sharesIn) public view override returns (uint256) {
        require(_sharesIn > 0, "Invalid amount");
        uint256 newShares = virtualShares + _sharesIn;
        return (virtualCash * _sharesIn) / newShares;
    }

    // ============== TRADING (Router only) ==============

    /**
     * @notice Execute a buy. Router has already transferred totalCost of DBucks to this pool.
     * @return totalCost The total cost including fee
     * @return dividendFee 67% of fee -> Hub
     * @return protocolFee 33% of fee -> Router
     */
    function executeBuy(
        address buyer,
        uint256 sharesOut,
        uint256 maxCost
    ) external override onlyRouter returns (uint256 totalCost, uint256 dividendFee, uint256 protocolFee) {
        require(active, "Player not active");

        uint256 cost = getBuyCost(sharesOut);
        uint256 fee = (cost * FEE_BPS) / BPS;
        totalCost = cost + fee;
        require(totalCost <= maxCost, "Slippage exceeded");

        dividendFee = (fee * DIVIDEND_FEE_BPS) / BPS;
        protocolFee = fee - dividendFee;

        // Read currentWeek from hub for snapshot
        uint256 currentWeek = IDividendHubWeek(dividendHub).currentWeek();
        _snapshotHoldings(buyer, currentWeek);

        // Update AMM
        virtualShares -= sharesOut;
        virtualCash += cost;
        totalShares += sharesOut;

        // Credit shares
        holdings[buyer] += sharesOut;

        // Send fees out
        if (dividendFee > 0) {
            paymentToken.safeTransfer(dividendHub, dividendFee);
        }
        if (protocolFee > 0) {
            paymentToken.safeTransfer(router, protocolFee);
        }
    }

    /**
     * @notice Execute a sell. Pool pays seller directly.
     * @return netRevenue Amount paid to seller
     * @return dividendFee 67% of fee -> Hub
     * @return protocolFee 33% of fee -> Router
     */
    function executeSell(
        address seller,
        uint256 sharesIn,
        uint256 minRevenue
    ) external override onlyRouter returns (uint256 netRevenue, uint256 dividendFee, uint256 protocolFee) {
        require(holdings[seller] >= sharesIn, "Insufficient shares");

        uint256 revenue = getSellRevenue(sharesIn);
        uint256 fee = (revenue * FEE_BPS) / BPS;
        netRevenue = revenue - fee;
        require(netRevenue >= minRevenue, "Slippage exceeded");

        dividendFee = (fee * DIVIDEND_FEE_BPS) / BPS;
        protocolFee = fee - dividendFee;

        // Read currentWeek from hub for snapshot
        uint256 currentWeek = IDividendHubWeek(dividendHub).currentWeek();
        _snapshotHoldings(seller, currentWeek);

        // Update AMM
        virtualShares += sharesIn;
        virtualCash -= revenue;
        totalShares -= sharesIn;

        // Debit shares
        holdings[seller] -= sharesIn;

        // Pay seller
        paymentToken.safeTransfer(seller, netRevenue);

        // Send fees out
        if (dividendFee > 0) {
            paymentToken.safeTransfer(dividendHub, dividendFee);
        }
        if (protocolFee > 0) {
            paymentToken.safeTransfer(router, protocolFee);
        }
    }

    // ============== SNAPSHOTS (Hub only) ==============

    function snapshotTotalShares() external override onlyHub returns (uint256) {
        return totalShares;
    }

    function snapshotUserHoldings(uint256 week, address user) external override onlyHub {
        _snapshotHoldings(user, week + 1); // +1 because _snapshotHoldings snapshots up to week-1
    }

    // ============== EMERGENCY (Router only) ==============

    function emergencyExitUser(address user) external override onlyRouter returns (uint256 refund) {
        uint256 userShares = holdings[user];
        if (userShares == 0) return 0;

        uint256 newShares = virtualShares + userShares;
        refund = (virtualCash * userShares) / newShares;

        virtualShares = newShares;
        virtualCash -= refund;
        totalShares -= userShares;
        holdings[user] = 0;

        // Transfer refund to router (which forwards to user)
        if (refund > 0) {
            uint256 bal = paymentToken.balanceOf(address(this));
            if (refund > bal) refund = bal;
            paymentToken.safeTransfer(router, refund);
        }
    }

    function forceLiquidate(address user) external override onlyRouter returns (uint256 shares, uint256 refund) {
        shares = holdings[user];
        require(shares > 0, "No holdings");

        // Read currentWeek from hub for snapshot
        uint256 currentWeek = IDividendHubWeek(dividendHub).currentWeek();
        _snapshotHoldings(user, currentWeek);

        uint256 newShares = virtualShares + shares;
        refund = (virtualCash * shares) / newShares;

        virtualShares = newShares;
        virtualCash -= refund;
        totalShares -= shares;
        holdings[user] = 0;

        // Transfer refund to router (which forwards to user)
        if (refund > 0) {
            uint256 bal = paymentToken.balanceOf(address(this));
            if (refund > bal) refund = bal;
            paymentToken.safeTransfer(router, refund);
        }
    }

    function resetPool(uint256 newShares, uint256 newCash) external override onlyRouter {
        virtualShares = newShares;
        virtualCash = newCash;
    }

    function setActive(bool _active) external override onlyRouter {
        active = _active;
    }
}

// Minimal interface to read currentWeek from DividendHub
interface IDividendHubWeek {
    function currentWeek() external view returns (uint256);
}
