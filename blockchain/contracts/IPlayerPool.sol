// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPlayerPool
 * @notice Interface for player AMM pools. Router and DividendHub interact through this only.
 *         New AMM math = new contract implementing IPlayerPool.
 */
interface IPlayerPool {
    // --- Trading (called by Router) ---
    function executeBuy(address buyer, uint256 sharesOut, uint256 maxCost) external returns (uint256 totalCost, uint256 dividendFee, uint256 protocolFee);
    function executeSell(address seller, uint256 sharesIn, uint256 minRevenue) external returns (uint256 netRevenue, uint256 dividendFee, uint256 protocolFee);

    // --- Snapshots (called by DividendHub) ---
    function snapshotTotalShares() external returns (uint256);
    function snapshotUserHoldings(uint256 week, address user) external;

    // --- Emergency (called by Router) ---
    function emergencyExitUser(address user) external returns (uint256 refund);
    function forceLiquidate(address user) external returns (uint256 shares, uint256 refund);
    function resetPool(uint256 newShares, uint256 newCash) external;
    function setActive(bool active) external;
    function drain(address to) external returns (uint256 amount);

    // --- Views ---
    function getPrice() external view returns (uint256);
    function getBuyCost(uint256 sharesOut) external view returns (uint256);
    function getSellRevenue(uint256 sharesIn) external view returns (uint256);
    function holdings(address user) external view returns (uint256);
    function totalShares() external view returns (uint256);
    function virtualShares() external view returns (uint256);
    function virtualCash() external view returns (uint256);
    function active() external view returns (bool);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function playerId() external view returns (string memory);
    function projectedPoints() external view returns (uint256);
    function weekEndHoldings(uint256 week, address user) external view returns (uint256);
    function lastSnapshotWeek(address user) external view returns (uint256);
}
