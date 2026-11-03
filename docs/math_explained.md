# Statix: The Math

## Overview

Users trade player shares via an AMM. Trading fees fund periodic dividends paid to shareholders of the top 10 fantasy point scorers.

---

## 1. AMM (Automated Market Maker)

### Formula: Constant Product

```
shares_in_pool × cash_in_pool = k (constant)
```

### Price

```
price = cash_in_pool / shares_in_pool
```

### Buying Shares

When you buy `n` shares:

```
new_shares = old_shares - n
new_cash = k / new_shares
cost = new_cash - old_cash
```

Example:
- Pool: 1000 shares, $10,000 cash
- k = 10,000,000
- Price = $10/share

Buy 50 shares:
- new_shares = 950
- new_cash = 10,000,000 / 950 = $10,526.32
- cost = $10,526.32 - $10,000 = **$526.32**
- Average price = $526.32 / 50 = **$10.53/share** (slippage)

### Selling Shares

When you sell `n` shares:

```
new_shares = old_shares + n
new_cash = k / new_shares
revenue = old_cash - new_cash
```

---

## 2. Fee Structure

```
Trading Fee: 1.5%

Fee Split:
├── 67% → Dividend Pool (back to users)
└── 33% → Company Revenue
```

---

## 3. Fantasy Points

```
FPts = PTS×1 + REB×1.2 + AST×1.5 + STL×3 + BLK×3 - TOV×1
```

Each period (weekly or bi-weekly), we sum each player's total fantasy points across all games played.

---

## 4. Dividend Distribution

### Step 1: Split the Dividend Pool

```
Dividend Pool Split:
├── 20% → Base Dividend (ALL shareholders)
└── 80% → Top Performer Dividend (top 10 players by absolute FPts)
```

### Step 2: Rank Players by Absolute Fantasy Points

All 50 players are ranked by their total fantasy points scored in the period.
The top 10 are eligible for the top performer pool.

No projections. No outperformance calculations. Just absolute performance.

### Step 3: Distribute Base Dividend

```
base_dividend_per_share = base_pool / total_shares_held_by_all_users

user_base_dividend = user_total_shares × base_dividend_per_share
```

### Step 4: Distribute Top Performer Dividend

The 80% pool is split among the top 10 players, weighted by their actual fantasy points.

```
player_share_of_pool = (player_fpts / sum_of_top10_fpts) × top_performer_pool

dividend_per_share = player_share_of_pool / total_shares_of_player

user_dividend_from_player = user_shares_of_player × dividend_per_share
```

### Step 5: Total User Dividend

```
user_total_dividend = base_dividend + sum(top_performer_dividends_from_each_player)
```

---

## 5. Worked Example

### Setup

- Weekly fees collected: **$1,000**
- Dividend pool (67%): **$670**
  - Base pool (20%): **$134**
  - Top performer pool (80%): **$536**

### Players (Top 3 of 10 shown)

| Player | Fantasy Points | In Top 10? |
|--------|---------------|------------|
| Jokic | 220 FPts | Yes |
| Wemby | 195 FPts | Yes |
| Luka | 180 FPts | Yes |
| ... | ... | ... |

Sum of top 10 FPts: **1,800** (for this example)

### Top Performer Pool Distribution (top 3 shown)

| Player | Share of Pool | Amount |
|--------|---------------|--------|
| Jokic | 220/1800 = 12.2% | $65.42 |
| Wemby | 195/1800 = 10.8% | $58.09 |
| Luka | 180/1800 = 10.0% | $53.56 |

### Shareholders

| Player | Alice | Bob | Carol | Total |
|--------|-------|-----|-------|-------|
| Jokic | 50 | 30 | 20 | 100 |
| Wemby | 40 | 0 | 60 | 100 |
| Luka | 0 | 80 | 20 | 100 |

Total shares across all 50 players: **300** (simplified)

### Alice's Dividend

**Base dividend:**
```
Alice's shares: 50 + 40 + 0 = 90
Base per share: $134 / 300 = $0.447
Alice base: 90 × $0.447 = $40.20
```

**Top performer dividend:**
```
From Jokic: $65.42 × (50/100) = $32.71
From Wemby: $58.09 × (40/100) = $23.24
Total top performer: $55.95
```

**Alice's total: $40.20 + $55.95 = $96.15**

### Bob's Dividend

**Base dividend:**
```
Bob's shares: 30 + 0 + 80 = 110
Bob base: 110 × $0.447 = $49.13
```

**Top performer dividend:**
```
From Jokic: $65.42 × (30/100) = $19.63
From Luka: $53.56 × (80/100) = $42.85
Total top performer: $62.48
```

**Bob's total: $49.13 + $62.48 = $111.61**

---

## 6. Key Formulas Summary

```
AMM Price:
price = cash / shares

Buy Cost:
cost = (k / (shares - n)) - cash

Fantasy Points:
FPts = PTS×1 + REB×1.2 + AST×1.5 + STL×3 + BLK×3 - TOV×1

Player Dividend Share (top 10 only):
player_pool = (player_fpts / total_top10_fpts) × top_performer_pool

User Dividend from Player:
user_div = player_pool × (user_shares / total_player_shares)

Total User Dividend:
total = base_div + Σ(top_performer_divs)
```

---

## 7. Why Absolute Rankings?

The system uses absolute fantasy points rather than "beat your projection" because:

1. **Stock market feel** — top performers' share prices naturally rise as investors hold long-term
2. **No projection gaming** — no need to predict matchups or exploit schedule advantages
3. **Simpler** — rank by total FPts, distribute. No outperformance ratios needed
4. **Real investment narrative** — "I bought Wemby early" is more compelling than "I knew the Spurs had an easy schedule this week"
