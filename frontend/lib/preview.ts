// Preview mode — bypasses auth + wallet, shows mock portfolio/dividend data
// Enable: set NEXT_PUBLIC_PREVIEW_MODE=true in .env.local

export const PREVIEW = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true';

export const PREVIEW_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18' as `0x${string}`;

// Mock portfolio: 6 players with varying positions
export const PREVIEW_HOLDINGS = [
  { index: 2,  name: 'Nikola Jokic',              shares: 45.0,  value: 711.00 },
  { index: 1,  name: 'Giannis Antetokounmpo',     shares: 30.0,  value: 396.00 },
  { index: 0,  name: 'Shai Gilgeous-Alexander',   shares: 25.0,  value: 311.25 },
  { index: 9,  name: 'Victor Wembanyama',         shares: 40.0,  value: 446.00 },
  { index: 7,  name: 'Anthony Edwards',           shares: 20.0,  value: 217.00 },
  { index: 13, name: 'Joel Embiid',               shares: 15.0,  value: 205.50 },
];

export const PREVIEW_BALANCE = 47250.00;
export const PREVIEW_HOLDINGS_VALUE = PREVIEW_HOLDINGS.reduce((s, h) => s + h.value, 0);
export const PREVIEW_TOTAL_VALUE = PREVIEW_BALANCE + PREVIEW_HOLDINGS_VALUE;

// Mock dividends
export const PREVIEW_UNCLAIMED = 1234.56;
export const PREVIEW_UNCLAIMED_WEEKS = 3;
export const PREVIEW_CURRENT_WEEK = 4;

// Mock per-player holdings lookup
export function getPreviewHolding(playerIndex: number): number {
  const h = PREVIEW_HOLDINGS.find(h => h.index === playerIndex);
  return h ? h.shares : 0;
}
