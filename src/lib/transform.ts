import type { SourceDataset } from "./source-schema";
import {
  normalizeLimits,
  normalizeModalities,
  normalizeReasoningOptions,
  normalizeStatus,
  nullIfInvalidDate,
} from "./normalize";
import type { OfferDTO } from "./types";

export interface ProviderRow {
  id: string;
  name: string;
  npm: string;
  api: string | null;
  doc: string;
  env: string[];
}

export interface ModelRow {
  modelId: string;
  name: string;
  family: string | null;
  offerCount: number;
  bestInputPrice: number | null;
  bestOutputPrice: number | null;
  bestProviderId: string | null;
  maxContext: number | null;
  minContext: number | null;
  hasFree: boolean;
  hasUnpriced: boolean;
  openWeights: boolean;
  reasoning: boolean;
}

export interface OfferRow extends OfferDTO {
  providerId: string;
}

export interface TransformedDataset {
  providers: ProviderRow[];
  models: ModelRow[];
  offers: OfferRow[];
  contentHash: string;
}

function offerSortKey(offer: OfferRow): string {
  return `${offer.providerId}|${offer.modelId}`;
}

/** Deterministic hash over the fields the UI renders, used as the dataset ETag. */
export function hashDataset(providers: ProviderRow[], offers: OfferRow[]): string {
  const chunks: string[] = [];

  const sortedProviders = [...providers].sort((a, b) => a.id.localeCompare(b.id));
  for (const p of sortedProviders) {
    chunks.push(`p:${p.id}:${p.name}:${p.npm}:${p.api ?? ""}`);
  }

  const sortedOffers = [...offers].sort((a, b) => offerSortKey(a).localeCompare(offerSortKey(b)));
  for (const o of sortedOffers) {
    chunks.push(
      `o:${o.providerId}:${o.modelId}:${o.cost.input}:${o.cost.output}:${o.cost.cache_read}:` +
        `${o.limits.context}:${o.lastUpdated}:${o.status ?? ""}:${o.hasCost}:${o.isFree}`,
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
  const providers: ProviderRow[] = [];
  const offers: OfferRow[] = [];

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
      const limits = normalizeLimits(model.limit);
      const cost = model.cost;

      const hasCost = cost !== undefined;
      const input = cost?.input ?? null;
      const output = cost?.output ?? null;
      const isFree = input === 0 && output === 0;
      const hasTieredPricing =
        (cost?.tiers?.length ?? 0) > 0 || cost?.context_over_200k !== undefined;

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
        limits,
        cost: {
          input,
          output,
          cache_read: cost?.cache_read ?? null,
          cache_write: cost?.cache_write ?? null,
          reasoning: cost?.reasoning ?? null,
          input_audio: cost?.input_audio ?? null,
          output_audio: cost?.output_audio ?? null,
          tiers: cost?.tiers
            ? cost.tiers.map((t) => ({
                input: t.input,
                output: t.output,
                cache_read: t.cache_read,
                cache_write: t.cache_write,
                tier: { type: t.tier.type, size: t.tier.size },
              }))
            : null,
          context_over_200k: cost?.context_over_200k
            ? {
                input: cost.context_over_200k.input ?? null,
                output: cost.context_over_200k.output ?? null,
                cache_read: cost.context_over_200k.cache_read ?? null,
                cache_write: cost.context_over_200k.cache_write ?? null,
              }
            : null,
        },
        hasCost,
        isFree,
        hasTieredPricing,
      });
    }
  }

  const models = aggregateModels(offers);
  return { providers, models, offers, contentHash: hashDataset(providers, offers) };
}

/** Collapse provider x model offers into one row per model id. */
export function aggregateModels(offers: OfferRow[]): ModelRow[] {
  const byModel = new Map<string, OfferRow[]>();
  for (const offer of offers) {
    const bucket = byModel.get(offer.modelId);
    if (bucket) bucket.push(offer);
    else byModel.set(offer.modelId, [offer]);
  }

  const models: ModelRow[] = [];
  for (const [modelId, group] of byModel) {
    const priced = group.filter((o) => o.cost.input !== null || o.cost.output !== null);
    // Rank by blended price, then by provider id, so ties resolve deterministically.
    const ranked = [...priced].sort((a, b) => {
      const ab = (a.cost.input ?? 0) * 3 + (a.cost.output ?? 0);
      const bb = (b.cost.input ?? 0) * 3 + (b.cost.output ?? 0);
      if (ab !== bb) return ab - bb;
      return a.providerId.localeCompare(b.providerId);
    });
    const best = ranked[0];

    const contexts = group
      .map((o) => o.limits.context)
      .filter((c): c is number => c !== null);

    const primary = group[0];
    models.push({
      modelId,
      name: primary.name,
      family: primary.family,
      offerCount: group.length,
      bestInputPrice: best?.cost.input ?? null,
      bestOutputPrice: best?.cost.output ?? null,
      bestProviderId: best?.providerId ?? null,
      maxContext: contexts.length ? Math.max(...contexts) : null,
      minContext: contexts.length ? Math.min(...contexts) : null,
      hasFree: group.some((o) => o.isFree),
      hasUnpriced: group.some((o) => !o.hasCost),
      openWeights: group.some((o) => o.openWeights),
      reasoning: group.some((o) => o.reasoning),
    });
  }
  return models;
}
