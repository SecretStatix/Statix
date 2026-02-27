'use client';
/**
 * Searchable, sortable grid of players. Data: getPlayers (lib/api). Price fallback: on-chain useAllPlayers.
 * TradeModal opens on Trade click.
 */

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { PlayerCard } from './PlayerCard';
import { TradeModal } from './TradeModal';
import { getPlayers } from '@/lib/api';
import { useAllPlayers } from '@/hooks/useContracts';
import { formatUnits } from 'viem';

export interface PlayerData {
  index: number;
  id: string;
  name: string;
  team: string;
  symbol: string;
  position: string;
  price: number;
  avgFantasyPoints: number;
  weeklyProjection: number;
  seasonProjection: number;
  totalShares: number;
}

type SortKey = 'price' | 'avgFantasyPoints' | 'weeklyProjection' | 'name';

export function PlayerGrid() {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerData | null>(null);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('avgFantasyPoints');

  const { data: onChainData } = useAllPlayers();

  useEffect(() => {
    async function load() {
      try {
        const apiPlayers = await getPlayers();

        const mapped: PlayerData[] = apiPlayers.map((p: any) => {
          let price = p.price || 10;
          if (onChainData) {
            const [, , prices] = onChainData as [string[], string[], bigint[], bigint[]];
            if (prices[p.index]) {
              price = parseFloat(formatUnits(prices[p.index], 6));
            }
          }

          return {
            index: p.index,
            id: p.id,
            name: p.name,
            team: p.team,
            symbol: p.symbol,
            position: p.position || 'F',
            price,
            avgFantasyPoints: p.avg_fantasy_points ?? (p.weekly_projection ?? 0) / 3.5,
            weeklyProjection: p.weekly_projection ?? 0,
            seasonProjection: p.season_projection ?? 0,
            totalShares: 0,
          };
        });

        setPlayers(mapped);
      } catch (err) {
        console.error('Failed to load players:', err);
        try {
          const res = await fetch('/deployments.json');
          const deployment = await res.json();
          const mapped = deployment.players.map((p: any) => ({
            index: p.index,
            id: p.id,
            name: p.name,
            team: p.team || '',
            symbol: p.symbol,
            position: 'F',
            price: 10,
            avgFantasyPoints: (p.weekly_projection ?? 0) / 3.5,
            weeklyProjection: p.weekly_projection ?? 0,
            seasonProjection: p.season_projection ?? 0,
            totalShares: 0,
          }));
          setPlayers(mapped);
        } catch {
          console.error('No player data available');
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [onChainData]);

  const handleTrade = (player: PlayerData) => {
    setSelectedPlayer(player);
    setTradeModalOpen(true);
  };

  const filtered = players
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.team.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return (b[sortBy] ?? 0) - (a[sortBy] ?? 0);
    });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <div className="h-12 rounded-xl bg-secondary/50 animate-pulse" />
          </div>
          <div className="flex items-center text-muted-foreground text-sm sm:w-auto">
            <span className="h-5 w-20 bg-secondary/50 rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-6 space-y-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-secondary/70" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-secondary/70 rounded w-3/4" />
                  <div className="h-4 bg-secondary/70 rounded w-1/2" />
                </div>
                <div className="h-8 w-16 bg-secondary/70 rounded" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1 h-14 bg-secondary/70 rounded-xl" />
                <div className="flex-1 h-14 bg-secondary/70 rounded-xl" />
              </div>
              <div className="h-12 bg-secondary/70 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-12 bg-card border border-white/[0.06] rounded-xl pl-12 pr-4 text-base text-foreground placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200"
          />
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-4">
          <span className="text-sm text-gray-400">{filtered.length} players</span>
          <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl">
            {([
              ['avgFantasyPoints', 'FPts'],
              ['price', 'Price'],
              ['weeklyProjection', 'Weekly'],
              ['name', 'A–Z'],
            ] as [SortKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  sortBy === key
                    ? 'bg-white/10 text-foreground'
                    : 'text-gray-400 hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filtered.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            onTrade={() => handleTrade(player)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400 bg-card rounded-2xl border border-white/[0.06]">
          No players match your search.
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
