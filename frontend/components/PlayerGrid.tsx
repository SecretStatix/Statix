'use client';

import { useState, useEffect } from 'react';
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

export function PlayerGrid() {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerData | null>(null);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Try to get on-chain prices
  const { data: onChainData } = useAllPlayers();

  useEffect(() => {
    async function load() {
      try {
        const apiPlayers = await getPlayers();

        const mapped: PlayerData[] = apiPlayers.map((p: any, i: number) => {
          // Use on-chain price if available, else default $10
          let price = 10;
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
            avgFantasyPoints: p.avg_fantasy_points,
            weeklyProjection: p.weekly_projection,
            seasonProjection: p.season_projection,
            totalShares: 0,
          };
        });

        setPlayers(mapped);
      } catch (err) {
        console.error('Failed to load players:', err);
        // Fallback: use deployments.json directly
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
            avgFantasyPoints: p.weekly_projection / 3.5,
            weeklyProjection: p.weekly_projection,
            seasonProjection: p.season_projection,
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

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.team.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-400">
        Loading players...
      </div>
    );
  }

  return (
    <>
      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md bg-gray-800 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <span className="ml-4 text-gray-400 text-sm">{filtered.length} players</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            onTrade={() => handleTrade(player)}
          />
        ))}
      </div>

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
