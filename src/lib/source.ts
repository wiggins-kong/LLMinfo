import type { SourceDataset } from "./source-schema";

export const SOURCE_URL = "https://models.dev/api.json";
export const LOGO_BASE = "https://models.dev/logos";

export interface FetchProgress {
  phase: "idle" | "fetching" | "parsing" | "ready" | "error";
  message: string;
  startedAt: number | null;
  finishedAt: number | null;
  bytes: number | null;
  error: string | null;
}

export interface SourceResult {
  data: SourceDataset;
  bytes: number;
  fetchedAt: string;
}

/**
 * models.dev is fetched directly from the page. When the file is opened over
 * file:// the browser hides response headers from script, so this deliberately
 * avoids ETag/304 handling and always performs a full request.
 */
export async function fetchSourceDataset(
  onProgress?: (progress: FetchProgress) => void,
): Promise<SourceResult> {
  const startedAt = Date.now();
  onProgress?.({
    phase: "fetching",
    message: "正在连接 models.dev…",
    startedAt,
    finishedAt: null,
    bytes: null,
    error: null,
  });

  let response: Response;
  try {
    response = await fetch(SOURCE_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      mode: "cors",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法连接 models.dev：${message}`);
  }

  if (!response.ok) {
    throw new Error(`models.dev 返回 HTTP ${response.status}`);
  }

  onProgress?.({
    phase: "parsing",
    message: "正在解析上游数据…",
    startedAt,
    finishedAt: null,
    bytes: null,
    error: null,
  });

  const text = await response.text();
  const bytes = new TextEncoder().encode(text).byteLength;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("models.dev 返回的不是合法 JSON");
  }

  onProgress?.({
    phase: "ready",
    message: `已获取 ${(bytes / 1024 / 1024).toFixed(1)} MB 上游数据`,
    startedAt,
    finishedAt: Date.now(),
    bytes,
    error: null,
  });

  return { data: parsed as SourceDataset, bytes, fetchedAt: new Date().toISOString() };
}

export function logoUrl(providerId: string): string {
  return `${LOGO_BASE}/${encodeURIComponent(providerId)}.svg`;
}
