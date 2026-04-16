// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IPlayerPool.sol";
import "./PoolFactory.sol";


/**
 * @title DividendHub
 * @notice Round-based dividend distribution for NBA playoff cycles.
 *
 * Each playoff round is one dividend cycle with a variable top-N:
 *   Round 1 (16 teams): top 10 performers
 *   Round 2 (8 teams):  top 5
 *   Conf Finals (4):    top 3
 *   Finals (2):         top 2
 *
 * Top performers ranked by per-game avg FPts (submitted by admin/oracle).
 * Pool split: 80% top performer pool (weighted by avg FPts), 20% base pool.
 * Holdings snapshots from PlayerPool weight each user's pro-rata claim.
 */
contract DividendHub is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============== STRUCTS ==============

    struct RoundPerformance {
        uint256 avgFptsScaled;   // per-game average fantasy points (scaled 1e6)
    }

    struct RoundDividend {
        uint256 topN;                // how many top performers this round (10, 5, 3, 2)
        uint256 totalPool;
        uint256 basePool;            // basePoolBps% of total
        uint256 topPerformerPool;    // remainder
        uint256 totalTopAvgFpts;     // sum of avgFptsScaled for eligible top performers
        bool distributed;
    }

    // ============== STATE ==============

    IERC20 public paymentToken;    // V-Bucks (DBucks contract)
    PoolFactory public factory;
    address public router;

    uint256 public constant BPS = 10000;

    // Configurable split (default: 20% base, 80% top performer)
    uint256 public basePoolBps = 2000;

    uint256 public currentRound;

    // round => poolIdx => performance
    mapping(uint256 => mapping(uint256 => RoundPerformance)) public roundPerformance;
    // round => dividend info
    mapping(uint256 => RoundDividend) public roundDividends;
    // round => user => claimed
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    // round => poolIdx => eligible for top performer pool
    mapping(uint256 => mapping(uint256 => bool)) public topPerformerEligible;
    // round => poolIdx => total shares at distribution
    mapping(uint256 => mapping(uint256 => uint256)) public roundEndPoolTotalShares;
    // round => total shares across ALL pools (for base pool)
    mapping(uint256 => uint256) public roundEndTotalAllShares;
    // round => poolIdx => user => holdings snapshot
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public userRoundHoldings;

    // ============== EVENTS ==============

    event DividendsDistributed(uint256 indexed round, uint256 totalPool, uint256 basePool, uint256 topPerformerPool, uint256 topN);
    event DividendClaimed(uint256 indexed round, address indexed user, uint256 amount);
    event RoundAdvanced(uint256 newRound);
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
        currentRound = 1;
    }

    // ============== CONFIG ==============

    function setBasePoolBps(uint256 _basePoolBps) external onlyOwner {
        require(_basePoolBps <= BPS, "Cannot exceed 100%");
        uint256 old = basePoolBps;
        basePoolBps = _basePoolBps;
        emit BasePoolBpsUpdated(old, _basePoolBps);
    }

    // ============== ADMIN: PERFORMANCE ==============

    /**
     * @notice Submit per-game average fantasy points for each player this round.
     * @param _poolIdxs Player pool indices
     * @param _avgFpts  Per-game average FPts (scaled 1e6)
     */
    function setRoundPerformanceBatch(
        uint256[] calldata _poolIdxs,
        uint256[] calldata _avgFpts
    ) external onlyOwner {
        require(_poolIdxs.length == _avgFpts.length, "Length mismatch");

        for (uint256 i = 0; i < _poolIdxs.length; i++) {
            uint256 idx = _poolIdxs[i];
            address poolAddr = factory.pools(idx);
            require(poolAddr != address(0), "Invalid pool");

            roundPerformance[currentRound][idx] = RoundPerformance({
                avgFptsScaled: _avgFpts[i]
            });
        }
    }

    /**
     * @notice Mark the top N players as eligible for the top performer pool.
     *         Called after setRoundPerformanceBatch. The array length determines top-N.
     */
    function setTopPerformerEligible(uint256[] calldata _poolIdxs) external onlyOwner {
        for (uint256 i = 0; i < _poolIdxs.length; i++) {
            topPerformerEligible[currentRound][_poolIdxs[i]] = true;
        }
    }

    /**
     * @notice Snapshot a user's holdings for the current round.
     *         Called by admin before distribution for each active user.
     *         Reads current holdings from each PlayerPool.
     */
    function snapshotUserHoldings(
        address _user,
        uint256[] calldata _poolIdxs
    ) external onlyOwner {
        for (uint256 i = 0; i < _poolIdxs.length; i++) {
            uint256 idx = _poolIdxs[i];
            address poolAddr = factory.pools(idx);
            if (poolAddr == address(0)) continue;

            uint256 h = IPlayerPool(poolAddr).holdings(_user);
            userRoundHoldings[currentRound][idx][_user] = h;
        }
    }

    // ============== DISTRIBUTION ==============

    /**
     * @notice Distribute dividends for the current round.
     * @param _topN Number of top performers this round (10, 5, 3, or 2).
     */
    function distributeDividends(uint256 _topN) external onlyOwner {
        RoundDividend storage rd = roundDividends[currentRound];
        require(!rd.distributed, "Already distributed");
        require(_topN > 0 && _topN <= 20, "Invalid topN");

        uint256 totalFees = paymentToken.balanceOf(address(this));
        require(totalFees > 0, "No fees");

        rd.topN = _topN;
        rd.totalPool = totalFees;
        rd.basePool = (totalFees * basePoolBps) / BPS;
        rd.topPerformerPool = totalFees - rd.basePool;

        uint256 totalTopAvg = 0;
        uint256 totalAllShares = 0;
        uint256 count = factory.poolCount();

        for (uint256 i = 0; i < count; i++) {
            address poolAddr = factory.pools(i);
            if (poolAddr == address(0)) continue;

            // Snapshot pool-level total shares
            uint256 poolTotal = IPlayerPool(poolAddr).totalShares();
            roundEndPoolTotalShares[currentRound][i] = poolTotal;
            totalAllShares += poolTotal;

            if (topPerformerEligible[currentRound][i]) {
                totalTopAvg += roundPerformance[currentRound][i].avgFptsScaled;
            }
        }

        rd.totalTopAvgFpts = totalTopAvg;
        roundEndTotalAllShares[currentRound] = totalAllShares;
        rd.distributed = true;

        emit DividendsDistributed(currentRound, rd.totalPool, rd.basePool, rd.topPerformerPool, _topN);
    }

    // ============== ROUND MANAGEMENT ==============

    function advanceRound() external onlyOwner {
        require(roundDividends[currentRound].distributed, "Distribute first");
        currentRound++;
        emit RoundAdvanced(currentRound);
    }

    function skipRound() external onlyOwner {
        RoundDividend storage rd = roundDividends[currentRound];
        if (!rd.distributed) {
            rd.distributed = true;
        }
        currentRound++;
        emit RoundAdvanced(currentRound);
    }

    /**
     * @notice Emergency drain — transfer entire token balance to a safe address.
     *         Use if funds are stuck (e.g. no user snapshots were taken before distribution).
     */
    function emergencyDrain(address _to) external onlyOwner {
        require(_to != address(0), "Zero address");
        uint256 balance = paymentToken.balanceOf(address(this));
        require(balance > 0, "Nothing to drain");
        paymentToken.safeTransfer(_to, balance);
    }

    // ============== CLAIMS ==============

    function _getUserHoldings(uint256 _round, uint256 _poolIdx, address _user) internal view returns (uint256) {
        return userRoundHoldings[_round][_poolIdx][_user];
    }

    function _calcTopPerformerDiv(
        uint256 _round,
        uint256 _poolIdx,
        uint256 _userHoldings,
        uint256 _topPerformerPool,
        uint256 _totalTopAvgFpts
    ) internal view returns (uint256) {
        if (_totalTopAvgFpts == 0 || _userHoldings == 0) return 0;
        if (!topPerformerEligible[_round][_poolIdx]) return 0;
        uint256 poolTotal = roundEndPoolTotalShares[_round][_poolIdx];
        if (poolTotal == 0) return 0;
        uint256 avgFpts = roundPerformance[_round][_poolIdx].avgFptsScaled;
        if (avgFpts == 0) return 0;

        // Player's share of the pool, weighted by avg FPts
        uint256 playerPool = (_topPerformerPool * avgFpts) / _totalTopAvgFpts;
        // User's share within this player's pool, weighted by holdings
        return (playerPool * _userHoldings) / poolTotal;
    }

    function calculateDividend(uint256 _round, address _user) public view returns (uint256) {
        RoundDividend storage rd = roundDividends[_round];
        if (!rd.distributed || rd.totalPool == 0) return 0;

        uint256 topPerformerDiv = 0;
        uint256 totalUserHoldings = 0;
        uint256 count = factory.poolCount();
        uint256 totalAllShares = roundEndTotalAllShares[_round];

        for (uint256 i = 0; i < count; i++) {
            uint256 userH = _getUserHoldings(_round, i, _user);
            totalUserHoldings += userH;

            topPerformerDiv += _calcTopPerformerDiv(
                _round, i, userH, rd.topPerformerPool, rd.totalTopAvgFpts
            );
        }

        // Base dividend: pro-rata by holdings across all pools
        uint256 baseDividend = 0;
        if (totalAllShares > 0) {
            baseDividend = (rd.basePool * totalUserHoldings) / totalAllShares;
        }

        return baseDividend + topPerformerDiv;
    }

    function claimDividend(uint256 _round) external nonReentrant {
        require(roundDividends[_round].distributed, "Not distributed");
        require(!hasClaimed[_round][msg.sender], "Already claimed");

        uint256 dividend = calculateDividend(_round, msg.sender);
        require(dividend > 0, "No dividend");

        uint256 balance = paymentToken.balanceOf(address(this));
        if (dividend > balance) {
            dividend = balance;
        }

        hasClaimed[_round][msg.sender] = true;
        paymentToken.safeTransfer(msg.sender, dividend);

        emit DividendClaimed(_round, msg.sender, dividend);
    }

    function claimMultipleRounds(uint256[] calldata _rounds) external nonReentrant {
        uint256 total = 0;

        for (uint256 i = 0; i < _rounds.length; i++) {
            uint256 r = _rounds[i];
            if (!roundDividends[r].distributed || hasClaimed[r][msg.sender]) continue;

            uint256 d = calculateDividend(r, msg.sender);
            if (d == 0) continue;

            uint256 balance = paymentToken.balanceOf(address(this));
            if (balance < d + total) break;

            hasClaimed[r][msg.sender] = true;
            total += d;

            emit DividendClaimed(r, msg.sender, d);
        }

        require(total > 0, "No dividends");
        paymentToken.safeTransfer(msg.sender, total);
    }

    // ============== VIEWS ==============

    function getUnclaimedDividends(address _user) external view returns (uint256 total, uint256 roundCount) {
        total = 0;
        roundCount = 0;
        for (uint256 r = 1; r <= currentRound; r++) {
            if (roundDividends[r].distributed && !hasClaimed[r][_user]) {
                uint256 d = calculateDividend(r, _user);
                if (d > 0) {
                    total += d;
                    roundCount++;
                }
            }
        }
    }
}
