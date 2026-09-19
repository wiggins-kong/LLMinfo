import "server-only";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get appUrl() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  /**
   * Directory holding the SQLite file and cached logos.
   *
   * Resolved against the process working directory. In the container this is
   * always an absolute path (/data) because compose sets DATA_DIR=/data, which
   * keeps the volume mount point and the app in agreement.
   */
  get dataDir() {
    return process.env.DATA_DIR ?? "./data";
  },
  get authSecret() {
    return required("AUTH_SECRET", "dev-only-insecure-secret-change-me-please-32");
  },
  get adminEmail() {
    return process.env.ADMIN_EMAIL ?? "";
  },
  get adminPassword() {
    return process.env.ADMIN_PASSWORD ?? "";
  },
  get syncIntervalMinutes() {
    const raw = Number(process.env.SYNC_INTERVAL_MINUTES ?? "60");
    return Number.isFinite(raw) && raw > 0 ? raw : 60;
  },
  /** Number of trusted proxy hops in front of the app. SakuraFrp appends the client IP last. */
  get trustProxyDepth() {
    const raw = Number(process.env.TRUST_PROXY_DEPTH ?? "1");
    return Number.isFinite(raw) && raw >= 0 ? raw : 1;
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
};
