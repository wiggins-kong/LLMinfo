import { describe, expect, it } from "vitest";
import { blendWeights, blendedPrice, formatPrice, monthlyCost } from "@/lib/pricing";
import type { Cost } from "@/lib/types";

function cost(partial: Partial<Cost>): Cost {
  return {
    input: null,
    output: null,
    cache_read: null,
    cache_write: null,
    reasoning: null,
    input_audio: null,
    output_audio: null,
    tiers: null,
    context_over_200k: null,
    ...partial,
  };
}

describe("blendedPrice", () => {
  it("defaults to a 3:1 input:output weighting", () => {
    expect(blendedPrice({ input: 3, output: 15 })).toBe((3 * 3 + 15) / 4);
    expect(blendWeights("3:1")).toEqual({ input: 3, output: 1 });
  });

  it("supports an even 1:1 weighting", () => {
    expect(blendedPrice({ input: 3, output: 15 }, "1:1")).toBe(9);
  });

  it("returns null when either side is unpriced", () => {
    expect(blendedPrice({ input: null, output: 5 })).toBeNull();
    expect(blendedPrice({ input: 5, output: null })).toBeNull();
  });
});

describe("monthlyCost", () => {
  it("splits cached and fresh input tokens", () => {
    const result = monthlyCost(cost({ input: 3, output: 15, cache_read: 0.3 }), {
      inputTokens: 10_000_000,
      outputTokens: 1_000_000,
      cacheHitRate: 0.5,
    });
    // 5M fresh @ $3/M = 15, 5M cached @ $0.30/M = 1.5, 1M output @ $15/M = 15
    expect(result.inputCost).toBeCloseTo(15, 6);
    expect(result.cacheCost).toBeCloseTo(1.5, 6);
    expect(result.outputCost).toBeCloseTo(15, 6);
    expect(result.total).toBeCloseTo(31.5, 6);
  });

  it("falls back to the input price when no cache price exists", () => {
    const result = monthlyCost(cost({ input: 2, output: 4 }), {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheHitRate: 1,
    });
    expect(result.cacheCost).toBeCloseTo(2, 6);
  });

  it("reports unpriced models instead of returning zero", () => {
    const result = monthlyCost(cost({}), {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheHitRate: 0,
    });
    expect(result.unpriced).toBe(true);
    expect(result.total).toBeNull();
  });

  it("clamps a cache hit rate outside 0..1", () => {
    const result = monthlyCost(cost({ input: 1, output: 1 }), {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheHitRate: 5,
    });
    expect(result.total).toBeCloseTo(1, 6);
  });
});

describe("formatPrice", () => {
  it("distinguishes free, unpriced and paid", () => {
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(0)).toBe("免费");
    expect(formatPrice(0.425)).toBe("$0.425");
    expect(formatPrice(15)).toBe("$15.00");
  });
});
