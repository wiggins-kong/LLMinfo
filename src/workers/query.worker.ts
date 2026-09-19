/// <reference lib="webworker" />
import {
  aggregate,
  filterModels,
  filterOffers,
  sortModels,
  sortOffers,
  type Filters,
  type ModelAggregate,
  type SortDir,
  type SortKey,
  type ViewMode,
} from "@/lib/query-engine";
import type { BlendWeights } from "@/lib/pricing";
import type { DatasetDTO, OfferDTO } from "@/lib/types";

export interface QueryRequest {
  id: number;
  dataset: DatasetDTO;
  view: ViewMode;
  filters: Filters;
  sortKey: SortKey;
  sortDir: SortDir;
  blend: BlendWeights;
}

export interface QueryResponse {
  id: number;
  models: ModelAggregate[];
  offers: OfferDTO[];
  aggregates: ModelAggregate[];
  totalModels: number;
  totalOffers: number;
  durationMs: number;
}

/**
 * All filtering, sorting and aggregation happens here so a 7,860-row dataset
 * never blocks the main thread while the user drags a slider or types.
 */
self.addEventListener("message", (event: MessageEvent<QueryRequest>) => {
  const { id, dataset, view, filters, sortKey, sortDir, blend } = event.data;
  const started = performance.now();

  const aggregates = aggregate(dataset, blend);
  const models = sortModels(filterModels(aggregates, filters, blend), sortKey, sortDir, blend);
  const offers =
    view === "offer"
      ? sortOffers(filterOffers(dataset, filters, blend), sortKey, sortDir)
      : [];

  const response: QueryResponse = {
    id,
    models,
    offers,
    aggregates,
    totalModels: aggregates.length,
    totalOffers: dataset.offers.length,
    durationMs: performance.now() - started,
  };

  (self as unknown as Worker).postMessage(response);
});
