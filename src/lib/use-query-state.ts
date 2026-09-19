"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_FILTERS,
  type Filters,
  type SortDir,
  type SortKey,
  type ViewMode,
} from "./query-engine";
import type { BlendWeights } from "./pricing";
import type { Modality } from "./types";

const MODALITIES: Modality[] = ["text", "image", "pdf", "video", "audio"];
const SORT_KEYS: SortKey[] = [
  "name",
  "input",
  "output",
  "blended",
  "cacheRead",
  "cacheWrite",
  "context",
  "outputLimit",
  "releaseDate",
  "lastUpdated",
  "offerCount",
  "capabilities",
];

export interface QueryUrlState {
  filters: Filters;
  sortKey: SortKey;
  sortDir: SortDir;
  view: ViewMode;
  blend: BlendWeights;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  patchFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  setSort: (key: SortKey, dir: SortDir) => void;
  setView: (view: ViewMode) => void;
  setBlend: (blend: BlendWeights) => void;
  /** Serialised query string, for shareable links and saved views. */
  queryString: string;
  activeFilterCount: number;
}

function parseNumber(value: string | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseFilters(params: URLSearchParams): Filters {
  const modalities = (params.get("mod") ?? "")
    .split(",")
    .filter((m): m is Modality => (MODALITIES as string[]).includes(m));

  return {
    ...EMPTY_FILTERS,
    search: params.get("q") ?? "",
    providerId: params.get("provider") ?? "",
    family: params.get("family") ?? "",
    inputModalities: modalities,
    reasoning: params.get("reasoning") === "1",
    toolCall: params.get("tool") === "1",
    structuredOutput: params.get("so") === "1",
    attachment: params.get("attach") === "1",
    temperature: params.get("temp") === "1",
    interleaved: params.get("inter") === "1",
    openWeights: params.get("ow") === "1",
    statuses: (params.get("status") ?? "").split(",").filter(Boolean),
    minInputPrice: parseNumber(params.get("minIn")),
    maxInputPrice: parseNumber(params.get("maxIn")),
    minContext: parseNumber(params.get("minCtx")),
    maxContext: parseNumber(params.get("maxCtx")),
    minOutputLimit: parseNumber(params.get("minOut")),
    knowledgeAfter: params.get("know") || null,
    releasedAfter: params.get("rel") || null,
    updatedAfter: params.get("upd") || null,
    freeOnly: params.get("free") === "1",
    unpricedOnly: params.get("unpriced") === "1",
  };
}

function serializeFilters(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.providerId) params.set("provider", filters.providerId);
  if (filters.family) params.set("family", filters.family);
  if (filters.inputModalities.length) params.set("mod", filters.inputModalities.join(","));
  if (filters.reasoning) params.set("reasoning", "1");
  if (filters.toolCall) params.set("tool", "1");
  if (filters.structuredOutput) params.set("so", "1");
  if (filters.attachment) params.set("attach", "1");
  if (filters.temperature) params.set("temp", "1");
  if (filters.interleaved) params.set("inter", "1");
  if (filters.openWeights) params.set("ow", "1");
  if (filters.statuses.length) params.set("status", filters.statuses.join(","));
  if (filters.minInputPrice !== null) params.set("minIn", String(filters.minInputPrice));
  if (filters.maxInputPrice !== null) params.set("maxIn", String(filters.maxInputPrice));
  if (filters.minContext !== null) params.set("minCtx", String(filters.minContext));
  if (filters.maxContext !== null) params.set("maxCtx", String(filters.maxContext));
  if (filters.minOutputLimit !== null) params.set("minOut", String(filters.minOutputLimit));
  if (filters.knowledgeAfter) params.set("know", filters.knowledgeAfter);
  if (filters.releasedAfter) params.set("rel", filters.releasedAfter);
  if (filters.updatedAfter) params.set("upd", filters.updatedAfter);
  if (filters.freeOnly) params.set("free", "1");
  if (filters.unpricedOnly) params.set("unpriced", "1");
  return params;
}

export function countActiveFilters(filters: Filters): number {
  let n = 0;
  if (filters.search) n += 1;
  if (filters.providerId) n += 1;
  if (filters.family) n += 1;
  if (filters.inputModalities.length) n += 1;
  if (filters.reasoning) n += 1;
  if (filters.toolCall) n += 1;
  if (filters.structuredOutput) n += 1;
  if (filters.attachment) n += 1;
  if (filters.temperature) n += 1;
  if (filters.interleaved) n += 1;
  if (filters.openWeights) n += 1;
  if (filters.statuses.length) n += 1;
  if (filters.minInputPrice !== null || filters.maxInputPrice !== null) n += 1;
  if (filters.minContext !== null || filters.maxContext !== null) n += 1;
  if (filters.minOutputLimit !== null) n += 1;
  if (filters.knowledgeAfter) n += 1;
  if (filters.releasedAfter) n += 1;
  if (filters.updatedAfter) n += 1;
  if (filters.freeOnly) n += 1;
  if (filters.unpricedOnly) n += 1;
  return n;
}

/**
 * Query state lives in the URL so any view is shareable, bookmarkable and
 * restorable by the back button. Writes are debounced through
 * history.replaceState to avoid flooding the history stack while typing.
 */
export function useQueryState(): QueryUrlState {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setViewState] = useState<ViewMode>("model");
  const [blend, setBlendState] = useState<BlendWeights>("3:1");
  const [hydrated, setHydrated] = useState(false);

  // Read the initial state from the URL after mount (SSR has no location).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilters(parseFilters(params));

    const sort = params.get("sort");
    if (sort && (SORT_KEYS as string[]).includes(sort)) setSortKey(sort as SortKey);
    setSortDir(params.get("dir") === "desc" ? "desc" : "asc");
    setViewState(params.get("view") === "offer" ? "offer" : "model");
    setBlendState(params.get("blend") === "1:1" ? "1:1" : "3:1");
    setHydrated(true);
  }, []);

  // Keep the URL in sync with state.
  useEffect(() => {
    if (!hydrated) return;
    const params = serializeFilters(filters);
    if (sortKey !== "name") params.set("sort", sortKey);
    if (sortDir !== "asc") params.set("dir", sortDir);
    if (view !== "model") params.set("view", view);
    if (blend !== "3:1") params.set("blend", blend);

    const next = params.toString();
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [filters, sortKey, sortDir, view, blend, hydrated]);

  const setFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const patchFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const setSort = useCallback((key: SortKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
  }, []);

  const queryString = useMemo(() => {
    const params = serializeFilters(filters);
    if (sortKey !== "name") params.set("sort", sortKey);
    if (sortDir !== "asc") params.set("dir", sortDir);
    if (view !== "model") params.set("view", view);
    if (blend !== "3:1") params.set("blend", blend);
    return params.toString();
  }, [filters, sortKey, sortDir, view, blend]);

  return {
    filters,
    sortKey,
    sortDir,
    view,
    blend,
    setFilter,
    patchFilters,
    resetFilters,
    setSort,
    setView: setViewState,
    setBlend: setBlendState,
    queryString,
    activeFilterCount: countActiveFilters(filters),
  };
}
