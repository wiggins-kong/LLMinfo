import { describe, expect, it } from "vitest";
import { transformDataset } from "@/lib/transform";
import { parseSourceDataset } from "@/lib/source-schema";

const payload = {
  acme: {
    id: "acme",
    name: "Acme AI",
    npm: "@ai-sdk/openai",
    api: "https://api.acme.test/v1",
    doc: "https://docs.acme.test",
    env: ["ACME_API_KEY"],
    models: {
      "acme/opus": {
        id: "acme/opus",
        name: "Opus",
        description: "flagship",
        family: "opus",
        reasoning: true,
        tool_call: true,
        modalities: { input: ["text", "image"], output: ["text"] },
        limit: { context: 200_000, output: 8_192 },
        cost: { input: 5, output: 25, cache_read: 0.5 },
      },
      "acme/free": {
        id: "acme/free",
        name: "Free",
        modalities: { input: ["text"], output: ["text"] },
        limit: { context: 0 },
        cost: { input: 0, output: 0 },
      },
      "acme/unpriced": {
        id: "acme/unpriced",
        name: "Unpriced",
        modalities: { input: ["text"], output: ["text"] },
        limit: { context: 32_768 },
      },
      "acme/stale": {
        id: "acme/stale",
        name: "Stale",
        release_date: "1970-01-01",
        last_updated: "1970-01-01",
        modalities: { input: ["text"], output: ["text"] },
        limit: { context: 8_192 },
        cost: { input: 1, output: 1 },
      },
    },
  },
};

describe("parseSourceDataset", () => {
  it("accepts a well-formed payload", () => {
    const parsed = parseSourceDataset(payload);
    expect(Object.keys(parsed)).toEqual(["acme"]);
  });

  it("rejects a payload missing required model fields", () => {
    expect(() => parseSourceDataset({ acme: { name: "no id" } })).toThrow(/validation/i);
  });
});

describe("transformDataset", () => {
  const result = transformDataset(parseSourceDataset(payload));

  it("produces one offer per provider x model", () => {
    expect(result.offers).toHaveLength(4);
    expect(result.providers).toHaveLength(1);
  });

  it("marks an explicit zero/zero cost as free", () => {
    const free = result.offers.find((o) => o.modelId === "acme/free")!;
    expect(free.isFree).toBe(true);
    expect(free.hasCost).toBe(true);
  });

  it("keeps a missing cost object as unpriced, not free", () => {
    const unpriced = result.offers.find((o) => o.modelId === "acme/unpriced")!;
    expect(unpriced.hasCost).toBe(false);
    expect(unpriced.isFree).toBe(false);
    expect(unpriced.cost.input).toBeNull();
  });

  it("normalises the 1970 sentinel to null dates", () => {
    const stale = result.offers.find((o) => o.modelId === "acme/stale")!;
    expect(stale.releaseDate).toBeNull();
    expect(stale.lastUpdated).toBeNull();
  });

  it("keeps a zero context window as null", () => {
    const free = result.offers.find((o) => o.modelId === "acme/free")!;
    expect(free.limits.context).toBeNull();
  });

  it("propagates provider metadata onto every offer", () => {
    const opus = result.offers.find((o) => o.modelId === "acme/opus")!;
    expect(opus.providerName).toBe("Acme AI");
    expect(opus.providerEnv).toEqual(["ACME_API_KEY"]);
    expect(opus.providerApi).toBe("https://api.acme.test/v1");
  });

  it("aggregates models with the cheapest offer as best", () => {
    const opus = result.models.find((m) => m.modelId === "acme/opus")!;
    expect(opus.offerCount).toBe(1);
    expect(opus.bestInputPrice).toBe(5);
    expect(opus.bestProviderId).toBe("acme");
  });

  it("flags models that have a free or unpriced offer", () => {
    expect(result.models.find((m) => m.modelId === "acme/free")!.hasFree).toBe(true);
    expect(result.models.find((m) => m.modelId === "acme/unpriced")!.hasUnpriced).toBe(true);
  });

  it("is deterministic: identical input yields an identical content hash", () => {
    const again = transformDataset(parseSourceDataset(payload));
    expect(again.contentHash).toBe(result.contentHash);
  });

  it("changes the content hash when a price changes", () => {
    const mutated = structuredClone(payload);
    mutated.acme.models["acme/opus"].cost.input = 6;
    const changed = transformDataset(parseSourceDataset(mutated));
    expect(changed.contentHash).not.toBe(result.contentHash);
  });
});
