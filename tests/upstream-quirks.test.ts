import { describe, expect, it } from "vitest";
import { parseSourceDataset } from "@/lib/source-schema";
import { transformDataset } from "@/lib/transform";

/**
 * Regression tests for real shapes found in models.dev/api.json.
 * Each of these previously aborted the entire 7,860-row sync, so they are
 * pinned here rather than left to chance.
 */

function providerWith(models: Record<string, unknown>) {
  return {
    p: {
      id: "p",
      name: "P",
      env: [],
      npm: "",
      doc: "",
      models,
    },
  };
}

function baseModel(overrides: Record<string, unknown> = {}) {
  return {
    id: "m",
    name: "M",
    modalities: { input: ["text"], output: ["text"] },
    limit: { context: 1000, output: 100 },
    ...overrides,
  };
}

describe("upstream shape quirks", () => {
  it("accepts interleaved as a boolean", () => {
    const parsed = parseSourceDataset(providerWith({ m: baseModel({ interleaved: true }) }));
    expect(parsed.p.models.m.interleaved).toBe(true);
  });

  it("accepts interleaved as an object (1,010 upstream models do)", () => {
    const parsed = parseSourceDataset(
      providerWith({ m: baseModel({ interleaved: { field: "reasoning_content" } }) }),
    );
    expect(parsed.p.models.m.interleaved).toBe(true);
  });

  it("treats a missing interleaved flag as false", () => {
    const parsed = parseSourceDataset(providerWith({ m: baseModel() }));
    expect(parsed.p.models.m.interleaved).toBe(false);
  });

  it("filters null entries out of reasoning_options values", () => {
    const parsed = parseSourceDataset(
      providerWith({
        m: baseModel({ reasoning_options: [{ type: "effort", values: ["low", null, "high"] }] }),
      }),
    );
    expect(parsed.p.models.m.reasoning_options[0].values).toEqual(["low", "high"]);
  });

  it("accepts an experimental object without aborting the sync", () => {
    const parsed = parseSourceDataset(
      providerWith({
        m: baseModel({
          experimental: { modes: { fast: { cost: { input: 30, output: 150 } } } },
        }),
      }),
    );
    const result = transformDataset(parsed);
    expect(result.offers[0].experimental).toBe(true);
  });

  it("keeps month-granularity dates instead of dropping them", () => {
    const parsed = parseSourceDataset(
      providerWith({ m: baseModel({ release_date: "2025-04", last_updated: "2025-04" }) }),
    );
    const result = transformDataset(parsed);
    expect(result.offers[0].releaseDate).toBe("2025-04");
    expect(result.offers[0].lastUpdated).toBe("2025-04");
  });

  it("still rejects a genuinely malformed model", () => {
    expect(() => parseSourceDataset(providerWith({ m: { name: "no id" } }))).toThrow(/validation/i);
  });

  it("tolerates a missing cost object and a zero context window together", () => {
    const parsed = parseSourceDataset(providerWith({ m: baseModel({ limit: { context: 0 } }) }));
    const result = transformDataset(parsed);
    expect(result.offers[0].hasCost).toBe(false);
    expect(result.offers[0].limits.context).toBeNull();
  });

  it("preserves the 99,999,999 context sentinel for the UI to collapse", () => {
    const parsed = parseSourceDataset(
      providerWith({ m: baseModel({ limit: { context: 99_999_999, output: 100 } }) }),
    );
    const result = transformDataset(parsed);
    expect(result.offers[0].limits.context).toBe(99_999_999);
  });
});
