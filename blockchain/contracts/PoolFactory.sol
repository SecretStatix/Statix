// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./PlayerPool.sol";
import "./IPlayerPool.sol";

/**
 * @title PoolFactory
 * @notice Deploys PlayerPool contracts and maintains a registry.
 *         Adding a new player = deploying one contract.
 */
contract PoolFactory is Ownable {
    // ============== STATE ==============

    address public paymentToken;   // DBucks
    address public router;
    address public dividendHub;

    uint256 public poolCount;
    mapping(uint256 => address) public pools;           // index => pool address
    mapping(string => uint256) public playerIdToIndex;  // external ID => index
    mapping(string => bool) public playerIdExists;

    // Default AMM parameters
    uint256 public defaultInitialShares = 1000e6;   // 1000 shares
    uint256 public defaultInitialCash = 10000e6;    // $10,000 -> $10/share

    // ============== EVENTS ==============

    event PoolCreated(uint256 indexed index, address pool, string name, string symbol, string playerId);
    event RouterSet(address router);
    event HubSet(address hub);

    // ============== CONSTRUCTOR ==============

    constructor(address _paymentToken) Ownable(msg.sender) {
        paymentToken = _paymentToken;
    }

    // ============== SETUP ==============

    function setRouter(address _router) external onlyOwner {
        require(_router != address(0), "Zero address");
        router = _router;
        emit RouterSet(_router);
    }

    function setDividendHub(address _hub) external onlyOwner {
        require(_hub != address(0), "Zero address");
        dividendHub = _hub;
        emit HubSet(_hub);
    }

    function setDefaults(uint256 _shares, uint256 _cash) external onlyOwner {
        defaultInitialShares = _shares;
        defaultInitialCash = _cash;
    }

    // ============== POOL CREATION ==============

    function createPool(
        string calldata _name,
        string calldata _symbol,
        string calldata _playerId,
        uint256 _projectedPoints
    ) external onlyOwner returns (address pool) {
        return _createPool(_name, _symbol, _playerId, _projectedPoints, defaultInitialShares, defaultInitialCash);
    }

    function createPoolWithParams(
        string calldata _name,
        string calldata _symbol,
        string calldata _playerId,
        uint256 _projectedPoints,
        uint256 _initialShares,
        uint256 _initialCash
    ) external onlyOwner returns (address pool) {
        return _createPool(_name, _symbol, _playerId, _projectedPoints, _initialShares, _initialCash);
    }

    function createPoolsBatch(
        string[] calldata _names,
        string[] calldata _symbols,
        string[] calldata _playerIds,
        uint256[] calldata _projectedPoints
    ) external onlyOwner {
        require(
            _names.length == _symbols.length &&
            _names.length == _playerIds.length &&
            _names.length == _projectedPoints.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < _names.length; i++) {
            _createPool(_names[i], _symbols[i], _playerIds[i], _projectedPoints[i], defaultInitialShares, defaultInitialCash);
        }
    }

    function _createPool(
        string memory _name,
        string memory _symbol,
        string memory _playerId,
        uint256 _projectedPoints,
        uint256 _initialShares,
        uint256 _initialCash
    ) internal returns (address pool) {
        require(router != address(0), "Router not set");
        require(dividendHub != address(0), "Hub not set");
        require(!playerIdExists[_playerId], "Player already exists");

        PlayerPool p = new PlayerPool(
            paymentToken,
            router,
            dividendHub,
            _name,
            _symbol,
            _playerId,
            _projectedPoints,
            _initialShares,
            _initialCash
        );

        pool = address(p);
        uint256 idx = poolCount;
        pools[idx] = pool;
        playerIdToIndex[_playerId] = idx;
        playerIdExists[_playerId] = true;
        poolCount++;

        emit PoolCreated(idx, pool, _name, _symbol, _playerId);
    }

    // ============== VIEWS ==============

    function getPool(uint256 _index) external view returns (address) {
        require(_index < poolCount, "Invalid index");
        return pools[_index];
    }

    function getAllPools() external view returns (address[] memory) {
        address[] memory result = new address[](poolCount);
        for (uint256 i = 0; i < poolCount; i++) {
            result[i] = pools[i];
        }
        return result;
    }
}
