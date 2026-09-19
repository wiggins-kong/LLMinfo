import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { sqlite, db, schema } from "@/db";
import { env } from "./env";
import { parseSourceDataset } from "./source-schema";
import { transformDataset, type OfferRow } from "./transform";

const SOURCE_URL = "https://models.dev/api.json";
const LOGO_BASE = "https://models.dev/logos";
const LOCK_TTL_MS = 5 * 60 * 1000;

export interface SyncResult {
  status: "updated" | "not-modified" | "skipped" | "failed";
  contentHash?: string;
  error?: string;
  counts?: { providers: number; models: number; offers: number };
}

function now(): Date {
  return new Date();
}

interface SyncStateRow {
  etag: string | null;
  content_hash: string | null;
  last_synced_at: number | null;
  last_checked_at: number | null;
  last_error: string | null;
  locked_at: number | null;
  provider_count: number;
  model_count: number;
  offer_count: number;
}

function readState(): SyncStateRow | undefined {
  return sqlite
    .prepare(
      `SELECT etag, content_hash, last_synced_at, last_checked_at, last_error, locked_at,
              provider_count, model_count, offer_count
       FROM sync_state WHERE id = 1`,
    )
    .get() as SyncStateRow | undefined;
}

function ensureStateRow(): void {
  sqlite.prepare(`INSERT OR IGNORE INTO sync_state (id) VALUES (1)`).run();
}

/**
 * Acquire a coarse cross-process lock so two container replicas (or a restart
 * mid-sync) cannot write the snapshot concurrently. Stale locks expire.
 */
function acquireLock(): boolean {
  ensureStateRow();
  const cutoff = Date.now() - LOCK_TTL_MS;
  const result = sqlite
    .prepare(
      `UPDATE sync_state
         SET locked_at = ?
       WHERE id = 1
         AND (locked_at IS NULL OR locked_at < ?)`,
    )
    .run(Date.now(), cutoff);
  return result.changes === 1;
}

function releaseLock(): void {
  sqlite.prepare(`UPDATE sync_state SET locked_at = NULL WHERE id = 1`).run();
}

export async function syncNow(options: { force?: boolean } = {}): Promise<SyncResult> {
  if (!acquireLock()) {
    return { status: "skipped" };
  }

  try {
    const state = readState();
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": "LLMinfo/1.0 (+self-hosted)",
    };
    // Conditional request: a 304 costs no bandwidth and leaves data untouched.
    if (!options.force && state?.etag) {
      headers["if-none-match"] = state.etag;
    }

    let response: Response;
    try {
      response = await fetch(SOURCE_URL, { headers, cache: "no-store" });
    } catch (error) {
      return fail(error);
    }

    if (response.status === 304) {
      sqlite
        .prepare(`UPDATE sync_state SET last_checked_at = ?, last_error = NULL WHERE id = 1`)
        .run(Date.now());
      return { status: "not-modified", contentHash: state?.content_hash ?? undefined };
    }

    if (!response.ok) {
      return fail(new Error(`models.dev responded ${response.status}`));
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      return fail(error);
    }

    let transformed;
    try {
      transformed = transformDataset(parseSourceDataset(payload));
    } catch (error) {
      return fail(error);
    }

    // A successful fetch that yields an empty dataset means upstream is broken;
    // keeping the previous snapshot is safer than wiping the UI.
    if (transformed.offers.length === 0) {
      return fail(new Error("models.dev returned an empty dataset; keeping previous snapshot"));
    }

    writeSnapshot(transformed, response.headers.get("etag"));

    void downloadLogos(transformed.providers.map((p) => p.id)).catch(() => undefined);

    return {
      status: "updated",
      contentHash: transformed.contentHash,
      counts: {
        providers: transformed.providers.length,
        models: transformed.models.length,
        offers: transformed.offers.length,
      },
    };
  } finally {
    releaseLock();
  }
}

function fail(error: unknown): SyncResult {
  const message = error instanceof Error ? error.message : String(error);
  sqlite
    .prepare(`UPDATE sync_state SET last_checked_at = ?, last_error = ? WHERE id = 1`)
    .run(Date.now(), message.slice(0, 500));
  return { status: "failed", error: message };
}

/**
 * Replace the whole snapshot in one transaction. Readers either see the old
 * dataset or the new one, never a half-written table.
 */
function writeSnapshot(
  transformed: ReturnType<typeof transformDataset>,
  etag: string | null,
): void {
  const { providers, models, offers, contentHash } = transformed;

  const insertProvider = sqlite.prepare(
    `INSERT INTO providers (id, name, npm, api, doc, env, has_logo)
     VALUES (@id, @name, @npm, @api, @doc, @env, 0)`,
  );
  const insertModel = sqlite.prepare(
    `INSERT INTO models (model_id, name, family, offer_count, best_input_price, best_output_price,
                         best_provider_id, max_context, min_context, has_free, has_unpriced,
                         open_weights, reasoning)
     VALUES (@modelId, @name, @family, @offerCount, @bestInputPrice, @bestOutputPrice,
             @bestProviderId, @maxContext, @minContext, @hasFree, @hasUnpriced,
             @openWeights, @reasoning)`,
  );
  const insertOffer = sqlite.prepare(
    `INSERT INTO offers (provider_id, model_id, name, family, description, attachment, reasoning,
                         reasoning_options, tool_call, structured_output, temperature, interleaved,
                         open_weights, knowledge, release_date, last_updated, status, experimental,
                         input_modalities, output_modalities, context_limit, input_limit, output_limit,
                         cost_input, cost_output, cost_cache_read, cost_cache_write, cost_reasoning,
                         cost_input_audio, cost_output_audio, cost_tiers, cost_over_200k,
                         has_cost, is_free, has_tiered_pricing)
     VALUES (@providerId, @modelId, @name, @family, @description, @attachment, @reasoning,
             @reasoningOptions, @toolCall, @structuredOutput, @temperature, @interleaved,
             @openWeights, @knowledge, @releaseDate, @lastUpdated, @status, @experimental,
             @inputModalities, @outputModalities, @contextLimit, @inputLimit, @outputLimit,
             @costInput, @costOutput, @costCacheRead, @costCacheWrite, @costReasoning,
             @costInputAudio, @costOutputAudio, @costTiers, @costOver200k,
             @hasCost, @isFree, @hasTieredPricing)`,
  );

  const run = sqlite.transaction(() => {
    sqlite.prepare(`DELETE FROM providers`).run();
    sqlite.prepare(`DELETE FROM models`).run();
    sqlite.prepare(`DELETE FROM offers`).run();

    for (const p of providers) {
      insertProvider.run({
        id: p.id,
        name: p.name,
        npm: p.npm,
        api: p.api,
        doc: p.doc,
        env: JSON.stringify(p.env),
      });
    }

    for (const m of models) {
      insertModel.run({
        modelId: m.modelId,
        name: m.name,
        family: m.family,
        offerCount: m.offerCount,
        bestInputPrice: m.bestInputPrice,
        bestOutputPrice: m.bestOutputPrice,
        bestProviderId: m.bestProviderId,
        maxContext: m.maxContext,
        minContext: m.minContext,
        hasFree: m.hasFree ? 1 : 0,
        hasUnpriced: m.hasUnpriced ? 1 : 0,
        openWeights: m.openWeights ? 1 : 0,
        reasoning: m.reasoning ? 1 : 0,
      });
    }

    for (const o of offers) {
      insertOffer.run({
        providerId: o.providerId,
        modelId: o.modelId,
        name: o.name,
        family: o.family,
        description: o.description,
        attachment: o.attachment ? 1 : 0,
        reasoning: o.reasoning ? 1 : 0,
        reasoningOptions: JSON.stringify(o.reasoningOptions),
        toolCall: o.toolCall ? 1 : 0,
        structuredOutput: o.structuredOutput ? 1 : 0,
        temperature: o.temperature ? 1 : 0,
        interleaved: o.interleaved ? 1 : 0,
        openWeights: o.openWeights ? 1 : 0,
        knowledge: o.knowledge,
        releaseDate: o.releaseDate,
        lastUpdated: o.lastUpdated,
        status: o.status,
        experimental: o.experimental ? 1 : 0,
        inputModalities: JSON.stringify(o.inputModalities),
        outputModalities: JSON.stringify(o.outputModalities),
        contextLimit: o.limits.context,
        inputLimit: o.limits.input,
        outputLimit: o.limits.output,
        costInput: o.cost.input,
        costOutput: o.cost.output,
        costCacheRead: o.cost.cache_read,
        costCacheWrite: o.cost.cache_write,
        costReasoning: o.cost.reasoning,
        costInputAudio: o.cost.input_audio,
        costOutputAudio: o.cost.output_audio,
        costTiers: o.cost.tiers ? JSON.stringify(o.cost.tiers) : null,
        costOver200k: o.cost.context_over_200k ? JSON.stringify(o.cost.context_over_200k) : null,
        hasCost: o.hasCost ? 1 : 0,
        isFree: o.isFree ? 1 : 0,
        hasTieredPricing: o.hasTieredPricing ? 1 : 0,
      });
    }

    ensureStateRow();
    sqlite
      .prepare(
        `UPDATE sync_state
            SET etag = ?, content_hash = ?, last_synced_at = ?, last_checked_at = ?,
                last_error = NULL, provider_count = ?, model_count = ?, offer_count = ?
          WHERE id = 1`,
      )
      .run(
        etag,
        contentHash,
        Date.now(),
        Date.now(),
        providers.length,
        models.length,
        offers.length,
      );
  });

  run();
}

/**
 * Best-effort logo cache. Failures are non-fatal: the UI falls back to an
 * initial-letter tile, and we never block a sync on 200+ remote fetches.
 */
async function downloadLogos(providerIds: string[]): Promise<void> {
  const dir = path.join(path.resolve(env.dataDir), "logos");
  await fs.mkdir(dir, { recursive: true });

  const markLogo = sqlite.prepare(`UPDATE providers SET has_logo = 1 WHERE id = ?`);
  const concurrency = 8;

  for (let i = 0; i < providerIds.length; i += concurrency) {
    const batch = providerIds.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (id) => {
        const target = path.join(dir, `${id}.svg`);
        try {
          await fs.access(target);
          markLogo.run(id);
          return;
        } catch {
          // not cached yet
        }
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(`${LOGO_BASE}/${encodeURIComponent(id)}.svg`, {
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!response.ok) return;
          const body = await response.text();
          if (!body.includes("<svg")) return;
          await fs.writeFile(target, body, "utf8");
          markLogo.run(id);
        } catch {
          // ignore individual logo failures
        }
      }),
    );
  }
}

export function readSyncStatus() {
  ensureStateRow();
  const state = readState();
  return {
    lastSyncedAt: state?.last_synced_at ? new Date(state.last_synced_at).toISOString() : null,
    lastCheckedAt: state?.last_checked_at ? new Date(state.last_checked_at).toISOString() : null,
    lastError: state?.last_error ?? null,
    etag: state?.etag ?? null,
    contentHash: state?.content_hash ?? null,
    counts: {
      providers: state?.provider_count ?? 0,
      models: state?.model_count ?? 0,
      offers: state?.offer_count ?? 0,
    },
    intervalMinutes: env.syncIntervalMinutes,
  };
}

/**
 * Start the background scheduler. Idempotent per process via a global flag so
 * Next.js dev-mode reloads and multiple instrumentation calls are harmless.
 */
export function startSyncScheduler(): void {
  const globalRef = globalThis as typeof globalThis & { __llminfoSyncStarted?: boolean };
  if (globalRef.__llminfoSyncStarted) return;
  globalRef.__llminfoSyncStarted = true;

  void syncNow().catch(() => undefined);

  const intervalMs = env.syncIntervalMinutes * 60 * 1000;
  const timer = setInterval(() => {
    void syncNow().catch(() => undefined);
  }, intervalMs);
  // Never hold the event loop open because of the scheduler.
  timer.unref?.();
}

export { db, schema };
