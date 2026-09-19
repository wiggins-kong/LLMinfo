/** Normalised shapes the client consumes. Kept intentionally small for wire size. */

export type Modality = "text" | "image" | "pdf" | "video" | "audio";

export interface CostTier {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
  tier: { type: string; size: number };
}

export interface Cost {
  input: number | null;
  output: number | null;
  cache_read: number | null;
  cache_write: number | null;
  reasoning: number | null;
  input_audio: number | null;
  output_audio: number | null;
  tiers: CostTier[] | null;
  context_over_200k: {
    input: number | null;
    output: number | null;
    cache_read: number | null;
    cache_write: number | null;
  } | null;
}

export interface Limits {
  context: number | null;
  input: number | null;
  output: number | null;
}

export interface ReasoningOption {
  type: string;
  values?: string[];
  min?: number;
  max?: number;
}

/** A provider's concrete offer for one model id. */
export interface OfferDTO {
  providerId: string;
  providerName: string;
  providerNpm: string;
  providerApi: string | null;
  providerDoc: string;
  providerEnv: string[];
  modelId: string;
  name: string;
  family: string | null;
  description: string;
  attachment: boolean;
  reasoning: boolean;
  reasoningOptions: ReasoningOption[];
  toolCall: boolean;
  structuredOutput: boolean;
  temperature: boolean;
  interleaved: boolean;
  openWeights: boolean;
  knowledge: string | null;
  releaseDate: string | null;
  lastUpdated: string | null;
  status: string | null;
  experimental: boolean;
  inputModalities: Modality[];
  outputModalities: Modality[];
  limits: Limits;
  cost: Cost;
  /** True when the source provided no cost object at all. */
  hasCost: boolean;
  /** True when both input and output are exactly zero. */
  isFree: boolean;
  /** True when a tiered or >200k price schedule exists. */
  hasTieredPricing: boolean;
}

export interface DatasetDTO {
  version: string;
  syncedAt: string | null;
  offers: OfferDTO[];
  counts: {
    providers: number;
    models: number;
    offers: number;
  };
}

export interface SyncStatusDTO {
  lastSyncedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  etag: string | null;
  contentHash: string | null;
  counts: { providers: number; models: number; offers: number };
  intervalMinutes: number;
}

export interface FavoriteDTO {
  modelId: string;
  createdAt: string;
}

export interface SavedViewDTO {
  id: number;
  name: string;
  query: string;
  createdAt: string;
}
