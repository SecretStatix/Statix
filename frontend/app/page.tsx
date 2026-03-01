'use client';

import { useState, useEffect, Suspense } from 'react';
import { getPlayers } from '@/lib/api';
import { useAllPlayers } from '@/hooks/useContracts';
import { formatUnits } from 'viem';
import { PlayerGrid, PlayerData } from '@/components/PlayerGrid';
import { FeaturedPlayer } from '@/components/FeaturedPlayer';
import { HotPlayers } from '@/components/HotPlayers';
import { ActivityFeed } from '@/components/ActivityFeed';

function HomeContent() {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);

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
            nbaId: p.nba_id,
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
            position: p.position || 'F',
            nbaId: p.nba_id,
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

  return (
    <div className="space-y-6">
      {/* Featured spotlight */}
      <FeaturedPlayer players={players} loading={loading} />

      {/* Hot players bar */}
      <HotPlayers players={players} loading={loading} />

      {/* Main content: grid + activity sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <PlayerGrid players={players} loading={loading} />
        </div>
        <div className="lg:col-span-1">
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-muted-foreground">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
