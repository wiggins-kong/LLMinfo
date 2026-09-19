import type { ModelAggregate } from "./query-engine";
import type { OfferDTO } from "./types";
import { blendedPrice } from "./pricing";

/** RFC 4180: wrap in quotes when the value contains a delimiter, quote or newline. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function modelsToCsv(rows: ModelAggregate[]): string {
  const header = [
    "model",
    "family",
    "best_provider",
    "input_usd_per_million",
    "output_usd_per_million",
    "blended_usd_per_million",
    "cache_read_usd_per_million",
    "max_context_tokens",
    "max_output_tokens",
    "provider_count",
    "capabilities",
    "open_weights",
    "has_free",
    "release_date",
    "last_updated",
  ];
  const body = rows.map((r) => [
    r.name,
    r.family ?? "",
    r.best?.providerName ?? "",
    r.minInput ?? "",
    r.minOutput ?? "",
    r.best ? blendedPrice(r.best.cost) ?? "" : "",
    r.cacheRead ?? "",
    r.context ?? "",
    r.outputLimit ?? "",
    r.providerCount,
    r.capabilityCount,
    r.openWeights ? "yes" : "no",
    r.hasFree ? "yes" : "no",
    r.releaseDate ?? "",
    r.lastUpdated ?? "",
  ]);
  return toCsv([header, ...body]);
}

export function offersToCsv(rows: OfferDTO[]): string {
  const header = [
    "provider",
    "model",
    "family",
    "model_id",
    "input_usd_per_million",
    "output_usd_per_million",
    "blended_usd_per_million",
    "cache_read_usd_per_million",
    "cache_write_usd_per_million",
    "context_tokens",
    "output_limit_tokens",
    "input_modalities",
    "reasoning",
    "tool_call",
    "structured_output",
    "open_weights",
    "tiered_pricing",
    "status",
    "release_date",
    "last_updated",
  ];
  const body = rows.map((r) => [
    r.providerName,
    r.name,
    r.family ?? "",
    r.modelId,
    r.cost.input ?? "",
    r.cost.output ?? "",
    blendedPrice(r.cost) ?? "",
    r.cost.cache_read ?? "",
    r.cost.cache_write ?? "",
    r.limits.context ?? "",
    r.limits.output ?? "",
    r.inputModalities.join("|"),
    r.reasoning ? "yes" : "no",
    r.toolCall ? "yes" : "no",
    r.structuredOutput ? "yes" : "no",
    r.openWeights ? "yes" : "no",
    r.hasTieredPricing ? "yes" : "no",
    r.status ?? "stable",
    r.releaseDate ?? "",
    r.lastUpdated ?? "",
  ]);
  return toCsv([header, ...body]);
}

export function modelsToJson(rows: ModelAggregate[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      modelId: r.modelId,
      name: r.name,
      family: r.family,
      providerCount: r.providerCount,
      bestProvider: r.best?.providerName ?? null,
      priceUsdPerMillionTokens: {
        input: r.minInput,
        output: r.minOutput,
        blended: r.best ? blendedPrice(r.best.cost) : null,
        cacheRead: r.cacheRead,
      },
      contextTokens: r.context,
      outputLimitTokens: r.outputLimit,
      capabilities: {
        reasoning: r.reasoning,
        toolCall: r.toolCall,
        structuredOutput: r.structuredOutput,
        attachment: r.attachment,
        openWeights: r.openWeights,
      },
      inputModalities: r.inputModalities,
      releaseDate: r.releaseDate,
      lastUpdated: r.lastUpdated,
    })),
    null,
    2,
  );
}

export function offersToJson(rows: OfferDTO[]): string {
  return JSON.stringify(rows, null, 2);
}

/** Trigger a client-side download without a server round trip. */
export function downloadFile(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
