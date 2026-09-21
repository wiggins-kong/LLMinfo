/** Normalised shapes the client consumes. Kept intentionally small for wire size. */

export type Modality = "text" | "image" | "pdf" | "video" | "audio";

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

export interface ProviderDTO {
  id: string;
  name: string;
  npm: string;
  api: string | null;
  doc: string;
  env: string[];
}

/** A provider's concrete model entry for one model id. */
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
}

export interface DatasetDTO {
  version: string;
  syncedAt: string | null;
  providers: ProviderDTO[];
  offers: OfferDTO[];
  counts: {
    providers: number;
    models: number;
    offers: number;
  };
}
