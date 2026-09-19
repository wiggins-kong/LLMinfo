import type { Page } from "@playwright/test";

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@local.test";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "local-dev-password";

/** Below this width the app switches to its mobile information architecture. */
export const MOBILE_BREAKPOINT = 1024;

export function isNarrow(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < MOBILE_BREAKPOINT;
}

/**
 * Open the dashboard using the session captured by auth.setup.ts.
 *
 * Tests must not sign in individually: the app rate-limits sign-in to 8
 * attempts per minute, which is exactly what a per-test login would trigger.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  if (page.url().includes("/login")) {
    // The stored session expired; fall back to a real login once.
    await page.getByLabel("邮箱").fill(ADMIN_EMAIL);
    await page.getByLabel("密码").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "登录" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 90_000 });
  }
  // Wait for attachment, not visibility: on phones the desktop table exists in
  // the DOM but is intentionally hidden in favour of the card list.
  await page.waitForSelector(".tbl-row", { state: "attached", timeout: 90_000 });
}

/**
 * Navigate between top-level views.
 *
 * The app has two navigations: the desktop side rail (>=1024px) and the mobile
 * bottom tab bar. Only one is visible at a time, so tests pick the right one.
 */
export async function openTab(page: Page, desktopName: string, mobileName?: string): Promise<void> {
  const narrow = isNarrow(page);
  const name = narrow ? (mobileName ?? desktopName) : desktopName;
  const scope = narrow ? ".shell-tabbar" : ".shell-nav";
  await page.locator(scope).getByRole("button", { name }).first().click();
}

export async function gotoModels(page: Page): Promise<void> {
  await openTab(page, "模型库");
  await page.waitForSelector(".tbl-row", { state: "attached", timeout: 30_000 });
}

/** The row representation actually rendered at this viewport. */
export function rowSelector(page: Page): string {
  return isNarrow(page) ? ".tbl-mobile" : ".tbl-row.tbl-desktop";
}

/** Open the detail drawer for the first visible row. */
export async function openFirstDetail(page: Page): Promise<void> {
  await page.locator(rowSelector(page)).first().click();
  await page.waitForSelector('aside[aria-label="模型详情"][data-open="true"]', { timeout: 30_000 });
}
