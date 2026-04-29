
##  Issue:

Right now, only way to make money is when a player's price go up.

### Problem:
1. You can't profit on bad takes.
2. Price has a hard floor.

The root cause is the same: the market being one-sided. 
Bears have no voice.


## Solution: Lending & Shorting:
Instead of keeping tokens in wallet, investors can lend out their tokens to players with no risk.
With bad takes, users can use the lended tokens to short some players.


## Why:
Once you have lending and shorting, the market starts working in both directions:

1. Holders earn extra income from renting out their shares. They don't have to sell. They don't lose dividend rights. They just get paid for being patient.
2. Bears get to act on their opinions instead of just sitting on the sidelines being right but powerless.
3. Prices become more accurate because both sides of every opinion can put money behind it.
4. The protocol earns more in fees because every short opens a trade and every short closes a trade — two extra fee events per opinion.
5. The dividend pool grows because those fees flow into it.

## Fee ratio (util):
What should the rental fee be? If too low, no lender will bother, if too high, no borrower will bother.

Imagine the lending pool for one player has 100 shares supplied by lenders, and 5 shares are currently borrowed. That's only 5% of the supply being used. There's tons of slack — borrowers can easily get more if they want. So the rental fee stays low to attract more borrowing.

Now imagine 90 of the 100 shares are borrowed. Now there's almost no slack. If a new bear wants to short, there's barely any supply left. The fee starts climbing fast — partly to discourage new borrowing (so existing lenders can pull out if they need to), and partly to attract new lenders (because high fees mean high yield, which pulls in new supply).

The percentage of supply that's being borrowed is called utilization. The system uses utilization to set the fee:
- Low utilization → low fee → low yield for lenders, cheap for borrowers
- High utilization → high fee → high yield for lenders, expensive for borrowers


## Chicken and Egg:
When starting out no one has tokens to lend out for shorting mechanisms. \\ 
Fix is for the protocol itself to be the first lender. We int a starter supply of shares for each player and deposit into the lending pool from day one. 
As shorts open, utilization rises, supply APR climbs and real lenders see an attractive yield and join. Over time, the ideal is for the protcol's share of supply naturally srinks as the market becomes self-sustaining.


---

## The Math

This is where the dynamic stuff lives. Everything below moves on its own based on user behavior — nobody manually sets a number anywhere.

### Utilization

The single most important number. Tells you how hot the lending market is for one player.

```
U = totalBorrowed / totalSupplied
```

Examples:
- 100 shares supplied, 5 borrowed → U = 5%   (cold)
- 100 shares supplied, 50 borrowed → U = 50%  (warm)
- 100 shares supplied, 95 borrowed → U = 95%  (hot, almost out of supply)

Every other number on this page is a function of U.

### Borrow APR (the kinked curve)

What shorts pay annually to keep a position open. Calculated live based on U.

Piecewise formula:

```
if U <= U_optimal:
    borrowAPR = baseRate + (U / U_optimal) * slope1
else:
    borrowAPR = baseRate + slope1 + ((U - U_optimal) / (1 - U_optimal)) * slope2
```

Defaults:
- baseRate = 0%        (no floor — totally cold market = free shorts)
- U_optimal = 80%      (the kink)
- slope1 = 4%          (gentle climb up to the kink)
- slope2 = 60%         (brutal climb past the kink)

Worked rates:

| U | Borrow APR | Vibe |
|---|---|---|
| 0% | 0% | Dead market |
| 20% | 1% | Cold |
| 50% | 2.5% | Warm |
| 80% | 4% | Optimal |
| 90% | 19% | Hot — pulling lenders in |
| 95% | 34% | Cornered |
| 99% | 56.8% | Bleeding red — close your short |

The kink is the whole game. Below it the market grows freely; above it the rate explodes to force equilibrium.

### Supply APR (what lenders earn)

```
supplyAPR = borrowAPR * U * (1 - reserveFactor)
```

Multiply by U because only the borrowed slice of the pool is earning. Multiply by (1 - reserveFactor) because the protocol takes a small cut of borrow interest for the dividend pool.

Defaults:
- reserveFactor = 10% (so 90% of borrow interest goes to lenders)

Worked rates (using the borrow APR table above):

| U | Borrow APR | Supply APR | Daily on $1000 supplied |
|---|---|---|---|
| 5% | 0.25% | 0.011% | $0.0003 |
| 50% | 2.5% | 1.13% | $0.031 |
| 80% | 4% | 2.88% | $0.079 |
| 90% | 19% | 15.39% | $0.42 |
| 95% | 34% | 29.07% | $0.80 |

So lending is meaningful (real money) only when U is high. That's what the trade-fee cut (next section) fixes — gives lenders income even on cold pools.

### Reserve factor (the slice that goes to DividendHub)

Of every dollar of borrow interest paid by a short:

```
to DividendHub = borrowInterest * reserveFactor      = 10%
to lenders     = borrowInterest * (1 - reserveFactor) = 90%
```

Tiny slice, but it scales with all short activity, so over a season it adds real money to the dividend pool that wouldn't exist otherwise.

### Trade fee split (the BIG fee change)

Every buy and sell on the AMM pays a 2% fee. Today that fee splits two ways. After lending, it splits three ways:

| Bucket | Today | After |
|---|---|---|
| DividendHub | 67% of fee | 50% of fee |
| Protocol | 33% of fee | 25% of fee |
| Lenders (this player's pool) | 0% | 25% of fee |

Total fee on a trade is unchanged at 2%. We're just carving 25% of it off the existing buckets and routing it to whoever is supplying that player's lending pool, pro-rata.

This is why lending is interesting even on cold pools. If a player has zero shorts but lots of trading volume, lenders still earn from the volume.

Worked example: Player does $10,000 in trade volume in a week.
- Total fees collected: $200
- Lender bucket: $50
- If you supplied 20% of that pool's lending supply, you earn $10 that week from trade fees alone — before any borrow interest.

### Liquidation math

A short position has collateral (DBucks deposited by the borrower) and debt (shares owed at current AMM price).

```
positionValue = collateral - (sharesOwed * currentPrice - amountReceivedAtOpen)
healthFactor  = (collateral) / (sharesOwed * currentPrice * maintenanceMarginRatio)
```

Defaults:
- maintenanceMarginRatio = 110%  (need collateral ≥ 110% of current debt value)
- liquidationPenalty = 5%        (taken from collateral on forced close)
- liquidatorReward = 50%         (of the 5% penalty)
- dividendHubReward = 50%        (of the 5% penalty)

When healthFactor drops below 1.0 (100%), anyone can call liquidate(). The system force-buys back the shares on the AMM, returns them to the lending pool, and seizes 5% of the position as penalty (split 50/50 between the bot that called it and DividendHub).

Worked example: Short 10 shares at $20, posted $50 collateral. Required collateral = 10 * $20 * 1.10 = $220. Wait — that doesn't work. Right, the collateral has to cover the *change* in price, not the full position. Let me redo:

```
required margin = sharesOwed * (currentPrice - entryPrice) + buffer
```

Short 10 shares at entry price $20 with $50 collateral.
- If price stays $20: needed = 10 * 0 = $0. Health = $50/$0 = ∞. Safe.
- If price rises to $24: needed = 10 * $4 = $40. Health = $50/$40 = 125%. Safe.
- If price rises to $24.50: needed = 10 * $4.50 = $45. Health = $50/$45 = 111%. Close to liquidation.
- If price rises to $25: needed = 10 * $5 = $50. Health = $50/$50 = 100%. LIQUIDATED.

So with $50 collateral on a 10-share short opened at $20, the liquidation price is $25 — a 25% adverse move.

### Per-pool caps (safety rails)

To stop one short from cornering a small pool:

```
maxShortInterest(pool) = min(suppliedShares, capRatio * virtualShares)
```

Defaults:
- capRatio = 20%

So if a player's AMM has 1000 virtualShares, total open shorts in that player can never exceed 200 shares — even if 500 are supplied to the lending pool. Prevents liquidation cascades on thin pools.

---

## Dynamic incentive shifts (the cool part)

This is what makes the math interesting — the ratios above don't sit still. They respond to what's happening in the world.

### Scenario 1: Player gets eliminated

Tuesday night, his team gets swept out of the playoffs. By Wednesday morning:
1. Bears smell blood. Open shorts on him fast.
2. Utilization on his lending pool spikes from 5% → 90%+ in hours.
3. Borrow APR goes from 0.25% → 19%+ (per the kink curve above).
4. Supply APR for his lenders goes from 0.011% → 15%+.
5. Other holders see "wait, I can earn 15% APR just by lending my dead bag of his shares" → they supply their bags too.
6. New supply pulls utilization back down toward 80%.
7. Equilibrium settles around U = 80% with healthy yield for both sides until shorts close as price approaches fair value.

Self-balancing. No admin intervention.

### Scenario 2: Pump on a heavily-shorted player

He drops 50 in Game 4. Price pumps from $30 → $48 in two hours.
1. All open shorts on him are now underwater.
2. Health factors crash. Many positions drop below 110%.
3. Liquidator bots fire — force-buys at $48 each, paying 5% penalty.
4. Forced buys push price even higher temporarily (cascade risk — the per-pool cap exists to limit this).
5. After the cascade, total open shorts drops sharply. Utilization falls.
6. Borrow APR falls. Lender supply APR falls. Some lenders withdraw because yield isn't worth it anymore.
7. The market is now drained of bear interest until fundamentals shift.

The pain is concentrated on the bears who were wrong. Lenders ate the spike yield, then exit. Liquidator bots earned penalties.

### Scenario 3: Round-end snapshot

T-2 hours before snapshot:
1. System auto-closes all open shorts on the AMM (force-buys them back).
2. Lent shares return to the lending pool's holdings, then back to suppliers.
3. Snapshot runs as today — only long holders count.
4. Dividends distribute. Protocol seed-lender shares are excluded from dividends (they earned lending fees instead).
5. After snapshot: lending unfreezes, fresh round starts at U = 0% on every pool.
6. Bears that wanted to stay short have to re-open in the new round (paying open/close fees again, which feed DividendHub).

The round-end close is a forced reset. It's a UX cost (bears who wanted to ride the position lose it) but the dividend math stays clean and the AMM state resets toward natural equilibrium each round.

### Scenario 4: Cold market, protocol-only supply

Day 1 of a new player. No real lenders, just protocol seed (say 150 shares).
1. U = 0%. Borrow APR = 0%. Supply APR = 0%.
2. Bear wants to short — can he? Yes, supply exists, and at U = 0 the borrow rate is 0%.
3. Bear opens 50-share short. Now U = 50/150 = 33%. Borrow APR jumps to ~1.7%.
4. Bear pays the carry. Protocol seed-lender earns 90% of that interest plus 25% of trade fees.
5. If more bears arrive, U climbs, APR climbs, real lenders show up to supply.
6. Eventually the pool stops being protocol-only. Protocol's share of supply dilutes.

This is the bootstrap path. Protocol takes no directional risk — just earns infrastructure fees and steps back as users take over.

---

## Quick reference table

| Number | Default | What it controls |
|---|---|---|
| trade fee total | 2% | Every buy/sell on AMM |
| dividend fee % | 50% (of fee) | Slice of trade fee → DividendHub |
| protocol fee % | 25% (of fee) | Slice of trade fee → operating treasury |
| lender fee % | 25% (of fee) | Slice of trade fee → that player's lenders |
| baseRate | 0% | Borrow APR floor |
| U_optimal | 80% | Where the kink is |
| slope1 | 4% | Borrow APR climb up to kink |
| slope2 | 60% | Borrow APR climb past kink |
| reserveFactor | 10% | Of borrow interest → DividendHub instead of lenders |
| maintenanceMargin | 110% | Health threshold for liquidation |
| liquidationPenalty | 5% | Of position size, taken on liquidation |
| liquidator reward | 50% (of penalty) | Bot that fires liquidate() gets this |
| short interest cap | 20% (of virtualShares) | Max open shorts per player |


