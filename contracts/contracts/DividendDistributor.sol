// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPlayerToken {
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function projectedPoints() external view returns (uint256);
}

/**
 * @title DividendDistributor
 * @notice Distributes weekly dividends based on player outperformance
 *
 * Flow:
 * 1. AMMs send fees throughout the week via recordFee()
 * 2. Backend calls setWeeklyPerformance() with actual points
 * 3. Backend calls distributeDividends() to calculate and enable claims
 * 4. Users call claimDividend() to receive their share
 *
 * Dividend Formula:
 * - 20% base dividend: distributed to ALL token holders proportionally
 * - 80% outperformer dividend: distributed to holders of outperforming players
 */
contract DividendDistributor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Payment token (USDC)
    IERC20 public paymentToken;

    // Registered player tokens
    mapping(address => bool) public isRegisteredPlayer;
    address[] public playerTokens;

    // Registered AMMs that can record fees
    mapping(address => bool) public isRegisteredAMM;

    // Current week number
    uint256 public currentWeek;

    // Fees collected per player this week
    mapping(address => uint256) public weeklyFees; // playerToken -> fees

    // Total fees collected this week
    uint256 public totalWeeklyFees;

    // Weekly performance data (set by backend)
    struct WeeklyPerformance {
        uint256 actualPoints;    // Actual fantasy points (scaled 1e18)
        uint256 projectedPoints; // Projected points (scaled 1e18)
        int256 outperformance;   // (actual - projected) / projected (scaled 1e18, can be negative)
    }
    mapping(uint256 => mapping(address => WeeklyPerformance)) public weeklyPerformance;

    // Dividend distribution per week
    struct WeeklyDividend {
        uint256 totalPool;           // Total dividend pool
        uint256 basePool;            // 20% - for all holders
        uint256 outperformerPool;    // 80% - for outperformer holders
        uint256 totalPositiveOutperf; // Sum of positive outperformance (scaled 1e18)
        bool distributed;            // Whether distribution is calculated
    }
    mapping(uint256 => WeeklyDividend) public weeklyDividends;

    // User claims
    mapping(uint256 => mapping(address => bool)) public hasClaimed; // week -> user -> claimed
    mapping(uint256 => mapping(address => uint256)) public userDividend; // week -> user -> amount

    // Configuration
    uint256 public constant BASE_DIVIDEND_BPS = 2000;  // 20%
    uint256 public constant OUTPERFORMER_BPS = 8000;   // 80%
    uint256 public constant BPS_DENOMINATOR = 10000;
    int256 public constant SCALE = 1e18;

    // Events
    event PlayerRegistered(address indexed playerToken);
    event AMMRegistered(address indexed amm);
    event FeeRecorded(address indexed playerToken, uint256 amount);
    event PerformanceSet(uint256 indexed week, address indexed playerToken, int256 outperformance);
    event DividendsDistributed(uint256 indexed week, uint256 totalPool, uint256 basePool, uint256 outperformerPool);
    event DividendClaimed(uint256 indexed week, address indexed user, uint256 amount);
    event WeekAdvanced(uint256 newWeek);

    constructor(address _paymentToken, address _owner) Ownable(_owner) {
        paymentToken = IERC20(_paymentToken);
        currentWeek = 1;
    }

    // ============== ADMIN FUNCTIONS ==============

    /**
     * @notice Register a player token
     */
    function registerPlayer(address _playerToken) external onlyOwner {
        require(!isRegisteredPlayer[_playerToken], "Already registered");
        isRegisteredPlayer[_playerToken] = true;
        playerTokens.push(_playerToken);
        emit PlayerRegistered(_playerToken);
    }

    /**
     * @notice Register an AMM that can record fees
     */
    function registerAMM(address _amm) external onlyOwner {
        isRegisteredAMM[_amm] = true;
        emit AMMRegistered(_amm);
    }

    /**
     * @notice Set weekly performance for a player (called by backend)
     * @param _playerToken The player token address
     * @param _actualPoints Actual fantasy points this week (scaled 1e18)
     */
    function setWeeklyPerformance(
        address _playerToken,
        uint256 _actualPoints
    ) external onlyOwner {
        require(isRegisteredPlayer[_playerToken], "Player not registered");

        uint256 projectedPoints = IPlayerToken(_playerToken).projectedPoints();
        // Weekly projection = season projection / 17 (NBA has ~17 fantasy weeks)
        uint256 weeklyProjection = projectedPoints / 17;

        int256 outperformance = 0;
        if (weeklyProjection > 0) {
            // outperformance = (actual - projected) / projected
            outperformance = (int256(_actualPoints) - int256(weeklyProjection)) * SCALE / int256(weeklyProjection);
        }

        weeklyPerformance[currentWeek][_playerToken] = WeeklyPerformance({
            actualPoints: _actualPoints,
            projectedPoints: weeklyProjection,
            outperformance: outperformance
        });

        emit PerformanceSet(currentWeek, _playerToken, outperformance);
    }

    /**
     * @notice Distribute dividends for the current week
     * @dev Called by backend after all performances are set
     */
    function distributeDividends() external onlyOwner {
        WeeklyDividend storage wd = weeklyDividends[currentWeek];
        require(!wd.distributed, "Already distributed");
        require(totalWeeklyFees > 0, "No fees to distribute");

        wd.totalPool = totalWeeklyFees;
        wd.basePool = (totalWeeklyFees * BASE_DIVIDEND_BPS) / BPS_DENOMINATOR;
        wd.outperformerPool = totalWeeklyFees - wd.basePool;

        // Calculate total positive outperformance
        uint256 totalPositive = 0;
        for (uint256 i = 0; i < playerTokens.length; i++) {
            int256 op = weeklyPerformance[currentWeek][playerTokens[i]].outperformance;
            if (op > 0) {
                totalPositive += uint256(op);
            }
        }
        wd.totalPositiveOutperf = totalPositive;
        wd.distributed = true;

        emit DividendsDistributed(currentWeek, wd.totalPool, wd.basePool, wd.outperformerPool);
    }

    /**
     * @notice Advance to next week (resets fee counters)
     */
    function advanceWeek() external onlyOwner {
        require(weeklyDividends[currentWeek].distributed, "Current week not distributed");

        currentWeek++;

        // Reset fee counters
        totalWeeklyFees = 0;
        for (uint256 i = 0; i < playerTokens.length; i++) {
            weeklyFees[playerTokens[i]] = 0;
        }

        emit WeekAdvanced(currentWeek);
    }

    // ============== AMM FUNCTIONS ==============

    /**
     * @notice Record a fee from an AMM trade
     * @param _playerToken The player token that was traded
     * @param _amount The fee amount
     */
    function recordFee(address _playerToken, uint256 _amount) external {
        require(isRegisteredAMM[msg.sender], "Not registered AMM");
        require(isRegisteredPlayer[_playerToken], "Player not registered");

        weeklyFees[_playerToken] += _amount;
        totalWeeklyFees += _amount;

        emit FeeRecorded(_playerToken, _amount);
    }

    // ============== USER FUNCTIONS ==============

    /**
     * @notice Calculate dividend for a user for a specific week
     * @param _week The week number
     * @param _user The user address
     */
    function calculateDividend(uint256 _week, address _user) public view returns (uint256) {
        WeeklyDividend storage wd = weeklyDividends[_week];
        if (!wd.distributed) return 0;

        uint256 baseDividend = 0;
        uint256 outperformerDividend = 0;

        // Calculate total shares held by user across all players
        uint256 totalUserShares = 0;
        uint256 totalAllShares = 0;

        for (uint256 i = 0; i < playerTokens.length; i++) {
            address pt = playerTokens[i];
            uint256 userShares = IPlayerToken(pt).balanceOf(_user);
            uint256 totalShares = IPlayerToken(pt).totalSupply();

            totalUserShares += userShares;
            totalAllShares += totalShares;

            // Outperformer dividend
            int256 op = weeklyPerformance[_week][pt].outperformance;
            if (op > 0 && wd.totalPositiveOutperf > 0 && totalShares > 0) {
                // Player's share of outperformer pool
                uint256 playerPool = (wd.outperformerPool * uint256(op)) / wd.totalPositiveOutperf;
                // User's share of player pool
                outperformerDividend += (playerPool * userShares) / totalShares;
            }
        }

        // Base dividend (proportional to total shares held)
        if (totalAllShares > 0) {
            baseDividend = (wd.basePool * totalUserShares) / totalAllShares;
        }

        return baseDividend + outperformerDividend;
    }

    /**
     * @notice Claim dividend for a specific week
     * @param _week The week number
     */
    function claimDividend(uint256 _week) external nonReentrant {
        require(weeklyDividends[_week].distributed, "Week not distributed");
        require(!hasClaimed[_week][msg.sender], "Already claimed");

        uint256 dividend = calculateDividend(_week, msg.sender);
        require(dividend > 0, "No dividend to claim");

        hasClaimed[_week][msg.sender] = true;
        userDividend[_week][msg.sender] = dividend;

        paymentToken.safeTransfer(msg.sender, dividend);

        emit DividendClaimed(_week, msg.sender, dividend);
    }

    /**
     * @notice Claim dividends for multiple weeks
     * @param _weeks Array of week numbers
     */
    function claimMultipleWeeks(uint256[] calldata _weeks) external nonReentrant {
        uint256 totalDividend = 0;

        for (uint256 i = 0; i < _weeks.length; i++) {
            uint256 week = _weeks[i];
            if (weeklyDividends[week].distributed && !hasClaimed[week][msg.sender]) {
                uint256 dividend = calculateDividend(week, msg.sender);
                if (dividend > 0) {
                    hasClaimed[week][msg.sender] = true;
                    userDividend[week][msg.sender] = dividend;
                    totalDividend += dividend;
                }
            }
        }

        require(totalDividend > 0, "No dividends to claim");
        paymentToken.safeTransfer(msg.sender, totalDividend);
    }

    // ============== VIEW FUNCTIONS ==============

    /**
     * @notice Get all registered player tokens
     */
    function getPlayerTokens() external view returns (address[] memory) {
        return playerTokens;
    }

    /**
     * @notice Get unclaimed dividends for a user
     */
    function getUnclaimedDividends(address _user) external view returns (uint256 total, uint256[] memory weekNumbers) {
        uint256[] memory unclaimedWeeks = new uint256[](currentWeek);
        uint256 count = 0;
        total = 0;

        for (uint256 w = 1; w <= currentWeek; w++) {
            if (weeklyDividends[w].distributed && !hasClaimed[w][_user]) {
                uint256 div = calculateDividend(w, _user);
                if (div > 0) {
                    total += div;
                    unclaimedWeeks[count] = w;
                    count++;
                }
            }
        }

        // Trim array
        weekNumbers = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            weekNumbers[i] = unclaimedWeeks[i];
        }
    }
}
