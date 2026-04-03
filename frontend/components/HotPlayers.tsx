'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Flame } from 'lucide-react';
import { PlayerData } from './PlayerGrid';
import { PlayerAvatar } from './PlayerAvatar';

interface HotPlayersProps {
  players: PlayerData[];
  loading: boolean;
}

export function HotPlayers({ players, loading }: HotPlayersProps) {
  const hotPlayers = useMemo(() => {
    return [...players]
      .sort((a, b) => b.avgFantasyPoints - a.avgFantasyPoints)
      .slice(0, 5);
  }, [players]);

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-1">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex items-center gap-3 bg-card border border-white/[0.06] rounded-xl px-4 py-3 animate-pulse shrink-0">
            <div className="w-8 h-8 rounded-lg bg-secondary/70" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-24 bg-secondary/70 rounded" />
              <div className="h-3 w-16 bg-secondary/70 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (hotPlayers.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Flame className="w-4 h-4 text-orange-400 shrink-0" />
        <h3 className="text-sm font-semibold text-foreground">Hot Players</h3>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">by avg fantasy / game</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {hotPlayers.map(player => (
            <Link
              key={player.id}
              href={`/player/${player.id}`}
              className="flex items-center gap-3 bg-card border border-white/[0.06] rounded-xl px-4 py-3 hover:border-primary/20 transition-all duration-200 shrink-0"
            >
              <PlayerAvatar name={player.name} nbaId={player.nbaId} size="sm" />
              <div>
                <p className="text-sm font-medium text-foreground whitespace-nowrap">{player.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-primary">{player.avgFantasyPoints.toFixed(1)} FP/G</span>
                  <span className="text-xs text-muted-foreground">${player.price.toFixed(2)}</span>
                </div>
              </div>
            </Link>
          ))}
      </div>
    </div>
  );
}
