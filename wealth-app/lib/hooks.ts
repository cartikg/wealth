// lib/hooks.ts — Shared React hooks for Wealth app
import { useState, useEffect, useCallback } from 'react';

export function useApiData<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await fetcher();
      setData(result);
    } catch (e: any) {
      setError(e.message || 'Failed to load data');
      console.error('[useApiData]', e);
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refreshing, refresh, reload: load };
}
