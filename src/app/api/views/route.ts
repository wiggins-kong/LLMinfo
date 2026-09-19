import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { getSessionUser } from "@/lib/session";
import { unauthorized, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

const MAX_VIEWS = 50;
const MAX_QUERY_LENGTH = 2000;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const rows = sqlite
    .prepare(`SELECT id, name, query, created_at FROM saved_views WHERE user_id = ? ORDER BY created_at DESC`)
    .all(user.id) as { id: number; name: string; query: string; created_at: number }[];

  return NextResponse.json({
    views: rows.map((r) => ({
      id: r.id,
      name: r.name,
      query: r.query,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("请求体不是合法 JSON", 400);
  }

  const { name, query } = (body ?? {}) as { name?: unknown; query?: unknown };
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 80) {
    return jsonError("视图名称无效", 400);
  }
  if (typeof query !== "string" || query.length > MAX_QUERY_LENGTH) {
    return jsonError("查询字符串无效", 400);
  }

  const count = sqlite
    .prepare(`SELECT COUNT(*) AS n FROM saved_views WHERE user_id = ?`)
    .get(user.id) as { n: number };
  if (count.n >= MAX_VIEWS) {
    return jsonError(`最多保存 ${MAX_VIEWS} 个视图`, 409);
  }

  const result = sqlite
    .prepare(`INSERT INTO saved_views (user_id, name, query, created_at) VALUES (?, ?, ?, ?)`)
    .run(user.id, name.trim(), query, Date.now());

  return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const raw = new URL(request.url).searchParams.get("id");
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError("id 无效", 400);
  }

  sqlite.prepare(`DELETE FROM saved_views WHERE user_id = ? AND id = ?`).run(user.id, id);
  return NextResponse.json({ ok: true });
}
