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

test.describe("single-page model library", () => {
  test("renders the two-pane library with one row per model", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "desktop split only");
    await openApp(page);
    await expect(page.locator(".model-pane")).toBeVisible();
    await expect(page.locator(".detail-pane")).toBeVisible();
    await expect(page.locator(".model-row").first()).toBeVisible();
    await expect(page.locator(".detail-title h1")).not.toBeEmpty();
    expect(await page.locator(".model-row").count()).toBeLessThan(200);
  });

  test("keeps virtual rows still while scrolling", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "desktop virtual list");
    await openApp(page);
    const rows = page.locator('[data-role="rows"][data-virtual="model"]');
    await expect(rows).toBeVisible();
    await rows.evaluate(async (element) => {
      for (let index = 0; index < 20; index += 1) {
        element.scrollTop += 160;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
    });
    const animated = await page.locator(".model-row").evaluateAll((items) =>
      items.filter((item) => {
        const name = getComputedStyle(item).animationName;
        return name !== "" && name !== "none";
      }).length,
    );
    expect(animated).toBe(0);
  });

  test("does not recycle virtual rows without scrolling", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "desktop virtual list");
    await openApp(page);
    const row = page.locator(".model-row").first();
    await expect(row).toBeVisible();
    const stable = await row.evaluate(async (element) => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      return element.isConnected;
    });
    expect(stable).toBe(true);
  });

  test("selects a model and keeps the list scroll offset", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "desktop selection");
    await openApp(page);
    const rows = page.locator('[data-role="rows"][data-virtual="model"]');
    await rows.evaluate(async (element) => {
      element.scrollTop = Math.min(400, element.scrollHeight - element.clientHeight);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const before = await rows.evaluate((element) => element.scrollTop);
    expect(before).toBeGreaterThan(0);
    await page.locator(".model-row").nth(9).click();
    await expect(page.locator(".model-row.active")).toHaveCount(1);
    await expect
      .poll(() => rows.evaluate((element) => element.scrollTop))
      .toBe(before);
  });

  test("searches models and keeps the selected model when possible", async ({ page }) => {
    await openApp(page);
    const search = page.locator("#model-search");
    await search.fill("claude");
    await expect(page.locator(".model-row").first()).toContainText(/claude/i, { timeout: 30_000 });
    const selected = await page.locator(".model-row.active").getAttribute("data-model");
    await search.fill("claude");
    await expect(page.locator(`.model-row.active[data-model="${selected}"]`)).toBeVisible();
    await page.locator('[data-action="reset-filters"]').click();
  });

  test("uses a styled provider multi-select instead of a native select", async ({ page }) => {
    await openApp(page);
    await expect(page.locator("select")).toHaveCount(0);
    const trigger = page.locator('[data-action="menu"][data-menu="providers"]');
    await trigger.click();
    const menu = page.locator(".filter-menu");
    await expect(menu).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    expect(Math.abs(menuBox!.x - triggerBox!.x)).toBeLessThan(24);
    expect(menuBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height);
    expect(menuBox!.y).toBeLessThan(triggerBox!.y + triggerBox!.height + 20);

    const options = menu.locator(".menu-option");
    const initialCount = await options.count();
    expect(initialCount).toBeGreaterThan(1);
    const needle = (await options.nth(1).innerText()).trim().slice(0, 4);
    await menu.locator('[data-input="menu-search"]').fill(needle);
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText(needle);

    await options.first().click();
    await expect(menu.locator(".menu-option.active")).toHaveCount(1);
    await menu.locator(".menu-close").click();
    await expect(page.locator(".model-row").first()).toBeVisible({ timeout: 30_000 });
  });

  test("filters by capabilities and modalities through popovers", async ({ page }) => {
    await openApp(page);
    await page.locator('[data-action="menu"][data-menu="capabilities"]').click();
    await page.locator('.filter-menu .menu-option[data-value="reasoning"]').click();
    await page.locator(".filter-menu .menu-close").click();
    await expect(page.locator(".model-row").first()).toBeVisible({ timeout: 30_000 });

    await page.locator('[data-action="menu"][data-menu="modalities"]').click();
    await page.locator('.filter-menu .menu-option[data-value="image"]').click();
    await page.locator(".filter-menu .menu-close").click();
    await expect(page.locator(".model-row").first()).toBeVisible({ timeout: 30_000 });
  });

  test("sorts through the styled sort popover", async ({ page }) => {
    await openApp(page);
    await page.locator('[data-action="menu"][data-menu="sort"]').click();
    await page.locator('.sort-menu .menu-option[data-key="context"]').click();
    await expect(page.locator(".sort-menu")).toHaveCount(0);
    await expect(page.locator(".model-row").first()).toBeVisible({ timeout: 30_000 });
  });

  test("supports splitter keyboard and double-click reset", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "desktop splitter");
    await openApp(page);
    const splitter = page.locator(".splitter");
    await expect(splitter).toBeVisible();
    const before = await page.locator(".split").evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    await splitter.focus();
    await splitter.press("ArrowRight");
    const after = await page.locator(".split").evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    expect(after).not.toBe(before);
    await splitter.dblclick();
    const reset = await page.locator(".split").evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    expect(reset).not.toBe(after);
  });

  test("expands provider differences", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "desktop details");
    await openApp(page);
    const provider = page.locator(".provider").first();
    await expect(provider).toBeVisible();
    await provider.locator("summary").click();
    await expect(provider).toHaveAttribute("open", "");
    await expect(provider.locator(".provider-specs")).toBeVisible();
  });

  test("shows an empty detail state when no model matches", async ({ page }) => {
    await openApp(page);
    await page.locator("#model-search").fill("this-model-does-not-exist-xyz");
    await expect(page.locator(".model-pane .empty")).toBeVisible({ timeout: 30_000 });
    const detailVisible = await page.locator(".detail-pane").isVisible();
    if (detailVisible) await expect(page.locator(".detail-empty")).toBeVisible();
  });

  test("opens mobile details and returns with browser back", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile flow");
    await openApp(page);
    await page.locator(".model-row").first().click();
    await expect(page.locator(".detail-mobile-bar")).toBeVisible();
    await expect(page.locator(".detail-title h1")).not.toBeEmpty();
    await page.goBack();
    await expect(page.locator(".model-pane")).toBeVisible();
  });

  test("persists appearance and split settings", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "desktop settings");
    await openApp(page);
    await page.locator('[data-action="settings"]').click();
    const modal = page.locator(".settings-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute("aria-modal", "true");
    await expect(page.locator(".modal-layer")).toHaveAttribute("data-motion-state", "enter");
    await expect(page.locator('[data-action="settings-close"]')).toBeFocused();
    await page.locator('[data-action="segment"][data-key="density"][data-value="compact"]').click();
    await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
    await page.locator(".modal-layer").click({ position: { x: 8, y: 8 } });
    expect(await page.locator(".modal-layer").getAttribute("data-motion-state")).toBe("exit");
    await expect(modal).toHaveCount(0);
    await expect(page.locator('[data-action="settings"]')).toBeFocused();
    await page.locator('[data-action="settings"]').click();
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(page.locator('[data-action="settings"]')).toBeFocused();
    await page.reload();
    await expect(page.locator(".statusbar")).toContainText("models.dev", { timeout: 90_000 });
    await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  });

  test("keeps old data and URL parameters from breaking startup", async ({ page }) => {
    await page.goto(`${appUrl}?q=old&provider=legacy&view=offer`);
    await page.evaluate(() => {
      localStorage.setItem(
        "llminfo.data.v1",
        JSON.stringify({ favorites: ["x"], compare: ["x"], savedViews: [{ id: "1", name: "old", query: "q=x" }] }),
      );
    });
    await page.reload();
    await expect(page.locator(".statusbar")).toContainText("models.dev", { timeout: 90_000 });
    await expect(page.locator(".model-row").first()).toBeVisible();
  });
});
