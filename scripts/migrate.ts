/**
 * Applies the schema to DATA_DIR without starting Next.js.
 * Useful for pre-warming a volume or debugging a deployment.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SCHEMA_DDL } from "../src/db/schema-ddl";

const dataDir = process.env.DATA_DIR ?? "./data";
const resolved = path.resolve(dataDir);
fs.mkdirSync(path.join(resolved, "logos"), { recursive: true });

const db = new Database(path.join(resolved, "llminfo.db"));
db.pragma("busy_timeout = 8000");
db.exec(SCHEMA_DDL);

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as { name: string }[];

console.log(`Schema applied to ${resolved}`);
console.log(`Tables: ${tables.map((t) => t.name).join(", ")}`);
db.close();
