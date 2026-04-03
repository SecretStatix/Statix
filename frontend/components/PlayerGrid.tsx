'use client';

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { PlayerCard } from './PlayerCard';
import { TradeModal } from './TradeModal';
import { isGuardPosition, isForwardPosition, isCenterPosition } from '@/lib/positions';

export interface PlayerData {
  index: number;
  id: string;
  name: string;
  team: string;
  symbol: string;
  position: string;
  nbaId?: number;
  price: number;
  avgFantasyPoints: number;
  weeklyProjection: number;
  seasonProjection: number;
  totalShares: number;
}

type FilterTab = 'trending' | 'movers' | 'guards' | 'forwards' | 'centers' | 'all';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'trending', label: 'Trending' },
  { key: 'movers', label: 'Top Movers' },
  { key: 'guards', label: 'Guards' },
  { key: 'forwards', label: 'Forwards' },
  { key: 'centers', label: 'Centers' },
  { key: 'all', label: 'All' },
];

interface PlayerGridProps {
  players: PlayerData[];
  loading: boolean;
}

export function PlayerGrid({ players, loading }: PlayerGridProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerData | null>(null);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('trending');

  const searchParams = useSearchParams();
  const search = searchParams.get('q') || '';

  const handleTrade = (player: PlayerData) => {
    setSelectedPlayer(player);
    setTradeModalOpen(true);
  };

  const filtered = useMemo(() => {
    let list = [...players];

    // Search filter from navbar
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.team.toLowerCase().includes(q)
      );
    }

    // Position filters (data uses PG/SG, SF/PF, C — not generic G/F)
    if (activeTab === 'guards') {
      list = list.filter((p) => isGuardPosition(p.position));
    } else if (activeTab === 'forwards') {
      list = list.filter((p) => isForwardPosition(p.position));
    } else if (activeTab === 'centers') {
      list = list.filter((p) => isCenterPosition(p.position));
    }

    // Sorting
    if (activeTab === 'trending') {
      list.sort((a, b) => b.avgFantasyPoints - a.avgFantasyPoints);
    } else if (activeTab === 'movers') {
      list.sort((a, b) => Math.abs(b.price - 10) - Math.abs(a.price - 10));
    } else if (activeTab === 'all') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Position tabs: sort by avgFantasyPoints within the position
      list.sort((a, b) => b.avgFantasyPoints - a.avgFantasyPoints);
    }

    return list;
  }, [players, search, activeTab]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {TABS.map(t => (
            <div key={t.key} className="h-8 w-20 bg-secondary/50 rounded-lg animate-pulse shrink-0" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary/70" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-secondary/70 rounded w-3/4" />
                  <div className="h-3 bg-secondary/70 rounded w-1/2" />
                </div>
                <div className="h-6 w-14 bg-secondary/70 rounded" />
              </div>
              <div className="h-9 bg-secondary/70 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-4 overflow-x-auto py-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
              activeTab === key
                ? 'bg-primary/10 text-primary ring-1 ring-primary/25'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{filtered.length} players</span>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            onTrade={() => handleTrade(player)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-white/[0.06]">
          {search ? 'No players match your search.' : 'No players in this category.'}
        </div>
      )}

      {selectedPlayer && (
        <TradeModal
          isOpen={tradeModalOpen}
          onClose={() => setTradeModalOpen(false)}
          player={selectedPlayer}
        />
      )}
    </>
  );
}
