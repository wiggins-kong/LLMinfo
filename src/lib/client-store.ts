import { EMPTY_FILTERS, type Filters, type SortDir, type SortKey } from "./query-engine";
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

export interface LocalData {
  version: 2;
  appearance: AppearanceState;
  splitRatio: number;
}

export interface QueryState {
  filters: Filters;
  sortKey: SortKey;
  sortDir: SortDir;
}

export const ACCENT_PRESETS: {
  id: Exclude<AccentId, "custom">;
  label: string;
  light: string;
  dark: string;
  ink: string;
  inkDark: string;
}[] = [
  { id: "fluent-blue", label: "Fluent 蓝", light: "#0f6cbd", dark: "#60cdff", ink: "#0b5392", inkDark: "#9adcff" },
  { id: "teal", label: "青", light: "#0f766e", dark: "#5eead4", ink: "#0f5c56", inkDark: "#8ff0e2" },
  { id: "violet", label: "紫", light: "#6d28d9", dark: "#c4b5fd", ink: "#5b21b6", inkDark: "#ddd6fe" },
  { id: "amber", label: "琥珀", light: "#a16207", dark: "#fcd34d", ink: "#854d0e", inkDark: "#fde68a" },
  { id: "rose", label: "玫红", light: "#be123c", dark: "#fda4af", ink: "#9f1239", inkDark: "#fecdd3" },
  { id: "slate", label: "石墨", light: "#475569", dark: "#cbd5e1", ink: "#334155", inkDark: "#e2e8f0" },
];

const DATA_KEY = "llminfo.data.v2";

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
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function clampSplitRatio(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.38;
  return Math.min(0.72, Math.max(0.24, value));
}

export function readLocalData(): LocalData {
  const stored = safeParse<Partial<LocalData>>(localStorage.getItem(DATA_KEY));
  return {
    version: 2,
    appearance: { ...DEFAULT_APPEARANCE, ...(stored?.appearance ?? {}) },
    splitRatio: clampSplitRatio(stored?.splitRatio),
  };
}

export function writeLocalData(data: LocalData): void {
  localStorage.setItem(DATA_KEY, JSON.stringify({ ...data, version: 2 }));
}

export function clearLocalData(): void {
  localStorage.removeItem(DATA_KEY);
}

export function activeFilterCount(filters: Filters): number {
  let count = 0;
  if (filters.search) count += 1;
  if (filters.providerIds.length) count += 1;
  if (filters.inputModalities.length) count += 1;
  for (const key of ["reasoning", "toolCall", "structuredOutput", "openWeights"] as const) {
    if (filters[key]) count += 1;
  }
  if (filters.statuses.length) count += 1;
  if (filters.minContext !== null || filters.maxContext !== null) count += 1;
  if (filters.minOutputLimit !== null || filters.maxOutputLimit !== null) count += 1;
  return count;
}

export function isModality(value: string): value is Modality {
  return ["text", "image", "pdf", "video", "audio"].includes(value);
}
