'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { PlayerCard } from './PlayerCard';
import { TradeModal } from './TradeModal';
import { isGuardPosition, isForwardPosition, isCenterPosition } from '@/lib/positions';
import { getGamesToday, getRecentTransactions } from '@/lib/api';

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
  expanded?: boolean;
}

const MOBILE_INITIAL_COUNT = 10;

export function PlayerGrid({ players, loading, expanded = false }: PlayerGridProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerData | null>(null);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('trending');
  const [teamsTonight, setTeamsTonight] = useState<Set<string>>(new Set());
  const [flashMap, setFlashMap] = useState<Record<number, 'buy' | 'sell'>>({});
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const seenTxRef = useRef<Set<string>>(new Set());
  const initializedTxRef = useRef(false);

  const searchParams = useSearchParams();
  const search = searchParams.get('q') || '';

  // Fetch teams playing tonight (cached 30m on backend; refresh every 15m client-side).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await getGamesToday();
      if (!cancelled) setTeamsTonight(new Set((data.teams || []).map((t) => t.toUpperCase())));
    }
    load();
    const id = setInterval(load, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Poll recent trades and flash matching cards on new entries.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const trades = await getRecentTransactions(20);
        if (cancelled || !Array.isArray(trades)) return;

        // First pass: seed the seen-set so we don't flash historic trades on mount.
        if (!initializedTxRef.current) {
          trades.forEach((t: any) => t?.tx_hash && seenTxRef.current.add(t.tx_hash));
          initializedTxRef.current = true;
          return;
        }

        const fresh = trades.filter((t: any) => t?.tx_hash && !seenTxRef.current.has(t.tx_hash));
        fresh.forEach((t: any) => seenTxRef.current.add(t.tx_hash));

        if (fresh.length === 0) return;

        setFlashMap((prev) => {
          const next = { ...prev };
          fresh.forEach((t: any) => {
            if (typeof t.player_index === 'number') {
              next[t.player_index] = t.side === 'sell' ? 'sell' : 'buy';
            }
          });
          return next;
        });

        // Clear flashes after the CSS animation duration (1.6s + small buffer).
        fresh.forEach((t: any) => {
          if (typeof t.player_index === 'number') {
            const idx = t.player_index;
            setTimeout(() => {
              setFlashMap((prev) => {
                if (!(idx in prev)) return prev;
                const next = { ...prev };
                delete next[idx];
                return next;
              });
            }, 1800);
          }
        });
      } catch {
        // Silent — offline / backend down shouldn't break the grid.
      }
    }
    poll();
    const id = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

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
      const TIER1 = new Set(['shai_gilgeous_alexander','victor_wembanyama','nikola_jokic','luka_doncic','anthony_edwards','jayson_tatum','jalen_brunson','donovan_mitchell','cade_cunningham','stephen_curry']);
      const TIER2 = new Set(['jalen_williams','chet_holmgren','de_aaron_fox','dylan_harper','jamal_murray','lebron_james','austin_reaves','alperen_sengun','kevin_durant','amen_thompson','julius_randle','devin_booker','jalen_green','kawhi_leonard','jaylen_brown','karl_anthony_towns','mikal_bridges','evan_mobley','james_harden','paolo_banchero','franz_wagner','lamelo_ball','tyrese_maxey','joel_embiid','bam_adebayo','tyler_herro','scottie_barnes','brandon_ingram','jalen_johnson','og_anunoby']);
      const base = (id: string) => TIER1.has(id) ? 15 : TIER2.has(id) ? 12.5 : 10;
      list.sort((a, b) => Math.abs(b.price - base(b.id)) - Math.abs(a.price - base(a.id)));
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
        <div className={`grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 ${expanded ? '2xl:grid-cols-5' : '2xl:grid-cols-4'}`}>
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
      <div className="flex items-center gap-2 mb-4 overflow-x-auto py-1 px-0.5">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setActiveTab(key);
              setMobileExpanded(false);
            }}
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

      <div className={`grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 ${expanded ? '2xl:grid-cols-5' : '2xl:grid-cols-4'}`}>
        {filtered.map((player, i) => {
          // On mobile (below md), collapse to 10 unless user is searching or has expanded.
          const hideOnMobile = !search && !mobileExpanded && i >= MOBILE_INITIAL_COUNT;
          return (
            <div key={player.id} className={hideOnMobile ? 'hidden md:block' : undefined}>
              <PlayerCard
                player={player}
                onTrade={() => handleTrade(player)}
                playingTonight={teamsTonight.has((player.team || '').toUpperCase())}
                flashSide={flashMap[player.index] ?? null}
              />
            </div>
          );
        })}
      </div>

      {!search && !mobileExpanded && filtered.length > MOBILE_INITIAL_COUNT && (
        <button
          onClick={() => setMobileExpanded(true)}
          className="md:hidden w-full mt-4 py-3 rounded-xl bg-card border border-white/[0.06] text-sm font-medium text-foreground hover:bg-secondary transition-colors"
        >
          View more players ({filtered.length - MOBILE_INITIAL_COUNT} more)
        </button>
      )}

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
