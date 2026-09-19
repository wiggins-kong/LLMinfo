import type { DatasetDTO, Modality, OfferDTO } from "./types";
import { blendedPrice, type BlendWeights } from "./pricing";

export type SortKey =
  | "name"
  | "input"
  | "output"
  | "blended"
  | "cacheRead"
  | "cacheWrite"
  | "context"
  | "outputLimit"
  | "releaseDate"
  | "lastUpdated"
  | "offerCount"
  | "capabilities";

export type SortDir = "asc" | "desc";
export type ViewMode = "model" | "offer";

export interface Filters {
  search: string;
  providerId: string;
  family: string;
  inputModalities: Modality[];
  reasoning: boolean;
  toolCall: boolean;
  structuredOutput: boolean;
  attachment: boolean;
  temperature: boolean;
  interleaved: boolean;
  openWeights: boolean;
  statuses: string[];
  minInputPrice: number | null;
  maxInputPrice: number | null;
  minContext: number | null;
  maxContext: number | null;
  minOutputLimit: number | null;
  knowledgeAfter: string | null;
  releasedAfter: string | null;
  updatedAfter: string | null;
  freeOnly: boolean;
  unpricedOnly: boolean;
}

export const EMPTY_FILTERS: Filters = {
  search: "",
  providerId: "",
  family: "",
  inputModalities: [],
  reasoning: false,
  toolCall: false,
  structuredOutput: false,
  attachment: false,
  temperature: false,
  interleaved: false,
  openWeights: false,
  statuses: [],
  minInputPrice: null,
  maxInputPrice: null,
  minContext: null,
  maxContext: null,
  minOutputLimit: null,
  knowledgeAfter: null,
  releasedAfter: null,
  updatedAfter: null,
  freeOnly: false,
  unpricedOnly: false,
};

export interface ModelAggregate {
  modelId: string;
  name: string;
  family: string | null;
  offers: OfferDTO[];
  best: OfferDTO | null;
  bestBlended: number | null;
  minInput: number | null;
  maxInput: number | null;
  minOutput: number | null;
  maxOutput: number | null;
  cacheRead: number | null;
  context: number | null;
  minContext: number | null;
  outputLimit: number | null;
  providerCount: number;
  capabilityCount: number;
  hasFree: boolean;
  hasUnpriced: boolean;
  openWeights: boolean;
  reasoning: boolean;
  toolCall: boolean;
  structuredOutput: boolean;
  attachment: boolean;
  temperature: boolean;
  interleaved: boolean;
  inputModalities: Modality[];
  releaseDate: string | null;
  lastUpdated: string | null;
  statuses: string[];
}

function capabilityCount(o: OfferDTO): number {
  let n = 0;
  if (o.reasoning) n += 1;
  if (o.toolCall) n += 1;
  if (o.structuredOutput) n += 1;
  if (o.attachment) n += 1;
  if (o.temperature) n += 1;
  if (o.interleaved) n += 1;
  if (o.openWeights) n += 1;
  return n;
}

/** Group provider offers into one aggregate row per model id. */
export function aggregate(dataset: DatasetDTO, blend: BlendWeights = "3:1"): ModelAggregate[] {
  const byModel = new Map<string, OfferDTO[]>();
  for (const offer of dataset.offers) {
    const bucket = byModel.get(offer.modelId);
    if (bucket) bucket.push(offer);
    else byModel.set(offer.modelId, [offer]);
  }

  const out: ModelAggregate[] = [];
  for (const [modelId, offers] of byModel) {
    const priced = offers.filter((o) => o.cost.input !== null || o.cost.output !== null);
    const ranked = [...priced].sort((a, b) => {
      const ab = blendedPrice(a.cost, blend);
      const bb = blendedPrice(b.cost, blend);
      const av = ab ?? Number.POSITIVE_INFINITY;
      const bv = bb ?? Number.POSITIVE_INFINITY;
      if (av !== bv) return av - bv;
      return a.providerId.localeCompare(b.providerId);
    });
    const best = ranked[0] ?? null;

    const inputs = offers.map((o) => o.cost.input).filter((v): v is number => v !== null);
    const outputs = offers.map((o) => o.cost.output).filter((v): v is number => v !== null);
    const contexts = offers.map((o) => o.limits.context).filter((v): v is number => v !== null);
    const outputLimits = offers.map((o) => o.limits.output).filter((v): v is number => v !== null);
    const modalities = new Set<Modality>();
    for (const o of offers) for (const m of o.inputModalities) modalities.add(m);

    const statuses = Array.from(
      new Set(offers.map((o) => o.status).filter((s): s is string => s !== null)),
    );

    out.push({
      modelId,
      name: offers[0].name,
      family: offers[0].family,
      offers,
      best,
      bestBlended: best ? blendedPrice(best.cost, blend) : null,
      minInput: inputs.length ? Math.min(...inputs) : null,
      maxInput: inputs.length ? Math.max(...inputs) : null,
      minOutput: outputs.length ? Math.min(...outputs) : null,
      maxOutput: outputs.length ? Math.max(...outputs) : null,
      cacheRead: best?.cost.cache_read ?? null,
      context: contexts.length ? Math.max(...contexts) : null,
      minContext: contexts.length ? Math.min(...contexts) : null,
      outputLimit: outputLimits.length ? Math.max(...outputLimits) : null,
      providerCount: offers.length,
      capabilityCount: Math.max(...offers.map(capabilityCount)),
      hasFree: offers.some((o) => o.isFree),
      hasUnpriced: offers.some((o) => !o.hasCost),
      openWeights: offers.some((o) => o.openWeights),
      reasoning: offers.some((o) => o.reasoning),
      toolCall: offers.some((o) => o.toolCall),
      structuredOutput: offers.some((o) => o.structuredOutput),
      attachment: offers.some((o) => o.attachment),
      temperature: offers.some((o) => o.temperature),
      interleaved: offers.some((o) => o.interleaved),
      inputModalities: Array.from(modalities),
      releaseDate: bestDate(offers.map((o) => o.releaseDate), "max"),
      lastUpdated: bestDate(offers.map((o) => o.lastUpdated), "max"),
      statuses,
    });
  }
  return out;
}

function bestDate(values: (string | null)[], mode: "min" | "max"): string | null {
  const valid = values.filter((v): v is string => v !== null);
  if (!valid.length) return null;
  valid.sort();
  return mode === "min" ? valid[0] : valid[valid.length - 1];
}

function matchesCommon(offer: OfferDTO, filters: Filters, blend: BlendWeights): boolean {
  if (filters.providerId && offer.providerId !== filters.providerId) return false;
  if (filters.family && offer.family !== filters.family) return false;

  if (filters.reasoning && !offer.reasoning) return false;
  if (filters.toolCall && !offer.toolCall) return false;
  if (filters.structuredOutput && !offer.structuredOutput) return false;
  if (filters.attachment && !offer.attachment) return false;
  if (filters.temperature && !offer.temperature) return false;
  if (filters.interleaved && !offer.interleaved) return false;
  if (filters.openWeights && !offer.openWeights) return false;

  if (filters.statuses.length > 0) {
    const status = offer.status ?? "stable";
    if (!filters.statuses.includes(status)) return false;
  }

  if (filters.inputModalities.length > 0) {
    for (const m of filters.inputModalities) {
      if (!offer.inputModalities.includes(m)) return false;
    }
  }

  if (filters.freeOnly && !offer.isFree) return false;
  if (filters.unpricedOnly && offer.hasCost) return false;

  if (filters.minInputPrice !== null || filters.maxInputPrice !== null) {
    if (offer.cost.input === null) return false;
    if (filters.minInputPrice !== null && offer.cost.input < filters.minInputPrice) return false;
    if (filters.maxInputPrice !== null && offer.cost.input > filters.maxInputPrice) return false;
  }

  if (filters.minContext !== null || filters.maxContext !== null) {
    if (offer.limits.context === null) return false;
    if (filters.minContext !== null && offer.limits.context < filters.minContext) return false;
    if (filters.maxContext !== null && offer.limits.context > filters.maxContext) return false;
  }

  if (filters.minOutputLimit !== null) {
    if (offer.limits.output === null || offer.limits.output < filters.minOutputLimit) return false;
  }

  if (filters.knowledgeAfter && (!offer.knowledge || offer.knowledge < filters.knowledgeAfter)) {
    return false;
  }
  if (filters.releasedAfter && (!offer.releaseDate || offer.releaseDate < filters.releasedAfter)) {
    return false;
  }
  if (filters.updatedAfter && (!offer.lastUpdated || offer.lastUpdated < filters.updatedAfter)) {
    return false;
  }

  // Blend is read here so price-band filtering stays consistent with sorting.
  void blend;
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

export function filterOffers(
  dataset: DatasetDTO,
  filters: Filters,
  blend: BlendWeights = "3:1",
): OfferDTO[] {
  return dataset.offers.filter(
    (offer) => matchesSearch(offer, filters.search) && matchesCommon(offer, filters, blend),
  );
}

export function filterModels(
  aggregates: ModelAggregate[],
  filters: Filters,
  blend: BlendWeights = "3:1",
): ModelAggregate[] {
  return aggregates.filter((agg) => {
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      const haystack = [
        agg.name,
        agg.modelId,
        agg.family ?? "",
        agg.best?.providerName ?? "",
        ...agg.offers.map((o) => o.providerName),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    // A model survives when at least one of its offers satisfies every active
    // offer-level constraint — that is what "show me models I can actually use
    // under these conditions" means.
    const hasMatchingOffer = agg.offers.some((offer) => {
      if (!matchesCommon(offer, filters, blend)) return false;
      return true;
    });
    if (!hasMatchingOffer) return false;

    if (filters.family && agg.family !== filters.family) return false;
    if (filters.providerId && !agg.offers.some((o) => o.providerId === filters.providerId)) return false;

    return true;
  });
}

function compareNullable(a: number | null, b: number | null, dir: SortDir): number {
  // Missing values always sink to the bottom regardless of direction.
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

export function sortModels(
  rows: ModelAggregate[],
  key: SortKey,
  dir: SortDir,
  blend: BlendWeights = "3:1",
): ModelAggregate[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (key) {
      case "name":
        return dir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      case "input":
        return compareNullable(a.minInput, b.minInput, dir);
      case "output":
        return compareNullable(a.minOutput, b.minOutput, dir);
      case "blended":
        return compareNullable(a.bestBlended, b.bestBlended, dir);
      case "cacheRead":
        return compareNullable(a.cacheRead, b.cacheRead, dir);
      case "cacheWrite":
        return compareNullable(a.best?.cost.cache_write ?? null, b.best?.cost.cache_write ?? null, dir);
      case "context":
        return compareNullable(a.context, b.context, dir);
      case "outputLimit":
        return compareNullable(a.outputLimit, b.outputLimit, dir);
      case "releaseDate":
        return compareNullableDate(a.releaseDate, b.releaseDate, dir);
      case "lastUpdated":
        return compareNullableDate(a.lastUpdated, b.lastUpdated, dir);
      case "offerCount":
        return compareNullable(a.providerCount, b.providerCount, dir);
      case "capabilities":
        return compareNullable(a.capabilityCount, b.capabilityCount, dir);
      default:
        return 0;
    }
  });
  void blend;
  return copy;
}

export function sortOffers(
  rows: OfferDTO[],
  key: SortKey,
  dir: SortDir,
): OfferDTO[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (key) {
      case "name":
        return dir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      case "input":
        return compareNullable(a.cost.input, b.cost.input, dir);
      case "output":
        return compareNullable(a.cost.output, b.cost.output, dir);
      case "blended":
        return compareNullable(blendedPrice(a.cost), blendedPrice(b.cost), dir);
      case "cacheRead":
        return compareNullable(a.cost.cache_read, b.cost.cache_read, dir);
      case "cacheWrite":
        return compareNullable(a.cost.cache_write, b.cost.cache_write, dir);
      case "context":
        return compareNullable(a.limits.context, b.limits.context, dir);
      case "outputLimit":
        return compareNullable(a.limits.output, b.limits.output, dir);
      case "releaseDate":
        return compareNullableDate(a.releaseDate, b.releaseDate, dir);
      case "lastUpdated":
        return compareNullableDate(a.lastUpdated, b.lastUpdated, dir);
      case "offerCount":
        return compareNullable(null, null, dir);
      case "capabilities":
        return compareNullable(capabilityCount(a), capabilityCount(b), dir);
      default:
        return 0;
    }
  });
  return copy;
}
