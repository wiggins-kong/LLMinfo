import "server-only";
import { sqlite } from "@/db";
import type { DatasetDTO, Modality, OfferDTO, Cost, CostTier } from "./types";
import { normalizeStatus } from "./normalize";

interface OfferDbRow {
  provider_id: string;
  provider_name: string;
  provider_npm: string;
  provider_api: string | null;
  provider_doc: string;
  provider_env: string;
  model_id: string;
  name: string;
  family: string | null;
  description: string;
  attachment: number;
  reasoning: number;
  reasoning_options: string;
  tool_call: number;
  structured_output: number;
  temperature: number;
  interleaved: number;
  open_weights: number;
  knowledge: string | null;
  release_date: string | null;
  last_updated: string | null;
  status: string | null;
  experimental: number;
  input_modalities: string;
  output_modalities: string;
  context_limit: number | null;
  input_limit: number | null;
  output_limit: number | null;
  cost_input: number | null;
  cost_output: number | null;
  cost_cache_read: number | null;
  cost_cache_write: number | null;
  cost_reasoning: number | null;
  cost_input_audio: number | null;
  cost_output_audio: number | null;
  cost_tiers: string | null;
  cost_over_200k: string | null;
  has_cost: number;
  is_free: number;
  has_tiered_pricing: number;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToOffer(row: OfferDbRow): OfferDTO {
  const cost: Cost = {
    input: row.cost_input,
    output: row.cost_output,
    cache_read: row.cost_cache_read,
    cache_write: row.cost_cache_write,
    reasoning: row.cost_reasoning,
    input_audio: row.cost_input_audio,
    output_audio: row.cost_output_audio,
    tiers: parseJson<CostTier[] | null>(row.cost_tiers, null),
    context_over_200k: parseJson<Cost["context_over_200k"]>(row.cost_over_200k, null),
  };

  return {
    providerId: row.provider_id,
    providerName: row.provider_name,
    providerNpm: row.provider_npm,
    providerApi: row.provider_api,
    providerDoc: row.provider_doc,
    providerEnv: parseJson<string[]>(row.provider_env, []),
    modelId: row.model_id,
    name: row.name,
    family: row.family,
    description: row.description,
    attachment: row.attachment === 1,
    reasoning: row.reasoning === 1,
    reasoningOptions: parseJson(row.reasoning_options, []),
    toolCall: row.tool_call === 1,
    structuredOutput: row.structured_output === 1,
    temperature: row.temperature === 1,
    interleaved: row.interleaved === 1,
    openWeights: row.open_weights === 1,
    knowledge: row.knowledge,
    releaseDate: row.release_date,
    lastUpdated: row.last_updated,
    status: normalizeStatus(row.status),
    experimental: row.experimental === 1,
    inputModalities: parseJson<Modality[]>(row.input_modalities, []),
    outputModalities: parseJson<Modality[]>(row.output_modalities, []),
    limits: {
      context: row.context_limit,
      input: row.input_limit,
      output: row.output_limit,
    },
    cost,
    hasCost: row.has_cost === 1,
    isFree: row.is_free === 1,
    hasTieredPricing: row.has_tiered_pricing === 1,
  };
}

let cache: { hash: string | null; payload: DatasetDTO; builtAt: number } | null = null;

export function buildDataset(): DatasetDTO {
  const state = sqlite
    .prepare(`SELECT content_hash, last_synced_at, provider_count, model_count, offer_count
              FROM sync_state WHERE id = 1`)
    .get() as
    | {
        content_hash: string | null;
        last_synced_at: number | null;
        provider_count: number;
        model_count: number;
        offer_count: number;
      }
    | undefined;

  const hash = state?.content_hash ?? null;

  // The snapshot only changes when the sync engine writes a new content hash,
  // so an in-process cache keyed by that hash avoids re-serialising 7k rows.
  if (cache && cache.hash === hash) {
    return cache.payload;
  }

  const rows = sqlite
    .prepare(
      `SELECT o.*, p.name AS provider_name, p.npm AS provider_npm, p.api AS provider_api,
              p.doc AS provider_doc, p.env AS provider_env
         FROM offers o
         JOIN providers p ON p.id = o.provider_id
        ORDER BY o.model_id, o.provider_id`,
    )
    .all() as OfferDbRow[];

  const payload: DatasetDTO = {
    version: hash ?? "0",
    syncedAt: state?.last_synced_at ? new Date(state.last_synced_at).toISOString() : null,
    offers: rows.map(rowToOffer),
    counts: {
      providers: state?.provider_count ?? 0,
      models: state?.model_count ?? 0,
      offers: state?.offer_count ?? 0,
    },
  };

  cache = { hash, payload, builtAt: Date.now() };
  return payload;
}

export function invalidateDatasetCache(): void {
  cache = null;
}
