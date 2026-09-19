import { z } from "zod";

/**
 * Permissive mirror of https://models.dev/api.json.
 *
 * Two deliberate choices keep a sync from failing on upstream drift:
 *  1. Unknown keys are stripped, not rejected, so new fields are harmless.
 *  2. Flag-like fields tolerate unexpected shapes. Upstream really does emit
 *     `interleaved` as a boolean in ~87 models and as `{field: "..."}` in
 *     ~1,010 models, and one malformed field must never abort a 7,860-row sync.
 */

/** Accepts boolean-ish values; any object/array collapses to the fallback. */
function looseFlag(fallback = false) {
  return z
    .unknown()
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") return value;
      if (value === undefined || value === null) return fallback;
      // Objects such as { field: "reasoning_content" } mean "supported".
      if (typeof value === "object") return true;
      return fallback;
    });
}

/** Accepts a string, or drops anything else to null. */
function looseString() {
  return z
    .unknown()
    .optional()
    .transform((value) => (typeof value === "string" && value.trim() !== "" ? value : null));
}

function looseNumber() {
  return z
    .unknown()
    .optional()
    .transform((value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined,
    );
}

const costTierSchema = z.object({
  input: z.number(),
  output: z.number(),
  cache_read: z.number().optional(),
  cache_write: z.number().optional(),
  tier: z.object({ type: z.string(), size: z.number() }),
});

/**
 * Upstream emits nulls inside `reasoning_options[].values` (2 occurrences at
 * the time of writing). Filtering them out is safer than rejecting the payload.
 */
const reasoningOptionSchema = z.object({
  type: z.string(),
  values: z
    .array(z.unknown())
    .optional()
    .transform((v) => (v ?? []).filter((x): x is string => typeof x === "string")),
  min: z.number().optional(),
  max: z.number().optional(),
});

const costSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
  cache_read: z.number().optional(),
  cache_write: z.number().optional(),
  reasoning: z.number().optional(),
  input_audio: z.number().optional(),
  output_audio: z.number().optional(),
  tiers: z.array(costTierSchema).optional(),
  context_over_200k: z
    .object({
      input: z.number().optional(),
      output: z.number().optional(),
      cache_read: z.number().optional(),
      cache_write: z.number().optional(),
    })
    .optional(),
});

const modalitiesSchema = z
  .object({
    input: z.array(z.string()).optional(),
    output: z.array(z.string()).optional(),
  })
  .optional();

const limitsSchema = z
  .object({
    context: looseNumber(),
    input: looseNumber(),
    output: looseNumber(),
  })
  .optional();

export const sourceModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: looseString(),
  family: looseString(),
  attachment: looseFlag(),
  reasoning: looseFlag(),
  reasoning_options: z
    .array(reasoningOptionSchema)
    .optional()
    .transform((v) => v ?? []),
  tool_call: looseFlag(),
  structured_output: looseFlag(),
  temperature: looseFlag(),
  interleaved: looseFlag(),
  knowledge: looseString(),
  release_date: looseString(),
  last_updated: looseString(),
  modalities: modalitiesSchema,
  open_weights: looseFlag(),
  limit: limitsSchema,
  cost: costSchema.optional(),
  status: looseString(),
  experimental: z.unknown().optional(),
  provider: z.unknown().optional(),
});

export const sourceProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  env: z
    .array(z.string())
    .optional()
    .transform((v) => v ?? []),
  npm: z.string().optional().default(""),
  api: looseString(),
  doc: z.string().optional().default(""),
  models: z.record(z.string(), sourceModelSchema),
});

export const sourceDatasetSchema = z.record(z.string(), sourceProviderSchema);

export type SourceProvider = z.infer<typeof sourceProviderSchema>;
export type SourceModel = z.infer<typeof sourceModelSchema>;
export type SourceDataset = z.infer<typeof sourceDatasetSchema>;

export function parseSourceDataset(input: unknown): SourceDataset {
  const result = sourceDatasetSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") ?? "?";
    throw new Error(`models.dev payload failed validation at ${path}: ${issue?.message ?? ""}`);
  }
  return result.data;
}
