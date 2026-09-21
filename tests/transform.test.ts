import { describe, expect, it } from "vitest";
import { parseSourceDataset } from "@/lib/source-schema";
import { transformDataset } from "@/lib/transform";

const source = {
  acme: {
    id: "acme",
    name: "Acme",
    npm: "@ai-sdk/acme",
    api: "https://api.acme.test/v1",
    doc: "https://docs.acme.test",
    env: ["ACME_API_KEY"],
    models: {
      "acme/opus": {
        id: "acme/opus",
        name: "Opus",
        family: "Opus",
        reasoning: true,
        reasoning_options: [{ type: "effort", values: ["low", "high"] }],
        tool_call: true,
        modalities: { input: ["text", "image"], output: ["text"] },
        limit: { context: 200_000, output: 32_000 },
        release_date: "2025-04",
        last_updated: "2025-05-01",
      },
    },
  },
  beta: {
    id: "beta",
    name: "Beta",
    npm: "@ai-sdk/beta",
    api: null,
    doc: "",
    env: [],
    models: {
      "acme/opus": {
        id: "acme/opus",
        name: "Opus",
        family: "Opus",
        reasoning: true,
        reasoning_options: [{ type: "effort", values: ["low", "medium", "high", "xhigh"] }],
        tool_call: false,
        modalities: { input: ["text"], output: ["text"] },
        limit: { context: 128_000, output: 16_000 },
      },
    },
  },
};

describe("transformDataset", () => {
  it("produces one offer per provider and model without pricing", () => {
    const result = transformDataset(parseSourceDataset(source));
    expect(result.offers).toHaveLength(2);
    expect(result.providers).toHaveLength(2);
    expect(result.offers[0]).not.toHaveProperty("cost");
    expect(result.offers[0].providerEnv).toEqual(["ACME_API_KEY"]);
    expect(result.offers[0].releaseDate).toBe("2025-04");
  });

  it("keeps provider metadata on each offer", () => {
    const result = transformDataset(parseSourceDataset(source));
    const beta = result.offers.find((offer) => offer.providerId === "beta")!;
    expect(beta.providerName).toBe("Beta");
    expect(beta.providerApi).toBeNull();
    expect(beta.limits).toEqual({ context: 128_000, input: null, output: 16_000 });
  });
});
