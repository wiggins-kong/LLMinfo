import type { Limits, Modality, ReasoningOption } from "./types";

/** Sentinel date used by models.dev when a field is unknown. */
const EPOCH_SENTINEL = "1970-01-01";
/** Above this the UI renders "1亿+" instead of a concrete number. */
export const HUGE_CONTEXT_THRESHOLD = 99_000_000;

/**
 * models.dev dates come in two granularities: full dates ("2026-07-24") and
 * month-only values ("2025-04"). Both are meaningful, so both are kept; only
 * the 1970 sentinel and unparseable values become null.
 */
export function nullIfInvalidDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(trimmed)) return null;
  if (trimmed === EPOCH_SENTINEL) return null;
  return trimmed;
}

/** Context windows of zero or below are meaningless, so they become null. */
export function normalizeContext(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.trunc(value);
}

export function normalizeLimits(raw: unknown): Limits {
  if (typeof raw !== "object" || raw === null) {
    return { context: null, input: null, output: null };
  }
  const source = raw as Record<string, unknown>;
  return {
    context: normalizeContext(source.context),
    input: normalizeContext(source.input),
    output: normalizeContext(source.output),
  };
}

/** Flag fields that upstream sometimes emits as an object instead of a boolean. */
export function normalizeFlag(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null) return fallback;
  if (typeof value === "object") return true;
  return fallback;
}

const MODALITIES: readonly Modality[] = ["text", "image", "pdf", "video", "audio"];

export function normalizeModalities(raw: unknown): Modality[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<Modality>();
  for (const item of raw) {
    if (typeof item === "string" && (MODALITIES as readonly string[]).includes(item)) {
      seen.add(item as Modality);
    }
  }
  return MODALITIES.filter((m) => seen.has(m));
}

export function normalizeReasoningOptions(raw: unknown): ReasoningOption[] {
  if (!Array.isArray(raw)) return [];
  const out: ReasoningOption[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.type !== "string") continue;
    const option: ReasoningOption = { type: entry.type };
    if (Array.isArray(entry.values)) {
      option.values = entry.values.filter((v): v is string => typeof v === "string");
    }
    if (typeof entry.min === "number") option.min = entry.min;
    if (typeof entry.max === "number") option.max = entry.max;
    out.push(option);
  }
  return out;
}

export function normalizeStatus(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formatContext(value: number | null): string {
  if (value === null) return "未知";
  if (value >= HUGE_CONTEXT_THRESHOLD) return "1亿+";
  if (value >= 1_048_576) {
    const millions = value / 1_048_576;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return String(value);
}
