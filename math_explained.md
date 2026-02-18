# Dividend Fantasy: The Math

## Overview

Users trade player shares via an AMM. Trading fees fund weekly dividends paid to shareholders of outperforming players.

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

## 3. Dividend Distribution

### Step 1: Split the Dividend Pool

```
Dividend Pool Split:
├── 20% → Base Dividend (ALL shareholders)
└── 80% → Outperformer Dividend (only outperforming players)
```

### Step 2: Calculate Outperformance

```
outperformance = (actual_points - projected_points) / projected_points
```

Example:
- Projected: 20 points
- Actual: 28 points
- Outperformance = (28 - 20) / 20 = **+40%**

### Step 3: Distribute Base Dividend

```
base_dividend_per_share = base_pool / total_shares_held_by_all_users

user_base_dividend = user_total_shares × base_dividend_per_share
```

### Step 4: Distribute Outperformer Dividend

Only players with positive outperformance qualify.

```
player_share_of_pool = (player_outperformance / sum_of_all_positive_outperformance) × outperformer_pool

dividend_per_share = player_share_of_pool / total_shares_of_player

user_dividend_from_player = user_shares_of_player × dividend_per_share
```

### Step 5: Total User Dividend

```
user_total_dividend = base_dividend + sum(outperformer_dividends_from_each_player)
```

---

## 4. Worked Example

### Setup

- Weekly fees collected: **$1,000**
- Dividend pool (67%): **$670**
  - Base pool (20%): **$134**
  - Outperformer pool (80%): **$536**

### Players

| Player | Outperformance | Qualifies? |
|--------|----------------|------------|
| Mahomes | +30% | Yes |
| Kelce | +15% | Yes |
| Hill | -10% | No |

Total positive outperformance: 30% + 15% = **45%**

### Outperformer Pool Distribution

| Player | Share of Pool | Amount |
|--------|---------------|--------|
| Mahomes | 30/45 = 66.7% | $357.33 |
| Kelce | 15/45 = 33.3% | $178.67 |

### Shareholders

| Player | Alice | Bob | Carol | Total |
|--------|-------|-----|-------|-------|
| Mahomes | 50 | 30 | 20 | 100 |
| Kelce | 40 | 0 | 60 | 100 |
| Hill | 0 | 80 | 20 | 100 |

Total shares: **300**

### Alice's Dividend

**Base dividend:**
```
Alice's shares: 50 + 40 + 0 = 90
Base per share: $134 / 300 = $0.447
Alice base: 90 × $0.447 = $40.20
```

**Outperformer dividend:**
```
From Mahomes: $357.33 × (50/100) = $178.67
From Kelce: $178.67 × (40/100) = $71.47
Total outperformer: $250.14
```

**Alice's total: $40.20 + $250.14 = $290.34**

### Bob's Dividend

**Base dividend:**
```
Bob's shares: 30 + 0 + 80 = 110
Bob base: 110 × $0.447 = $49.13
```

**Outperformer dividend:**
```
From Mahomes: $357.33 × (30/100) = $107.20
From Kelce: $0 (Bob owns none)
Total outperformer: $107.20
```

**Bob's total: $49.13 + $107.20 = $156.33**

### Carol's Dividend

**Base dividend:**
```
Carol's shares: 20 + 60 + 20 = 100
Carol base: 100 × $0.447 = $44.67
```

**Outperformer dividend:**
```
From Mahomes: $357.33 × (20/100) = $71.47
From Kelce: $178.67 × (60/100) = $107.20
Total outperformer: $178.67
```

**Carol's total: $44.67 + $178.67 = $223.34**

### Verification

| User | Dividend |
|------|----------|
| Alice | $290.34 |
| Bob | $156.33 |
| Carol | $223.34 |
| **Total** | **$670.01** |

Company revenue: $330.00
Total: $1,000.01 ✓ (rounding)

---

## 5. Key Formulas Summary

```
AMM Price:
price = cash / shares

Buy Cost:
cost = (k / (shares - n)) - cash

Outperformance:
outperformance = (actual - projected) / projected

Player Dividend Share:
player_pool = (player_op / total_positive_op) × outperformer_pool

User Dividend from Player:
user_div = player_pool × (user_shares / total_player_shares)

Total User Dividend:
total = base_div + Σ(outperformer_divs)
```
