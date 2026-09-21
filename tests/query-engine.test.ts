import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, aggregate, filterModels, reasoningOptionLabel, sortModels } from "@/lib/query-engine";
import type { DatasetDTO, OfferDTO } from "@/lib/types";

function offer(partial: Partial<OfferDTO> & { providerId: string; modelId: string }): OfferDTO {
  return {
    providerName: partial.providerName ?? partial.providerId,
    providerNpm: "",
    providerApi: null,
    providerDoc: "",
    providerEnv: [],
    name: partial.name ?? partial.modelId,
    family: partial.family ?? null,
    description: partial.description ?? "",
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
    limits: { context: 100_000, input: null, output: 10_000 },
    ...partial,
  };
}

function dataset(offers: OfferDTO[]): DatasetDTO {
  return {
    version: "test",
    syncedAt: null,
    providers: [],
    offers,
    counts: { providers: 2, models: 1, offers: offers.length },
  };
}

describe("model aggregation", () => {
  const offers = [
    offer({
      providerId: "acme",
      providerName: "Acme",
      modelId: "shared/model",
      reasoning: true,
      reasoningOptions: [{ type: "effort", values: ["low", "high"] }],
      limits: { context: 200_000, input: 180_000, output: 32_000 },
    }),
    offer({
      providerId: "beta",
      providerName: "Beta",
      modelId: "shared/model",
      reasoning: true,
      reasoningOptions: [{ type: "effort", values: ["low", "medium", "high", "xhigh"] }],
      limits: { context: 128_000, input: null, output: 16_000 },
    }),
  ];

  it("collapses provider offers into one model row with maximum values", () => {
    const [model] = aggregate(dataset(offers));
    expect(model.modelId).toBe("shared/model");
    expect(model.providerCount).toBe(2);
    expect(model.context).toBe(200_000);
    expect(model.minContext).toBe(128_000);
    expect(model.outputLimit).toBe(32_000);
    expect(model.minOutputLimit).toBe(16_000);
  });

  it("merges reasoning levels in canonical order", () => {
    const [model] = aggregate(dataset(offers));
    expect(model.reasoningSummary.levels).toEqual(["low", "medium", "high", "xhigh"]);
    expect(model.reasoningSummary.highestLevel).toBe("xhigh");
    expect(model.reasoningSummary.levelCount).toBe(4);
  });
});

describe("model filtering", () => {
  const models = aggregate(
    dataset([
      offer({
        providerId: "acme",
        modelId: "alpha",
        reasoning: true,
        toolCall: true,
        limits: { context: 200_000, input: null, output: 32_000 },
      }),
      offer({
        providerId: "beta",
        modelId: "alpha",
        reasoning: false,
        limits: { context: 100_000, input: null, output: 8_000 },
      }),
      offer({
        providerId: "beta",
        modelId: "beta",
        openWeights: true,
        limits: { context: 64_000, input: null, output: 4_000 },
      }),
    ]),
  );

  it("matches any selected provider", () => {
    const result = filterModels(models, { ...EMPTY_FILTERS, providerIds: ["beta"] });
    expect(result.map((model) => model.modelId)).toEqual(["alpha", "beta"]);
  });

  it("keeps a model when any provider offer satisfies all filters", () => {
    const result = filterModels(models, {
      ...EMPTY_FILTERS,
      providerIds: ["acme"],
      reasoning: true,
      minContext: 150_000,
    });
    expect(result.map((model) => model.modelId)).toEqual(["alpha"]);
  });

  it("supports output range and capability filters", () => {
    expect(filterModels(models, { ...EMPTY_FILTERS, minOutputLimit: 10_000 }).map((m) => m.modelId)).toEqual(["alpha"]);
    expect(filterModels(models, { ...EMPTY_FILTERS, openWeights: true }).map((m) => m.modelId)).toEqual(["beta"]);
  });
});

describe("model sorting", () => {
  const models = aggregate(
    dataset([
      offer({ providerId: "a", modelId: "small", name: "Zed", limits: { context: 32_000, input: null, output: 4_000 } }),
      offer({ providerId: "b", modelId: "large", name: "Alpha", limits: { context: 200_000, input: null, output: 32_000 } }),
    ]),
  );

  it("sorts by name and numeric specification", () => {
    expect(sortModels(models, "name", "asc").map((m) => m.modelId)).toEqual(["large", "small"]);
    expect(sortModels(models, "context", "desc").map((m) => m.modelId)).toEqual(["large", "small"]);
  });
});

describe("reasoning labels", () => {
  it("formats effort, budget and toggle options", () => {
    expect(reasoningOptionLabel({ type: "effort", values: ["low", "high"] })).toBe("low / high");
    expect(reasoningOptionLabel({ type: "budget_tokens", min: 1024, max: 4096 })).toContain("1,024");
    expect(reasoningOptionLabel({ type: "toggle" })).toBe("可开关");
  });
});
