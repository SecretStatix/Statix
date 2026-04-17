// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {BinaryCTF} from "./BinaryCTF.sol";
import {BinaryFPMM} from "./BinaryFPMM.sol";
import {IH2HMarket} from "./IH2HMarket.sol";

/// @title H2HCreator — orchestrates H2H market creation.
/// @notice Pulls seed collateral from the protocol, prepares the condition,
///         deploys a BinaryFPMM, and seeds initial liquidity 50/50.
contract H2HCreator is Ownable, IH2HMarket {
    using SafeERC20 for IERC20;

    BinaryCTF public immutable ctf;
    IERC20 public immutable collateralToken;
    address public immutable oracle;
    uint256 public immutable feeBps;
    address public immutable feeRecipient;

    /// @dev questionId => fpmm address. Lookup for off-chain.
    mapping(bytes32 => address) public marketByQuestion;

    constructor(
        address initialOwner,
        BinaryCTF _ctf,
        IERC20 _collateralToken,
        address _oracle,
        uint256 _feeBps,
        address _feeRecipient
    ) Ownable(initialOwner) {
        require(_oracle != address(0), "Creator: zero oracle");
        require(_feeRecipient != address(0), "Creator: zero feeRecipient");
        ctf = _ctf;
        collateralToken = _collateralToken;
        oracle = _oracle;
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
    }

    /// @notice Create a new H2H market. Owner-only (called by backend deployer key).
    /// @param questionId   Unique id for this matchup (e.g. keccak(gameId,playerA,playerB)).
    /// @param playerAId    Off-chain player identifier (for indexing — emitted only).
    /// @param playerBId    Off-chain player identifier.
    /// @param seedAmount   Collateral to seed the FPMM with (split 50/50).
    function createMarket(
        bytes32 questionId,
        bytes32 playerAId,
        bytes32 playerBId,
        uint256 seedAmount
    ) external onlyOwner returns (address fpmm, bytes32 conditionId) {
        require(seedAmount > 0, "Creator: zero seed");
        require(marketByQuestion[questionId] == address(0), "Creator: already created");

        conditionId = ctf.prepareCondition(oracle, questionId);

        BinaryFPMM newFpmm = new BinaryFPMM(
            ctf,
            collateralToken,
            conditionId,
            feeBps,
            feeRecipient
        );
        fpmm = address(newFpmm);
        marketByQuestion[questionId] = fpmm;

        // Pull seed collateral from caller (the protocol owner) and seed FPMM.
        collateralToken.safeTransferFrom(msg.sender, address(this), seedAmount);
        collateralToken.forceApprove(fpmm, seedAmount);
        newFpmm.addFunding(seedAmount);

        // Transfer LP shares to the protocol owner so they can withdraw later.
        uint256 lpBalance = newFpmm.balanceOf(address(this));
        if (lpBalance > 0) {
            newFpmm.transfer(msg.sender, lpBalance);
        }

        emit H2HMarketCreated(conditionId, questionId, fpmm, playerAId, playerBId, seedAmount);
    }
}
