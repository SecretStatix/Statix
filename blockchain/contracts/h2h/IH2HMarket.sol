// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IH2HMarket — shared events / view shape for H2H markets.
interface IH2HMarket {
    /// @notice Emitted by H2HCreator when a new market is created.
    event H2HMarketCreated(
        bytes32 indexed conditionId,
        bytes32 indexed questionId,
        address indexed fpmm,
        bytes32 playerAId,
        bytes32 playerBId,
        uint256 seedAmount
    );

    /// @notice Emitted by H2HOracle when a market is resolved on-chain.
    event H2HMarketResolved(
        bytes32 indexed conditionId,
        bytes32 indexed questionId,
        uint256 playerAFP,
        uint256 playerBFP,
        uint8 winner // 0 = A, 1 = B, 2 = void/tie
    );
}
