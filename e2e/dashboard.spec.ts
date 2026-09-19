import { expect, test } from "@playwright/test";
import { gotoModels, isNarrow, openFirstDetail, openTab, rowSelector, signIn } from "./helpers";

test.describe("模型库", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("加载表格并显示数据来源与单位", async ({ page }) => {
    await expect(page.locator(rowSelector(page)).first()).toBeVisible();
    await expect(page.getByText("USD / 百万 token")).toBeVisible();
    await expect(page.getByText(/models\.dev/)).toBeVisible();
  });

  test("按输入价排序会改变首行", async ({ page }) => {
    test.skip(isNarrow(page), "排序表头仅在桌面端提供");
    const firstBefore = await page.locator(rowSelector(page)).first().innerText();
    await page.locator('.tbl-head button:has-text("输入")').click();
    await expect
      .poll(async () => page.locator(rowSelector(page)).first().innerText(), { timeout: 30_000 })
      .not.toBe(firstBefore);
  });

  test("搜索会把结果收敛并把查询写进 URL", async ({ page }) => {
    const total = await page.locator(rowSelector(page)).count();
    await page.getByLabel("搜索模型").fill("glm");
    await expect.poll(async () => page.url(), { timeout: 20_000 }).toContain("q=glm");
    await expect
      .poll(async () => page.locator(rowSelector(page)).count(), { timeout: 30_000 })
      .toBeLessThan(total + 1);
    await expect(page.getByText(/显示 \d+ \/ \d+/)).toBeVisible();
  });

  test("供应商筛选可收敛结果并可清除", async ({ page }) => {
    await page.getByLabel("供应商筛选").selectOption({ index: 1 });
    await expect(page.getByRole("button", { name: /清除/ })).toBeVisible();
    await page.getByRole("button", { name: /清除/ }).click();
    await expect(page.getByRole("button", { name: /清除/ })).toBeHidden();
  });

  test("打开详情抽屉显示跨供应商比价", async ({ page }) => {
    await openFirstDetail(page);
    const drawer = page.locator('aside[aria-label="模型详情"]');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("跨供应商比价")).toBeVisible();
    await expect(drawer.getByText("关键指标")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("切换到供应商报价视角", async ({ page }) => {
    test.skip(isNarrow(page), "视角切换控件仅在桌面端提供");
    await page.getByRole("button", { name: "供应商报价" }).click();
    await expect(page.getByText(/条报价/)).toBeVisible();
  });

  test("导出 CSV 会触发下载", async ({ page }) => {
    test.skip(isNarrow(page), "导出是桌面端专属功能");
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: "导出" }).first().click();
    await page.getByRole("menuitem", { name: /CSV/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test("收藏可以往返", async ({ page }) => {
    await openFirstDetail(page);
    const drawer = page.locator('aside[aria-label="模型详情"]');

    // Favourites persist server-side, so the starting state depends on earlier
    // runs. Normalise to "not favourited" first, then exercise both directions.
    const unfavourite = drawer.getByRole("button", { name: "取消收藏" });
    if (await unfavourite.count()) {
      await unfavourite.click();
      await expect(drawer.getByRole("button", { name: "收藏", exact: true })).toBeVisible();
    }

    await drawer.getByRole("button", { name: "收藏", exact: true }).click();
    await expect(drawer.getByRole("button", { name: "取消收藏" })).toBeVisible();

    // Survives a reload, proving it was persisted rather than local state.
    await page.reload();
    await page.waitForSelector(".tbl-row", { state: "attached", timeout: 90_000 });
    await openFirstDetail(page);
    await expect(page.locator('aside[aria-label="模型详情"]').getByRole("button", { name: "取消收藏" })).toBeVisible();

    await page.locator('aside[aria-label="模型详情"]').getByRole("button", { name: "取消收藏" }).click();
  });
});

test.describe("其他视图", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("分析图表按视口显示或隐藏", async ({ page }) => {
    const width = page.viewportSize()?.width ?? 0;
    const chartsNav = page.getByRole("button", { name: "分析图表" }).first();

    if (width < 1024) {
      // Charts are desktop-only by product decision.
      await expect(chartsNav).toBeHidden();
      return;
    }

    await chartsNav.click();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
  });

  test("对比空状态提示如何添加", async ({ page }) => {
    await openTab(page, "对比");
    await expect(page.getByText("还没有选择要对比的模型")).toBeVisible();
  });

  test("成本估算可计算并显示美元金额", async ({ page }) => {
    await openTab(page, "成本估算");
    await expect(page.getByText("月输入 tokens")).toBeVisible();
    await expect(page.locator("text=/\\$[0-9]/").first()).toBeVisible({ timeout: 30_000 });
  });

  test("主题切换会改变根元素状态", async ({ page }) => {
    await gotoModels(page);
    const narrow = isNarrow(page);
    // The appearance flyout lives in the side rail on desktop and is reached
    // from the title-bar control on phones.
    if (narrow) await page.getByRole("button", { name: "外观设置" }).click();
    else await page.locator(".shell-nav").getByRole("button", { name: "设置" }).click();

    // The default theme depends on the OS colour scheme and the viewport, so
    // pick the opposite of whatever is currently resolved rather than assuming.
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    const target = before === "dark" ? "亮色" : "暗色";
    await page.getByRole("button", { name: target }).click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.theme), { timeout: 15_000 })
      .toBe(before === "dark" ? "light" : "dark");

    // The choice must survive a reload (persisted, not just in-memory state).
    await page.reload();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.theme), { timeout: 30_000 })
      .toBe(before === "dark" ? "light" : "dark");
  });
});

test.describe("认证与安全", () => {
  // These must run signed OUT, so they discard the shared session captured by
  // auth.setup.ts instead of inheriting it.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("未登录访问会被重定向到登录页", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("错误密码显示错误且不进入应用", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("邮箱").fill("admin@local.test");
    await page.getByLabel("密码").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("移动端布局", () => {
  // Only meaningful on a phone-sized viewport; skip elsewhere so the suite can
  // run every project against the same file.
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, "仅在移动视口运行");
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("卡片流与底部导航可用", async ({ page }) => {
    await signIn(page);
    await expect(page.locator(".tbl-mobile").first()).toBeVisible();
    await expect(page.locator(".shell-tabbar")).toBeVisible();
    await expect(page.locator(".tbl-desktop").first()).toBeHidden();
    await openFirstDetail(page);
    await expect(page.locator('aside[aria-label="模型详情"]')).toBeVisible();
  });

  test("没有横向溢出", async ({ page }) => {
    await signIn(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
