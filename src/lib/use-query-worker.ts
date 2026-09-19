"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Filters, ModelAggregate, SortDir, SortKey, ViewMode } from "./query-engine";
import type { BlendWeights } from "./pricing";
import type { DatasetDTO, OfferDTO } from "./types";
import type { QueryRequest, QueryResponse } from "@/workers/query.worker";

export interface QueryState {
  filters: Filters;
  sortKey: SortKey;
  sortDir: SortDir;
  view: ViewMode;
  blend: BlendWeights;
}

export interface QueryResult {
  models: ModelAggregate[];
  offers: OfferDTO[];
  aggregates: ModelAggregate[];
  totalModels: number;
  totalOffers: number;
  pending: boolean;
  durationMs: number;
}

const EMPTY: QueryResult = {
  models: [],
  offers: [],
  aggregates: [],
  totalModels: 0,
  totalOffers: 0,
  pending: false,
  durationMs: 0,
};

/** Runs the query engine off the main thread, debounced to one frame. */
export function useQueryWorker(dataset: DatasetDTO | null, query: QueryState): QueryResult {
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const latestHandled = useRef(0);
  const [result, setResult] = useState<QueryResult>(EMPTY);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const worker = new Worker(new URL("../workers/query.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.addEventListener("message", (event: MessageEvent<QueryResponse>) => {
      const data = event.data;
      // Ignore out-of-order responses from superseded requests.
      if (data.id < latestHandled.current) return;
      latestHandled.current = data.id;
      setResult({
        models: data.models,
        offers: data.offers,
        aggregates: data.aggregates,
        totalModels: data.totalModels,
        totalOffers: data.totalOffers,
        pending: false,
        durationMs: data.durationMs,
      });
    });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const serializedFilters = useMemo(() => JSON.stringify(query.filters), [query.filters]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || !dataset) return;

    const id = ++requestId.current;
    setResult((prev) => ({ ...prev, pending: true }));

    const timer = setTimeout(() => {
      const message: QueryRequest = {
        id,
        dataset,
        view: query.view,
        filters: query.filters,
        sortKey: query.sortKey,
        sortDir: query.sortDir,
        blend: query.blend,
      };
      worker.postMessage(message);
    }, 0);

    return () => clearTimeout(timer);
    // serializedFilters is the stable identity for the filters object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, serializedFilters, query.sortKey, query.sortDir, query.view, query.blend]);

  return dataset ? result : EMPTY;
}
