// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title BinaryCTF — minimal binary-outcome Conditional Tokens
/// @notice Public surface mirrors Gnosis ConditionalTokens for the binary
///         (outcomeSlotCount = 2) case so a future swap to full Gnosis is mechanical.
contract BinaryCTF is ERC1155 {
    using SafeERC20 for IERC20;

    /// @dev outcomeSlotCount is fixed at 2 for this build.
    uint256 public constant OUTCOME_SLOT_COUNT = 2;

    /// @dev Index sets: 0b01 = outcome A, 0b10 = outcome B.
    uint256 public constant INDEX_SET_A = 1;
    uint256 public constant INDEX_SET_B = 2;

    /// @dev conditionId => oracle address (set on prepareCondition).
    mapping(bytes32 => address) public conditionOracle;

    /// @dev conditionId => [payoutA, payoutB] numerators. Sum == denominator.
    mapping(bytes32 => uint256[2]) public payoutNumerators;
    mapping(bytes32 => uint256) public payoutDenominator;

    event ConditionPreparation(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId);
    event ConditionResolution(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId, uint256[2] payoutNumerators);
    event PositionSplit(address indexed stakeholder, IERC20 collateralToken, bytes32 indexed conditionId, uint256 amount);
    event PositionsMerge(address indexed stakeholder, IERC20 collateralToken, bytes32 indexed conditionId, uint256 amount);
    event PayoutRedemption(address indexed redeemer, IERC20 indexed collateralToken, bytes32 indexed conditionId, uint256 payout);

    constructor() ERC1155("") {}

    // ---------------------------------------------------------------------
    // Pure helpers
    // ---------------------------------------------------------------------

    function getConditionId(address oracle, bytes32 questionId) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(oracle, questionId, OUTCOME_SLOT_COUNT));
    }

    /// @notice Position id for a (collateral, condition, indexSet) triple.
    /// @dev    indexSet must be 1 or 2 in this binary build.
    function getPositionId(IERC20 collateralToken, bytes32 conditionId, uint256 indexSet) public pure returns (uint256) {
        require(indexSet == INDEX_SET_A || indexSet == INDEX_SET_B, "BinaryCTF: bad indexSet");
        return uint256(keccak256(abi.encode(collateralToken, conditionId, indexSet)));
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    function prepareCondition(address oracle, bytes32 questionId) external returns (bytes32 conditionId) {
        require(oracle != address(0), "BinaryCTF: zero oracle");
        conditionId = getConditionId(oracle, questionId);
        require(conditionOracle[conditionId] == address(0), "BinaryCTF: already prepared");
        conditionOracle[conditionId] = oracle;
        emit ConditionPreparation(conditionId, oracle, questionId);
    }

    /// @notice Pull `amount` collateral from msg.sender, mint `amount` of A AND B to msg.sender.
    function splitPosition(IERC20 collateralToken, bytes32 conditionId, uint256 amount) external {
        require(conditionOracle[conditionId] != address(0), "BinaryCTF: unknown condition");
        require(payoutDenominator[conditionId] == 0, "BinaryCTF: condition resolved");
        require(amount > 0, "BinaryCTF: zero amount");

        collateralToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 idA = getPositionId(collateralToken, conditionId, INDEX_SET_A);
        uint256 idB = getPositionId(collateralToken, conditionId, INDEX_SET_B);

        _mint(msg.sender, idA, amount, "");
        _mint(msg.sender, idB, amount, "");

        emit PositionSplit(msg.sender, collateralToken, conditionId, amount);
    }

    /// @notice Burn `amount` of A AND `amount` of B from msg.sender, return collateral.
    function mergePositions(IERC20 collateralToken, bytes32 conditionId, uint256 amount) external {
        require(amount > 0, "BinaryCTF: zero amount");
        uint256 idA = getPositionId(collateralToken, conditionId, INDEX_SET_A);
        uint256 idB = getPositionId(collateralToken, conditionId, INDEX_SET_B);

        _burn(msg.sender, idA, amount);
        _burn(msg.sender, idB, amount);

        collateralToken.safeTransfer(msg.sender, amount);

        emit PositionsMerge(msg.sender, collateralToken, conditionId, amount);
    }

    /// @notice Oracle reports binary payouts. `payouts.length == 2`.
    ///         Valid combinations: [1,0], [0,1], [1,1] (tie/void → 50/50 split).
    function reportPayouts(bytes32 questionId, uint256[] calldata payouts) external {
        require(payouts.length == OUTCOME_SLOT_COUNT, "BinaryCTF: bad payouts length");
        bytes32 conditionId = getConditionId(msg.sender, questionId);
        address oracle = conditionOracle[conditionId];
        require(oracle == msg.sender, "BinaryCTF: not oracle");
        require(payoutDenominator[conditionId] == 0, "BinaryCTF: already resolved");

        uint256 denom = payouts[0] + payouts[1];
        require(denom > 0, "BinaryCTF: zero denominator");

        payoutNumerators[conditionId][0] = payouts[0];
        payoutNumerators[conditionId][1] = payouts[1];
        payoutDenominator[conditionId] = denom;

        emit ConditionResolution(conditionId, msg.sender, questionId, [payouts[0], payouts[1]]);
    }

    /// @notice Burn all of msg.sender's A and B tokens for `conditionId`,
    ///         pay out collateral pro-rata to payout numerators.
    function redeemPositions(IERC20 collateralToken, bytes32 conditionId) external {
        uint256 denom = payoutDenominator[conditionId];
        require(denom > 0, "BinaryCTF: not resolved");

        uint256 idA = getPositionId(collateralToken, conditionId, INDEX_SET_A);
        uint256 idB = getPositionId(collateralToken, conditionId, INDEX_SET_B);

        uint256 balA = balanceOf(msg.sender, idA);
        uint256 balB = balanceOf(msg.sender, idB);

        uint256 payout = 0;
        if (balA > 0) {
            payout += (balA * payoutNumerators[conditionId][0]) / denom;
            _burn(msg.sender, idA, balA);
        }
        if (balB > 0) {
            payout += (balB * payoutNumerators[conditionId][1]) / denom;
            _burn(msg.sender, idB, balB);
        }

        if (payout > 0) {
            collateralToken.safeTransfer(msg.sender, payout);
        }

        emit PayoutRedemption(msg.sender, collateralToken, conditionId, payout);
    }
}
