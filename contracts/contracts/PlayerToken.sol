// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PlayerToken
 * @notice ERC20 token representing shares in an NBA player
 * @dev Each player has their own token contract
 */
contract PlayerToken is ERC20, Ownable {
    string public playerId;        // External player ID (e.g., NBA API ID)
    uint256 public projectedPoints; // Season projection (scaled by 1e18)

    // Only the AMM contract can mint/burn
    address public ammContract;

    event AMMSet(address indexed amm);
    event ProjectionUpdated(uint256 oldProjection, uint256 newProjection);

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _playerId,
        uint256 _projectedPoints,
        address _initialOwner
    ) ERC20(_name, _symbol) Ownable(_initialOwner) {
        playerId = _playerId;
        projectedPoints = _projectedPoints;
    }

    /**
     * @notice Set the AMM contract address (can only be set once)
     */
    function setAMM(address _amm) external onlyOwner {
        require(ammContract == address(0), "AMM already set");
        require(_amm != address(0), "Invalid AMM address");
        ammContract = _amm;
        emit AMMSet(_amm);
    }

    /**
     * @notice Mint tokens (only callable by AMM)
     */
    function mint(address to, uint256 amount) external {
        require(msg.sender == ammContract, "Only AMM can mint");
        _mint(to, amount);
    }

    /**
     * @notice Burn tokens (only callable by AMM)
     */
    function burn(address from, uint256 amount) external {
        require(msg.sender == ammContract, "Only AMM can burn");
        _burn(from, amount);
    }

    /**
     * @notice Update projected points (only owner, typically the backend)
     */
    function updateProjection(uint256 _newProjection) external onlyOwner {
        emit ProjectionUpdated(projectedPoints, _newProjection);
        projectedPoints = _newProjection;
    }
}
