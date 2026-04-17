// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {BinaryCTF} from "./BinaryCTF.sol";

/// @title BinaryFPMM — fixed-product market maker over binary outcome tokens.
/// @notice CPMM with constant `pool_a * pool_b = k`. LP shares are this contract's ERC20.
///         Pricing: instantaneous price of A = pool_b / (pool_a + pool_b).
///         Trader pays/receives collateral; FPMM does the split/merge with the CTF.
contract BinaryFPMM is ERC20, ERC1155Holder, ReentrancyGuard {
    using SafeERC20 for IERC20;

    BinaryCTF public immutable ctf;
    IERC20 public immutable collateralToken;
    bytes32 public immutable conditionId;
    uint256 public immutable feeBps;            // e.g. 200 = 2%
    address public immutable feeRecipient;      // protocol address that calls withdrawFees

    uint256 public immutable positionIdA;
    uint256 public immutable positionIdB;

    uint256 public collectedFees;

    event FPMMFundingAdded(address indexed funder, uint256 collateralAdded, uint256 sharesMinted);
    event FPMMFundingRemoved(address indexed funder, uint256 collateralRemoved, uint256 outcomeARemoved, uint256 outcomeBRemoved, uint256 sharesBurned);
    event FPMMBuy(address indexed buyer, uint256 investmentAmount, uint256 feeAmount, uint8 outcomeIndex, uint256 outcomeTokensBought);
    event FPMMSell(address indexed seller, uint256 returnAmount, uint256 feeAmount, uint8 outcomeIndex, uint256 outcomeTokensSold);
    event FPMMFeesWithdrawn(address indexed to, uint256 amount);

    constructor(
        BinaryCTF _ctf,
        IERC20 _collateralToken,
        bytes32 _conditionId,
        uint256 _feeBps,
        address _feeRecipient
    ) ERC20("Statix H2H FPMM LP", "H2H-LP") {
        require(_feeBps <= 1000, "FPMM: fee too high"); // cap 10%
        require(_feeRecipient != address(0), "FPMM: zero feeRecipient");
        ctf = _ctf;
        collateralToken = _collateralToken;
        conditionId = _conditionId;
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;

        positionIdA = _ctf.getPositionId(_collateralToken, _conditionId, _ctf.INDEX_SET_A());
        positionIdB = _ctf.getPositionId(_collateralToken, _conditionId, _ctf.INDEX_SET_B());

        _collateralToken.forceApprove(address(_ctf), type(uint256).max);
    }

    // ---------------------------------------------------------------------
    // Pool state
    // ---------------------------------------------------------------------

    function poolBalances() public view returns (uint256 a, uint256 b) {
        a = ctf.balanceOf(address(this), positionIdA);
        b = ctf.balanceOf(address(this), positionIdB);
    }

    /// @notice Instantaneous price of outcome A in collateral, scaled to 1e18.
    function priceA() external view returns (uint256) {
        (uint256 a, uint256 b) = poolBalances();
        if (a + b == 0) return 0;
        return (b * 1e18) / (a + b);
    }

    // ---------------------------------------------------------------------
    // LP funding
    // ---------------------------------------------------------------------

    /// @notice Pull `addedFunds` collateral, split into A+B, deposit into pool.
    ///         For a skewed pool, the LP receives back the "excess" outcome tokens so
    ///         that their effective funding matches the pool's current weighting.
    ///         First-time deposit mints `addedFunds` LP shares (1:1 with seed collateral).
    function addFunding(uint256 addedFunds) external nonReentrant returns (uint256 sharesMinted) {
        require(addedFunds > 0, "FPMM: zero funds");

        collateralToken.safeTransferFrom(msg.sender, address(this), addedFunds);

        uint256 supply = totalSupply();
        uint256 sendBackA = 0;
        uint256 sendBackB = 0;

        if (supply == 0) {
            // Initial funding: balanced 50/50 seed.
            ctf.splitPosition(collateralToken, conditionId, addedFunds);
            sharesMinted = addedFunds;
        } else {
            (uint256 priorA, uint256 priorB) = poolBalances();
            uint256 poolWeight = priorA > priorB ? priorA : priorB;
            require(poolWeight > 0, "FPMM: prior pool empty");

            ctf.splitPosition(collateralToken, conditionId, addedFunds);

            // Keep `addedFunds * priorX / poolWeight` of each side; refund the rest.
            uint256 keepA = (addedFunds * priorA) / poolWeight;
            uint256 keepB = (addedFunds * priorB) / poolWeight;
            sendBackA = addedFunds - keepA;
            sendBackB = addedFunds - keepB;

            sharesMinted = (addedFunds * supply) / poolWeight;
        }

        _mint(msg.sender, sharesMinted);

        if (sendBackA > 0) ctf.safeTransferFrom(address(this), msg.sender, positionIdA, sendBackA, "");
        if (sendBackB > 0) ctf.safeTransferFrom(address(this), msg.sender, positionIdB, sendBackB, "");

        emit FPMMFundingAdded(msg.sender, addedFunds, sharesMinted);
    }

    /// @notice Burn `shares` LP tokens. Returns the LP's pro-rata slice of A and B
    ///         outcome tokens. The LP can `mergePositions` themselves to recover
    ///         collateral on any 1:1 portion (or hold the unbalanced exposure).
    function removeFunding(uint256 shares) external nonReentrant returns (uint256 sentA, uint256 sentB, uint256 sentCollateral) {
        require(shares > 0, "FPMM: zero shares");
        uint256 supply = totalSupply();
        require(supply > 0, "FPMM: empty supply");

        (uint256 a, uint256 b) = poolBalances();
        sentA = (a * shares) / supply;
        sentB = (b * shares) / supply;

        _burn(msg.sender, shares);

        // Auto-merge the matched portion to give the LP pure collateral on top of the
        // unbalanced exposure they end up with.
        uint256 mergeable = sentA < sentB ? sentA : sentB;
        if (mergeable > 0) {
            ctf.mergePositions(collateralToken, conditionId, mergeable);
            sentCollateral = mergeable;
            sentA -= mergeable;
            sentB -= mergeable;
            collateralToken.safeTransfer(msg.sender, sentCollateral);
        }

        if (sentA > 0) ctf.safeTransferFrom(address(this), msg.sender, positionIdA, sentA, "");
        if (sentB > 0) ctf.safeTransferFrom(address(this), msg.sender, positionIdB, sentB, "");

        emit FPMMFundingRemoved(msg.sender, sentCollateral, sentA, sentB, shares);
    }

    // ---------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------

    /// @dev Buy: trader pays `investment` collateral. After fee, `net` is split into
    ///      A+B (both pools += net). Pool then sells chosen down s.t. CPMM invariant
    ///      `chosen * other` is preserved against the pre-trade balance.
    ///      Closed form (binary case): Y = net * (chosen + other + net) / (other + net).
    function calcBuyAmount(uint256 investment, uint8 outcomeIndex) public view returns (uint256) {
        require(outcomeIndex < 2, "FPMM: bad outcome");
        require(investment > 0, "FPMM: zero invest");

        uint256 fee = (investment * feeBps) / 10_000;
        uint256 net = investment - fee;

        (uint256 a, uint256 b) = poolBalances();
        uint256 chosen = outcomeIndex == 0 ? a : b;
        uint256 other = outcomeIndex == 0 ? b : a;
        require(chosen > 0 && other > 0, "FPMM: empty pool");

        return (net * (chosen + other + net)) / (other + net);
    }

    /// @dev Sell: trader hands in `outcomeTokens` of chosen, FPMM merges G matched pairs
    ///      to release G collateral. Invariant: (chosen + T - G)(other - G) = chosen * other.
    ///      Quadratic G^2 - (a+b+T)G + bT = 0; take smaller root.
    ///      Returned amount = G * (10_000 - feeBps) / 10_000.
    function calcSellAmount(uint256 outcomeTokens, uint8 outcomeIndex) public view returns (uint256) {
        require(outcomeIndex < 2, "FPMM: bad outcome");
        require(outcomeTokens > 0, "FPMM: zero tokens");

        (uint256 a, uint256 b) = poolBalances();
        uint256 chosen = outcomeIndex == 0 ? a : b;
        uint256 other = outcomeIndex == 0 ? b : a;
        require(chosen > 0 && other > 0, "FPMM: empty pool");

        uint256 sumT = chosen + other + outcomeTokens;
        uint256 disc = sumT * sumT - 4 * other * outcomeTokens;
        uint256 sqrtDisc = _sqrt(disc);
        // smaller root → physically meaningful (G < other, G < chosen + T)
        uint256 g = (sumT - sqrtDisc) / 2;

        return (g * (10_000 - feeBps)) / 10_000;
    }

    function buy(uint256 investment, uint8 outcomeIndex, uint256 minOutcomeTokens) external nonReentrant returns (uint256 outcomeTokens) {
        outcomeTokens = calcBuyAmount(investment, outcomeIndex);
        require(outcomeTokens >= minOutcomeTokens, "FPMM: slippage");

        uint256 fee = (investment * feeBps) / 10_000;
        uint256 net = investment - fee;

        collateralToken.safeTransferFrom(msg.sender, address(this), investment);
        collectedFees += fee;

        ctf.splitPosition(collateralToken, conditionId, net);
        // Pool now has +net of both sides. Send `outcomeTokens` of the chosen side to buyer.
        uint256 idChosen = outcomeIndex == 0 ? positionIdA : positionIdB;
        ctf.safeTransferFrom(address(this), msg.sender, idChosen, outcomeTokens, "");

        emit FPMMBuy(msg.sender, investment, fee, outcomeIndex, outcomeTokens);
    }

    function sell(uint256 outcomeTokens, uint8 outcomeIndex, uint256 minCollateralOut) external nonReentrant returns (uint256 collateralOut) {
        collateralOut = calcSellAmount(outcomeTokens, outcomeIndex);
        require(collateralOut >= minCollateralOut, "FPMM: slippage");

        // Pre-fee collateral the FPMM owes itself before paying out.
        uint256 grossOut = (collateralOut * 10_000) / (10_000 - feeBps);
        uint256 fee = grossOut - collateralOut;
        collectedFees += fee;

        // Trader sends in `outcomeTokens` of chosen. We need `grossOut` collateral to move out
        // by merging `grossOut` matched pairs (chosen + other). The chosen side gets the trader's
        // tokens added then loses `grossOut` to merge; net pool change matches the math above.
        uint256 idChosen = outcomeIndex == 0 ? positionIdA : positionIdB;
        ctf.safeTransferFrom(msg.sender, address(this), idChosen, outcomeTokens, "");

        ctf.mergePositions(collateralToken, conditionId, grossOut);
        collateralToken.safeTransfer(msg.sender, collateralOut);

        emit FPMMSell(msg.sender, collateralOut, fee, outcomeIndex, outcomeTokens);
    }

    // ---------------------------------------------------------------------
    // Fees
    // ---------------------------------------------------------------------

    function withdrawFees() external returns (uint256 amount) {
        amount = collectedFees;
        if (amount == 0) return 0;
        collectedFees = 0;
        collateralToken.safeTransfer(feeRecipient, amount);
        emit FPMMFeesWithdrawn(feeRecipient, amount);
    }

    // ---------------------------------------------------------------------
    // Math
    // ---------------------------------------------------------------------

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
