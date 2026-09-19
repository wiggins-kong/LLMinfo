import { NextResponse } from "next/server";
import { buildDataset } from "@/lib/dataset";
import { getSessionUser } from "@/lib/session";
import { unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const dataset = buildDataset();
  const etag = `"${dataset.version}"`;

  // The browser revalidates against this ETag, so a repeated poll after a
  // no-op sync costs a 304 instead of another few hundred KB.
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  }

  return NextResponse.json(dataset, {
    headers: {
      ETag: etag,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
