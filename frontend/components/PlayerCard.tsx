'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { PlayerData } from './PlayerGrid';
import { PlayerAvatar } from './PlayerAvatar';
import { cn } from '@/lib/utils';

interface PlayerCardProps {
  player: PlayerData;
  onTrade: () => void;
  playingTonight?: boolean;
  flashSide?: 'buy' | 'sell' | null;
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
    borderLeftColor: `rgb(${r}, ${g}, ${b})`,
    '--team-r': r,
    '--team-g': g,
    '--team-b': b,
  } as CSSProperties;
}

export function PlayerCard({ player, onTrade, playingTonight = false, flashSide = null }: PlayerCardProps) {
  const TIER1 = new Set(['shai_gilgeous_alexander','victor_wembanyama','nikola_jokic','luka_doncic','anthony_edwards','jayson_tatum','jalen_brunson','donovan_mitchell','cade_cunningham','stephen_curry']);
  const TIER2 = new Set(['jalen_williams','chet_holmgren','de_aaron_fox','dylan_harper','jamal_murray','lebron_james','austin_reaves','alperen_sengun','kevin_durant','amen_thompson','julius_randle','devin_booker','jalen_green','kawhi_leonard','jaylen_brown','karl_anthony_towns','mikal_bridges','evan_mobley','james_harden','paolo_banchero','franz_wagner','lamelo_ball','tyrese_maxey','joel_embiid','bam_adebayo','tyler_herro','scottie_barnes','brandon_ingram','jalen_johnson','og_anunoby']);
  const base = TIER1.has(player.id) ? 15 : TIER2.has(player.id) ? 12.5 : 10;
  const pctChange = ((player.price - base) / base) * 100;
  const isPositive = pctChange >= 0;
  const accentStyle = getTeamAccentStyle(player.team);
  const flashClass = flashSide === 'buy' ? 'card-flash-buy' : flashSide === 'sell' ? 'card-flash-sell' : '';

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1",
        flashClass,
      )}
      style={{
        borderLeftWidth: '3px',
        ...accentStyle,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        const r = getComputedStyle(el).getPropertyValue('--team-r');
        const g = getComputedStyle(el).getPropertyValue('--team-g');
        const b = getComputedStyle(el).getPropertyValue('--team-b');
        el.style.boxShadow = `0 10px 36px rgba(${r}, ${g}, ${b}, 0.5), 0 4px 14px rgba(${r}, ${g}, ${b}, 0.3), 0 4px 12px rgba(0,0,0,0.25)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '';
      }}
    >
      {playingTonight && (
        <span
          className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary ring-1 ring-primary/30"
          title="Playing tonight"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          Tonight
        </span>
      )}
      <Link href={`/player/${player.id}`} className="block p-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar name={player.name} nbaId={player.nbaId} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold leading-tight text-foreground transition-colors duration-200 line-clamp-2 min-h-[2.5rem]">
              {player.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{player.team} · {player.position} · {Math.round(player.avgFantasyPoints)} FP</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xl font-bold text-foreground">${player.price.toFixed(2)}</p>
            <span className={cn(
              "inline-block text-xs font-semibold px-1.5 py-0.5 rounded",
              isPositive ? "bg-success/25 text-success" : "bg-destructive/25 text-destructive"
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
            className="h-11 sm:h-9 rounded-md border-0 bg-[#0a7a52] text-sm font-semibold text-white transition-all duration-200 hover:bg-[#0e9966] focus:outline-none focus:ring-2 focus:ring-[#0a7a52]/40 focus:ring-offset-1 focus:ring-offset-card"
          >
            Buy
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              onTrade();
            }}
            className="h-11 sm:h-9 rounded-md border-0 bg-[#cc3333] text-sm font-semibold text-white transition-all duration-200 hover:bg-[#e04040] focus:outline-none focus:ring-2 focus:ring-[#cc3333]/40 focus:ring-offset-1 focus:ring-offset-card"
          >
            Sell
          </button>
        </div>
      </div>
    </div>
  );
}
