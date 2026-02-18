"""
Market Engine v2
================
AMM pools for each player, fee collection, dividend distribution.
Uses constant product AMM (x * y = k) from dividend_math.py.

Fixes applied:
- Flaw 1: Negative events (injuries, suspensions, bad games)
- Flaw 4: Configurable initial liquidity to avoid week-1 spike
- Flaw 6: Tracks base vs outperformer dividend attribution
"""

import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


# ── Fantasy Scoring ────────────────────────────────────────────────

SCORING = {"pts": 1, "reb": 1.25, "ast": 1.5, "stl": 3, "blk": 3, "tov": -1}


# ── Negative Events ───────────────────────────────────────────────

@dataclass
class NegativeEvent:
    player_id: str
    event_type: str   # "injury", "suspension", "bad_game"
    severity: float   # 0-1, affects sell panic level
    duration: int     # weeks the event lasts (for injuries)
    week: int


NEGATIVE_EVENT_TYPES = [
    {"type": "injury_minor", "label": "minor injury (GTD)", "severity": 0.3, "duration": 1, "weight": 5},
    {"type": "injury_major", "label": "major injury (OUT)", "severity": 0.7, "duration": 3, "weight": 2},
    {"type": "suspension", "label": "suspended", "severity": 0.5, "duration": 1, "weight": 1},
    {"type": "bad_game", "label": "terrible game", "severity": 0.2, "duration": 0, "weight": 6},
    {"type": "personal", "label": "personal reasons (away)", "severity": 0.4, "duration": 1, "weight": 2},
]


# ── Player Model ──────────────────────────────────────────────────

@dataclass
class Player:
    id: str
    name: str
    team: str
    position: str
    avg_fp: float          # average fantasy points per game
    fp_std: float          # standard deviation (game-to-game variance)
    projection: float = 0  # current game projection
    actual: float = 0      # actual game result
    active_event: Optional[NegativeEvent] = None
    event_history: List[NegativeEvent] = field(default_factory=list)

    def generate_projection(self):
        """Generate a realistic projection (close to avg, slight noise)."""
        if self.active_event and self.active_event.severity >= 0.5:
            # Injured/suspended: projection drops significantly
            self.projection = max(0, self.avg_fp * (1 - self.active_event.severity) +
                                  random.gauss(0, self.fp_std * 0.1))
        else:
            self.projection = max(0, self.avg_fp + random.gauss(0, self.fp_std * 0.2))
        return self.projection

    def generate_actual(self):
        """Generate actual performance (wider variance than projection)."""
        if self.active_event and self.active_event.event_type in ("injury_major", "suspension", "personal"):
            # Player is OUT — 0 fantasy points
            self.actual = 0
            return self.actual

        if self.active_event and self.active_event.event_type == "injury_minor":
            # Playing through minor injury — reduced performance
            self.actual = max(0, random.gauss(self.avg_fp * 0.6, self.fp_std * 0.8))
        elif self.active_event and self.active_event.event_type == "bad_game":
            # Bad game — well below average
            self.actual = max(0, random.gauss(self.avg_fp * 0.35, self.fp_std * 0.5))
        else:
            self.actual = max(0, random.gauss(self.avg_fp, self.fp_std))

        return self.actual

    @property
    def outperformance(self):
        if self.projection == 0:
            return 0
        return (self.actual - self.projection) / self.projection

    @property
    def has_active_event(self):
        return self.active_event is not None

    def tick_event(self, current_week: int):
        """Progress/expire events."""
        if self.active_event:
            weeks_elapsed = current_week - self.active_event.week
            if weeks_elapsed >= self.active_event.duration:
                self.active_event = None


def generate_players(n: int) -> List[Player]:
    """Generate N realistic NBA player profiles."""
    archetypes = [
        ("Star PG", "PG", (40, 55), (10, 14)),
        ("Star SG", "SG", (35, 50), (10, 13)),
        ("Star SF", "SF", (38, 55), (10, 14)),
        ("Star PF", "PF", (35, 52), (10, 13)),
        ("Star C", "C", (38, 58), (10, 15)),
        ("Starter PG", "PG", (25, 38), (8, 11)),
        ("Starter SG", "SG", (22, 35), (7, 10)),
        ("Starter SF", "SF", (24, 36), (8, 11)),
        ("Starter PF", "PF", (22, 35), (7, 10)),
        ("Starter C", "C", (24, 38), (8, 12)),
        ("Role PG", "PG", (12, 22), (5, 8)),
        ("Role SG", "SG", (10, 20), (5, 7)),
        ("Role SF", "SF", (12, 22), (5, 8)),
        ("Role PF", "PF", (10, 20), (5, 7)),
        ("Role C", "C", (12, 22), (5, 8)),
        ("Bench PG", "PG", (5, 12), (3, 6)),
        ("Bench SG", "SG", (4, 10), (3, 5)),
        ("Bench SF", "SF", (5, 12), (3, 6)),
        ("Bench PF", "PF", (4, 10), (3, 5)),
        ("Bench C", "C", (5, 12), (3, 6)),
    ]

    teams = ["LAL", "BOS", "DEN", "MIL", "PHO", "GSW", "DAL", "MIA",
             "PHI", "CLE", "NY", "SAC", "MIN", "OKC", "IND"]

    players = []
    for i in range(n):
        arch = archetypes[i % len(archetypes)]
        avg_lo, avg_hi = arch[2]
        std_lo, std_hi = arch[3]

        avg_fp = random.uniform(avg_lo, avg_hi)
        fp_std = random.uniform(std_lo, std_hi)

        player = Player(
            id=f"player_{i+1}",
            name=f"{arch[0]} #{i+1}",
            team=teams[i % len(teams)],
            position=arch[1],
            avg_fp=round(avg_fp, 1),
            fp_std=round(fp_std, 1),
        )
        players.append(player)

    return players


def roll_negative_events(players: Dict[str, Player], week: int,
                         event_chance_per_player: float = 0.075) -> List[NegativeEvent]:
    """
    Roll for negative events. ~15% chance per player per week = ~7.5% per game day.
    Returns list of new events that fired.
    """
    new_events = []
    for pid, player in players.items():
        if player.active_event:
            continue  # already has an active event

        if random.random() < event_chance_per_player:
            # Pick event type weighted by frequency
            weights = [e["weight"] for e in NEGATIVE_EVENT_TYPES]
            event_template = random.choices(NEGATIVE_EVENT_TYPES, weights=weights, k=1)[0]

            event = NegativeEvent(
                player_id=pid,
                event_type=event_template["type"],
                severity=event_template["severity"],
                duration=event_template["duration"],
                week=week,
            )
            player.active_event = event
            player.event_history.append(event)
            new_events.append(event)

    return new_events


# ── AMM Pool ──────────────────────────────────────────────────────

@dataclass
class AMMPool:
    player_id: str
    shares: float
    cash: float
    k: float = 0
    fee_rate: float = 0.015

    def __post_init__(self):
        self.k = self.shares * self.cash

    @property
    def price(self):
        return self.cash / self.shares

    def buy(self, num_shares: float) -> Optional[dict]:
        if num_shares <= 0 or num_shares >= self.shares * 0.5:
            return None

        new_shares = self.shares - num_shares
        new_cash = self.k / new_shares
        gross_cost = new_cash - self.cash
        fee = gross_cost * self.fee_rate
        total_cost = gross_cost + fee

        pre_price = self.price
        self.shares = new_shares
        self.cash = new_cash

        return {
            "side": "buy",
            "shares": num_shares,
            "gross_cost": gross_cost,
            "fee": fee,
            "total_cost": total_cost,
            "avg_price": gross_cost / num_shares,
            "pre_price": pre_price,
            "post_price": self.price,
        }

    def sell(self, num_shares: float) -> Optional[dict]:
        if num_shares <= 0:
            return None

        new_shares = self.shares + num_shares
        new_cash = self.k / new_shares
        gross_revenue = self.cash - new_cash
        fee = gross_revenue * self.fee_rate
        net_revenue = gross_revenue - fee

        pre_price = self.price
        self.shares = new_shares
        self.cash = new_cash

        return {
            "side": "sell",
            "shares": num_shares,
            "gross_revenue": gross_revenue,
            "fee": fee,
            "net_revenue": net_revenue,
            "avg_price": gross_revenue / num_shares,
            "pre_price": pre_price,
            "post_price": self.price,
        }

    def quote_buy(self, num_shares: float) -> Optional[float]:
        if num_shares <= 0 or num_shares >= self.shares * 0.5:
            return None
        new_shares = self.shares - num_shares
        new_cash = self.k / new_shares
        gross = new_cash - self.cash
        return gross * (1 + self.fee_rate)

    def quote_sell(self, num_shares: float) -> Optional[float]:
        if num_shares <= 0:
            return None
        new_shares = self.shares + num_shares
        new_cash = self.k / new_shares
        gross = self.cash - new_cash
        return gross * (1 - self.fee_rate)


# ── Trade Record ──────────────────────────────────────────────────

@dataclass
class Trade:
    week: int
    game: int
    day: int
    agent_id: str
    player_id: str
    side: str
    shares: float
    cost_or_revenue: float
    fee: float
    price_before: float
    price_after: float


# ── Market Engine ─────────────────────────────────────────────────

class MarketEngine:
    def __init__(self, players: List[Player], initial_shares=1000, initial_price=10.0,
                 fee_rate=0.015, top_n_outperformers=10):
        self.players = {p.id: p for p in players}
        self.pools: Dict[str, AMMPool] = {}
        self.fee_rate = fee_rate
        self.top_n_outperformers = top_n_outperformers

        # Fee tracking
        self.total_fees = 0
        self.weekly_fees = 0
        self.fee_history = []

        # Dividend tracking
        self.dividend_history = []

        # Trade log
        self.trades: List[Trade] = []

        # Negative event log
        self.event_log: List[NegativeEvent] = []

        # Price history
        self.price_history: Dict[str, List[tuple]] = {}

        # Initialize pools
        for pid in self.players:
            cash = initial_shares * initial_price
            pool = AMMPool(pid, initial_shares, cash, fee_rate=fee_rate)
            self.pools[pid] = pool
            self.price_history[pid] = []

        # Dividend pool params
        self.dividend_pool_pct = 0.67
        self.company_pct = 0.33
        self.base_dividend_pct = 0.20
        self.outperformer_dividend_pct = 0.80

    def get_price(self, player_id: str) -> float:
        return self.pools[player_id].price

    def execute_buy(self, agent_id: str, player_id: str, num_shares: float,
                    week: int, game: int, day: int) -> Optional[Trade]:
        pool = self.pools[player_id]
        result = pool.buy(num_shares)
        if result is None:
            return None

        self.total_fees += result["fee"]
        self.weekly_fees += result["fee"]

        trade = Trade(
            week=week, game=game, day=day,
            agent_id=agent_id, player_id=player_id,
            side="buy", shares=num_shares,
            cost_or_revenue=result["total_cost"],
            fee=result["fee"],
            price_before=result["pre_price"],
            price_after=result["post_price"],
        )
        self.trades.append(trade)
        return trade

    def execute_sell(self, agent_id: str, player_id: str, num_shares: float,
                     week: int, game: int, day: int) -> Optional[Trade]:
        pool = self.pools[player_id]
        result = pool.sell(num_shares)
        if result is None:
            return None

        self.total_fees += result["fee"]
        self.weekly_fees += result["fee"]

        trade = Trade(
            week=week, game=game, day=day,
            agent_id=agent_id, player_id=player_id,
            side="sell", shares=num_shares,
            cost_or_revenue=-result["net_revenue"],
            fee=result["fee"],
            price_before=result["pre_price"],
            price_after=result["post_price"],
        )
        self.trades.append(trade)
        return trade

    def record_prices(self, day: int):
        for pid, pool in self.pools.items():
            self.price_history[pid].append((day, pool.price))

    def generate_game(self, week: int):
        """Generate projections and actuals, roll negative events."""
        # Tick existing events
        for p in self.players.values():
            p.tick_event(week)

        # Roll for new negative events
        new_events = roll_negative_events(self.players, week)
        self.event_log.extend(new_events)

        # Generate game results
        for p in self.players.values():
            p.generate_projection()
            p.generate_actual()

        return new_events

    def distribute_dividends(self, week: int, agent_holdings: Dict[str, Dict[str, float]]):
        """
        Distribute weekly dividends with full attribution tracking.
        Flaw 6 fix: tracks base vs outperformer dividends separately.
        """
        fees = self.weekly_fees
        dividend_pool = fees * self.dividend_pool_pct
        company_revenue = fees * self.company_pct
        base_pool = dividend_pool * self.base_dividend_pct
        outperformer_pool = dividend_pool * self.outperformer_dividend_pct

        # Calculate outperformance
        player_op = {}
        for pid, player in self.players.items():
            player_op[pid] = player.outperformance

        # Top-N positive outperformers only
        positive_op = {pid: op for pid, op in player_op.items() if op > 0}
        sorted_op = sorted(positive_op.items(), key=lambda x: x[1], reverse=True)
        top_n = dict(sorted_op[:self.top_n_outperformers])
        total_positive_op = sum(top_n.values())

        # Build total shares per agent
        agent_total_shares = {}
        total_all_shares = 0
        for agent_id, holdings in agent_holdings.items():
            total = sum(holdings.values())
            agent_total_shares[agent_id] = total
            total_all_shares += total

        # Base dividend
        base_dividends = {}
        if total_all_shares > 0:
            base_per_share = base_pool / total_all_shares
            for agent_id, total in agent_total_shares.items():
                base_dividends[agent_id] = total * base_per_share

        # Outperformer dividend with per-player attribution
        outperformer_dividends = {}
        # Flaw 6: track which players earned dividends for which agents
        dividend_attribution = {}  # {agent_id: {player_id: amount}}

        if total_positive_op > 0:
            for pid, op in top_n.items():
                player_pool_share = (op / total_positive_op) * outperformer_pool

                total_player_shares = 0
                holders = {}
                for agent_id, holdings in agent_holdings.items():
                    if pid in holdings and holdings[pid] > 0:
                        holders[agent_id] = holdings[pid]
                        total_player_shares += holdings[pid]

                if total_player_shares == 0:
                    continue

                div_per_share = player_pool_share / total_player_shares
                for agent_id, shares in holders.items():
                    amount = shares * div_per_share
                    if agent_id not in outperformer_dividends:
                        outperformer_dividends[agent_id] = 0
                    outperformer_dividends[agent_id] += amount

                    # Attribution tracking
                    if agent_id not in dividend_attribution:
                        dividend_attribution[agent_id] = {}
                    dividend_attribution[agent_id][pid] = {
                        "amount": amount,
                        "player_name": self.players[pid].name,
                        "outperformance": op,
                        "shares_held": shares,
                    }

        # Combine
        all_agents = set(base_dividends.keys()) | set(outperformer_dividends.keys())
        agent_dividends = {
            aid: base_dividends.get(aid, 0) + outperformer_dividends.get(aid, 0)
            for aid in all_agents
        }

        result = {
            "week": week,
            "fees_collected": fees,
            "company_revenue": company_revenue,
            "dividend_pool": dividend_pool,
            "base_pool": base_pool,
            "outperformer_pool": outperformer_pool,
            "top_outperformers": top_n,
            "player_outperformance": player_op,
            "base_dividends": base_dividends,
            "outperformer_dividends": outperformer_dividends,
            "agent_dividends": agent_dividends,
            "total_distributed": sum(agent_dividends.values()),
            "dividend_attribution": dividend_attribution,
        }

        self.dividend_history.append(result)
        self.fee_history.append((week, fees))
        self.weekly_fees = 0

        return result
