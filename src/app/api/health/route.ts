import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { bootstrap } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness in one probe: the container is healthy when the schema
 * is reachable and the bootstrap sequence has run.
 */
export async function GET() {
  try {
    sqlite.prepare("SELECT 1").get();
    await bootstrap();
    return NextResponse.json({ status: "ok", time: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", error: message }, { status: 503 });
  }
}
