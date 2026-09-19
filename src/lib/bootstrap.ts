import "server-only";
import { env } from "./env";
import { sqlite } from "@/db";
import { syncNow, startSyncScheduler } from "./sync";
import { pruneRateLimits } from "./rate-limit";
import { createUser, userCount } from "./user-admin";

declare global {
  // eslint-disable-next-line no-var
  var __llminfoBootstrapped: boolean | undefined;
}

/**
 * Seed the single admin account on first boot.
 *
 * Runs exactly once: if any user exists, env credentials are ignored so that
 * changing ADMIN_PASSWORD later cannot silently reset a live password.
 *
 * Note this writes rows directly rather than calling better-auth's sign-up
 * endpoint, which is deliberately disabled.
 */
export async function ensureAdminUser(): Promise<{ created: boolean; reason?: string }> {
  if (userCount(sqlite) > 0) {
    return { created: false, reason: "already-initialised" };
  }

  if (!env.adminEmail || !env.adminPassword) {
    return { created: false, reason: "missing-env" };
  }

  const result = await createUser(sqlite, {
    email: env.adminEmail,
    password: env.adminPassword,
    name: env.adminEmail.split("@")[0],
  });

  return result.ok ? { created: true } : { created: false, reason: result.reason };
}

/** Idempotent start-up sequence shared by instrumentation and health checks. */
export async function bootstrap(): Promise<void> {
  if (globalThis.__llminfoBootstrapped) return;
  globalThis.__llminfoBootstrapped = true;

  await ensureAdminUser();
  pruneRateLimits();

  const row = sqlite.prepare(`SELECT content_hash FROM sync_state WHERE id = 1`).get() as
    | { content_hash: string | null }
    | undefined;

  // Only block on a network sync when we have no snapshot at all; otherwise the
  // scheduler refreshes in the background and the UI serves cached data.
  if (!row?.content_hash) {
    await syncNow().catch(() => undefined);
  }
  startSyncScheduler();
}

export function countUsers(): number {
  return userCount(sqlite);
}
