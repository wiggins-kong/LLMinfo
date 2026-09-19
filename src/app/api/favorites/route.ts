import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { getSessionUser } from "@/lib/session";
import { unauthorized, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const rows = sqlite
    .prepare(`SELECT model_id, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC`)
    .all(user.id) as { model_id: string; created_at: number }[];

  return NextResponse.json({
    favorites: rows.map((r) => ({
      modelId: r.model_id,
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

  const modelId = (body as { modelId?: unknown })?.modelId;
  if (typeof modelId !== "string" || modelId.length === 0 || modelId.length > 200) {
    return jsonError("modelId 无效", 400);
  }

  sqlite
    .prepare(
      `INSERT INTO favorites (user_id, model_id, created_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, model_id) DO NOTHING`,
    )
    .run(user.id, modelId, Date.now());

  return NextResponse.json({ ok: true, modelId });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const modelId = new URL(request.url).searchParams.get("modelId");
  if (!modelId) return jsonError("缺少 modelId", 400);

  sqlite.prepare(`DELETE FROM favorites WHERE user_id = ? AND model_id = ?`).run(user.id, modelId);
  return NextResponse.json({ ok: true, modelId });
}
