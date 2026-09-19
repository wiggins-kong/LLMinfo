import { describe, expect, it } from "vitest";
import {
  HUGE_CONTEXT_THRESHOLD,
  formatContext,
  normalizeCost,
  normalizeLimits,
  normalizeModalities,
  nullIfInvalidDate,
} from "@/lib/normalize";

describe("nullIfInvalidDate", () => {
  it("rejects the 1970 sentinel models.dev uses for unknown dates", () => {
    expect(nullIfInvalidDate("1970-01-01")).toBeNull();
  });

  it("rejects malformed and non-string values", () => {
    expect(nullIfInvalidDate("2025-5")).toBeNull();
    expect(nullIfInvalidDate(undefined)).toBeNull();
    expect(nullIfInvalidDate(null)).toBeNull();
    expect(nullIfInvalidDate("not-a-date")).toBeNull();
    expect(nullIfInvalidDate("2025-13-01-01")).toBeNull();
  });

  it("keeps full dates", () => {
    expect(nullIfInvalidDate("2026-07-24")).toBe("2026-07-24");
  });

  it("keeps month-granularity dates, which ~235 upstream offers use", () => {
    expect(nullIfInvalidDate("2025-04")).toBe("2025-04");
  });
});

describe("normalizeLimits", () => {
  it("treats non-positive context as unknown rather than zero", () => {
    expect(normalizeLimits({ context: 0 }).context).toBeNull();
    expect(normalizeLimits({ context: -5 }).context).toBeNull();
  });

  it("keeps large context windows intact", () => {
    expect(normalizeLimits({ context: 99_999_999 }).context).toBe(99_999_999);
    expect(normalizeLimits({ context: 1_048_576 }).context).toBe(1_048_576);
  });

  it("returns nulls for a missing limit object", () => {
    expect(normalizeLimits(undefined)).toEqual({ context: null, input: null, output: null });
  });
});

describe("normalizeCost", () => {
  it("keeps a missing cost object as unpriced rather than free", () => {
    const result = normalizeCost(undefined);
    expect(result.hasCost).toBe(false);
    expect(result.isFree).toBe(false);
    expect(result.cost.input).toBeNull();
    expect(result.cost.output).toBeNull();
  });

  it("flags an explicit zero/zero cost as free", () => {
    const result = normalizeCost({ input: 0, output: 0 });
    expect(result.hasCost).toBe(true);
    expect(result.isFree).toBe(true);
  });

  it("does not treat a zero input with a priced output as free", () => {
    const result = normalizeCost({ input: 0, output: 1.5 });
    expect(result.isFree).toBe(false);
  });

  it("drops negative prices instead of surfacing them", () => {
    const result = normalizeCost({ input: -1, output: 2 });
    expect(result.cost.input).toBeNull();
    expect(result.cost.output).toBe(2);
  });

  it("parses tiered pricing and marks the offer as tiered", () => {
    const result = normalizeCost({
      input: 5,
      output: 25,
      tiers: [{ input: 10, output: 37.5, tier: { type: "context", size: 200_000 } }],
      context_over_200k: { input: 10, output: 37.5 },
    });
    expect(result.hasTieredPricing).toBe(true);
    expect(result.cost.tiers).toHaveLength(1);
    expect(result.cost.tiers?.[0].tier.size).toBe(200_000);
    expect(result.cost.context_over_200k?.input).toBe(10);
  });

  it("ignores malformed tiers", () => {
    const result = normalizeCost({ input: 1, output: 2, tiers: [{ input: 1 }] });
    expect(result.cost.tiers).toBeNull();
    expect(result.hasTieredPricing).toBe(false);
  });
});

describe("normalizeModalities", () => {
  it("keeps a stable canonical order and drops unknown entries", () => {
    expect(normalizeModalities(["audio", "text", "nope", "image"])).toEqual([
      "text",
      "image",
      "audio",
    ]);
  });

  it("returns an empty array for non-arrays", () => {
    expect(normalizeModalities(undefined)).toEqual([]);
  });
});

describe("formatContext", () => {
  it("collapses absurd context windows to a human label", () => {
    expect(formatContext(HUGE_CONTEXT_THRESHOLD)).toBe("1亿+");
    expect(formatContext(99_999_999)).toBe("1亿+");
  });

  it("formats millions and thousands", () => {
    expect(formatContext(1_048_576)).toBe("1M");
    expect(formatContext(1_050_000)).toBe("1.0M");
    expect(formatContext(131_072)).toBe("131K");
  });

  it("renders unknown for null", () => {
    expect(formatContext(null)).toBe("未知");
  });
});
