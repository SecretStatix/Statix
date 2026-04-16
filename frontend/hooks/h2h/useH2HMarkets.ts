'use client';

import { useEffect, useState } from 'react';
import { listMarkets, type MarketStatus, type MarketSummary } from '@/lib/h2h-api';

export function useH2HMarkets(status?: MarketStatus) {
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listMarkets(status);
        if (!cancelled) {
          setMarkets(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e as Error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [status]);

  return { markets, loading, error };
}
