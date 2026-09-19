import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";

export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  npm: text("npm").notNull(),
  api: text("api"),
  doc: text("doc").notNull(),
  env: text("env").notNull(), // JSON array
  hasLogo: integer("has_logo", { mode: "boolean" }).notNull().default(false),
});

export const models = sqliteTable(
  "models",
  {
    modelId: text("model_id").primaryKey(),
    name: text("name").notNull(),
    family: text("family"),
    offerCount: integer("offer_count").notNull().default(0),
    bestInputPrice: real("best_input_price"),
    bestOutputPrice: real("best_output_price"),
    bestProviderId: text("best_provider_id"),
    maxContext: integer("max_context"),
    minContext: integer("min_context"),
    hasFree: integer("has_free", { mode: "boolean" }).notNull().default(false),
    hasUnpriced: integer("has_unpriced", { mode: "boolean" }).notNull().default(false),
    openWeights: integer("open_weights", { mode: "boolean" }).notNull().default(false),
    reasoning: integer("reasoning", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("models_family_idx").on(t.family)],
);

export const offers = sqliteTable(
  "offers",
  {
    providerId: text("provider_id").notNull(),
    modelId: text("model_id").notNull(),
    name: text("name").notNull(),
    family: text("family"),
    description: text("description").notNull().default(""),
    attachment: integer("attachment", { mode: "boolean" }).notNull().default(false),
    reasoning: integer("reasoning", { mode: "boolean" }).notNull().default(false),
    reasoningOptions: text("reasoning_options").notNull().default("[]"),
    toolCall: integer("tool_call", { mode: "boolean" }).notNull().default(false),
    structuredOutput: integer("structured_output", { mode: "boolean" }).notNull().default(false),
    temperature: integer("temperature", { mode: "boolean" }).notNull().default(false),
    interleaved: integer("interleaved", { mode: "boolean" }).notNull().default(false),
    openWeights: integer("open_weights", { mode: "boolean" }).notNull().default(false),
    knowledge: text("knowledge"),
    releaseDate: text("release_date"),
    lastUpdated: text("last_updated"),
    status: text("status"),
    experimental: integer("experimental", { mode: "boolean" }).notNull().default(false),
    inputModalities: text("input_modalities").notNull().default("[]"),
    outputModalities: text("output_modalities").notNull().default("[]"),
    contextLimit: integer("context_limit"),
    inputLimit: integer("input_limit"),
    outputLimit: integer("output_limit"),
    costInput: real("cost_input"),
    costOutput: real("cost_output"),
    costCacheRead: real("cost_cache_read"),
    costCacheWrite: real("cost_cache_write"),
    costReasoning: real("cost_reasoning"),
    costInputAudio: real("cost_input_audio"),
    costOutputAudio: real("cost_output_audio"),
    costTiers: text("cost_tiers"),
    costOver200k: text("cost_over_200k"),
    hasCost: integer("has_cost", { mode: "boolean" }).notNull().default(false),
    isFree: integer("is_free", { mode: "boolean" }).notNull().default(false),
    hasTieredPricing: integer("has_tiered_pricing", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.providerId, t.modelId] }),
    index("offers_model_idx").on(t.modelId),
    index("offers_provider_idx").on(t.providerId),
  ],
);

export const syncState = sqliteTable("sync_state", {
  id: integer("id").primaryKey().default(1),
  etag: text("etag"),
  contentHash: text("content_hash"),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
  lastError: text("last_error"),
  providerCount: integer("provider_count").notNull().default(0),
  modelCount: integer("model_count").notNull().default(0),
  offerCount: integer("offer_count").notNull().default(0),
  lockedAt: integer("locked_at", { mode: "timestamp" }),
});

export const favorites = sqliteTable(
  "favorites",
  {
    userId: text("user_id").notNull(),
    modelId: text("model_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.modelId] })],
);

export const savedViews = sqliteTable(
  "saved_views",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    query: text("query").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("saved_views_user_idx").on(t.userId)],
);

/** Fixed-window rate limit buckets keyed by scope + identifier. */
export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  },
);
