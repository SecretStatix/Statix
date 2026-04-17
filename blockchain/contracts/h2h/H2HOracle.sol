// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BinaryCTF} from "./BinaryCTF.sol";
import {IH2HMarket} from "./IH2HMarket.sol";

/// @title H2HOracle — autonomous oracle wrapper around BinaryCTF.reportPayouts.
/// @notice The owner is the backend resolver wallet. The resolver daemon polls NBA
///         box scores and calls `resolve(questionId, aFP, bFP)` once a game is final.
///         The oracle picks the payout vector automatically:
///           aFP > bFP → [1, 0]   (A wins)
///           aFP < bFP → [0, 1]   (B wins)
///           aFP == bFP → [1, 1]  (tie / void → 50/50 split via CTF math)
///
///         For postponements / DNPs / errors the resolver calls `voidMarket(questionId)`.
///
///         Single-owner is fine for beta. Swap to UMA Optimistic Oracle for mainnet
///         without changing any other contract.
contract H2HOracle is Ownable, IH2HMarket {
    BinaryCTF public immutable ctf;

    /// @dev Tracks resolved questions so we can guard against double-resolution
    ///      independent of CTF state (CTF will revert too, but we log here).
    mapping(bytes32 => bool) public resolved;

    constructor(address initialOwner, BinaryCTF _ctf) Ownable(initialOwner) {
        ctf = _ctf;
    }

    /// @notice Resolve a market based on the two players' final fantasy points.
    /// @dev FP scaled by 100 (e.g. 32.50 FP → 3250) so that the oracle never sees floats.
    function resolve(bytes32 questionId, uint256 playerAFP, uint256 playerBFP) external onlyOwner {
        require(!resolved[questionId], "Oracle: resolved");

        uint256[] memory payouts = new uint256[](2);
        uint8 winner;
        if (playerAFP > playerBFP) {
            payouts[0] = 1;
            payouts[1] = 0;
            winner = 0;
        } else if (playerAFP < playerBFP) {
            payouts[0] = 0;
            payouts[1] = 1;
            winner = 1;
        } else {
            payouts[0] = 1;
            payouts[1] = 1;
            winner = 2;
        }

        resolved[questionId] = true;
        ctf.reportPayouts(questionId, payouts);

        bytes32 conditionId = ctf.getConditionId(address(this), questionId);
        emit H2HMarketResolved(conditionId, questionId, playerAFP, playerBFP, winner);
    }

    /// @notice Force-void a market (DNP, postponement, data error) → 50/50 split.
    function voidMarket(bytes32 questionId) external onlyOwner {
        require(!resolved[questionId], "Oracle: resolved");

        uint256[] memory payouts = new uint256[](2);
        payouts[0] = 1;
        payouts[1] = 1;

        resolved[questionId] = true;
        ctf.reportPayouts(questionId, payouts);

        bytes32 conditionId = ctf.getConditionId(address(this), questionId);
        emit H2HMarketResolved(conditionId, questionId, 0, 0, 2);
    }
}
