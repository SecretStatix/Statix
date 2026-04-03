'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PlayerData } from './PlayerGrid';
import { PlayerAvatar } from './PlayerAvatar';

interface HotPlayersProps {
  players: PlayerData[];
  loading: boolean;
}

export function HotPlayers({ players, loading }: HotPlayersProps) {
  const hotPlayers = useMemo(() => {
    return [...players]
      .sort((a, b) => Math.abs(b.price - 10) - Math.abs(a.price - 10))
      .slice(0, 5);
  }, [players]);

  if (loading) {
    return (
      <div className="border-y border-white/[0.15] py-3">
        <div className="flex items-center gap-10">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="flex items-center gap-2 shrink-0 animate-pulse">
              <div className="w-6 h-6 rounded-md bg-secondary/70" />
              <div className="h-3.5 w-20 bg-secondary/70 rounded" />
              <div className="h-3.5 w-14 bg-secondary/70 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (hotPlayers.length === 0) return null;

  // Triple the items for seamless looping
  const tickerItems = [...hotPlayers, ...hotPlayers, ...hotPlayers];

  return (
    <div className="border-y border-white/[0.15] py-2.5 overflow-hidden">
      <div className="ticker-track flex items-center">
        {tickerItems.map((player, idx) => {
          const pctChange = ((player.price - 10) / 10) * 100;
          const isPositive = pctChange >= 0;
          return (
            <Link
              key={`${player.id}-${idx}`}
              href={`/player/${player.id}`}
              className="flex items-center gap-2.5 shrink-0 px-5 hover:brightness-125 transition-all duration-150"
            >
              <PlayerAvatar name={player.name} nbaId={player.nbaId} size="sm" />
              <span className="text-sm font-medium text-foreground whitespace-nowrap">{player.name}</span>
              <span className="text-sm font-bold text-foreground">${player.price.toFixed(2)}</span>
              <span className={`text-xs font-bold ${isPositive ? 'text-success' : 'text-destructive'}`}>
                {isPositive ? '\u25B2' : '\u25BC'} {Math.abs(pctChange).toFixed(1)}%
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
