// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPlayerToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

interface IDividendDistributor {
    function recordFee(address player, uint256 amount) external;
}

/**
 * @title PlayerAMM
 * @notice Constant Product AMM for trading player tokens
 * @dev Uses virtual reserves model - no actual tokens in pool
 *
 * Formula: virtualShares * virtualCash = k (constant)
 * Price = virtualCash / virtualShares
 */
contract PlayerAMM is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // The player token being traded
    IPlayerToken public playerToken;

    // Payment token (USDC on Base)
    IERC20 public paymentToken;

    // Dividend distributor contract
    IDividendDistributor public dividendDistributor;

    // Virtual reserves (for price calculation)
    uint256 public virtualShares;
    uint256 public virtualCash;

    // Fee configuration (in basis points, 150 = 1.5%)
    uint256 public constant FEE_BPS = 150;
    uint256 public constant FEE_DENOMINATOR = 10000;

    // Fee split (67% to dividends, 33% to protocol)
    uint256 public constant DIVIDEND_FEE_BPS = 6700;
    uint256 public constant PROTOCOL_FEE_BPS = 3300;

    // Protocol fee recipient
    address public protocolFeeRecipient;

    // Events
    event Buy(
        address indexed buyer,
        uint256 sharesOut,
        uint256 cashIn,
        uint256 fee,
        uint256 newPrice
    );

    event Sell(
        address indexed seller,
        uint256 sharesIn,
        uint256 cashOut,
        uint256 fee,
        uint256 newPrice
    );

    event LiquidityAdded(uint256 shares, uint256 cash);

    constructor(
        address _playerToken,
        address _paymentToken,
        address _dividendDistributor,
        address _protocolFeeRecipient,
        uint256 _initialShares,
        uint256 _initialCash,
        address _owner
    ) Ownable(_owner) {
        playerToken = IPlayerToken(_playerToken);
        paymentToken = IERC20(_paymentToken);
        dividendDistributor = IDividendDistributor(_dividendDistributor);
        protocolFeeRecipient = _protocolFeeRecipient;
        virtualShares = _initialShares;
        virtualCash = _initialCash;
    }

    /**
     * @notice Get current price per share (scaled by 1e18)
     */
    function getPrice() public view returns (uint256) {
        return (virtualCash * 1e18) / virtualShares;
    }

    /**
     * @notice Get the constant product k
     */
    function getK() public view returns (uint256) {
        return virtualShares * virtualCash;
    }

    /**
     * @notice Calculate cost to buy shares (before fee)
     * @param sharesOut Number of shares to buy
     * @return cost The cash required (before fee)
     */
    function getBuyCost(uint256 sharesOut) public view returns (uint256 cost) {
        require(sharesOut < virtualShares, "Insufficient liquidity");

        uint256 k = getK();
        uint256 newShares = virtualShares - sharesOut;
        uint256 newCash = k / newShares;
        cost = newCash - virtualCash;
    }

    /**
     * @notice Calculate revenue from selling shares (before fee)
     * @param sharesIn Number of shares to sell
     * @return revenue The cash received (before fee)
     */
    function getSellRevenue(uint256 sharesIn) public view returns (uint256 revenue) {
        uint256 k = getK();
        uint256 newShares = virtualShares + sharesIn;
        uint256 newCash = k / newShares;
        revenue = virtualCash - newCash;
    }

    /**
     * @notice Buy player tokens
     * @param sharesOut Number of shares to buy
     * @param maxCashIn Maximum cash willing to pay (slippage protection)
     */
    function buy(uint256 sharesOut, uint256 maxCashIn) external nonReentrant {
        require(sharesOut > 0, "Must buy > 0");
        require(sharesOut < virtualShares / 2, "Max 50% of pool");

        uint256 cost = getBuyCost(sharesOut);
        uint256 fee = (cost * FEE_BPS) / FEE_DENOMINATOR;
        uint256 totalCost = cost + fee;

        require(totalCost <= maxCashIn, "Slippage exceeded");

        // Transfer payment from buyer
        paymentToken.safeTransferFrom(msg.sender, address(this), totalCost);

        // Split and distribute fee
        _distributeFee(fee);

        // Update virtual reserves
        virtualShares -= sharesOut;
        virtualCash += cost;

        // Mint tokens to buyer
        playerToken.mint(msg.sender, sharesOut);

        emit Buy(msg.sender, sharesOut, totalCost, fee, getPrice());
    }

    /**
     * @notice Sell player tokens
     * @param sharesIn Number of shares to sell
     * @param minCashOut Minimum cash to receive (slippage protection)
     */
    function sell(uint256 sharesIn, uint256 minCashOut) external nonReentrant {
        require(sharesIn > 0, "Must sell > 0");
        require(playerToken.balanceOf(msg.sender) >= sharesIn, "Insufficient balance");

        uint256 revenue = getSellRevenue(sharesIn);
        uint256 fee = (revenue * FEE_BPS) / FEE_DENOMINATOR;
        uint256 netRevenue = revenue - fee;

        require(netRevenue >= minCashOut, "Slippage exceeded");

        // Burn tokens from seller
        playerToken.burn(msg.sender, sharesIn);

        // Split and distribute fee
        _distributeFee(fee);

        // Update virtual reserves
        virtualShares += sharesIn;
        virtualCash -= revenue;

        // Transfer payment to seller
        paymentToken.safeTransfer(msg.sender, netRevenue);

        emit Sell(msg.sender, sharesIn, netRevenue, fee, getPrice());
    }

    /**
     * @notice Distribute fee between dividend pool and protocol
     */
    function _distributeFee(uint256 fee) internal {
        uint256 dividendFee = (fee * DIVIDEND_FEE_BPS) / FEE_DENOMINATOR;
        uint256 protocolFee = fee - dividendFee;

        // Send dividend portion to distributor
        if (dividendFee > 0) {
            paymentToken.safeTransfer(address(dividendDistributor), dividendFee);
            dividendDistributor.recordFee(address(playerToken), dividendFee);
        }

        // Send protocol fee
        if (protocolFee > 0) {
            paymentToken.safeTransfer(protocolFeeRecipient, protocolFee);
        }
    }

    /**
     * @notice Get quote for buying shares
     */
    function getBuyQuote(uint256 sharesOut) external view returns (
        uint256 cost,
        uint256 fee,
        uint256 total,
        uint256 avgPrice,
        uint256 newPrice
    ) {
        cost = getBuyCost(sharesOut);
        fee = (cost * FEE_BPS) / FEE_DENOMINATOR;
        total = cost + fee;
        avgPrice = (total * 1e18) / sharesOut;

        uint256 newShares = virtualShares - sharesOut;
        uint256 newCash = virtualCash + cost;
        newPrice = (newCash * 1e18) / newShares;
    }

    /**
     * @notice Get quote for selling shares
     */
    function getSellQuote(uint256 sharesIn) external view returns (
        uint256 revenue,
        uint256 fee,
        uint256 net,
        uint256 avgPrice,
        uint256 newPrice
    ) {
        revenue = getSellRevenue(sharesIn);
        fee = (revenue * FEE_BPS) / FEE_DENOMINATOR;
        net = revenue - fee;
        avgPrice = (net * 1e18) / sharesIn;

        uint256 newShares = virtualShares + sharesIn;
        uint256 newCash = virtualCash - revenue;
        newPrice = (newCash * 1e18) / newShares;
    }

    /**
     * @notice Owner can add liquidity (increase k)
     */
    function addLiquidity(uint256 shares, uint256 cash) external onlyOwner {
        virtualShares += shares;
        virtualCash += cash;
        emit LiquidityAdded(shares, cash);
    }

    /**
     * @notice Update dividend distributor
     */
    function setDividendDistributor(address _distributor) external onlyOwner {
        dividendDistributor = IDividendDistributor(_distributor);
    }

    /**
     * @notice Update protocol fee recipient
     */
    function setProtocolFeeRecipient(address _recipient) external onlyOwner {
        protocolFeeRecipient = _recipient;
    }
}
