import type { Cost, OfferDTO } from "./types";

export type BlendWeights = "3:1" | "1:1";

export interface Blend {
  input: number;
  output: number;
}

export function blendWeights(kind: BlendWeights): Blend {
  return kind === "1:1" ? { input: 1, output: 1 } : { input: 3, output: 1 };
}

/**
 * Blended price per million tokens. Cache prices are deliberately excluded —
 * they depend on a cache hit rate the user has not stated yet.
 */
export function blendedPrice(
  cost: Pick<Cost, "input" | "output">,
  kind: BlendWeights = "3:1",
): number | null {
  if (cost.input === null || cost.output === null) return null;
  const w = blendWeights(kind);
  return (cost.input * w.input + cost.output * w.output) / (w.input + w.output);
}

export function offerBlended(offer: OfferDTO, kind: BlendWeights = "3:1"): number | null {
  return blendedPrice(offer.cost, kind);
}

export interface MonthlyCostInput {
  inputTokens: number;
  outputTokens: number;
  cacheHitRate: number;
  blend?: BlendWeights;
}

export interface MonthlyCostBreakdown {
  inputCost: number | null;
  outputCost: number | null;
  cacheCost: number | null;
  total: number | null;
  /** True when the offer has no usable price at all. */
  unpriced: boolean;
}

/**
 * Monthly cost in USD. Tokens are counted per million.
 * When a cache price is absent the cached tokens fall back to the full input price.
 */
export function monthlyCost(
  cost: Cost,
  input: MonthlyCostInput,
): MonthlyCostBreakdown {
  const { inputTokens, outputTokens, cacheHitRate } = input;

  if (cost.input === null && cost.output === null) {
    return { inputCost: null, outputCost: null, cacheCost: null, total: null, unpriced: true };
  }

  const inputPrice = cost.input ?? 0;
  const outputPrice = cost.output ?? 0;
  const cachePrice = cost.cache_read ?? inputPrice;

  const clamped = Math.min(Math.max(cacheHitRate, 0), 1);
  const cachedTokens = inputTokens * clamped;
  const freshTokens = inputTokens - cachedTokens;

  const inputCost = (freshTokens / 1_000_000) * inputPrice;
  const cacheCost = (cachedTokens / 1_000_000) * cachePrice;
  const outputCost = (outputTokens / 1_000_000) * outputPrice;

  return {
    inputCost,
    outputCost,
    cacheCost,
    total: inputCost + cacheCost + outputCost,
    unpriced: false,
  };
}

export function formatPrice(value: number | null): string {
  if (value === null) return "—";
  if (value === 0) return "免费";
  if (value < 1) {
    return `$${value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
  }
  return `$${value.toFixed(2)}`;
}

export function formatUsd(value: number | null, digits = 2): string {
  if (value === null) return "—";
  return `$${value.toFixed(digits)}`;
}
