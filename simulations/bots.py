"""
Trading Bots (Agents) v2
=========================
Different agent types with varying strategies.
Each bot has a cash balance, player share holdings, and a strategy.

Fixes applied:
- Flaw 2: Agent churn (rage quit + new agent replacement)
- Flaw 3: Balanced buy/sell behavior, new rebalancer type
- Flaw 1: Panic selling on negative events
"""

import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from .engine import MarketEngine, NegativeEvent


@dataclass
class AgentState:
    id: str
    agent_type: str
    cash: float
    initial_cash: float
    holdings: Dict[str, float] = field(default_factory=dict)
    total_fees_paid: float = 0
    total_dividends_received: float = 0
    total_base_dividends: float = 0       # Flaw 6
    total_outperformer_dividends: float = 0  # Flaw 6
    pnl_history: List[dict] = field(default_factory=list)
    active: bool = True          # Flaw 2: can be deactivated (rage quit)
    joined_week: int = 0         # Flaw 2: when they entered
    exited_week: int = -1        # Flaw 2: when they rage quit (-1 = still active)

    def portfolio_value(self, engine: MarketEngine) -> float:
        if not self.active:
            return self.cash  # exited agents only have cash
        holdings_value = sum(
            shares * engine.get_price(pid)
            for pid, shares in self.holdings.items()
            if shares > 0
        )
        return self.cash + holdings_value

    def record_pnl(self, day: int, week: int, engine: MarketEngine):
        portfolio = self.portfolio_value(engine)
        self.pnl_history.append({
            "day": day,
            "week": week,
            "cash": round(self.cash, 2),
            "holdings_value": round(portfolio - self.cash, 2),
            "portfolio_value": round(portfolio, 2),
            "pnl": round(portfolio - self.initial_cash, 2),
            "pnl_pct": round((portfolio - self.initial_cash) / self.initial_cash * 100, 2)
                       if self.initial_cash > 0 else 0,
            "total_fees_paid": round(self.total_fees_paid, 2),
            "total_dividends": round(self.total_dividends_received, 2),
            "total_base_div": round(self.total_base_dividends, 2),
            "total_outperf_div": round(self.total_outperformer_dividends, 2),
            "active": self.active,
        })


def _try_buy(agent: AgentState, engine: MarketEngine, player_id: str,
             max_spend: float, week: int, game: int, day: int) -> bool:
    if not agent.active or max_spend < 1:
        return False
    pool = engine.pools[player_id]
    price = pool.price

    approx_shares = max_spend / (price * 1.15)
    shares_to_buy = max(1, int(approx_shares))

    quote = pool.quote_buy(shares_to_buy)
    if quote is None or quote > agent.cash:
        shares_to_buy = max(1, shares_to_buy // 2)
        quote = pool.quote_buy(shares_to_buy)
        if quote is None or quote > agent.cash:
            return False

    trade = engine.execute_buy(agent.id, player_id, shares_to_buy, week, game, day)
    if trade is None:
        return False

    agent.cash -= trade.cost_or_revenue
    agent.total_fees_paid += trade.fee
    agent.holdings[player_id] = agent.holdings.get(player_id, 0) + shares_to_buy
    return True


def _try_sell(agent: AgentState, engine: MarketEngine, player_id: str,
              shares: float, week: int, game: int, day: int) -> bool:
    if not agent.active:
        return False
    held = agent.holdings.get(player_id, 0)
    to_sell = min(shares, held)
    if to_sell <= 0:
        return False

    trade = engine.execute_sell(agent.id, player_id, to_sell, week, game, day)
    if trade is None:
        return False

    agent.cash -= trade.cost_or_revenue
    agent.total_fees_paid += trade.fee
    agent.holdings[player_id] = held - to_sell
    if agent.holdings[player_id] <= 0:
        del agent.holdings[player_id]
    return True


def _sell_all(agent: AgentState, engine: MarketEngine, week: int, game: int, day: int):
    """Liquidate all holdings."""
    for pid in list(agent.holdings.keys()):
        shares = agent.holdings[pid]
        if shares > 0:
            _try_sell(agent, engine, pid, shares, week, game, day)


# ── Flaw 1: Panic Selling on Negative Events ─────────────────────

def handle_panic_selling(agents: List[AgentState], engine: MarketEngine,
                         events: List[NegativeEvent], week: int, game: int, day: int):
    """When a negative event fires, holders panic sell 30-70% of position."""
    for event in events:
        pid = event.player_id
        sell_pct = 0.3 + event.severity * 0.4  # severity 0→30%, severity 1→70%

        for agent in agents:
            if not agent.active:
                continue
            if pid in agent.holdings and agent.holdings[pid] > 0:
                # Not everyone panics — probability based on agent type
                panic_chance = {
                    "random": 0.7,
                    "momentum": 0.8,   # momentum traders flee fast
                    "value": 0.3,      # value traders hold through dips
                    "passive": 0.2,    # passive barely reacts
                    "rebalancer": 0.5,
                }
                if random.random() < panic_chance.get(agent.agent_type, 0.5):
                    shares = int(agent.holdings[pid] * sell_pct)
                    if shares >= 1:
                        _try_sell(agent, engine, pid, shares, week, game, day)


# ── Flaw 2: Agent Churn ──────────────────────────────────────────

def process_churn(agents: List[AgentState], engine: MarketEngine,
                  week: int, game: int, day: int,
                  churn_rate: float = 0.06) -> List[AgentState]:
    """
    Each week, some agents rage quit (sell all, withdraw).
    Returns list of new replacement agents (delayed entry).
    """
    new_agents = []
    active_agents = [a for a in agents if a.active]

    # Don't churn in first 2 weeks (warm-up)
    if week <= 2:
        return new_agents

    for agent in active_agents:
        if random.random() < churn_rate:
            # Rage quit: sell everything
            _sell_all(agent, engine, week, game, day)
            agent.active = False
            agent.exited_week = week

            # Schedule replacement (enters 1-2 weeks later)
            delay = random.randint(1, 2)
            replacement = AgentState(
                id=f"{agent.agent_type}_r{week}_{random.randint(100,999)}",
                agent_type=agent.agent_type,
                cash=agent.initial_cash,  # fresh capital
                initial_cash=agent.initial_cash,
                joined_week=week + delay,
            )
            new_agents.append(replacement)

    return new_agents


# ── Bot Strategies ────────────────────────────────────────────────

def random_bot_trade(agent: AgentState, engine: MarketEngine,
                     week: int, game: int, day: int):
    """
    Random Bot: Flaw 3 fix — 50/50 buy/sell probability.
    """
    if not agent.active:
        return

    player_ids = list(engine.players.keys())

    if random.random() > 0.6:
        return

    pid = random.choice(player_ids)

    if random.random() < 0.50:  # Flaw 3: was 0.55, now 50/50
        spend_pct = random.uniform(0.05, 0.15)
        max_spend = agent.cash * spend_pct
        if max_spend > 5:
            _try_buy(agent, engine, pid, max_spend, week, game, day)
    else:
        # Sell random holdings
        held_players = [p for p in agent.holdings if agent.holdings[p] > 0]
        if held_players:
            sell_pid = random.choice(held_players)
            sell_pct = random.uniform(0.15, 0.6)
            shares = int(agent.holdings[sell_pid] * sell_pct)
            if shares >= 1:
                _try_sell(agent, engine, sell_pid, shares, week, game, day)


def momentum_bot_trade(agent: AgentState, engine: MarketEngine,
                       week: int, game: int, day: int):
    """
    Momentum Bot: Flaw 3 fix — sells on momentum reversal, not just buys winners.
    """
    if not agent.active:
        return
    if random.random() > 0.7:
        return

    ranked = sorted(engine.players.values(), key=lambda p: p.outperformance, reverse=True)

    # Buy top outperformers
    for player in ranked[:3]:
        if player.outperformance > 0.05:
            spend = agent.cash * random.uniform(0.05, 0.12)
            if spend > 5:
                _try_buy(agent, engine, player.id, spend, week, game, day)

    # Flaw 3 fix: Sell MORE aggressively on underperformance + sell when momentum reverses
    for player in ranked[-5:]:  # bottom 5 instead of bottom 3
        if player.id in agent.holdings:
            if player.outperformance < -0.03:  # lower threshold (was -0.05)
                sell_pct = random.uniform(0.3, 0.8)  # sell more (was 0.2-0.6)
                shares = int(agent.holdings[player.id] * sell_pct)
                if shares >= 1:
                    _try_sell(agent, engine, player.id, shares, week, game, day)

    # Also sell players with negative events
    for pid in list(agent.holdings.keys()):
        player = engine.players.get(pid)
        if player and player.has_active_event:
            sell_pct = random.uniform(0.4, 0.9)
            shares = int(agent.holdings[pid] * sell_pct)
            if shares >= 1:
                _try_sell(agent, engine, pid, shares, week, game, day)


def value_bot_trade(agent: AgentState, engine: MarketEngine,
                    week: int, game: int, day: int):
    """
    Value Bot: Flaw 3 fix — actively sells overvalued tokens.
    """
    if not agent.active:
        return
    if random.random() > 0.5:
        return

    for pid, player in engine.players.items():
        pool = engine.pools[pid]
        price = pool.price

        fair_value = player.avg_fp / 4

        # Factor in negative events
        if player.has_active_event:
            fair_value *= (1 - player.active_event.severity * 0.5)

        if price < fair_value * 0.85:
            spend = agent.cash * random.uniform(0.05, 0.10)
            if spend > 5:
                _try_buy(agent, engine, pid, spend, week, game, day)

        elif price > fair_value * 1.15 and pid in agent.holdings:
            # Flaw 3: Lower threshold (was 1.20) and sell MORE
            sell_pct = random.uniform(0.4, 0.8)  # was 0.3-0.7
            shares = int(agent.holdings[pid] * sell_pct)
            if shares >= 1:
                _try_sell(agent, engine, pid, shares, week, game, day)


def passive_bot_trade(agent: AgentState, engine: MarketEngine,
                      week: int, game: int, day: int):
    """
    Passive Bot: Buy and hold, but now reacts to negative events.
    """
    if not agent.active:
        return

    total_holdings_value = sum(
        shares * engine.get_price(pid)
        for pid, shares in agent.holdings.items()
    )

    if total_holdings_value < agent.initial_cash * 0.3:
        players = list(engine.players.keys())
        picks = random.sample(players, min(5, len(players)))
        spend_each = agent.cash * 0.15

        for pid in picks:
            if spend_each > 5:
                _try_buy(agent, engine, pid, spend_each, week, game, day)
    else:
        # React to negative events (even passive holders flee major injuries)
        for pid in list(agent.holdings.keys()):
            player = engine.players.get(pid)
            if player and player.active_event and player.active_event.severity >= 0.5:
                if random.random() < 0.3:  # 30% chance to sell on major event
                    sell_pct = random.uniform(0.2, 0.5)
                    shares = int(agent.holdings[pid] * sell_pct)
                    if shares >= 1:
                        _try_sell(agent, engine, pid, shares, week, game, day)

        # 5% chance to rebalance
        if random.random() < 0.05:
            pid = random.choice(list(engine.players.keys()))
            spend = agent.cash * random.uniform(0.03, 0.08)
            if spend > 5:
                _try_buy(agent, engine, pid, spend, week, game, day)


def rebalancer_bot_trade(agent: AgentState, engine: MarketEngine,
                         week: int, game: int, day: int):
    """
    Rebalancer Bot (NEW — Flaw 3): Contrarian strategy.
    Sells tokens that have pumped, buys tokens that have dumped.
    Creates natural mean-reversion pressure.
    """
    if not agent.active:
        return
    if random.random() > 0.6:
        return

    # Calculate price deviation from initial ($10)
    initial_price = 10.0
    for pid, pool in engine.pools.items():
        price = pool.price
        deviation = (price - initial_price) / initial_price

        if deviation > 0.15 and pid in agent.holdings:
            # Pumped >15%: sell to take profit
            sell_pct = random.uniform(0.2, 0.5)
            shares = int(agent.holdings[pid] * sell_pct)
            if shares >= 1:
                _try_sell(agent, engine, pid, shares, week, game, day)

        elif deviation < -0.10:
            # Dumped >10%: buy the dip
            spend = agent.cash * random.uniform(0.03, 0.08)
            if spend > 5:
                _try_buy(agent, engine, pid, spend, week, game, day)

        elif deviation > 0.25 and pid not in agent.holdings:
            # Way overextended and we don't hold it — skip (no shorting)
            pass


# ── Strategy Registry ─────────────────────────────────────────────

STRATEGIES = {
    "random": random_bot_trade,
    "momentum": momentum_bot_trade,
    "value": value_bot_trade,
    "passive": passive_bot_trade,
    "rebalancer": rebalancer_bot_trade,
}


def create_agents(config: Dict[str, int], starting_cash: float = 1000) -> List[AgentState]:
    agents = []
    idx = 1
    for agent_type, count in config.items():
        for i in range(count):
            agent = AgentState(
                id=f"{agent_type}_{idx}",
                agent_type=agent_type,
                cash=starting_cash,
                initial_cash=starting_cash,
            )
            agents.append(agent)
            idx += 1
    return agents
