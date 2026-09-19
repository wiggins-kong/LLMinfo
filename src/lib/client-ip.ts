import { env } from "./env";

/**
 * Resolve the client IP for rate limiting.
 *
 * SakuraFrp's frpc *appends* the real client IP to the end of X-Forwarded-For,
 * so the leading entries are attacker-controlled. With one trusted hop we must
 * read the LAST entry, never the first. Cloudflare-in-front deployments would
 * need depth 2 plus CF-Connecting-IP handling (documented in the README).
 */
export function clientIpFromHeaders(headers: Headers): string {
  const depth = env.trustProxyDepth;

  if (depth === 0) {
    return "direct";
  }

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const index = parts.length - depth;
      const candidate = parts[index >= 0 ? index : 0];
      if (candidate) {
        // Strip an optional port suffix and any bracketed IPv6 form.
        const withoutBrackets = candidate.replace(/^\[|\]$/g, "");
        const withoutPort = withoutBrackets.replace(/:\d+$/, "");
        return withoutPort || "unknown";
      }
    }
  }

  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}
