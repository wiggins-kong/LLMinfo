import type { DatasetDTO, Modality, OfferDTO, ReasoningOption } from "./types";

export type SortKey =
  | "name"
  | "context"
  | "outputLimit"
  | "reasoningLevels"
  | "releaseDate"
  | "lastUpdated"
  | "providerCount";

export type SortDir = "asc" | "desc";

export interface Filters {
  search: string;
  providerIds: string[];
  inputModalities: Modality[];
  reasoning: boolean;
  toolCall: boolean;
  structuredOutput: boolean;
  openWeights: boolean;
  statuses: string[];
  minContext: number | null;
  maxContext: number | null;
  minOutputLimit: number | null;
  maxOutputLimit: number | null;
}

export const EMPTY_FILTERS: Filters = {
  search: "",
  providerIds: [],
  inputModalities: [],
  reasoning: false,
  toolCall: false,
  structuredOutput: false,
  openWeights: false,
  statuses: [],
  minContext: null,
  maxContext: null,
  minOutputLimit: null,
  maxOutputLimit: null,
};

export interface ReasoningSummary {
  supported: boolean;
  options: ReasoningOption[];
  levels: string[];
  levelCount: number;
  highestLevel: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
}

export interface ModelAggregate {
  modelId: string;
  name: string;
  family: string | null;
  description: string;
  offers: OfferDTO[];
  providerCount: number;
  context: number | null;
  minContext: number | null;
  maxContext: number | null;
  inputLimit: number | null;
  outputLimit: number | null;
  minOutputLimit: number | null;
  maxOutputLimit: number | null;
  reasoning: boolean;
  reasoningSummary: ReasoningSummary;
  toolCall: boolean;
  structuredOutput: boolean;
  attachment: boolean;
  temperature: boolean;
  interleaved: boolean;
  openWeights: boolean;
  inputModalities: Modality[];
  outputModalities: Modality[];
  releaseDate: string | null;
  lastUpdated: string | null;
  statuses: string[];
  knowledge: string | null;
  experimental: boolean;
}

const LEVEL_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

function maxOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? Math.max(...present) : null;
}

function minOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? Math.min(...present) : null;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function summarizeReasoning(offers: OfferDTO[]): ReasoningSummary {
  const options: ReasoningOption[] = [];
  const levels: string[] = [];
  let budgetMin: number | null = null;
  let budgetMax: number | null = null;

  for (const offer of offers) {
    for (const option of offer.reasoningOptions) {
      const key = JSON.stringify(option);
      if (!options.some((item) => JSON.stringify(item) === key)) options.push(option);
      if (option.type === "effort" && option.values) levels.push(...option.values);
      if (option.type === "budget_tokens") {
        if (option.min !== undefined) budgetMin = budgetMin === null ? option.min : Math.min(budgetMin, option.min);
        if (option.max !== undefined) budgetMax = budgetMax === null ? option.max : Math.max(budgetMax, option.max);
      }
    }
  }

  const orderedLevels = uniqueStrings(levels).sort(
    (a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b),
  );
  const highestLevel = orderedLevels.length ? orderedLevels[orderedLevels.length - 1] : null;
  return {
    supported: offers.some((offer) => offer.reasoning),
    options,
    levels: orderedLevels,
    levelCount: orderedLevels.length,
    highestLevel,
    budgetMin,
    budgetMax,
  };
}

/** Group provider entries into one aggregate row per model id. */
export function aggregate(dataset: DatasetDTO): ModelAggregate[] {
  const byModel = new Map<string, OfferDTO[]>();
  for (const offer of dataset.offers) {
    const bucket = byModel.get(offer.modelId);
    if (bucket) bucket.push(offer);
    else byModel.set(offer.modelId, [offer]);
  }

  const out: ModelAggregate[] = [];
  for (const [modelId, offers] of byModel) {
    const contexts = offers.map((offer) => offer.limits.context);
    const outputs = offers.map((offer) => offer.limits.output);
    const inputs = offers.map((offer) => offer.limits.input);
    const modalities = new Set<Modality>();
    const outputModalities = new Set<Modality>();
    for (const offer of offers) {
      for (const modality of offer.inputModalities) modalities.add(modality);
      for (const modality of offer.outputModalities) outputModalities.add(modality);
    }

    const reasoningSummary = summarizeReasoning(offers);
    out.push({
      modelId,
      name: offers[0].name,
      family: offers[0].family,
      description: offers.find((offer) => offer.description)?.description ?? "",
      offers,
      providerCount: offers.length,
      context: maxOf(contexts),
      minContext: minOf(contexts),
      maxContext: maxOf(contexts),
      inputLimit: maxOf(inputs),
      outputLimit: maxOf(outputs),
      minOutputLimit: minOf(outputs),
      maxOutputLimit: maxOf(outputs),
      reasoning: reasoningSummary.supported,
      reasoningSummary,
      toolCall: offers.some((offer) => offer.toolCall),
      structuredOutput: offers.some((offer) => offer.structuredOutput),
      attachment: offers.some((offer) => offer.attachment),
      temperature: offers.some((offer) => offer.temperature),
      interleaved: offers.some((offer) => offer.interleaved),
      openWeights: offers.some((offer) => offer.openWeights),
      inputModalities: Array.from(modalities),
      outputModalities: Array.from(outputModalities),
      releaseDate: bestDate(offers.map((offer) => offer.releaseDate), "max"),
      lastUpdated: bestDate(offers.map((offer) => offer.lastUpdated), "max"),
      statuses: uniqueStrings(
        offers.map((offer) => offer.status).filter((status): status is string => status !== null),
      ),
      knowledge: bestDate(offers.map((offer) => offer.knowledge), "max"),
      experimental: offers.some((offer) => offer.experimental),
    });
  }
  return out;
}

function bestDate(values: (string | null)[], mode: "min" | "max"): string | null {
  const valid = values.filter((value): value is string => value !== null);
  if (!valid.length) return null;
  valid.sort();
  return mode === "min" ? valid[0] : valid[valid.length - 1];
}

function matchesCommon(offer: OfferDTO, filters: Filters): boolean {
  if (filters.reasoning && !offer.reasoning) return false;
  if (filters.toolCall && !offer.toolCall) return false;
  if (filters.structuredOutput && !offer.structuredOutput) return false;
  if (filters.openWeights && !offer.openWeights) return false;

  if (filters.statuses.length > 0) {
    const status = offer.status ?? "stable";
    if (!filters.statuses.includes(status)) return false;
  }

  if (filters.inputModalities.length > 0) {
    for (const modality of filters.inputModalities) {
      if (!offer.inputModalities.includes(modality)) return false;
    }
  }

  if (filters.minContext !== null || filters.maxContext !== null) {
    if (offer.limits.context === null) return false;
    if (filters.minContext !== null && offer.limits.context < filters.minContext) return false;
    if (filters.maxContext !== null && offer.limits.context > filters.maxContext) return false;
  }

  if (filters.minOutputLimit !== null || filters.maxOutputLimit !== null) {
    if (offer.limits.output === null) return false;
    if (filters.minOutputLimit !== null && offer.limits.output < filters.minOutputLimit) return false;
    if (filters.maxOutputLimit !== null && offer.limits.output > filters.maxOutputLimit) return false;
  }

  return true;
}

export function matchesSearch(offer: OfferDTO, search: string): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return (
    offer.name.toLowerCase().includes(needle) ||
    offer.modelId.toLowerCase().includes(needle) ||
    (offer.family ?? "").toLowerCase().includes(needle) ||
    offer.providerName.toLowerCase().includes(needle) ||
    offer.description.toLowerCase().includes(needle)
  );
}

export function filterModels(aggregates: ModelAggregate[], filters: Filters): ModelAggregate[] {
  return aggregates.filter((model) => {
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      const haystack = [
        model.name,
        model.modelId,
        model.family ?? "",
        model.description,
        ...model.offers.map((offer) => offer.providerName),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    const matchingOffers = model.offers.filter((offer) => {
      if (filters.providerIds.length && !filters.providerIds.includes(offer.providerId)) return false;
      return matchesCommon(offer, filters);
    });
    return matchingOffers.length > 0;
  });
}

function compareNullable(a: number | null, b: number | null, dir: SortDir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function compareNullableDate(a: string | null, b: string | null, dir: SortDir): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

export function sortModels(rows: ModelAggregate[], key: SortKey, dir: SortDir): ModelAggregate[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (key) {
      case "name":
        return dir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      case "context":
        return compareNullable(a.context, b.context, dir);
      case "outputLimit":
        return compareNullable(a.outputLimit, b.outputLimit, dir);
      case "reasoningLevels":
        return compareNullable(a.reasoningSummary.levelCount, b.reasoningSummary.levelCount, dir);
      case "releaseDate":
        return compareNullableDate(a.releaseDate, b.releaseDate, dir);
      case "lastUpdated":
        return compareNullableDate(a.lastUpdated, b.lastUpdated, dir);
      case "providerCount":
        return compareNullable(a.providerCount, b.providerCount, dir);
      default:
        return 0;
    }
  });
  return copy;
}

export function reasoningOptionLabel(option: ReasoningOption): string {
  if (option.type === "effort") {
    return option.values?.length ? option.values.join(" / ") : "推理档位";
  }
  if (option.type === "budget_tokens") {
    if (option.min !== undefined && option.max !== undefined) {
      return `${option.min.toLocaleString()} - ${option.max.toLocaleString()} tokens`;
    }
    if (option.min !== undefined) return `≥ ${option.min.toLocaleString()} tokens`;
    if (option.max !== undefined) return `≤ ${option.max.toLocaleString()} tokens`;
    return "token 预算";
  }
  if (option.type === "toggle") return "可开关";
  return option.type;
}
