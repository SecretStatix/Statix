// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IPlayerPool.sol";
import "./PoolFactory.sol";


// FIXME: weeklong projected fantasy is wrong. 
// FIXME: 

/**
 * @title DividendHub
 * @notice Centralized dividend management across all player pools.
 *         Accumulates fees from pools, manages weekly performance data,
 *         distributes dividends, and handles claims.
 *
 * Base/outperformer split is configurable via setBasePoolBps().
 */
contract DividendHub is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============== STRUCTS ==============
    struct WeeklyPerformance {
        uint256 actualPoints;    // Actual fantasy points (scaled 1e6)
        uint256 projectedPoints; // Weekly projection (scaled 1e6)
        int256 outperformance;   // (actual - projected) / projected (scaled 1e18)
    }

    struct WeeklyDividend {
        uint256 totalPool;
        uint256 basePool;            // basePoolBps% of total
        uint256 outperformerPool;    // remainder
        uint256 totalPositiveOutperf;
        bool distributed;
    }

    // ============== STATE ==============

    IERC20 public paymentToken;    // DBucks
    PoolFactory public factory;
    address public router;

    uint256 public constant BPS = 10000;

    // Configurable dividend split (default: 20% base, 80% outperformer)
    uint256 public basePoolBps = 2000; // 20% of fees go to base pool (all holders)

    uint256 public currentWeek;

    // week => poolIdx => performance
    mapping(uint256 => mapping(uint256 => WeeklyPerformance)) public weeklyPerformance;
    // week => dividend info
    mapping(uint256 => WeeklyDividend) public weeklyDividends;
    // week => user => claimed
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    // week => poolIdx => eligible for outperformer pool
    mapping(uint256 => mapping(uint256 => bool)) public outperformerEligible;
    // week => poolIdx => totalShares at distribution time
    mapping(uint256 => mapping(uint256 => uint256)) public weekEndTotalShares;

    // ============== EVENTS ==============

    event DividendsDistributed(uint256 indexed week, uint256 totalPool, uint256 basePool, uint256 outperformerPool);
    event DividendClaimed(uint256 indexed week, address indexed user, uint256 amount);
    event WeekAdvanced(uint256 newWeek);
    event TradingPaused(bool paused);
    event BasePoolBpsUpdated(uint256 oldBps, uint256 newBps);

    // ============== CONSTRUCTOR ==============

    constructor(
        address _paymentToken,
        address _factory,
        address _router
    ) Ownable(msg.sender) {
        paymentToken = IERC20(_paymentToken);
        factory = PoolFactory(_factory);
        router = _router;
        currentWeek = 1;
    }

    // ============== CONFIG ==============

    /**
     * @notice Update the base pool percentage. Remainder goes to outperformer pool.
     * @param _basePoolBps New base pool share in basis points (e.g. 2000 = 20%). Max 10000.
     */
    function setBasePoolBps(uint256 _basePoolBps) external onlyOwner {
        require(_basePoolBps <= BPS, "Cannot exceed 100%");
        uint256 old = basePoolBps;
        basePoolBps = _basePoolBps;
        emit BasePoolBpsUpdated(old, _basePoolBps);
    }

    // ============== ADMIN: PERFORMANCE ==============
    function setWeeklyPerformanceBatch(
        uint256[] calldata _poolIdxs,
        uint256[] calldata _actualPoints
    ) external onlyOwner {
        require(_poolIdxs.length == _actualPoints.length, "Length mismatch");

        for (uint256 i = 0; i < _poolIdxs.length; i++) {
            uint256 idx = _poolIdxs[i];
            address poolAddr = factory.pools(idx);
            require(poolAddr != address(0), "Invalid pool");

            IPlayerPool pool = IPlayerPool(poolAddr);
            uint256 weeklyProjection = pool.projectedPoints() / 17;

            int256 outperformance = 0;
            if (weeklyProjection > 0) {
                outperformance = (int256(_actualPoints[i]) - int256(weeklyProjection)) * 1e18 / int256(weeklyProjection);
            }

            weeklyPerformance[currentWeek][idx] = WeeklyPerformance({
                actualPoints: _actualPoints[i],
                projectedPoints: weeklyProjection,
                outperformance: outperformance
            });
        }
    }

    function setOutperformerEligible(uint256[] calldata _poolIdxs) external onlyOwner {
        for (uint256 i = 0; i < _poolIdxs.length; i++) {
            outperformerEligible[currentWeek][_poolIdxs[i]] = true;
        }
    }

    // ============== DISTRIBUTION ==============

    function distributeDividends() external onlyOwner {
        WeeklyDividend storage wd = weeklyDividends[currentWeek];
        require(!wd.distributed, "Already distributed");

        // Total fees = hub's DBucks balance (accumulated from pool fee transfers)
        uint256 totalFees = paymentToken.balanceOf(address(this));
        require(totalFees > 0, "No fees");

        wd.totalPool = totalFees;
        wd.basePool = (totalFees * basePoolBps) / BPS;
        wd.outperformerPool = totalFees - wd.basePool;

        uint256 totalPositive = 0;
        uint256 count = factory.poolCount();

        for (uint256 i = 0; i < count; i++) {
            address poolAddr = factory.pools(i);
            if (poolAddr == address(0)) continue;

            // Snapshot totalShares at distribution time
            uint256 ts = IPlayerPool(poolAddr).snapshotTotalShares();
            weekEndTotalShares[currentWeek][i] = ts;

            int256 op = weeklyPerformance[currentWeek][i].outperformance;
            if (op > 0 && outperformerEligible[currentWeek][i]) {
                totalPositive += uint256(op);
            }
        }

        wd.totalPositiveOutperf = totalPositive;
        wd.distributed = true;

        emit DividendsDistributed(currentWeek, wd.totalPool, wd.basePool, wd.outperformerPool);
    }

    // ============== WEEK MANAGEMENT ==============

    function advanceWeek() external onlyOwner {
        require(weeklyDividends[currentWeek].distributed, "Distribute first");
        currentWeek++;
        emit WeekAdvanced(currentWeek);
    }

    function skipWeek() external onlyOwner {
        WeeklyDividend storage wd = weeklyDividends[currentWeek];
        if (!wd.distributed) {
            wd.distributed = true;
            // totalPool stays 0 — no one can claim for this week
            // Hub balance carries over
        }
        currentWeek++;
        emit WeekAdvanced(currentWeek);
    }

    // ============== CLAIMS ==============

    function _getUserShares(uint256 _week, uint256 _poolIdx, address _user) internal view returns (uint256) {
        address poolAddr = factory.pools(_poolIdx);
        if (poolAddr == address(0)) return 0;
        IPlayerPool pool = IPlayerPool(poolAddr);
        if (pool.lastSnapshotWeek(_user) >= _week) {
            return pool.weekEndHoldings(_week, _user);
        }
        return pool.holdings(_user);
    }

    function _calcOutperformerDiv(
        uint256 _week,
        uint256 _poolIdx,
        uint256 _userShares,
        uint256 _outperformerPool,
        uint256 _totalPositiveOutperf
    ) internal view returns (uint256) {
        if (_totalPositiveOutperf == 0 || _userShares == 0) return 0;
        uint256 playerTotal = weekEndTotalShares[_week][_poolIdx];
        if (playerTotal == 0) return 0;
        int256 op = weeklyPerformance[_week][_poolIdx].outperformance;
        if (op <= 0 || !outperformerEligible[_week][_poolIdx]) return 0;
        uint256 playerPool = (_outperformerPool * uint256(op)) / _totalPositiveOutperf;
        return (playerPool * _userShares) / playerTotal;
    }

    function calculateDividend(uint256 _week, address _user) public view returns (uint256) {
        WeeklyDividend storage wd = weeklyDividends[_week];
        if (!wd.distributed || wd.totalPool == 0) return 0;

        uint256 outperformerDividend = 0;
        uint256 totalUserShares = 0;
        uint256 totalAllShares = 0;
        uint256 count = factory.poolCount();

        for (uint256 i = 0; i < count; i++) {
            uint256 userShares = _getUserShares(_week, i, _user);
            uint256 playerTotal = weekEndTotalShares[_week][i];

            totalUserShares += userShares;
            totalAllShares += playerTotal;

            outperformerDividend += _calcOutperformerDiv(
                _week, i, userShares, wd.outperformerPool, wd.totalPositiveOutperf
            );
        }

        uint256 baseDividend = 0;
        if (totalAllShares > 0) {
            baseDividend = (wd.basePool * totalUserShares) / totalAllShares;
        }

        return baseDividend + outperformerDividend;
    }

    function claimDividend(uint256 _week) external nonReentrant {
        require(weeklyDividends[_week].distributed, "Not distributed");
        require(!hasClaimed[_week][msg.sender], "Already claimed");

        uint256 dividend = calculateDividend(_week, msg.sender);
        require(dividend > 0, "No dividend");

        uint256 balance = paymentToken.balanceOf(address(this));
        if (dividend > balance) {
            dividend = balance;
        }

        hasClaimed[_week][msg.sender] = true;
        paymentToken.safeTransfer(msg.sender, dividend);

        emit DividendClaimed(_week, msg.sender, dividend);
    }

    /**
     * @notice Claim dividends for multiple weeks. Stops when Hub balance runs out
     *         so unclaimed weeks remain claimable later (no silent fund loss).
     */
    function claimMultipleWeeks(uint256[] calldata _weeks) external nonReentrant {
        uint256 total = 0;

        for (uint256 i = 0; i < _weeks.length; i++) {
            uint256 w = _weeks[i];
            if (!weeklyDividends[w].distributed || hasClaimed[w][msg.sender]) continue;

            uint256 d = calculateDividend(w, msg.sender);
            if (d == 0) continue;

            // Check if Hub can afford this week's payout
            uint256 balance = paymentToken.balanceOf(address(this));
            if (balance < d + total) {
                // Can't afford this week — stop here, leave it claimable for later
                break;
            }

            hasClaimed[w][msg.sender] = true;
            total += d;

            emit DividendClaimed(w, msg.sender, d);
        }

        require(total > 0, "No dividends");
        paymentToken.safeTransfer(msg.sender, total);
    }

    // ============== VIEWS ==============

    function getUnclaimedDividends(address _user) external view returns (uint256 total, uint256 weekCount) {
        total = 0;
        weekCount = 0;
        for (uint256 w = 1; w <= currentWeek; w++) {
            if (weeklyDividends[w].distributed && !hasClaimed[w][_user]) {
                uint256 d = calculateDividend(w, _user);
                if (d > 0) {
                    total += d;
                    weekCount++;
                }
            }
        }
    }
}
