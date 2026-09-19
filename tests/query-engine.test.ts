import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  aggregate,
  filterModels,
  filterOffers,
  sortModels,
  type Filters,
} from "@/lib/query-engine";
import type { DatasetDTO, OfferDTO } from "@/lib/types";

function offer(partial: Partial<OfferDTO> & { providerId: string; modelId: string }): OfferDTO {
  return {
    providerName: partial.providerId,
    providerNpm: "",
    providerApi: null,
    providerDoc: "",
    providerEnv: [],
    name: partial.modelId,
    family: "test",
    description: "",
    attachment: false,
    reasoning: false,
    reasoningOptions: [],
    toolCall: false,
    structuredOutput: false,
    temperature: false,
    interleaved: false,
    openWeights: false,
    knowledge: null,
    releaseDate: null,
    lastUpdated: null,
    status: null,
    experimental: false,
    inputModalities: ["text"],
    outputModalities: ["text"],
    limits: { context: 128_000, input: null, output: 8_192 },
    cost: {
      input: 1,
      output: 2,
      cache_read: null,
      cache_write: null,
      reasoning: null,
      input_audio: null,
      output_audio: null,
      tiers: null,
      context_over_200k: null,
    },
    hasCost: true,
    isFree: false,
    hasTieredPricing: false,
    ...partial,
  };
}

const dataset: DatasetDTO = {
  version: "test",
  syncedAt: null,
  counts: { providers: 3, models: 2, offers: 3 },
  offers: [
    offer({ providerId: "cheap", modelId: "alpha", cost: { ...offer({} as never).cost, input: 0.5, output: 1 } }),
    offer({ providerId: "pricey", modelId: "alpha", cost: { ...offer({} as never).cost, input: 5, output: 25 } }),
    offer({
      providerId: "vision",
      modelId: "beta",
      reasoning: true,
      inputModalities: ["text", "image"],
      limits: { context: 1_048_576, input: null, output: 32_768 },
    }),
  ],
};

const filters = (patch: Partial<Filters> = {}): Filters => ({ ...EMPTY_FILTERS, ...patch });

describe("aggregate", () => {
  it("collapses provider offers into one row per model", () => {
    const rows = aggregate(dataset);
    expect(rows).toHaveLength(2);
    const alpha = rows.find((r) => r.modelId === "alpha")!;
    expect(alpha.providerCount).toBe(2);
    expect(alpha.minInput).toBe(0.5);
    expect(alpha.maxInput).toBe(5);
  });

  it("picks the cheapest provider as best", () => {
    const alpha = aggregate(dataset).find((r) => r.modelId === "alpha")!;
    expect(alpha.best?.providerId).toBe("cheap");
  });

  it("takes the widest context window across providers", () => {
    const beta = aggregate(dataset).find((r) => r.modelId === "beta")!;
    expect(beta.context).toBe(1_048_576);
  });
});

describe("filterOffers", () => {
  it("filters by provider", () => {
    const rows = filterOffers(dataset, filters({ providerId: "pricey" }));
    expect(rows).toHaveLength(1);
    expect(rows[0].modelId).toBe("alpha");
  });

  it("requires every selected modality", () => {
    expect(filterOffers(dataset, filters({ inputModalities: ["image"] }))).toHaveLength(1);
    expect(filterOffers(dataset, filters({ inputModalities: ["image", "audio"] }))).toHaveLength(0);
  });

  it("filters by capability flags", () => {
    const rows = filterOffers(dataset, filters({ reasoning: true }));
    expect(rows).toHaveLength(1);
    expect(rows[0].modelId).toBe("beta");
  });

  it("applies an input price ceiling inclusively", () => {
    // beta's default offer sits exactly at 1, so <= must keep it.
    const inclusive = filterOffers(dataset, filters({ maxInputPrice: 1 }));
    expect(inclusive.map((r) => r.providerId).sort()).toEqual(["cheap", "vision"]);

    const stricter = filterOffers(dataset, filters({ maxInputPrice: 0.9 }));
    expect(stricter).toHaveLength(1);
    expect(stricter[0].providerId).toBe("cheap");
  });

  it("applies a minimum context floor", () => {
    const rows = filterOffers(dataset, filters({ minContext: 500_000 }));
    expect(rows).toHaveLength(1);
    expect(rows[0].modelId).toBe("beta");
  });

  it("excludes unpriced offers when a price filter is active", () => {
    const withUnpriced: DatasetDTO = {
      ...dataset,
      offers: [
        ...dataset.offers,
        offer({
          providerId: "nopricing",
          modelId: "gamma",
          hasCost: false,
          cost: { ...dataset.offers[0].cost, input: null, output: null },
        }),
      ],
    };
    const rows = filterOffers(withUnpriced, filters({ maxInputPrice: 100 }));
    expect(rows.some((r) => r.providerId === "nopricing")).toBe(false);
  });

  it("matches search across name, id, family and provider", () => {
    expect(filterOffers(dataset, filters({ search: "alpha" }))).toHaveLength(2);
    expect(filterOffers(dataset, filters({ search: "vision" }))).toHaveLength(1);
    expect(filterOffers(dataset, filters({ search: "nothing-here" }))).toHaveLength(0);
  });

  it("treats a null status as stable when filtering by status", () => {
    expect(filterOffers(dataset, filters({ statuses: ["stable"] }))).toHaveLength(3);
    expect(filterOffers(dataset, filters({ statuses: ["beta"] }))).toHaveLength(0);
  });
});

describe("filterModels", () => {
  it("keeps a model when any of its offers satisfies the filters", () => {
    const rows = filterModels(aggregate(dataset), filters({ maxInputPrice: 1 }));
    expect(rows.map((r) => r.modelId)).toContain("alpha");
  });

  it("drops models with no qualifying offer", () => {
    const rows = filterModels(aggregate(dataset), filters({ reasoning: true }));
    expect(rows.map((r) => r.modelId)).toEqual(["beta"]);
  });
});

describe("sortModels", () => {
  it("sorts ascending by input price", () => {
    const rows = sortModels(aggregate(dataset), "input", "asc");
    expect(rows[0].modelId).toBe("alpha");
  });

  it("sorts descending by context", () => {
    const rows = sortModels(aggregate(dataset), "context", "desc");
    expect(rows[0].modelId).toBe("beta");
  });

  it("always sinks missing values to the bottom regardless of direction", () => {
    const withMissing: DatasetDTO = {
      ...dataset,
      offers: [
        ...dataset.offers,
        offer({
          providerId: "nopricing",
          modelId: "gamma",
          hasCost: false,
          cost: { ...dataset.offers[0].cost, input: null, output: null },
        }),
      ],
    };
    for (const dir of ["asc", "desc"] as const) {
      const rows = sortModels(aggregate(withMissing), "input", dir);
      expect(rows[rows.length - 1].modelId).toBe("gamma");
    }
  });
});
