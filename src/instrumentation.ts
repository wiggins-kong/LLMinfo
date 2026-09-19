/**
 * Next.js calls this once per server process. It is the only place the
 * background sync scheduler is started, so dev-mode reloads stay idempotent.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootstrap } = await import("./lib/bootstrap");
  await bootstrap();
}
