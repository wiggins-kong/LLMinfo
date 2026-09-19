"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DatasetDTO, SyncStatusDTO } from "./types";
import { readCachedDataset, writeCachedDataset } from "./dataset-cache";

export interface DatasetState {
  dataset: DatasetDTO | null;
  status: SyncStatusDTO | null;
  loading: boolean;
  error: string | null;
  /** True while the cached copy is shown but the server copy is still in flight. */
  stale: boolean;
  refresh: () => Promise<void>;
}

export function useDataset(): DatasetState {
  const [dataset, setDataset] = useState<DatasetDTO | null>(null);
  const [status, setStatus] = useState<SyncStatusDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const etagRef = useRef<string | null>(null);

  const loadFromServer = useCallback(async () => {
    const headers: Record<string, string> = {};
    if (etagRef.current) headers["if-none-match"] = etagRef.current;

    const response = await fetch("/api/dataset", { headers, cache: "no-store" });

    if (response.status === 304) {
      setStale(false);
      return;
    }
    if (!response.ok) {
      throw new Error(`数据集请求失败 (${response.status})`);
    }

    const etag = response.headers.get("etag");
    if (etag) etagRef.current = etag;

    const payload = (await response.json()) as DatasetDTO;
    setDataset(payload);
    setStale(false);
    void writeCachedDataset(payload);
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (response.ok) setStatus((await response.json()) as SyncStatusDTO);
    } catch {
      // status is informational only
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      await fetch("/api/refresh", { method: "POST" });
      await Promise.all([loadFromServer(), loadStatus()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadFromServer, loadStatus]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Paint from cache first so the table is never empty on a cold start.
      const cached = await readCachedDataset();
      if (!cancelled && cached) {
        setDataset(cached);
        setStale(true);
      }
      try {
        await Promise.all([loadFromServer(), loadStatus()]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadFromServer, loadStatus]);

  // Poll periodically; the ETag makes a no-op sync a cheap 304.
  useEffect(() => {
    const interval = setInterval(() => {
      void Promise.all([loadFromServer(), loadStatus()]);
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadFromServer, loadStatus]);

  return { dataset, status, loading, error, stale, refresh };
}
