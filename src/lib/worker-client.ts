import type { QueryRequest, QueryResponse } from "../workers/query.worker";

export interface QueryClient {
  run: (request: Omit<QueryRequest, "id">) => Promise<QueryResponse>;
  dispose: () => void;
}

const WORKER_SOURCE = String.raw`
const MODALITIES = ["text", "image", "pdf", "video", "audio"];

function blendWeights(kind) {
  return kind === "1:1" ? { input: 1, output: 1 } : { input: 3, output: 1 };
}

function blendedPrice(cost, kind = "3:1") {
  if (cost.input === null || cost.output === null) return null;
  const w = blendWeights(kind);
  return (cost.input * w.input + cost.output * w.output) / (w.input + w.output);
}

function capabilityCount(o) {
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

function aggregate(dataset, blend) {
  const byModel = new Map();
  for (const offer of dataset.offers) {
    const bucket = byModel.get(offer.modelId);
    if (bucket) bucket.push(offer);
    else byModel.set(offer.modelId, [offer]);
  }
  const out = [];
  for (const [modelId, offers] of byModel) {
    const priced = offers.filter((o) => o.cost.input !== null || o.cost.output !== null);
    const ranked = [...priced].sort((a, b) => {
      const ab = blendedPrice(a.cost, blend);
      const bb = blendedPrice(b.cost, blend);
      const av = ab === null ? Infinity : ab;
      const bv = bb === null ? Infinity : bb;
      if (av !== bv) return av - bv;
      return a.providerId.localeCompare(b.providerId);
    });
    const best = ranked[0] ?? null;
    const inputs = offers.map((o) => o.cost.input).filter((v) => v !== null);
    const outputs = offers.map((o) => o.cost.output).filter((v) => v !== null);
    const contexts = offers.map((o) => o.limits.context).filter((v) => v !== null);
    const outputLimits = offers.map((o) => o.limits.output).filter((v) => v !== null);
    const modalities = new Set();
    for (const o of offers) for (const m of o.inputModalities) modalities.add(m);
    const statuses = [...new Set(offers.map((o) => o.status).filter((s) => s !== null))];
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
      inputModalities: [...modalities],
      releaseDate: bestDate(offers.map((o) => o.releaseDate), "max"),
      lastUpdated: bestDate(offers.map((o) => o.lastUpdated), "max"),
      statuses,
    });
  }
  return out;
}

function bestDate(values, mode) {
  const valid = values.filter((v) => v !== null).sort();
  if (!valid.length) return null;
  return mode === "min" ? valid[0] : valid[valid.length - 1];
}

function matchesSearch(offer, search) {
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

function matchesCommon(offer, filters) {
  if (filters.providerId && offer.providerId !== filters.providerId) return false;
  if (filters.family && offer.family !== filters.family) return false;
  if (filters.reasoning && !offer.reasoning) return false;
  if (filters.toolCall && !offer.toolCall) return false;
  if (filters.structuredOutput && !offer.structuredOutput) return false;
  if (filters.attachment && !offer.attachment) return false;
  if (filters.temperature && !offer.temperature) return false;
  if (filters.interleaved && !offer.interleaved) return false;
  if (filters.openWeights && !offer.openWeights) return false;
  if (filters.statuses.length) {
    const status = offer.status ?? "stable";
    if (!filters.statuses.includes(status)) return false;
  }
  if (filters.inputModalities.length) {
    for (const modality of filters.inputModalities) {
      if (!offer.inputModalities.includes(modality)) return false;
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
  if (filters.knowledgeAfter && (!offer.knowledge || offer.knowledge < filters.knowledgeAfter)) return false;
  if (filters.releasedAfter && (!offer.releaseDate || offer.releaseDate < filters.releasedAfter)) return false;
  if (filters.updatedAfter && (!offer.lastUpdated || offer.lastUpdated < filters.updatedAfter)) return false;
  return true;
}

function filterModels(aggregates, filters) {
  return aggregates.filter((agg) => {
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      const haystack = [
        agg.name,
        agg.modelId,
        agg.family ?? "",
        agg.best?.providerName ?? "",
        ...agg.offers.map((o) => o.providerName),
      ].join(" ").toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (!agg.offers.some((offer) => matchesCommon(offer, filters))) return false;
    if (filters.family && agg.family !== filters.family) return false;
    if (filters.providerId && !agg.offers.some((o) => o.providerId === filters.providerId)) return false;
    return true;
  });
}

function compareNullable(a, b, dir) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function compareNullableDate(a, b, dir) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

function sortModels(rows, key, dir) {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (key) {
      case "name": return dir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      case "input": return compareNullable(a.minInput, b.minInput, dir);
      case "output": return compareNullable(a.minOutput, b.minOutput, dir);
      case "blended": return compareNullable(a.bestBlended, b.bestBlended, dir);
      case "cacheRead": return compareNullable(a.cacheRead, b.cacheRead, dir);
      case "cacheWrite": return compareNullable(a.best?.cost.cache_write ?? null, b.best?.cost.cache_write ?? null, dir);
      case "context": return compareNullable(a.context, b.context, dir);
      case "outputLimit": return compareNullable(a.outputLimit, b.outputLimit, dir);
      case "releaseDate": return compareNullableDate(a.releaseDate, b.releaseDate, dir);
      case "lastUpdated": return compareNullableDate(a.lastUpdated, b.lastUpdated, dir);
      case "offerCount": return compareNullable(a.providerCount, b.providerCount, dir);
      case "capabilities": return compareNullable(a.capabilityCount, b.capabilityCount, dir);
      default: return 0;
    }
  });
  return copy;
}

function sortOffers(rows, key, dir) {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (key) {
      case "name": return dir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      case "input": return compareNullable(a.cost.input, b.cost.input, dir);
      case "output": return compareNullable(a.cost.output, b.cost.output, dir);
      case "blended": return compareNullable(blendedPrice(a.cost), blendedPrice(b.cost), dir);
      case "cacheRead": return compareNullable(a.cost.cache_read, b.cost.cache_read, dir);
      case "cacheWrite": return compareNullable(a.cost.cache_write, b.cost.cache_write, dir);
      case "context": return compareNullable(a.limits.context, b.limits.context, dir);
      case "outputLimit": return compareNullable(a.limits.output, b.limits.output, dir);
      case "releaseDate": return compareNullableDate(a.releaseDate, b.releaseDate, dir);
      case "lastUpdated": return compareNullableDate(a.lastUpdated, b.lastUpdated, dir);
      case "capabilities": return compareNullable(capabilityCount(a), capabilityCount(b), dir);
      default: return 0;
    }
  });
  return copy;
}

self.onmessage = (event) => {
  const started = performance.now();
  const request = event.data;
  if (!request.dataset) {
    self.postMessage({ id: request.id, models: [], offers: [], totalModels: 0, durationMs: 0 });
    return;
  }
  const aggregates = aggregate(request.dataset, request.blend);
  const models = request.view === "model"
    ? sortModels(filterModels(aggregates, request.filters), request.sortKey, request.sortDir)
    : [];
  const offers = request.view === "offer"
    ? sortOffers(
        request.dataset.offers.filter((offer) => matchesSearch(offer, request.filters.search) && matchesCommon(offer, request.filters)),
        request.sortKey,
        request.sortDir,
      )
    : [];
  self.postMessage({
    id: request.id,
    models,
    offers,
    totalModels: aggregates.length,
    durationMs: performance.now() - started,
  });
};
`;

export function createQueryClient(): QueryClient {
  const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
  const objectUrl = URL.createObjectURL(blob);
  const worker = new Worker(objectUrl);
  let nextId = 1;
  const pending = new Map<number, (response: QueryResponse) => void>();

  worker.onmessage = (event: MessageEvent<QueryResponse>) => {
    const resolve = pending.get(event.data.id);
    if (resolve) {
      pending.delete(event.data.id);
      resolve(event.data);
    }
  };

  return {
    run(request) {
      const id = nextId++;
      return new Promise<QueryResponse>((resolve) => {
        pending.set(id, resolve);
        worker.postMessage({ ...request, id });
      });
    },
    dispose() {
      worker.terminate();
      URL.revokeObjectURL(objectUrl);
      pending.clear();
    },
  };
}
