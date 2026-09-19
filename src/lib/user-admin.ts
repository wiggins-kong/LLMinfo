import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";

/**
 * Argon2id parameters. Kept in one place so the bootstrap path, the CLI and
 * the auth provider cannot drift apart — a mismatch would make existing
 * passwords unverifiable.
 */
export const ARGON2_OPTIONS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  algorithm: 2, // Argon2id
} as const;

export const MIN_PASSWORD_LENGTH = 12;

export interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
}

export interface CreateUserResult {
  ok: boolean;
  userId?: string;
  reason?: string;
}

/**
 * Structural subset of better-sqlite3's Database.
 *
 * Declared with permissive argument types so both the app's Database instance
 * and a plain CLI connection satisfy it, without importing server-only code.
 */
export interface SqliteStatementLike {
  get(...args: unknown[]): unknown;
  run(...args: unknown[]): unknown;
}

export interface SqliteLike {
  prepare(sql: string): SqliteStatementLike;
  transaction<T>(fn: () => T): () => T;
}

export function userCount(db: SqliteLike): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM "user"`).get() as { n: number } | undefined;
  return row?.n ?? 0;
}

/**
 * Insert a credential user directly.
 *
 * better-auth's sign-up endpoint is disabled on purpose (public registration
 * must stay closed), so account creation writes the two rows the adapter
 * expects instead of going through that endpoint.
 */
export async function createUser(
  db: SqliteLike,
  input: CreateUserInput,
): Promise<CreateUserResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, reason: "invalid-email" };
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: "password-too-short" };
  }

  const existing = db.prepare(`SELECT id FROM "user" WHERE email = ?`).get(email);
  if (existing) {
    return { ok: false, reason: "already-exists" };
  }

  const userId = randomUUID();
  const now = Date.now();
  const passwordHash = await hash(input.password, ARGON2_OPTIONS);
  const name = input.name?.trim() || email.split("@")[0] || "user";

  db.transaction(() => {
    db.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, twoFactorEnabled)
       VALUES (?, ?, ?, 1, ?, ?, 0)`,
    ).run(userId, name, email, now, now);

    db.prepare(
      `INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
       VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
    ).run(randomUUID(), userId, userId, passwordHash, now, now);
  })();

  return { ok: true, userId };
}
