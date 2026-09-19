import "server-only";
import { sqlite } from "@/db";

export interface RateLimitRule {
  /** Window length in seconds. */
  windowSeconds: number;
  /** Maximum allowed hits inside the window. */
  max: number;
}

export interface RateLimitOutcome {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter backed by SQLite. Used for the non-auth endpoints
 * (refresh, export) where better-auth's own limiter does not apply.
 */
export function checkRateLimit(scope: string, identity: string, rule: RateLimitRule): RateLimitOutcome {
  const key = `${scope}:${identity}`;
  const now = Date.now();
  const expiresAt = now + rule.windowSeconds * 1000;

  const run = sqlite.transaction(() => {
    const existing = sqlite
      .prepare(`SELECT count, expires_at FROM rate_limits WHERE key = ?`)
      .get(key) as { count: number; expires_at: number } | undefined;

    if (!existing || existing.expires_at <= now) {
      sqlite
        .prepare(
          `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET count = 1, expires_at = excluded.expires_at`,
        )
        .run(key, expiresAt);
      return { count: 1, expiresAt };
    }

    const next = existing.count + 1;
    sqlite.prepare(`UPDATE rate_limits SET count = ? WHERE key = ?`).run(next, key);
    return { count: next, expiresAt: existing.expires_at };
  });

  const { count, expiresAt: windowEnd } = run();
  const remaining = Math.max(0, rule.max - count);
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - now) / 1000));

  return { allowed: count <= rule.max, remaining, retryAfterSeconds };
}

/** Drop expired buckets; cheap enough to call on each sync tick. */
export function pruneRateLimits(): void {
  sqlite.prepare(`DELETE FROM rate_limits WHERE expires_at <= ?`).run(Date.now());
}
