'use client';

import { useEffect, useState } from 'react';
import { getMarket, getMarketLive, type MarketDetail, type LiveScore } from '@/lib/h2h-api';

export function useH2HMarket(id: number | null) {
  const [market, setMarket] = useState<MarketDetail | null>(null);
  const [live, setLive] = useState<LiveScore | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id == null) return;
    let cancelled = false;

    async function load() {
      try {
        const [m, l] = await Promise.all([getMarket(id as number), getMarketLive(id as number)]);
        if (cancelled) return;
        setMarket(m);
        setLive(l);
      } catch {
        // leave stale data in place
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id1 = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id1);
    };
  }, [id]);

  return { market, live, loading };
}
