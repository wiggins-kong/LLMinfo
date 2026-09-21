import type { Filters, ModelAggregate, SortDir, SortKey } from "../lib/query-engine";
import type { DatasetDTO } from "../lib/types";

/** Reference implementation of the inline worker protocol. */
export interface QueryRequest {
  id: number;
  dataset: DatasetDTO | null;
  filters: Filters;
  sortKey: SortKey;
  sortDir: SortDir;
}

export interface QueryResponse {
  id: number;
  models: ModelAggregate[];
  totalModels: number;
  durationMs: number;
}
