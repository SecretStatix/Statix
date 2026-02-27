'use client';

import Link from 'next/link';
import { PlayerData } from './PlayerGrid';
import { cn } from '@/lib/utils';

interface PlayerCardProps {
  player: PlayerData;
  onTrade: () => void;
}

export function PlayerCard({ player, onTrade }: PlayerCardProps) {
  const initials = player.name.split(' ').map(n => n[0]).join('');

  return (
    <div className="group bg-card rounded-2xl border border-white/[0.06] overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:shadow-black/30 hover:border-white/[0.1] shadow-lg shadow-black/10">
      <Link href={`/player/${player.id}`} className="block p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary/15 flex items-center justify-center text-lg font-bold text-primary flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground truncate group-hover:text-primary transition-colors duration-200">
              {player.name}
            </h3>
            <p className="text-sm text-gray-400 mt-0.5">{player.team} · {player.position}</p>
            <span className="inline-block mt-2 px-2.5 py-0.5 rounded-md bg-success/10 text-xs text-success font-medium border border-success/20">
              {player.symbol}
            </span>
          </div>
          <div className="text-right shrink-0">
            <p className="text-3xl font-bold text-foreground">${player.price.toFixed(2)}</p>
            <p className="text-xs text-gray-400 mt-0.5">per share</p>
          </div>
        </div>

        <div className="mt-8 flex gap-4">
          <div className="flex-1 rounded-xl px-4 py-3 bg-white/[0.03]">
            <p className="text-xs text-gray-400">FPts/Game</p>
            <p className="text-base font-semibold text-foreground mt-1">{player.avgFantasyPoints.toFixed(1)}</p>
          </div>
          <div className="flex-1 rounded-xl px-4 py-3 bg-white/[0.03]">
            <p className="text-xs text-gray-400">Weekly</p>
            <p className="text-base font-semibold text-foreground mt-1">{player.weeklyProjection.toFixed(1)}</p>
          </div>
        </div>
      </Link>

      <div className="px-6 md:px-8 pb-6 md:pb-8">
        <button
          onClick={(e) => {
            e.preventDefault();
            onTrade();
          }}
          className="w-full h-12 rounded-xl text-base font-semibold bg-success text-white hover:bg-success/90 focus:outline-none focus:ring-2 focus:ring-success focus:ring-offset-2 focus:ring-offset-card transition-all duration-200 shadow-md shadow-success/20"
        >
          Trade
        </button>
      </div>
    </div>
  );
}
