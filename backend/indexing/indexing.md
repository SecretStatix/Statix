# StatixRouter chain indexer

Python service that reads **StatixRouter** `Buy` / `Sell` events from Base Sepolia and writes analytics to **Supabase**. It does **not** execute trades; it mirrors on-chain activity for charts and activity feeds.

## What gets written

| Table | Purpose | Key |
|--------|---------|-----|
| `pool_price_snapshots` | Per-trade implied AMM price (DBucks per share) for player price history | `(block_number, log_index)` |
| `transactions` | Wallet, player, side, shares, cost, fee, `tx_hash`, timestamps — **derived from logs**, not the frontend `log-transaction` POST | `tx_hash` |

Price per trade is computed from swap amounts (`avg_price_dbucks_per_share`). Buys store **total paid** (cost + fee) in `cost`; sells use **revenue** to the seller. Rows are **upserted** in batches (`UPSERT_BATCH`, default 100).

## Modules

| File | Role |
|------|------|
| **`common.py`** | RPC (`connect_w3_http`, `rpc_url_for_indexer`, `websocket_url_for_indexer`), `StatixRouter` contract wiring, **`collect_trade_index_rows`** (logs → snapshot + transaction rows), `sync_range`, **`run_backfill_once`**, **`catch_up_gap`**, `process_confirmed_head` / `process_blocks_range` for live modes. |
| **`live.py`** | Long-running orchestrator: **startup backfill** then either **poll** or **WebSocket**. CLI: `python -m indexing.live` or `index_statix_router_ws.py`. |
| **`poll.py`** | HTTP loop: every *N* seconds, advance from `indexer_state.json` through **latest − confirmations** and index that range. |
| **`websocket.py`** | JSON-RPC **`eth_subscribe`** to **`newHeads`**; on each head, process confirmed blocks; on disconnect, **`catch_up_gap`** then reconnect; **405** or handshake failure → fall back to **`poll`**. |
| **`batch.py`** | One-shot / cron **`run_backfill_once`** with flags: `--dry-run`, `--reset-state`, `--from-block`; optional **`INDEXER_LOOP_SECONDS`** for repeated batch runs. |

## State

- **`backend/indexer_state.json`** — `{ "last_processed_block": <int> }` updated as blocks are applied (not in dry-run).

## Configuration (environment)

| Variable | Meaning |
|----------|---------|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Required for writes (service role bypasses RLS). |
| `INDEXER_RPC_URL` | Preferred HTTPS RPC; overrides localhost avoidance. |
| `RPC_URL` | Default RPC; **localhost** is replaced by `https://sepolia.base.org` unless `INDEXER_USE_LOCAL_RPC=1`. |
| `INDEXER_WS_URL` | Explicit WebSocket URL for `newHeads` (e.g. Alchemy `wss://…`). If unset, derived from HTTP RPC via `https` → `wss`. |
| `INDEXER_CONFIRMATIONS` | Blocks to wait behind tip before indexing (default **12**). |
| `INDEXER_BLOCK_CHUNK` | Max block span per `get_logs` chunk (default **2000**). |
| `INDEXER_FIRST_LOOKBACK` | When no state/env from-block, start **this many** blocks behind safe head (default **50000**). |
| `INDEXER_FROM_BLOCK` | Initial start block if no state file. |
| `INDEXER_POLL_SECONDS` | If **> 0**, `live.py` uses **poll only** (skips WebSocket). |
| `INDEXER_POLL_FALLBACK_SECONDS` | Poll interval when WebSocket fails (default **3**). |
| `INDEXER_UPSERT_BATCH` | Rows per Supabase upsert batch. |

`deployments.json` must include **StatixRouter** (and chain id must match **Base Sepolia**, 84532).

## How to run

```bash
cd backend
# Live: backfill then WebSocket (or poll if INDEXER_POLL_SECONDS > 0 / --poll-seconds)
./venv/bin/python index_statix_router_ws.py
./venv/bin/python index_statix_router_ws.py --poll-seconds 3   # public RPC without WSS

# Same via module
./venv/bin/python -m indexing.live --poll-seconds 3

# One-shot backfill (batch.py)
./venv/bin/python -m indexing.batch --dry-run
./venv/bin/python -m indexing.batch --from-block 12345678
```

## Live mode behavior

1. **`run_backfill_once`** — Catch up from state / `INDEXER_FROM_BLOCK` / first-lookback window through **safe** latest.
2. Then either:
   - **`run_poll_loop`**: periodic HTTP `eth_blockNumber` + `process_blocks_range` for `last+1 … safe`, or  
   - **`run_ws_loop`**: stream heads, **`process_confirmed_head`** to advance through **`head − CONFIRMATIONS`**.

If the public Base URL returns **HTTP 405** for WSS, the indexer logs a warning and switches to **HTTP polling** at `INDEXER_POLL_FALLBACK_SECONDS`.

## Design notes

- **Idempotency**: Upserts use natural keys (`block_number,log_index` for snapshots, `tx_hash` for transactions).
- **Ordering**: Events are merged Buy+Sell and sorted by `(blockNumber, logIndex)` before insert.
- **Gap recovery**: After WebSocket errors, **`catch_up_gap`** indexes from `last_processed_block + 1` to current safe head before reconnecting.
