// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title H2HOracle
 * @notice Admin-gated oracle that holds the right to call
 *         ConditionalTokens.reportPayouts for every H2H market.
 *         Invoked by the backend resolver daemon when:
 *           - game status = Final AND both players have MIN > 0  → [1,0] or [0,1]
 *           - tie, postponement, or DNP                          → [1,1]
 *
 *         Single-owner for beta. Swappable to UMA Optimistic Oracle
 *         for real-money launch without touching any other contract.
 *
 *         Populated in P1.
 */
contract H2HOracle {
    // P1 populates.
}
