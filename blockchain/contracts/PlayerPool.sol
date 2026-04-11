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
 *
 * Fee parameters are read from Router at trade time so the owner can
 * update fees once on the Router and every pool picks them up immediately.
 */
contract PlayerPool is IPlayerPool {
    using SafeERC20 for IERC20;

    // ============== CONSTANTS ==============

    uint256 public constant BPS = 10000;

    // ============== IMMUTABLES ==============

    IERC20 public immutable paymentToken;  // DBucks
    address public immutable router;
    address public immutable dividendHub;

    // ============== STATE ==============

    string public override name;
    string public override symbol;
    string public override playerId;

    uint256 public override virtualShares;
    uint256 public override virtualCash;
    uint256 public override totalShares;
    bool public override active;

    // LP tracking: initial reserves get "house" liquidity (non-withdrawable).
    // Additional deposits mint LP tokens the owner can burn to withdraw.
    uint256 public override totalLiquidity;
    uint256 public override lpLiquidity;

    // Holdings: user => shares (scaled 1e6)
    mapping(address => uint256) public override holdings;


    // ============== MODIFIERS ==============

    modifier onlyRouter() {
        require(msg.sender == router, "Only router");
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
        uint256 _initialShares,
        uint256 _initialCash
    ) {
        paymentToken = IERC20(_paymentToken);
        router = _router;
        dividendHub = _dividendHub;
        name = _name;
        symbol = _symbol;
        playerId = _playerId;
        virtualShares = _initialShares;
        virtualCash = _initialCash;
        totalLiquidity = _initialCash;
        active = true;
    }

    // ============== FEE READS ==============

    function _feeBps() internal view returns (uint256) {
        return IFeeConfig(router).feeBps();
    }

    function _dividendFeeBps() internal view returns (uint256) {
        return IFeeConfig(router).dividendFeeBps();
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
     * @return dividendFee Share of fee sent to Hub
     * @return protocolFee Share of fee sent back to Router
     */
    function executeBuy(
        address buyer,
        uint256 sharesOut,
        uint256 maxCost
    ) external override onlyRouter returns (uint256 totalCost, uint256 dividendFee, uint256 protocolFee) {
        require(active, "Player not active");

        uint256 currentFeeBps = _feeBps();
        uint256 currentDividendFeeBps = _dividendFeeBps();

        uint256 cost = getBuyCost(sharesOut);
        uint256 fee = (cost * currentFeeBps) / BPS;
        totalCost = cost + fee;
        require(totalCost <= maxCost, "Slippage exceeded");

        dividendFee = (fee * currentDividendFeeBps) / BPS;
        protocolFee = fee - dividendFee;

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
     * @return dividendFee Share of fee sent to Hub
     * @return protocolFee Share of fee sent back to Router
     */
    function executeSell(
        address seller,
        uint256 sharesIn,
        uint256 minRevenue
    ) external override onlyRouter returns (uint256 netRevenue, uint256 dividendFee, uint256 protocolFee) {
        require(holdings[seller] >= sharesIn, "Insufficient shares");

        uint256 currentFeeBps = _feeBps();
        uint256 currentDividendFeeBps = _dividendFeeBps();

        uint256 revenue = getSellRevenue(sharesIn);
        uint256 fee = (revenue * currentFeeBps) / BPS;
        netRevenue = revenue - fee;
        require(netRevenue >= minRevenue, "Slippage exceeded");

        dividendFee = (fee * currentDividendFeeBps) / BPS;
        protocolFee = fee - dividendFee;

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

    // ============== LIQUIDITY (Router only) ==============

    /**
     * @notice Add liquidity: deposit cash and increase both reserves proportionally.
     *         Price stays the same. Router must transfer cashAmount to this pool first.
     * @return lpTokensMinted LP tokens credited to the owner
     */
    function addLiquidity(uint256 cashAmount) external override onlyRouter returns (uint256 lpTokensMinted) {
        require(cashAmount > 0, "Zero amount");

        uint256 sharesToAdd = (cashAmount * virtualShares) / virtualCash;
        lpTokensMinted = (cashAmount * totalLiquidity) / virtualCash;

        virtualCash += cashAmount;
        virtualShares += sharesToAdd;
        totalLiquidity += lpTokensMinted;
        lpLiquidity += lpTokensMinted;
    }

    /**
     * @notice Remove liquidity: burn LP tokens, withdraw proportional cash.
     *         Corresponding virtual shares are also removed to keep the price unchanged.
     * @return cashOut DBucks sent back to router
     */
    function removeLiquidity(uint256 lpTokens) external override onlyRouter returns (uint256 cashOut) {
        require(lpTokens > 0 && lpTokens <= lpLiquidity, "Invalid LP amount");

        cashOut = (lpTokens * virtualCash) / totalLiquidity;
        uint256 sharesToRemove = (lpTokens * virtualShares) / totalLiquidity;

        require(virtualCash - cashOut > 0 && virtualShares - sharesToRemove > 0, "Would drain pool");

        uint256 bal = paymentToken.balanceOf(address(this));
        require(cashOut <= bal, "Insufficient real balance");

        virtualCash -= cashOut;
        virtualShares -= sharesToRemove;
        totalLiquidity -= lpTokens;
        lpLiquidity -= lpTokens;

        paymentToken.safeTransfer(router, cashOut);
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

    /**
     * @notice Drain all payment tokens from this pool to a target address.
     *         Only callable by Router during emergency drain.
     */
    function drain(address to) external override onlyRouter returns (uint256 amount) {
        amount = paymentToken.balanceOf(address(this));
        if (amount > 0) {
            paymentToken.safeTransfer(to, amount);
        }
    }
}

// Minimal interface to read fee config from StatixRouter
interface IFeeConfig {
    function feeBps() external view returns (uint256);
    function dividendFeeBps() external view returns (uint256);
}
