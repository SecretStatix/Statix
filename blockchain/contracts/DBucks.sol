// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DBucks
 * @notice Casino-chip style wrapper token for Dividend Fantasy
 *
 * Flow:
 *   1. User deposits USDC -> receives D-Bucks 1:1
 *   2. User trades player shares using D-Bucks via DividendFantasy contract
 *   3. User withdraws D-Bucks -> burns them and receives USDC 1:1
 *
 * This ensures the platform is fully backed: total D-Bucks in circulation
 * always equals the USDC held in this contract (minus protocol fees already withdrawn).
 *
 * On testnet: owner can enable "faucet mode" so users can mint free D-Bucks
 * without depositing real USDC (since there's no real USDC on Base Sepolia).
 */
contract DBucks is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public usdc;
    bool public faucetMode; // When true, anyone can mint up to faucetLimit for free
    uint256 public faucetLimit; // Max free mint per address
    mapping(address => uint256) public faucetMinted; // Track free mints per address

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event FaucetMint(address indexed user, uint256 amount);

    constructor(
        address _usdc,
        bool _faucetMode,
        uint256 _faucetLimit
    ) ERC20("Dividend Bucks", "DBUCKS") Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        faucetMode = _faucetMode;
        faucetLimit = _faucetLimit;
    }

    function decimals() public pure override returns (uint8) {
        return 6; // Match USDC
    }

    /**
     * @notice Deposit USDC and receive D-Bucks 1:1
     * @param amount Amount of USDC to deposit (6 decimals)
     */
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw: burn D-Bucks and receive USDC 1:1
     * @param amount Amount of D-Bucks to withdraw (6 decimals)
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(balanceOf(msg.sender) >= amount, "Insufficient D-Bucks");
        _burn(msg.sender, amount);
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Faucet: mint free D-Bucks (testnet only)
     * @param amount Amount to mint (capped at faucetLimit per address)
     */
    function faucet(uint256 amount) external {
        require(faucetMode, "Faucet disabled");
        require(faucetMinted[msg.sender] + amount <= faucetLimit, "Faucet limit reached");
        faucetMinted[msg.sender] += amount;
        _mint(msg.sender, amount);
        emit FaucetMint(msg.sender, amount);
    }

    /**
     * @notice Owner can toggle faucet mode
     */
    function setFaucetMode(bool _enabled, uint256 _limit) external onlyOwner {
        faucetMode = _enabled;
        faucetLimit = _limit;
    }

    /**
     * @notice Owner can withdraw accumulated protocol fees (USDC)
     * Protocol fees are the USDC that backs burned D-Bucks from fees
     * that were sent to protocolFeeRecipient and then withdrawn.
     * In practice: USDC balance > totalSupply means there's excess.
     */
    function withdrawProtocolFees(address to) external onlyOwner {
        uint256 excess = usdc.balanceOf(address(this)) - totalSupply();
        if (excess > 0) {
            usdc.safeTransfer(to, excess);
        }
    }
}
