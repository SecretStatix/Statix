import type { CSSProperties } from 'react';

// Single source of truth for NBA team accent colors used across PlayerCard,
// the landing-page hero, and any other places we want a "team-tinted" UI.
export const TEAM_COLORS: Record<string, string> = {
  ATL: '#E03A3E',
  BOS: '#007A33',
  BKN: '#111111',
  CHA: '#1D1160',
  CHI: '#CE1141',
  CLE: '#860038',
  DAL: '#00538C',
  DEN: '#0E2240',
  DET: '#C8102E',
  GSW: '#1D428A',
  HOU: '#CE1141',
  IND: '#002D62',
  LAC: '#C8102E',
  LAL: '#FDB927',
  MEM: '#5D76A9',
  MIA: '#98002E',
  MIL: '#00471B',
  MIN: '#0C2340',
  NOP: '#0C2340',
  NYK: '#006BB6',
  OKC: '#007AC1',
  ORL: '#0077C0',
  PHI: '#006BB6',
  PHX: '#1D1160',
  POR: '#E03A3E',
  SAC: '#5A2D81',
  SAS: '#C4CED4',
  TOR: '#CE1141',
  UTA: '#002B5C',
  WAS: '#002B5C',
};

const FALLBACK = '#2B3440';

export function getTeamColor(team?: string): string {
  if (!team) return FALLBACK;
  return TEAM_COLORS[team.toUpperCase()] || FALLBACK;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const normalized =
    value.length === 3
      ? value
          .split('')
          .map((c) => `${c}${c}`)
          .join('')
      : value;
  const int = Number.parseInt(normalized, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

// Returns a style object that paints a 3px team-colored left border and
// exposes the underlying RGB triplet as CSS custom props (--team-r/g/b) so
// callers can use them in box-shadow/glow effects without re-computing.
export function getTeamAccentStyle(team?: string): CSSProperties {
  const color = getTeamColor(team);
  const [r, g, b] = hexToRgb(color);
  return {
    borderLeftColor: `rgb(${r}, ${g}, ${b})`,
    '--team-r': r,
    '--team-g': g,
    '--team-b': b,
  } as CSSProperties;
}
