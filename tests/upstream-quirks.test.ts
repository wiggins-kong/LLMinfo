import { describe, expect, it } from "vitest";
import { parseSourceDataset } from "@/lib/source-schema";
import { transformDataset } from "@/lib/transform";

function payload(model: Record<string, unknown>) {
  return {
    acme: {
      id: "acme",
      name: "Acme",
      npm: "@ai-sdk/acme",
      api: null,
      doc: "",
      env: [],
      models: {
        "acme/model": {
          id: "acme/model",
          name: "Model",
          ...model,
        },
      },
    },
  };
}

describe("upstream quirks", () => {
  it("accepts object-shaped interleaved and experimental fields", () => {
    const result = transformDataset(
      parseSourceDataset(payload({ interleaved: { field: "reasoning_content" }, experimental: { modes: {} } })),
    );
    expect(result.offers[0].interleaved).toBe(true);
    expect(result.offers[0].experimental).toBe(true);
  });

  it("filters null reasoning values and keeps month-granularity dates", () => {
    const result = transformDataset(
      parseSourceDataset(
        payload({
          reasoning: true,
          reasoning_options: [{ type: "effort", values: ["low", null, "high"] }],
          release_date: "2025-04",
          last_updated: "2025-04",
        }),
      ),
    );
    expect(result.offers[0].reasoningOptions[0].values).toEqual(["low", "high"]);
    expect(result.offers[0].releaseDate).toBe("2025-04");
    expect(result.offers[0].lastUpdated).toBe("2025-04");
  });

  it("turns zero context into null and keeps huge context bounded", () => {
    const zero = transformDataset(parseSourceDataset(payload({ limit: { context: 0 } })));
    const huge = transformDataset(parseSourceDataset(payload({ limit: { context: 99_999_999 } })));
    expect(zero.offers[0].limits.context).toBeNull();
    expect(huge.offers[0].limits.context).toBe(99_999_999);
  });

  it("ignores upstream cost instead of rejecting the payload", () => {
    const result = transformDataset(
      parseSourceDataset(
        payload({
          cost: { input: 3, output: 15, tiers: [{ input: 1, output: 2, tier: { type: "context", size: 200_000 } }] },
        }),
      ),
    );
    expect(result.offers[0]).not.toHaveProperty("cost");
  });
});
