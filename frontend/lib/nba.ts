// NBA headshot URL from official CDN
// Uses nba_id (numeric player ID from nba_api / stats.nba.com)
export function getHeadshotUrl(nbaId: number | undefined, size: '260x190' | '1040x760' = '260x190'): string | null {
  if (!nbaId) return null;
  return `https://cdn.nba.com/headshots/nba/latest/${size}/${nbaId}.png`;
}
