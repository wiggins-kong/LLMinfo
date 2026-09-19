import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { syncNow } from "@/lib/sync";
import { invalidateDatasetCache } from "@/lib/dataset";
import { getSessionUser } from "@/lib/session";
import { unauthorized, jsonError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

const RULE = { windowSeconds: 5 * 60, max: 5 };

export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const ip = clientIpFromHeaders(await headers());
  const limit = checkRateLimit("refresh", `${user.id}:${ip}`, RULE);
  if (!limit.allowed) {
    return jsonError("刷新过于频繁，请稍后再试", 429, {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const result = await syncNow();
  if (result.status === "updated") {
    invalidateDatasetCache();
  }

  return NextResponse.json({ ...result, rateLimit: { remaining: limit.remaining } });
}
