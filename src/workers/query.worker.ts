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
} from "../lib/query-engine";
import type { BlendWeights } from "../lib/pricing";
import type { DatasetDTO, OfferDTO } from "../lib/types";

export interface QueryRequest {
  id: number;
  dataset: DatasetDTO | null;
  filters: Filters;
  sortKey: SortKey;
  sortDir: SortDir;
  view: ViewMode;
  blend: BlendWeights;
}

export interface QueryResponse {
  id: number;
  models: ModelAggregate[];
  offers: OfferDTO[];
  totalModels: number;
  durationMs: number;
}

self.onmessage = (event: MessageEvent<QueryRequest>) => {
  const started = performance.now();
  const request = event.data;
  if (!request.dataset) {
    self.postMessage({
      id: request.id,
      models: [],
      offers: [],
      totalModels: 0,
      durationMs: 0,
    } satisfies QueryResponse);
    return;
  }

  const aggregates = aggregate(request.dataset, request.blend);
  const models =
    request.view === "model"
      ? sortModels(
          filterModels(aggregates, request.filters, request.blend),
          request.sortKey,
          request.sortDir,
          request.blend,
        )
      : [];
  const offers =
    request.view === "offer"
      ? sortOffers(
          filterOffers(request.dataset, request.filters, request.blend),
          request.sortKey,
          request.sortDir,
        )
      : [];

  self.postMessage({
    id: request.id,
    models,
    offers,
    totalModels: aggregates.length,
    durationMs: performance.now() - started,
  } satisfies QueryResponse);
};
