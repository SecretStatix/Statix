/**
 * Faucet numbers (human-readable DBucks, 6 decimals on-chain).
 * Deploy reads the same JSON: `blockchain/scripts/deploy-statix.js` → `FAUCET_LIMIT`.
 */
import cfg from "./faucet-config.json";

export const FAUCET_LIMIT_HUMAN = cfg.faucetLimitHuman;
/** Per-click mint on the Portfolio button (each call uses this as `faucet(amount)`). */
export const FAUCET_UI_MINT_AMOUNT = cfg.faucetUiMintPerClickHuman;
