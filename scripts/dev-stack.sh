#!/usr/bin/env bash
# Open three terminal windows: backend (uvicorn), deploy contracts to Base Sepolia, frontend (next dev).
# Usage: ./scripts/dev-stack.sh   (from repo root, or anywhere)
#
# Deploy uses: cd blockchain && npm run deploy:sepolia
#   Requires blockchain/.env with PRIVATE_KEY (deployer) and test ETH on Base Sepolia for gas.
#   Writes deployments.json → frontend/backend can read addresses; faucet is ON on testnet for DBucks mints.
#
# Requires a GUI terminal emulator. Tries: kitty, gnome-terminal, konsole, xfce4-terminal, xterm.
# Override: TERMINAL=gnome-terminal ./scripts/dev-stack.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKEND_CMD="cd $(printf '%q' "$ROOT/backend") && ( [ -f venv/bin/activate ] && . venv/bin/activate; exec uvicorn main:app --reload --host 0.0.0.0 --port 8000 )"
CHAIN_CMD="cd $(printf '%q' "$ROOT/blockchain") && set -e && echo '' && echo '==> Deploying to Base Sepolia (chain 84532)' && echo '    Needs: PRIVATE_KEY in .env here, and Sepolia ETH on that wallet for gas.' && echo '' && npm run deploy:sepolia && echo '' && echo '==> Done. deployments.json updated. In the app: switch wallet to Base Sepolia, then mint DBucks / trade.'"
FRONTEND_CMD="cd $(printf '%q' "$ROOT/frontend") && exec npm run dev"

TERMINAL="${TERMINAL:-}"

if [[ -z "$TERMINAL" ]]; then
  if command -v kitty >/dev/null 2>&1; then
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

launch_three() {
  case "$TERMINAL" in
    kitty)
      kitty -T "Statix — Backend" -d "$ROOT/backend" bash -lc "$BACKEND_CMD" &
      sleep 0.3
      kitty -T "Statix — Deploy Base Sepolia" -d "$ROOT/blockchain" bash -lc "$CHAIN_CMD" &
      sleep 0.3
      kitty -T "Statix — Frontend" -d "$ROOT/frontend" bash -lc "$FRONTEND_CMD" &
      ;;
    gnome-terminal)
      gnome-terminal \
        --window \
        --title "Statix — Backend" \
        --working-directory "$ROOT/backend" \
        -- bash -lc "$BACKEND_CMD" \
        --window \
        --title "Statix — Deploy Base Sepolia" \
        --working-directory "$ROOT/blockchain" \
        -- bash -lc "$CHAIN_CMD" \
        --window \
        --title "Statix — Frontend" \
        --working-directory "$ROOT/frontend" \
        -- bash -lc "$FRONTEND_CMD"
      ;;
    konsole)
      konsole --separate --title "Statix — Backend" -e bash -lc "$BACKEND_CMD" &
      sleep 0.5
      konsole --separate --title "Statix — Deploy Base Sepolia" -e bash -lc "$CHAIN_CMD" &
      sleep 0.5
      konsole --separate --title "Statix — Frontend" -e bash -lc "$FRONTEND_CMD" &
      ;;
    xfce4-terminal)
      xfce4-terminal --title "Statix — Backend" --working-directory "$ROOT/backend" -e bash -lc "$BACKEND_CMD" &
      sleep 0.3
      xfce4-terminal --title "Statix — Deploy Base Sepolia" --working-directory "$ROOT/blockchain" -e bash -lc "$CHAIN_CMD" &
      sleep 0.3
      xfce4-terminal --title "Statix — Frontend" --working-directory "$ROOT/frontend" -e bash -lc "$FRONTEND_CMD" &
      ;;
    xterm)
      xterm -title "Statix — Backend" -e bash -lc "$BACKEND_CMD" &
      xterm -title "Statix — Deploy Base Sepolia" -e bash -lc "$CHAIN_CMD" &
      xterm -title "Statix — Frontend" -e bash -lc "$FRONTEND_CMD" &
      ;;
    *)
      return 1
      ;;
  esac
}

if launch_three; then
  echo "Launched stack with: $TERMINAL"
  echo "  Backend:    http://127.0.0.1:8000"
  echo "  Deploy:     Base Sepolia (84532) — run completes, then use app on same chain"
  echo "  Frontend:   http://localhost:3000 (default Next port)"
  exit 0
fi

cat << EOF >&2
No supported terminal found (tried kitty, gnome-terminal, konsole, xfce4-terminal, xterm).
Install one, or set TERMINAL to a command that accepts: -e bash -lc 'CMD'

Run manually in three terminals:

  Terminal 1 — backend:
    cd $ROOT/backend && source venv/bin/activate 2>/dev/null || true
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

  Terminal 2 — deploy Base Sepolia:
    cd $ROOT/blockchain && npm run deploy:sepolia

  Terminal 3 — frontend:
    cd $ROOT/frontend && npm run dev
EOF
exit 1
