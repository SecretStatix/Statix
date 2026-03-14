'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { PlayerData } from './PlayerGrid';
import { PlayerAvatar } from './PlayerAvatar';
import { cn } from '@/lib/utils';

interface PlayerCardProps {
  player: PlayerData;
  onTrade: () => void;
}

const TEAM_COLORS: Record<string, string> = {
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

function getRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map((c) => `${c}${c}`).join('')
    : value;
  const int = Number.parseInt(normalized, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function getTeamAccentStyle(team: string): CSSProperties {
  const color = TEAM_COLORS[team?.toUpperCase()] || '#2B3440';
  const [r, g, b] = getRgb(color);
  return {
    borderLeftColor: `rgba(${r}, ${g}, ${b}, 0.7)`,
    '--team-r': r,
    '--team-g': g,
    '--team-b': b,
  } as CSSProperties;
}

export function PlayerCard({ player, onTrade }: PlayerCardProps) {
  const pctChange = ((player.price - 10) / 10) * 100;
  const isPositive = pctChange >= 0;
  const accentStyle = getTeamAccentStyle(player.team);

  return (
    <div
      className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1"
      style={{
        borderLeftWidth: '3px',
        ...accentStyle,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        const r = getComputedStyle(el).getPropertyValue('--team-r');
        const g = getComputedStyle(el).getPropertyValue('--team-g');
        const b = getComputedStyle(el).getPropertyValue('--team-b');
        el.style.boxShadow = `0 8px 24px rgba(${r}, ${g}, ${b}, 0.18), 0 4px 12px rgba(0,0,0,0.2)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '';
      }}
    >
      <Link href={`/player/${player.id}`} className="block p-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar name={player.name} nbaId={player.nbaId} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground transition-colors duration-200">
              {player.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{player.team} · {player.position}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xl font-bold text-foreground">${player.price.toFixed(2)}</p>
            <span className={cn(
              "inline-block text-xs font-semibold px-1.5 py-0.5 rounded",
              isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
            )}>
              {isPositive ? '+' : ''}{pctChange.toFixed(1)}%
            </span>
          </div>
        </div>
      </Link>

      <div className="px-4 pb-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              onTrade();
            }}
            className="h-9 rounded-md border-0 bg-[#0f8a5f] text-sm font-semibold text-white transition-all duration-200 hover:bg-[#12a06d] focus:outline-none focus:ring-2 focus:ring-[#12a06d]/40 focus:ring-offset-1 focus:ring-offset-card"
          >
            Buy
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              onTrade();
            }}
            className="h-9 rounded-md border-0 bg-destructive text-sm font-semibold text-white transition-all duration-200 hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-destructive/40 focus:ring-offset-1 focus:ring-offset-card"
          >
            Sell
          </button>
        </div>
      </div>
    </div>
  );
}
