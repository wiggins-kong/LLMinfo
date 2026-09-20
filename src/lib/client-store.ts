import { EMPTY_FILTERS, type Filters, type SortDir, type SortKey, type ViewMode } from "./query-engine";
import type { BlendWeights } from "./pricing";
import type { Modality } from "./types";

export type ThemeMode = "system" | "light" | "dark";
export type Density = "comfortable" | "compact";
export type AccentId = "fluent-blue" | "teal" | "violet" | "amber" | "rose" | "slate" | "custom";

export interface AppearanceState {
  theme: ThemeMode;
  density: Density;
  acrylic: boolean;
  accentId: AccentId;
  customAccent: string;
}

export interface SavedView {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}

export interface LocalData {
  version: 1;
  favorites: string[];
  savedViews: SavedView[];
  appearance: AppearanceState;
  compare: string[];
}

export interface QueryState {
  filters: Filters;
  sortKey: SortKey;
  sortDir: SortDir;
  view: ViewMode;
  blend: BlendWeights;
}

export const ACCENT_PRESETS: { id: Exclude<AccentId, "custom">; label: string; light: string; dark: string; ink: string; inkDark: string }[] = [
  { id: "fluent-blue", label: "Fluent 蓝", light: "#0f6cbd", dark: "#60cdff", ink: "#0b5392", inkDark: "#9adcff" },
  { id: "teal", label: "青", light: "#0f766e", dark: "#5eead4", ink: "#0f5c56", inkDark: "#8ff0e2" },
  { id: "violet", label: "紫", light: "#6d28d9", dark: "#c4b5fd", ink: "#5b21b6", inkDark: "#ddd6fe" },
  { id: "amber", label: "琥珀", light: "#a16207", dark: "#fcd34d", ink: "#854d0e", inkDark: "#fde68a" },
  { id: "rose", label: "玫红", light: "#be123c", dark: "#fda4af", ink: "#9f1239", inkDark: "#fecdd3" },
  { id: "slate", label: "石墨", light: "#475569", dark: "#cbd5e1", ink: "#334155", inkDark: "#e2e8f0" },
];

const DATA_KEY = "llminfo.data.v1";
const QUERY_KEY = "llminfo.query.v1";

export const DEFAULT_APPEARANCE: AppearanceState = {
  theme: "system",
  density: "comfortable",
  acrylic: true,
  accentId: "fluent-blue",
  customAccent: "#0f6cbd",
};

export const DEFAULT_QUERY: QueryState = {
  filters: EMPTY_FILTERS,
  sortKey: "name",
  sortDir: "asc",
  view: "model",
  blend: "3:1",
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readLocalData(): LocalData {
  const stored = safeParse<Partial<LocalData>>(localStorage.getItem(DATA_KEY));
  return {
    version: 1,
    favorites: Array.isArray(stored?.favorites) ? stored.favorites.filter((v) => typeof v === "string") : [],
    savedViews: Array.isArray(stored?.savedViews)
      ? stored.savedViews.filter(
          (v): v is SavedView =>
            typeof v === "object" &&
            v !== null &&
            typeof (v as SavedView).id === "string" &&
            typeof (v as SavedView).name === "string" &&
            typeof (v as SavedView).query === "string",
        )
      : [],
    appearance: { ...DEFAULT_APPEARANCE, ...(stored?.appearance ?? {}) },
    compare: Array.isArray(stored?.compare) ? stored.compare.filter((v) => typeof v === "string") : [],
  };
}

export function writeLocalData(data: LocalData): void {
  localStorage.setItem(DATA_KEY, JSON.stringify({ ...data, version: 1 }));
}

export function clearLocalData(): void {
  localStorage.removeItem(DATA_KEY);
  localStorage.removeItem(QUERY_KEY);
}

export function exportLocalData(data: LocalData): string {
  return JSON.stringify(data, null, 2);
}

export function importLocalData(raw: string): LocalData {
  const parsed = safeParse<Partial<LocalData>>(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("文件不是有效的 LLMinfo JSON");
  }
  const favorites = Array.isArray(parsed.favorites) ? parsed.favorites.filter((v) => typeof v === "string") : [];
  const savedViews = Array.isArray(parsed.savedViews)
    ? parsed.savedViews.filter(
        (v): v is SavedView =>
          typeof v === "object" &&
          v !== null &&
          typeof (v as SavedView).id === "string" &&
          typeof (v as SavedView).name === "string" &&
          typeof (v as SavedView).query === "string",
      )
    : [];
  return {
    version: 1,
    favorites,
    savedViews,
    appearance: { ...DEFAULT_APPEARANCE, ...(parsed.appearance ?? {}) },
    compare: Array.isArray(parsed.compare) ? parsed.compare.filter((v) => typeof v === "string").slice(0, 4) : [],
  };
}

export function parseQueryState(search: string): QueryState {
  const params = new URLSearchParams(search);
  const filters: Filters = {
    ...EMPTY_FILTERS,
    search: params.get("q") ?? "",
    providerId: params.get("provider") ?? "",
    family: params.get("family") ?? "",
    inputModalities: (params.get("mod") ?? "")
      .split(",")
      .filter((m): m is Modality => ["text", "image", "pdf", "video", "audio"].includes(m)),
    reasoning: params.get("reasoning") === "1",
    toolCall: params.get("tool") === "1",
    structuredOutput: params.get("so") === "1",
    attachment: params.get("attach") === "1",
    temperature: params.get("temp") === "1",
    interleaved: params.get("inter") === "1",
    openWeights: params.get("ow") === "1",
    statuses: (params.get("status") ?? "").split(",").filter(Boolean),
    minInputPrice: numberOrNull(params.get("minIn")),
    maxInputPrice: numberOrNull(params.get("maxIn")),
    minContext: numberOrNull(params.get("minCtx")),
    maxContext: numberOrNull(params.get("maxCtx")),
    minOutputLimit: numberOrNull(params.get("minOut")),
    knowledgeAfter: params.get("know"),
    releasedAfter: params.get("rel"),
    updatedAfter: params.get("upd"),
    freeOnly: params.get("free") === "1",
    unpricedOnly: params.get("unpriced") === "1",
  };
  const sortKey = params.get("sort");
  return {
    filters,
    sortKey: (sortKey as SortKey) || "name",
    sortDir: params.get("dir") === "desc" ? "desc" : "asc",
    view: params.get("view") === "offer" ? "offer" : "model",
    blend: params.get("blend") === "1:1" ? "1:1" : "3:1",
  };
}

export function readQueryState(): QueryState {
  return parseQueryState(window.location.search);
}

function numberOrNull(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function queryString(state: QueryState): string {
  const params = new URLSearchParams();
  const f = state.filters;
  if (f.search) params.set("q", f.search);
  if (f.providerId) params.set("provider", f.providerId);
  if (f.family) params.set("family", f.family);
  if (f.inputModalities.length) params.set("mod", f.inputModalities.join(","));
  if (f.reasoning) params.set("reasoning", "1");
  if (f.toolCall) params.set("tool", "1");
  if (f.structuredOutput) params.set("so", "1");
  if (f.attachment) params.set("attach", "1");
  if (f.temperature) params.set("temp", "1");
  if (f.interleaved) params.set("inter", "1");
  if (f.openWeights) params.set("ow", "1");
  if (f.statuses.length) params.set("status", f.statuses.join(","));
  if (f.minInputPrice !== null) params.set("minIn", String(f.minInputPrice));
  if (f.maxInputPrice !== null) params.set("maxIn", String(f.maxInputPrice));
  if (f.minContext !== null) params.set("minCtx", String(f.minContext));
  if (f.maxContext !== null) params.set("maxCtx", String(f.maxContext));
  if (f.minOutputLimit !== null) params.set("minOut", String(f.minOutputLimit));
  if (f.knowledgeAfter) params.set("know", f.knowledgeAfter);
  if (f.releasedAfter) params.set("rel", f.releasedAfter);
  if (f.updatedAfter) params.set("upd", f.updatedAfter);
  if (f.freeOnly) params.set("free", "1");
  if (f.unpricedOnly) params.set("unpriced", "1");
  if (state.sortKey !== "name") params.set("sort", state.sortKey);
  if (state.sortDir !== "asc") params.set("dir", state.sortDir);
  if (state.view !== "model") params.set("view", state.view);
  if (state.blend !== "3:1") params.set("blend", state.blend);
  return params.toString();
}

export function syncUrl(state: QueryState): void {
  const next = queryString(state);
  const url = `${window.location.pathname}${next ? `?${next}` : ""}`;
  window.history.replaceState(null, "", url);
}

export function activeFilterCount(filters: Filters): number {
  let count = 0;
  if (filters.search) count += 1;
  if (filters.providerId) count += 1;
  if (filters.family) count += 1;
  if (filters.inputModalities.length) count += 1;
  for (const key of ["reasoning", "toolCall", "structuredOutput", "attachment", "temperature", "interleaved", "openWeights", "freeOnly", "unpricedOnly"] as const) {
    if (filters[key]) count += 1;
  }
  if (filters.statuses.length) count += 1;
  if (filters.minInputPrice !== null || filters.maxInputPrice !== null) count += 1;
  if (filters.minContext !== null || filters.maxContext !== null) count += 1;
  if (filters.minOutputLimit !== null) count += 1;
  if (filters.knowledgeAfter) count += 1;
  if (filters.releasedAfter) count += 1;
  if (filters.updatedAfter) count += 1;
  return count;
}
