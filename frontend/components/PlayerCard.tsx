'use client';

import Link from 'next/link';
import { PlayerData } from './PlayerGrid';
import { PlayerAvatar } from './PlayerAvatar';
import { cn } from '@/lib/utils';

interface PlayerCardProps {
  player: PlayerData;
  onTrade: () => void;
}

export function PlayerCard({ player, onTrade }: PlayerCardProps) {
  const pctChange = ((player.price - 10) / 10) * 100;
  const isPositive = pctChange >= 0;

  return (
    <div className="group bg-card rounded-xl border border-white/[0.06] overflow-hidden transition-all duration-200 hover:border-primary/20 shadow-sm">
      <Link href={`/player/${player.id}`} className="block p-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar name={player.name} nbaId={player.nbaId} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors duration-200">
              {player.name}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{player.team} · {player.position}</p>
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
        <button
          onClick={(e) => {
            e.preventDefault();
            onTrade();
          }}
          className="w-full h-9 rounded-lg text-sm font-semibold bg-primary/10 text-primary hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-1 focus:ring-offset-card transition-all duration-200"
        >
          Buy
        </button>
      </div>
    </div>
  );
}
