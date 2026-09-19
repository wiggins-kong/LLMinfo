/**
 * Adds a user to an existing deployment.
 *
 * Run inside the container:
 *   docker exec -it llminfo npm run create-user -- user@example.com 'a-strong-password' 'Name'
 *
 * Public sign-up stays disabled; this is the only supported way to add accounts.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SCHEMA_DDL } from "../src/db/schema-ddl.ts";
import { createUser } from "../src/lib/user-admin.ts";

const [email, password, name] = process.argv.slice(2);

if (!email || !password) {
  console.error("用法: npm run create-user -- <email> <password> [name]");
  process.exit(1);
}

const dataDir = path.resolve(process.env.DATA_DIR ?? "./data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "llminfo.db"));
db.pragma("busy_timeout = 8000");
db.exec(SCHEMA_DDL);

const result = await createUser(db, { email, password, name });

if (!result.ok) {
  const messages: Record<string, string> = {
    "invalid-email": "邮箱格式无效",
    "password-too-short": "密码至少需要 12 个字符",
    "already-exists": `用户已存在: ${email.toLowerCase()}`,
  };
  console.error(messages[result.reason ?? ""] ?? `创建失败: ${result.reason}`);
  process.exit(1);
}

console.log(`已创建用户: ${email.toLowerCase()}`);
db.close();
