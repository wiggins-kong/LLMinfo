import type { QueryRequest, QueryResponse } from "../workers/query.worker";

export interface QueryClient {
  run: (request: Omit<QueryRequest, "id">) => Promise<QueryResponse>;
  dispose: () => void;
}

const WORKER_SOURCE = String.raw`
const LEVEL_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

function maxOf(values) {
  const present = values.filter((value) => value !== null);
  return present.length ? Math.max(...present) : null;
}

function minOf(values) {
  const present = values.filter((value) => value !== null);
  return present.length ? Math.min(...present) : null;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function summarizeReasoning(offers) {
  const options = [];
  const levels = [];
  let budgetMin = null;
  let budgetMax = null;
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
  const orderedLevels = uniqueStrings(levels).sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
  return {
    supported: offers.some((offer) => offer.reasoning),
    options,
    levels: orderedLevels,
    levelCount: orderedLevels.length,
    highestLevel: orderedLevels.length ? orderedLevels[orderedLevels.length - 1] : null,
    budgetMin,
    budgetMax,
  };
}

function aggregate(dataset) {
  const byModel = new Map();
  for (const offer of dataset.offers) {
    const bucket = byModel.get(offer.modelId);
    if (bucket) bucket.push(offer);
    else byModel.set(offer.modelId, [offer]);
  }
  const out = [];
  for (const [modelId, offers] of byModel) {
    const contexts = offers.map((offer) => offer.limits.context);
    const outputs = offers.map((offer) => offer.limits.output);
    const inputs = offers.map((offer) => offer.limits.input);
    const modalities = new Set();
    const outputModalities = new Set();
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
      inputModalities: [...modalities],
      outputModalities: [...outputModalities],
      releaseDate: bestDate(offers.map((offer) => offer.releaseDate), "max"),
      lastUpdated: bestDate(offers.map((offer) => offer.lastUpdated), "max"),
      statuses: uniqueStrings(offers.map((offer) => offer.status).filter((status) => status !== null)),
      knowledge: bestDate(offers.map((offer) => offer.knowledge), "max"),
      experimental: offers.some((offer) => offer.experimental),
    });
  }
  return out;
}

function bestDate(values, mode) {
  const valid = values.filter((value) => value !== null).sort();
  if (!valid.length) return null;
  return mode === "min" ? valid[0] : valid[valid.length - 1];
}

function matchesCommon(offer, filters) {
  if (filters.reasoning && !offer.reasoning) return false;
  if (filters.toolCall && !offer.toolCall) return false;
  if (filters.structuredOutput && !offer.structuredOutput) return false;
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

function filterModels(aggregates, filters) {
  return aggregates.filter((model) => {
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      const haystack = [
        model.name,
        model.modelId,
        model.family ?? "",
        model.description,
        ...model.offers.map((offer) => offer.providerName),
      ].join(" ").toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return model.offers.some((offer) => {
      if (filters.providerIds.length && !filters.providerIds.includes(offer.providerId)) return false;
      return matchesCommon(offer, filters);
    });
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
      case "context": return compareNullable(a.context, b.context, dir);
      case "outputLimit": return compareNullable(a.outputLimit, b.outputLimit, dir);
      case "reasoningLevels": return compareNullable(a.reasoningSummary.levelCount, b.reasoningSummary.levelCount, dir);
      case "releaseDate": return compareNullableDate(a.releaseDate, b.releaseDate, dir);
      case "lastUpdated": return compareNullableDate(a.lastUpdated, b.lastUpdated, dir);
      case "providerCount": return compareNullable(a.providerCount, b.providerCount, dir);
      default: return 0;
    }
  });
  return copy;
}

self.onmessage = (event) => {
  const started = performance.now();
  const request = event.data;
  if (!request.dataset) {
    self.postMessage({ id: request.id, models: [], totalModels: 0, durationMs: 0 });
    return;
  }
  const aggregates = aggregate(request.dataset);
  const models = sortModels(filterModels(aggregates, request.filters), request.sortKey, request.sortDir);
  self.postMessage({
    id: request.id,
    models,
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
