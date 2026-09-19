import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getSessionUser } from "@/lib/session";
import { unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Serve cached provider logos from the data volume so the page never has to
 * reach models.dev (and the CSP can stay at img-src 'self').
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  // Provider ids come from upstream, so constrain them before touching disk.
  if (!/^[a-z0-9._-]{1,80}$/i.test(id)) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const file = path.join(path.resolve(env.dataDir), "logos", `${id}.svg`);
    const body = await fs.readFile(file, "utf8");
    return new NextResponse(body, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, max-age=86400, immutable",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
