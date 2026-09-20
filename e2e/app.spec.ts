import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const appUrl = pathToFileURL(path.resolve(root, "..", "llminfo.html")).href;

async function openApp(page: Page): Promise<void> {
  await page.goto(appUrl);
  await expect(page.locator(".statusbar")).toContainText("models.dev", { timeout: 90_000 });
  await expect(page.locator('[data-role="rows"]')).toBeVisible({ timeout: 90_000 });
}

test.describe("single-file app", () => {
  test("loads models.dev data and renders virtualised rows", async ({ page }) => {
    await openApp(page);
    await expect(page.locator(".statusbar")).toContainText("显示");
    const rows = page.locator(".row");
    expect(await rows.count()).toBeLessThan(200);
    expect(await page.locator('[data-role="vspacer"]').evaluate((el) => (el as HTMLElement).style.height)).not.toBe("");
  });

  test("searches and filters models", async ({ page }) => {
    await openApp(page);
    await page.locator("#model-search").fill("claude");
    await expect(page.locator(".row").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".row").first()).toContainText(/claude/i);
    const count = await page.locator(".row").count();
    expect(count).toBeGreaterThan(0);
    await page.locator('[data-action="reset-filters"]').click();
  });

  test("opens the detail drawer and adds to compare", async ({ page }) => {
    await openApp(page);
    await page.locator(".row").first().locator(".rowopen").click();
    await expect(page.locator(".drawer[data-open='true']")).toBeVisible();
    await expect(page.locator(".drawer h2")).not.toBeEmpty();
    await page.locator('[data-action="compare-toggle"]').last().click();
    await expect(page.locator(".navitem[data-tab='compare'] .badge")).toHaveText("1");
    await page.locator(".drawer .iconbtn[data-action='drawer-close']").click();
  });

  test("switches to offer view", async ({ page }) => {
    await openApp(page);
    await page.locator('[data-action="segment"][data-value="offer"]').click();
    await expect(page.locator(".offerrow").first()).toBeVisible({ timeout: 30_000 });
  });

  test("shows charts on desktop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "charts are desktop-only");
    await openApp(page);
    await page.locator('[data-action="tab"][data-tab="charts"]:visible').click();
    await expect(page.locator('[data-chart="scatter"] canvas').first()).toBeVisible({ timeout: 30_000 });
  });

  test("estimates cost", async ({ page }) => {
    await openApp(page);
    await page.locator('[data-action="tab"][data-tab="cost"]:visible').click();
    await expect(page.locator(".costrow").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".costrow").first()).toContainText("$");
  });

  test("persists favorites and clears local data", async ({ page }) => {
    await openApp(page);
    await page.locator(".row").first().locator(".favbtn").click();
    await page.reload();
    await expect(page.locator("[data-tab='favorites'] .badge")).toHaveText("1", { timeout: 90_000 });
    await page.locator('[data-action="settings"]:visible').first().click();
    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator('[data-action="data-clear"]').click();
    await expect(page.locator("[data-tab='favorites'] .badge")).toHaveCount(0);
  });

  test("keeps query state in the URL", async ({ page }) => {
    await openApp(page);
    await page.locator("#model-search").fill("gemini");
    await expect(page).toHaveURL(/q=gemini/, { timeout: 30_000 });
    await page.reload();
    await expect(page.locator("#model-search")).toHaveValue("gemini", { timeout: 90_000 });
  });

  test("plays a content transition when switching tabs", async ({ page }) => {
    await openApp(page);
    await page.locator('[data-action="tab"][data-tab="cost"]:visible').click();
    await expect(page.locator(".motion-content")).toHaveAttribute("data-motion-reason", "tab");
    const animation = await page
      .locator(".motion-content")
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toContain("motion-content-enter");
  });

  test("plays drawer exit before removing it", async ({ page }) => {
    await openApp(page);
    await page.locator(".row").first().locator(".rowopen").click();
    const drawer = page.locator(".drawer[data-open='true']");
    await expect(drawer).toBeVisible();
    await page.locator(".drawer .iconbtn[data-action='drawer-close']").click();
    await expect(drawer).toHaveAttribute("data-motion-state", "exit");
    await expect(page.locator(".drawer[data-open='false']")).toBeHidden();
  });

  test("settles rapid search input before replaying content motion", async ({ page }) => {
    await openApp(page);
    const search = page.locator("#model-search");
    await search.fill("c");
    await search.fill("cl");
    await search.fill("claude");
    await expect(page.locator(".motion-content")).toHaveAttribute("data-motion-reason", "query", {
      timeout: 30_000,
    });
    await expect(page.locator(".row").first()).toContainText(/claude/i);
  });

  test("removes a favorite with motion on the favorites page", async ({ page }) => {
    await openApp(page);
    const firstRow = page.locator(".row").first();
    const modelId = await firstRow.getAttribute("data-model");
    await firstRow.locator(".favbtn").click();
    await page.locator('[data-action="tab"][data-tab="favorites"]:visible').click();
    const favorite = page.locator(`.row[data-model="${modelId}"]`);
    await expect(favorite).toBeVisible();
    await favorite.locator(".favbtn").click();
    await expect(favorite).toHaveAttribute("data-motion-state", "remove");
    await expect(page.locator(`.row[data-model="${modelId}"]`)).toHaveCount(0);
  });

  test("keeps only fades when reduced motion is requested", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openApp(page);
    await page.locator('[data-action="tab"][data-tab="cost"]:visible').click();
    const style = await page.locator(".motion-content").evaluate((el) => {
      const computed = getComputedStyle(el);
      return { name: computed.animationName, duration: computed.animationDuration };
    });
    expect(style.name).toContain("motion-fade-in");
    expect(style.duration).toBe("0.08s");
  });
});
