// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../IPlayerPool.sol";

/**
 * @notice Minimal mock that acts as both Router (fee config) and Hub (currentWeek)
 *         for unit-testing PlayerPool in isolation.
 */
contract MockRouterHub {
    using SafeERC20 for IERC20;

    uint256 public feeBps = 150;
    uint256 public dividendFeeBps = 6700;
    uint256 public currentWeek = 1;

    IERC20 public token;

    constructor(address _token) {
        token = IERC20(_token);
    }

    function setFeeBps(uint256 _val) external { feeBps = _val; }
    function setDividendFeeBps(uint256 _val) external { dividendFeeBps = _val; }
    function setCurrentWeek(uint256 _val) external { currentWeek = _val; }

    // ---- Forward calls to PlayerPool (msg.sender = this contract = "router"/"hub") ----

    function callExecuteBuy(address pool, address buyer, uint256 sharesOut, uint256 maxCost) external {
        uint256 cost = IPlayerPool(pool).getBuyCost(sharesOut);
        uint256 fee = (cost * feeBps) / 10000;
        uint256 total = cost + fee;
        token.safeTransfer(pool, total);
        IPlayerPool(pool).executeBuy(buyer, sharesOut, maxCost);
    }

    function callExecuteSell(address pool, address seller, uint256 sharesIn, uint256 minRevenue) external {
        IPlayerPool(pool).executeSell(seller, sharesIn, minRevenue);
    }

    function callAddLiquidity(address pool, uint256 cashAmount) external returns (uint256) {
        token.safeTransfer(pool, cashAmount);
        return IPlayerPool(pool).addLiquidity(cashAmount);
    }

    function callRemoveLiquidity(address pool, uint256 lpTokens) external returns (uint256) {
        return IPlayerPool(pool).removeLiquidity(lpTokens);
    }

    function callSnapshotTotalShares(address pool) external returns (uint256) {
        return IPlayerPool(pool).snapshotTotalShares();
    }

    function callSnapshotUserHoldings(address pool, uint256 week, address user) external {
        IPlayerPool(pool).snapshotUserHoldings(week, user);
    }

    function callEmergencyExitUser(address pool, address user) external returns (uint256) {
        return IPlayerPool(pool).emergencyExitUser(user);
    }

    function callForceLiquidate(address pool, address user) external returns (uint256, uint256) {
        return IPlayerPool(pool).forceLiquidate(user);
    }

    function callResetPool(address pool, uint256 s, uint256 c) external {
        IPlayerPool(pool).resetPool(s, c);
    }

    function callSetActive(address pool, bool a) external {
        IPlayerPool(pool).setActive(a);
    }

    function callDrain(address pool, address to) external returns (uint256) {
        return IPlayerPool(pool).drain(to);
    }

    receive() external payable {}
}
