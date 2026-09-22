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

async function choosePageSize(page: Page, size: number): Promise<void> {
  const trigger = page.locator('[data-menu="page-size"]');
  await trigger.click();
  await page.locator(`[data-action="page-size-option"][data-value="${size}"]`).click();
  await expect(trigger).toContainText(`${size} 条`);
}

async function paginationInfo(page: Page): Promise<{ total: number; totalPages: number }> {
  const range = await page.locator(".pagination-range").innerText();
  const current = await page.locator(".pagination-page").innerText();
  const total = Number(range.split("/").at(-1)!.trim());
  const totalPages = Number(current.split("/").at(-1)!.replace("页", "").trim());
  return { total, totalPages };
}

function expectedRange(pageNumber: number, pageSize: number, total: number): string {
  const start = (pageNumber - 1) * pageSize + 1;
  const end = Math.min(pageNumber * pageSize, total);
  return `${start}-${end} / ${total}`;
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
    await choosePageSize(page, 200);
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
    await choosePageSize(page, 200);
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
    await choosePageSize(page, 200);
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

  test("animates a new model selection once without replaying on repeat click", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "desktop selection");
    await openApp(page);
    await page.evaluate(() => {
      (window as any).selectionMotionStarts = [];
      document.addEventListener(
        "animationstart",
        (event) => (window as any).selectionMotionStarts.push((event as AnimationEvent).animationName),
        true,
      );
    });

    const selectedRow = page.locator(".model-row").nth(1);
    await selectedRow.click();
    await expect(page.locator(".model-row.active")).toHaveAttribute("data-selection-motion", "enter");
    await expect(page.locator(".detail-scroll")).toHaveAttribute("data-selection-motion", "enter");
    await expect
      .poll(() => page.evaluate(() => (window as any).selectionMotionStarts.includes("model-selection-row")))
      .toBe(true);
    await expect
      .poll(() => page.evaluate(() => (window as any).selectionMotionStarts.includes("detail-selection-enter")))
      .toBe(true);

    await page.waitForTimeout(200);
    const firstCount = await page.evaluate(
      () => (window as any).selectionMotionStarts.filter((name: string) => name === "model-selection-row").length,
    );
    expect(firstCount).toBe(1);

    await page.locator(".model-row.active").click();
    await page.waitForTimeout(200);
    const repeatCount = await page.evaluate(
      () => (window as any).selectionMotionStarts.filter((name: string) => name === "model-selection-row").length,
    );
    expect(repeatCount).toBe(1);
  });

  test("animates keyboard model selection", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "desktop keyboard selection");
    await openApp(page);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".model-row.active")).toHaveAttribute("data-selection-motion", "enter");
    await expect(page.locator(".detail-scroll")).toHaveAttribute("data-selection-motion", "enter");
  });

  test("paginates results and keeps details across pages", async ({ page }) => {
    await openApp(page);
    const pagination = page.locator(".pagination");
    await expect(pagination).toBeVisible();
    const { total, totalPages } = await paginationInfo(page);
    expect(totalPages).toBe(Math.ceil(total / 50));
    await expect(pagination.locator(".pagination-range")).toHaveText(expectedRange(1, 50, total));
    await expect(pagination.locator(".pagination-page")).toHaveText(`1 / ${totalPages} 页`);
    await expect(page.locator('[data-action="page-prev"]')).toBeDisabled();

    const detailTitle = await page.locator(".detail-title h1").innerText();
    const firstModel = await page.locator(".model-row").first().getAttribute("data-model");
    await page.locator('[data-action="page-next"]').click();
    await expect(pagination.locator(".pagination-range")).toHaveText(expectedRange(2, 50, total));
    await expect(pagination.locator(".pagination-page")).toHaveText(`2 / ${totalPages} 页`);
    await expect(page.locator(".detail-title h1")).toHaveText(detailTitle);
    await expect(page.locator(".model-row.active")).toHaveCount(0);
    await expect(page.locator('[data-action="page-next"]')).toBeFocused();

    await page.locator('[data-action="page-prev"]').click();
    await expect(pagination.locator(".pagination-range")).toHaveText(expectedRange(1, 50, total));
    await expect(page.locator(".model-row").first()).toHaveAttribute("data-model", firstModel!);
    await expect(page.locator(".model-row.active")).toHaveCount(1);
  });

  test("keeps arrow-key movement within the current page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "desktop keyboard navigation");
    await openApp(page);
    const lastRow = page.locator(".model-row").last();
    await lastRow.click();
    const lastModel = await lastRow.getAttribute("data-model");
    const detailTitle = await page.locator(".detail-title h1").innerText();

    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".model-row.active")).toHaveAttribute("data-model", lastModel!);
    await expect(page.locator(".detail-title h1")).toHaveText(detailTitle);
    await expect(page.locator(".pagination-page")).toHaveText(/^1 \/ /);

    await page.locator('[data-action="page-next"]').click();
    await expect(page.locator(".model-row.active")).toHaveCount(0);
    await expect(page.locator(".detail-title h1")).toHaveText(detailTitle);
  });

  test("resets the page after a sort change", async ({ page }) => {
    await openApp(page);
    await page.locator('[data-action="page-next"]').click();
    await expect(page.locator(".pagination-page")).toHaveText(/^2 \/ /);
    await page.locator('[data-action="menu"][data-menu="sort"]').click();
    await page.locator('[data-action="sort"][data-key="context"]').click();
    await expect(page.locator(".pagination-page")).toHaveText(/^1 \/ /);
    await expect(page.locator(".pagination-range")).toHaveText(/^1-50 \/ /);
    await expect(page.locator('[data-action="page-prev"]')).toBeDisabled();
  });

  test("changes page size near the first visible item and resets on reload", async ({ page }) => {
    await openApp(page);
    const initial = await paginationInfo(page);
    await page.locator('[data-action="page-next"]').click();
    const firstModel = await page.locator(".model-row").first().getAttribute("data-model");
    await choosePageSize(page, 100);
    await expect(page.locator(".pagination-range")).toHaveText(expectedRange(1, 100, initial.total));
    await expect(page.locator(".pagination-page")).toHaveText(`1 / ${Math.ceil(initial.total / 100)} 页`);
    await expect(page.locator(`.model-row[data-model="${firstModel}"]`)).toHaveCount(1);

    await page.reload();
    await expect(page.locator(".statusbar")).toContainText("models.dev", { timeout: 90_000 });
    await expect(page.locator('[data-menu="page-size"]')).toContainText("50 条");
    await expect(page.locator(".pagination-page")).toHaveText(`1 / ${initial.totalPages} 页`);
  });

  test("keeps pagination visible and inside the mobile viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile pagination");
    await openApp(page);
    const pagination = page.locator(".pagination");
    await expect(pagination).toBeVisible();
    const info = await paginationInfo(page);
    await expect(pagination.locator(".pagination-range")).toContainText(`/ ${info.total}`);
    await expect(pagination.locator(".pagination-page")).toContainText(`/ ${info.totalPages} 页`);
    const box = await pagination.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    const trigger = page.locator('[data-menu="page-size"]');
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox).not.toBeNull();
    await trigger.click();
    const menu = page.locator(".page-size-menu");
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(triggerBox!.y);
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

  test("plays reverse motion when closing mobile details", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile motion");
    await openApp(page);
    await page.evaluate(() => {
      (window as any).selectionMotionStarts = [];
      document.addEventListener(
        "animationstart",
        (event) => (window as any).selectionMotionStarts.push((event as AnimationEvent).animationName),
        true,
      );
    });

    await page.locator(".model-row").first().click();
    await expect(page.locator(".detail-mobile-bar")).toBeVisible();
    await page.locator('[data-action="mobile-back"]').click();
    await expect
      .poll(() => page.evaluate(() => (window as any).selectionMotionStarts.includes("detail-selection-exit")))
      .toBe(true);
    await expect(page.locator(".model-pane")).toBeVisible();
    await expect(page.locator(".model-pane")).toHaveAttribute("data-selection-motion", "list");
    await expect
      .poll(() => page.evaluate(() => (window as any).selectionMotionStarts.includes("model-list-enter")))
      .toBe(true);
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
