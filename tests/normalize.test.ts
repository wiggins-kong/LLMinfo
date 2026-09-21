import { describe, expect, it } from "vitest";
import {
  formatContext,
  normalizeContext,
  normalizeLimits,
  normalizeReasoningOptions,
  nullIfInvalidDate,
} from "@/lib/normalize";

describe("normalize", () => {
  it("drops sentinel and malformed dates while keeping month granularity", () => {
    expect(nullIfInvalidDate("1970-01-01")).toBeNull();
    expect(nullIfInvalidDate("2025-04")).toBe("2025-04");
    expect(nullIfInvalidDate("2025-04-18")).toBe("2025-04-18");
    expect(nullIfInvalidDate("not-a-date")).toBeNull();
  });

  it("normalizes limits and ignores non-positive context values", () => {
    expect(normalizeContext(0)).toBeNull();
    expect(normalizeContext(-1)).toBeNull();
    expect(normalizeContext(128_000.8)).toBe(128_000);
    expect(normalizeLimits({ context: 200_000, input: 0, output: 32_000 })).toEqual({
      context: 200_000,
      input: null,
      output: 32_000,
    });
  });

  it("parses effort, budget and toggle reasoning options", () => {
    expect(
      normalizeReasoningOptions([
        { type: "effort", values: ["low", null, "high"] },
        { type: "budget_tokens", min: 1024, max: 32768 },
        { type: "toggle" },
      ]),
    ).toEqual([
      { type: "effort", values: ["low", "high"] },
      { type: "budget_tokens", min: 1024, max: 32768 },
      { type: "toggle" },
    ]);
  });

  it("formats huge context without overflowing the UI", () => {
    expect(formatContext(null)).toBe("未知");
    expect(formatContext(1_048_576)).toBe("1M");
    expect(formatContext(99_999_999)).toBe("1亿+");
  });
});
