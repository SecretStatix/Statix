// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../IPlayerPool.sol";

/**
 * @notice Minimal mock Router for DividendHub tests.
 *         feeBps = 0 so buys are fee-free; the hub is funded directly
 *         via token.mint() for deterministic dividend math.
 */
contract MockRouterForHub {
    using SafeERC20 for IERC20;

    uint256 public feeBps = 0;
    uint256 public dividendFeeBps = 0;
    IERC20 public token;

    constructor(address _token) {
        token = IERC20(_token);
    }

    function callExecuteBuy(address pool, address buyer, uint256 sharesOut, uint256 maxCost) external {
        uint256 cost = IPlayerPool(pool).getBuyCost(sharesOut);
        token.safeTransfer(pool, cost);
        IPlayerPool(pool).executeBuy(buyer, sharesOut, maxCost);
    }

    function callExecuteSell(address pool, address seller, uint256 sharesIn, uint256 minRevenue) external {
        IPlayerPool(pool).executeSell(seller, sharesIn, minRevenue);
    }

    receive() external payable {}
}
