import type { SourceDataset } from "./source-schema";
import {
  normalizeLimits,
  normalizeModalities,
  normalizeReasoningOptions,
  normalizeStatus,
  nullIfInvalidDate,
} from "./normalize";
import type { OfferDTO, ProviderDTO } from "./types";

export interface TransformedDataset {
  providers: ProviderDTO[];
  offers: OfferDTO[];
  contentHash: string;
}

function offerSortKey(offer: OfferDTO): string {
  return `${offer.providerId}|${offer.modelId}`;
}

/** Deterministic hash over the fields the UI renders, used as the dataset version. */
export function hashDataset(providers: ProviderDTO[], offers: OfferDTO[]): string {
  const chunks: string[] = [];

  const sortedProviders = [...providers].sort((a, b) => a.id.localeCompare(b.id));
  for (const p of sortedProviders) {
    chunks.push(`p:${p.id}:${p.name}:${p.npm}:${p.api ?? ""}`);
  }

  const sortedOffers = [...offers].sort((a, b) => offerSortKey(a).localeCompare(offerSortKey(b)));
  for (const o of sortedOffers) {
    chunks.push(
      `o:${o.providerId}:${o.modelId}:${o.name}:${o.family ?? ""}:` +
        `${o.limits.context}:${o.limits.input}:${o.limits.output}:` +
        `${o.reasoning}:${JSON.stringify(o.reasoningOptions)}:${o.lastUpdated}:${o.status ?? ""}`,
    );
  }

  // FNV-1a over the rendered fields: deterministic across browsers, no Node
  // crypto dependency, and sufficient for change detection (not security).
  const input = chunks.join("\n");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

export function transformDataset(source: SourceDataset): TransformedDataset {
  const providers: ProviderDTO[] = [];
  const offers: OfferDTO[] = [];

  for (const [providerKey, provider] of Object.entries(source)) {
    const providerId = provider.id || providerKey;
    providers.push({
      id: providerId,
      name: provider.name,
      npm: provider.npm,
      api: provider.api ?? null,
      doc: provider.doc,
      env: provider.env,
    });

    for (const [modelKey, model] of Object.entries(provider.models)) {
      const modelId = model.id || modelKey;
      offers.push({
        providerId,
        providerName: provider.name,
        providerNpm: provider.npm,
        providerApi: provider.api ?? null,
        providerDoc: provider.doc,
        providerEnv: provider.env,
        modelId,
        name: model.name,
        family: model.family ?? null,
        description: model.description ?? "",
        attachment: model.attachment,
        reasoning: model.reasoning,
        reasoningOptions: normalizeReasoningOptions(model.reasoning_options),
        toolCall: model.tool_call,
        structuredOutput: model.structured_output,
        temperature: model.temperature,
        interleaved: model.interleaved,
        openWeights: model.open_weights,
        knowledge: nullIfInvalidDate(model.knowledge) ?? model.knowledge,
        releaseDate: nullIfInvalidDate(model.release_date),
        lastUpdated: nullIfInvalidDate(model.last_updated),
        status: normalizeStatus(model.status),
        experimental: model.experimental !== undefined,
        inputModalities: normalizeModalities(model.modalities?.input),
        outputModalities: normalizeModalities(model.modalities?.output),
        limits: normalizeLimits(model.limit),
      });
    }
  }

  return { providers, offers, contentHash: hashDataset(providers, offers) };
}
