import { test as setup, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers";

/**
 * Sign in once and persist the session.
 *
 * The app rate-limits sign-in to 8 attempts per minute per IP (a deliberate
 * production behaviour), so every test logging in independently would trip it.
 */
setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(ADMIN_EMAIL);
  await page.getByLabel("密码").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 90_000 });
  await expect(page.locator(".tbl-row").first()).toBeAttached({ timeout: 90_000 });
  await page.context().storageState({ path: "e2e/.auth/state.json" });
});
