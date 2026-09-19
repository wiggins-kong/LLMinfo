import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { env } from "@/lib/env";
import * as schema from "./schema";
import { applySchema } from "./schema-ddl";

declare global {
  // eslint-disable-next-line no-var
  var __llminfoSqlite: Database.Database | undefined;
}

function resolveDbPath(): string {
  const dir = path.resolve(env.dataDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "logos"), { recursive: true });
  return path.join(dir, "llminfo.db");
}

/**
 * Idempotent DDL for both our tables and better-auth's tables.
 *
 * better-auth can generate migrations, but running its CLI inside a container
 * adds a build step; declaring the schema here keeps the image a single
 * artefact that boots straight onto an empty volume.
 */
function migrate(db: Database.Database): void {
  applySchema(db);
}
function createConnection(): Database.Database {
  const db = new Database(resolveDbPath());
  // WAL is an optimisation, not a requirement: during `next build` several
  // workers may race on the same file, and a busy timeout is enough there.
  try {
    db.pragma("journal_mode = WAL");
  } catch {
    // fall back to the default journal mode
  }
  db.pragma("busy_timeout = 8000");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/**
 * Lazy singleton.
 *
 * The connection must NOT be created at module scope: Next.js evaluates route
 * modules during `next build`, which would otherwise create (and contend for)
 * the database file before the container ever runs.
 */
export function getSqlite(): Database.Database {
  if (!globalThis.__llminfoSqlite) {
    globalThis.__llminfoSqlite = createConnection();
  }
  return globalThis.__llminfoSqlite;
}

/**
 * Proxy so call sites can keep using `sqlite.prepare(...)` while the underlying
 * connection is still created on first use.
 *
 * The `has` trap matters: better-auth's Kysely adapter sniffs the driver with
 * `"aggregate" in database`, and `in` consults the proxy target unless it is
 * trapped. Without it the adapter sees an empty object and refuses to start.
 */
export const sqlite = new Proxy({} as Database.Database, {
  get(_target, property, receiver) {
    const instance = getSqlite();
    const value = Reflect.get(instance as object, property, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has(_target, property) {
    return Reflect.has(getSqlite() as object, property);
  },
  ownKeys() {
    return Reflect.ownKeys(getSqlite() as object);
  },
  getOwnPropertyDescriptor(_target, property) {
    return Reflect.getOwnPropertyDescriptor(getSqlite() as object, property);
  },
});

export function getDb(): BetterSQLite3Database<typeof schema> {
  return drizzle(getSqlite(), { schema });
}

export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, property, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance as object, property, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { schema };
