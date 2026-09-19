import { NextResponse } from "next/server";
import { readSyncStatus } from "@/lib/sync";
import { getSessionUser } from "@/lib/session";
import { unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return NextResponse.json(readSyncStatus());
}
