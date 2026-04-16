#!/usr/bin/env bash
# Open five terminal windows: Hardhat node, backend, indexer (→ Supabase), deploy Statix to localhost, Next.js.
# Usage: ./scripts/dev-stack-local.sh   (from repo root, or anywhere)
#
# Flow:
#   1) Hardhat node on http://127.0.0.1:8545 (chain 31337)
#   2) Backend + indexer use backend/deployments.json (written by deploy) and RPC_URL=http://127.0.0.1:8545
#   3) npm run deploy:local — needs the node running first; copies deployments to frontend/backend
#   4) Next.js with NEXT_PUBLIC_LOCAL_CHAIN=true (wagmi/Privy use viem `hardhat` chain → 127.0.0.1:8545)
#
# Indexer: set INDEXER_USE_LOCAL_RPC=1 so localhost RPC is not replaced with Base Sepolia.
#   Still needs SUPABASE_SERVICE_ROLE_KEY in backend/.env for writes.
#
# Frontend waits for frontend/.statix-local-deploy-ready (touched after deploy) so deployments.json is current.
#
# Requires a GUI terminal emulator (same as dev-stack.sh).
# Override: TERMINAL=gnome-terminal ./scripts/dev-stack-local.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE_CMD="cd $(printf '%q' "$ROOT/blockchain") && echo '' && echo '==> Hardhat node — http://127.0.0.1:8545  (chain 31337). Leave this running.' && echo '' && exec npx hardhat node"

BACKEND_CMD="cd $(printf '%q' "$ROOT/backend") && export RPC_URL=http://127.0.0.1:8545 && ( [ -f venv/bin/activate ] && . venv/bin/activate; exec uvicorn main:app --reload --host 0.0.0.0 --port 8000 )"

INDEXER_CMD="cd $(printf '%q' "$ROOT/backend") && export INDEXER_USE_LOCAL_RPC=1 RPC_URL=http://127.0.0.1:8545 && ( [ -f venv/bin/activate ] && . venv/bin/activate; exec python index_statix_router_ws.py --poll-seconds 3 )"

# shellcheck disable=SC2016
CHAIN_CMD="cd $(printf '%q' "$ROOT/blockchain") && set -e && rm -f $(printf '%q' "$ROOT/frontend/.statix-local-deploy-ready") && echo '' && echo '==> Waiting for Hardhat JSON-RPC at http://127.0.0.1:8545 ...' && until curl -sf -X POST http://127.0.0.1:8545 -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_chainId\",\"params\":[],\"id\":1}' | grep -q .; do sleep 1; done && echo '' && echo '==> Deploying Statix to localhost (chain 31337)' && echo '    Unlocked accounts from Hardhat node — account #0 deploys.' && echo '' && npm run deploy:local && touch $(printf '%q' "$ROOT/frontend/.statix-local-deploy-ready") && echo '' && echo '==> Done. deployments.json updated. Import a test key from the Hardhat window into Privy / your wallet.'"

FRONTEND_CMD="cd $(printf '%q' "$ROOT/frontend") && echo 'Waiting for local deploy to finish (Deploy terminal)...' && until test -f .statix-local-deploy-ready; do sleep 1; done && rm -f .statix-local-deploy-ready && export NEXT_PUBLIC_LOCAL_CHAIN=true && exec npm run dev"

escape_for_applescript() {
  printf '%s' "$1" | perl -pe 's/\\/\\\\/g; s/"/\\"/g'
}

TERMINAL="${TERMINAL:-}"

if [[ -z "$TERMINAL" ]]; then
  if [[ "$(uname -s)" == "Darwin" ]] && [[ -d "/System/Applications/Utilities/Terminal.app" || -d "/Applications/Utilities/Terminal.app" ]]; then
    TERMINAL=Terminal.app
  elif command -v kitty >/dev/null 2>&1; then
    TERMINAL=kitty
  elif command -v gnome-terminal >/dev/null 2>&1; then
    TERMINAL=gnome-terminal
  elif command -v konsole >/dev/null 2>&1; then
    TERMINAL=konsole
  elif command -v xfce4-terminal >/dev/null 2>&1; then
    TERMINAL=xfce4-terminal
  elif command -v xterm >/dev/null 2>&1; then
    TERMINAL=xterm
  fi
fi

launch_stack() {
  case "$TERMINAL" in
    Terminal.app|terminal.app|macos)
      macos_do_script() {
        local full="bash -lc $(printf '%q' "$1")"
        osascript -e "tell application \"Terminal\" to do script \"$(escape_for_applescript "$full")\""
      }
      osascript -e 'tell application "Terminal" to activate'
      sleep 0.2
      macos_do_script "$NODE_CMD"
      sleep 0.3
      macos_do_script "$BACKEND_CMD"
      sleep 0.3
      macos_do_script "$INDEXER_CMD"
      sleep 0.3
      macos_do_script "$CHAIN_CMD"
      sleep 0.3
      macos_do_script "$FRONTEND_CMD"
      ;;
    kitty)
      kitty -T "Statix — Hardhat node" -d "$ROOT/blockchain" bash -lc "$NODE_CMD" &
      sleep 0.3
      kitty -T "Statix — Backend" -d "$ROOT/backend" bash -lc "$BACKEND_CMD" &
      sleep 0.3
      kitty -T "Statix — Indexer" -d "$ROOT/backend" bash -lc "$INDEXER_CMD" &
      sleep 0.3
      kitty -T "Statix — Deploy localhost" -d "$ROOT/blockchain" bash -lc "$CHAIN_CMD" &
      sleep 0.3
      kitty -T "Statix — Frontend" -d "$ROOT/frontend" bash -lc "$FRONTEND_CMD" &
      ;;
    gnome-terminal)
      gnome-terminal \
        --window \
        --title "Statix — Hardhat node" \
        --working-directory "$ROOT/blockchain" \
        -- bash -lc "$NODE_CMD" \
        --window \
        --title "Statix — Backend" \
        --working-directory "$ROOT/backend" \
        -- bash -lc "$BACKEND_CMD" \
        --window \
        --title "Statix — Indexer" \
        --working-directory "$ROOT/backend" \
        -- bash -lc "$INDEXER_CMD" \
        --window \
        --title "Statix — Deploy localhost" \
        --working-directory "$ROOT/blockchain" \
        -- bash -lc "$CHAIN_CMD" \
        --window \
        --title "Statix — Frontend" \
        --working-directory "$ROOT/frontend" \
        -- bash -lc "$FRONTEND_CMD"
      ;;
    konsole)
      konsole --separate --title "Statix — Hardhat node" -e bash -lc "$NODE_CMD" &
      sleep 0.5
      konsole --separate --title "Statix — Backend" -e bash -lc "$BACKEND_CMD" &
      sleep 0.5
      konsole --separate --title "Statix — Indexer" -e bash -lc "$INDEXER_CMD" &
      sleep 0.5
      konsole --separate --title "Statix — Deploy localhost" -e bash -lc "$CHAIN_CMD" &
      sleep 0.5
      konsole --separate --title "Statix — Frontend" -e bash -lc "$FRONTEND_CMD" &
      ;;
    xfce4-terminal)
      xfce4-terminal --title "Statix — Hardhat node" --working-directory "$ROOT/blockchain" -e bash -lc "$NODE_CMD" &
      sleep 0.3
      xfce4-terminal --title "Statix — Backend" --working-directory "$ROOT/backend" -e bash -lc "$BACKEND_CMD" &
      sleep 0.3
      xfce4-terminal --title "Statix — Indexer" --working-directory "$ROOT/backend" -e bash -lc "$INDEXER_CMD" &
      sleep 0.3
      xfce4-terminal --title "Statix — Deploy localhost" --working-directory "$ROOT/blockchain" -e bash -lc "$CHAIN_CMD" &
      sleep 0.3
      xfce4-terminal --title "Statix — Frontend" --working-directory "$ROOT/frontend" -e bash -lc "$FRONTEND_CMD" &
      ;;
    xterm)
      xterm -title "Statix — Hardhat node" -e bash -lc "$NODE_CMD" &
      xterm -title "Statix — Backend" -e bash -lc "$BACKEND_CMD" &
      xterm -title "Statix — Indexer" -e bash -lc "$INDEXER_CMD" &
      xterm -title "Statix — Deploy localhost" -e bash -lc "$CHAIN_CMD" &
      xterm -title "Statix — Frontend" -e bash -lc "$FRONTEND_CMD" &
      ;;
    *)
      return 1
      ;;
  esac
}

if launch_stack; then
  echo "Launched local stack with: $TERMINAL"
  echo "  Hardhat:    http://127.0.0.1:8545  (chain 31337)"
  echo "  Backend:    http://127.0.0.1:8000  (RPC_URL=http://127.0.0.1:8545)"
  echo "  Indexer:    StatixRouter → Supabase (INDEXER_USE_LOCAL_RPC=1, RPC_URL=http://127.0.0.1:8545)"
  echo "  Deploy:     npm run deploy:local — completes after node is up"
  echo "  Frontend:   http://localhost:3000 with NEXT_PUBLIC_LOCAL_CHAIN=true (Hardhat / viem chain)"
  exit 0
fi

cat << EOF >&2
No supported terminal found.
  macOS: Terminal.app should be used automatically (or set TERMINAL=Terminal.app).
  Linux: install one of kitty, gnome-terminal, konsole, xfce4-terminal, xterm,
         or set TERMINAL to a command that accepts: -e bash -lc 'CMD'

Run manually in five terminals (order matters):

  Terminal 1 — Hardhat node:
    cd $ROOT/blockchain && npx hardhat node

  Terminal 2 — backend:
    cd $ROOT/backend && source venv/bin/activate 2>/dev/null || true
    export RPC_URL=http://127.0.0.1:8545
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

  Terminal 3 — indexer:
    cd $ROOT/backend && source venv/bin/activate 2>/dev/null || true
    export INDEXER_USE_LOCAL_RPC=1 RPC_URL=http://127.0.0.1:8545
    python index_statix_router_ws.py --poll-seconds 3

  Terminal 4 — deploy (after node responds on 8545):
    cd $ROOT/blockchain && npm run deploy:local

  Terminal 5 — frontend (after deploy wrote deployments.json):
    cd $ROOT/frontend && NEXT_PUBLIC_LOCAL_CHAIN=true npm run dev
EOF
exit 1
