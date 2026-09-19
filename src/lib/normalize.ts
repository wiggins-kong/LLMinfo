import type { Cost, CostTier, Limits, Modality, ReasoningOption } from "./types";

/** Sentinel date used by models.dev when a field is unknown. */
const EPOCH_SENTINEL = "1970-01-01";
/** Above this the UI renders "1亿+" instead of a concrete number. */
export const HUGE_CONTEXT_THRESHOLD = 99_000_000;

/**
 * models.dev dates come in two granularities: full dates ("2026-07-24") and
 * month-only values ("2025-04", used by ~235 offers). Both are meaningful, so
 * both are kept; only the 1970 sentinel and unparseable values become null.
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

function numOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function parseTiers(value: unknown): CostTier[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const tiers: CostTier[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    const tier = entry.tier as Record<string, unknown> | undefined;
    if (!tier || typeof tier.size !== "number") continue;
    const input = numOrNull(entry.input);
    const output = numOrNull(entry.output);
    if (input === null || output === null) continue;
    tiers.push({
      input,
      output,
      cache_read: numOrNull(entry.cache_read) ?? undefined,
      cache_write: numOrNull(entry.cache_write) ?? undefined,
      tier: { type: String(tier.type ?? "context"), size: tier.size },
    });
  }
  return tiers.length > 0 ? tiers : null;
}

export interface NormalizedCost {
  cost: Cost;
  hasCost: boolean;
  isFree: boolean;
  hasTieredPricing: boolean;
}

/**
 * A missing cost object must stay `null` rather than defaulting to 0 — free and
 * unpriced are different states and the UI renders them differently.
 */
export function normalizeCost(raw: unknown): NormalizedCost {
  const empty: Cost = {
    input: null,
    output: null,
    cache_read: null,
    cache_write: null,
    reasoning: null,
    input_audio: null,
    output_audio: null,
    tiers: null,
    context_over_200k: null,
  };

  if (typeof raw !== "object" || raw === null) {
    return { cost: empty, hasCost: false, isFree: false, hasTieredPricing: false };
  }

  const source = raw as Record<string, unknown>;
  const over200k = source.context_over_200k as Record<string, unknown> | undefined;

  const cost: Cost = {
    input: numOrNull(source.input),
    output: numOrNull(source.output),
    cache_read: numOrNull(source.cache_read),
    cache_write: numOrNull(source.cache_write),
    reasoning: numOrNull(source.reasoning),
    input_audio: numOrNull(source.input_audio),
    output_audio: numOrNull(source.output_audio),
    tiers: parseTiers(source.tiers),
    context_over_200k:
      over200k && typeof over200k === "object"
        ? {
            input: numOrNull(over200k.input),
            output: numOrNull(over200k.output),
            cache_read: numOrNull(over200k.cache_read),
            cache_write: numOrNull(over200k.cache_write),
          }
        : null,
  };

  const isFree = cost.input === 0 && cost.output === 0;
  return {
    cost,
    hasCost: true,
    isFree,
    hasTieredPricing: cost.tiers !== null || cost.context_over_200k !== null,
  };
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
