'use client';

import { useState, useEffect, Suspense } from 'react';
import { getPlayers } from '@/lib/api';
import { useAllPlayers } from '@/hooks/useContracts';
import { formatUnits } from 'viem';
import { PlayerGrid, PlayerData } from '@/components/PlayerGrid';
import { FeaturedPlayer } from '@/components/FeaturedPlayer';
import { HotPlayers } from '@/components/HotPlayers';
import { ActivityFeed } from '@/components/ActivityFeed';
import { PriceTicker } from '@/components/PriceTicker';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

function MarketContent() {
  const [rawPlayers, setRawPlayers] = useState<any[]>([]);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { data: onChainData } = useAllPlayers();

  // Fetch player list from API exactly once on mount.
  useEffect(() => {
    async function load() {
      setLoadError(null);
      try {
        const apiPlayers = await getPlayers();
        setRawPlayers(apiPlayers);
      } catch (err) {
        console.error('Failed to load players:', err);
        setLoadError('Unable to fetch player data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Merge chain prices into the player list whenever API data or chain data updates.
  // No extra API call — just re-maps the already-fetched rawPlayers.
  useEffect(() => {
    if (!rawPlayers.length) return;
    // Defensive extraction: onChainData is the `getAllPlayers` tuple
    // [names, symbols, prices, totalShares]. If wagmi returns an unexpected
    // shape (transient state, RPC hiccup, ABI drift), we must NOT throw —
    // the grid has to render on the API price alone.
    const chainPrices: readonly bigint[] | null =
      Array.isArray(onChainData) && Array.isArray((onChainData as any)[2])
        ? ((onChainData as any)[2] as readonly bigint[])
        : null;
    const mapped: PlayerData[] = rawPlayers.map((p: any) => {
      let price = p.price || 10;
      const raw = chainPrices?.[p.index];
      if (raw !== undefined && raw !== null) {
        try {
          price = parseFloat(formatUnits(raw as bigint, 6));
        } catch {
          // Keep API fallback on decode failure.
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
  }, [rawPlayers, onChainData]);

  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-6 py-12 text-center">
        <p className="text-destructive font-medium">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left column: featured, hot, grid */}
      <div className={`space-y-6 ${sidebarOpen ? 'lg:col-span-9' : 'lg:col-span-12'}`}>
        <PriceTicker players={players} loading={loading} />
        <FeaturedPlayer players={players} loading={loading} />
        <HotPlayers players={players} loading={loading} />
        <PlayerGrid players={players} loading={loading} expanded={!sidebarOpen} />
      </div>

      {/* Right column: activity sidebar */}
      <div className={`lg:col-span-3 ${sidebarOpen ? '' : 'hidden'}`}>
        <div className="lg:sticky lg:top-20 space-y-2">
          <ActivityFeed />
        </div>
      </div>

      {/* Sidebar toggle — desktop only */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="hidden lg:flex fixed right-4 top-20 z-40 items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-white/[0.06] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-xs font-medium shadow-lg"
        title={sidebarOpen ? 'Hide activity' : 'Show activity'}
      >
        {sidebarOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
        {sidebarOpen ? 'Hide' : 'Activity'}
      </button>
    </div>
  );
}

export default function MarketPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-muted-foreground">Loading...</div>}>
      <MarketContent />
    </Suspense>
  );
}
