import "./styles.css";
import { parseSourceDataset } from "./lib/source-schema";
import { transformDataset } from "./lib/transform";
import { fetchSourceDataset, logoUrl, type FetchProgress } from "./lib/source";
import {
  ACCENT_PRESETS,
  DEFAULT_APPEARANCE,
  DEFAULT_QUERY,
  activeFilterCount,
  isModality,
  readLocalData,
  writeLocalData,
  type AccentId,
  type AppearanceState,
  type Density,
  type LocalData,
  type QueryState,
  type ThemeMode,
} from "./lib/client-store";
import {
  aggregate,
  filterModels,
  reasoningOptionLabel,
  sortModels,
  type Filters,
  type ModelAggregate,
  type SortDir,
  type SortKey,
} from "./lib/query-engine";
import { formatContext } from "./lib/normalize";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  clampPage,
  isPageSize,
  pageAfterPageSizeChange,
  pageWindow,
  type PageSize,
} from "./lib/pagination";
import type { DatasetDTO, Modality, OfferDTO } from "./lib/types";
import { createQueryClient } from "./lib/worker-client";
import { icon, type IconName } from "./ui/icons";
import {
  motionItemAttribute,
  motionTimings,
  playEnter,
  playExit,
  selectionMotionAttribute,
  type MotionReason,
  type SelectionMotion,
} from "./ui/motion";
import {
  escapeAttr,
  escapeHtml,
  initialsOf,
  modalityLabel,
  shortDate,
  tile,
} from "./ui/format";

type FilterMenuId = "providers" | "statuses" | "modalities" | "capabilities";
type MenuId = FilterMenuId | "sort" | "page-size" | null;

interface AppState {
  settingsOpen: boolean;
  menu: MenuId;
  menuSearch: string;
  selected: ModelAggregate | null;
  refreshing: boolean;
  progress: FetchProgress;
  local: LocalData;
  query: QueryState;
  dataset: DatasetDTO | null;
  models: ModelAggregate[];
  totalModels: number;
  durationMs: number;
  pending: boolean;
  error: string | null;
  mobileDetail: boolean;
  rowsScrollTop: number;
  page: number;
  pageSize: PageSize;
}

const state: AppState = {
  settingsOpen: false,
  menu: null,
  menuSearch: "",
  selected: null,
  refreshing: false,
  progress: {
    phase: "idle",
    message: "等待加载",
    startedAt: null,
    finishedAt: null,
    bytes: null,
    error: null,
  },
  local: {
    version: 2,
    appearance: DEFAULT_APPEARANCE,
    splitRatio: 0.38,
  },
  query: DEFAULT_QUERY,
  dataset: null,
  models: [],
  totalModels: 0,
  durationMs: 0,
  pending: false,
  error: null,
  mobileDetail: false,
  rowsScrollTop: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "名称" },
  { key: "context", label: "上下文" },
  { key: "outputLimit", label: "最大输出" },
  { key: "reasoningLevels", label: "推理档位数" },
  { key: "releaseDate", label: "发布日期" },
  { key: "lastUpdated", label: "更新日期" },
  { key: "providerCount", label: "供应商数" },
];

const CAPABILITY_FILTERS: { key: "reasoning" | "toolCall" | "structuredOutput" | "openWeights"; label: string }[] = [
  { key: "reasoning", label: "推理" },
  { key: "toolCall", label: "工具调用" },
  { key: "structuredOutput", label: "结构化输出" },
  { key: "openWeights", label: "开放权重" },
];

const STATUS_OPTIONS = [
  { value: "stable", label: "稳定" },
  { value: "beta", label: "Beta" },
  { value: "deprecated", label: "已弃用" },
];

const MIN_LEFT = 300;
const MIN_RIGHT = 420;
const SPLITTER_WIDTH = 8;
const VIRTUAL_THRESHOLD = 120;
const MOBILE_BREAKPOINT = 1023;

let queryTimer: number | null = null;
let querySequence = 0;
let logoObserver: IntersectionObserver | null = null;
let virtualRaf = 0;
let virtualData: ModelAggregate[] = [];
let pendingRowsScrollTop: number | null = null;
let draggingSplit = false;
let historyPushed = false;
let mobileBackPending = false;
let selectionMotion: SelectionMotion | null = null;
let selectionMotionModelId: string | null = null;
let virtualSelectionMotionModelId: string | null = null;
const queryClient = createQueryClient();

function q<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

function qa<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

function isMobile(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function canSplit(): boolean {
  return !isMobile() && window.innerWidth >= MIN_LEFT + MIN_RIGHT + SPLITTER_WIDTH;
}

function virtualRowPitch(): number {
  const styles = getComputedStyle(document.documentElement);
  const row = Number.parseFloat(styles.getPropertyValue("--row"));
  const gap = Number.parseFloat(styles.getPropertyValue("--row-gap"));
  return (Number.isFinite(row) ? row : 68) + (Number.isFinite(gap) ? gap : 4);
}

function saveLocal(): void {
  try {
    writeLocalData(state.local);
  } catch {
    // Storage can be disabled; the current session still works.
  }
}

function focusSettingsTrigger(): void {
  const target = q<HTMLElement>('[data-action="settings"]');
  if (target) target.focus();
}

function closeSettings(): void {
  if (!state.settingsOpen) return;
  const node = q<HTMLElement>(".modal-layer");
  state.settingsOpen = false;
  applyAppearance();
  if (!node) {
    render("none");
    focusSettingsTrigger();
    return;
  }
  void playExit({ node, kind: "settings" }).then(() => {
    render("none");
    focusSettingsTrigger();
  });
}

function openMobileDetail(): void {
  state.mobileDetail = true;
  if (historyPushed) return;
  window.history.pushState({ llminfoMobileDetail: true }, "");
  historyPushed = true;
}

function playMobileDetailExit(): Promise<void> {
  const detail = q<HTMLElement>(".detail-scroll");
  if (!detail) return Promise.resolve();
  detail.style.pointerEvents = "none";
  detail.dataset.selectionMotion = "exit";
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(fallback);
      resolve();
    };
    detail.addEventListener("animationend", finish, { once: true });
    const fallback = window.setTimeout(finish, motionTimings().exit + 50);
  });
}

function commitMobileDetailExit(): void {
  mobileBackPending = false;
  state.mobileDetail = false;
  selectionMotion = "list";
  selectionMotionModelId = null;
  render("none");
}

function returnToMobileList(): void {
  if (mobileBackPending) return;
  mobileBackPending = true;
  if (historyPushed) {
    window.history.back();
    return;
  }
  void playMobileDetailExit().then(commitMobileDetailExit);
}

function applyAppearance(): void {
  const root = document.documentElement;
  const appearance = state.local.appearance;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = appearance.theme === "system" ? (prefersDark ? "dark" : "light") : appearance.theme;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
  root.dataset.density = appearance.density;
  root.dataset.acrylic = appearance.acrylic ? "on" : "off";
  document.body.classList.toggle("settings-open", state.settingsOpen);
  const preset = ACCENT_PRESETS.find((item) => item.id === appearance.accentId);
  const isDark = resolved === "dark";
  const base = preset ? (isDark ? preset.dark : preset.light) : appearance.customAccent;
  const ink = preset ? (isDark ? preset.inkDark : preset.ink) : appearance.customAccent;
  root.style.setProperty("--accent", base);
  root.style.setProperty("--accent-ink", ink);
  root.style.setProperty("--accent-soft", `color-mix(in srgb, ${base} 14%, transparent)`);
  root.style.setProperty("--accent-line", `color-mix(in srgb, ${base} 36%, transparent)`);
  root.style.setProperty("--on-accent", isDark ? "#003350" : "#ffffff");
}

function setAppearance(patch: Partial<AppearanceState>): void {
  state.local.appearance = { ...state.local.appearance, ...patch };
  saveLocal();
  applyAppearance();
  render("none");
}

function scheduleQuery(): void {
  if (queryTimer !== null) window.clearTimeout(queryTimer);
  querySequence += 1;
  state.pending = true;
  queryTimer = window.setTimeout(() => void runQuery(), 90);
  render("none");
}

async function runQuery(): Promise<void> {
  if (!state.dataset) return;
  const sequence = querySequence;
  const response = await queryClient.run({
    dataset: state.dataset,
    filters: state.query.filters,
    sortKey: state.query.sortKey,
    sortDir: state.query.sortDir,
  });
  if (sequence !== querySequence) return;
  state.models = response.models;
  state.totalModels = response.totalModels;
  state.durationMs = response.durationMs;
  state.pending = false;
  state.page = clampPage(state.page, state.models.length, state.pageSize);
  keepSelection();
  state.rowsScrollTop = 0;
  render("query");
}

function keepSelection(): void {
  if (!state.models.length) {
    state.selected = null;
    state.mobileDetail = false;
    return;
  }
  const current = state.selected ? state.models.find((model) => model.modelId === state.selected!.modelId) : null;
  state.selected = current ?? state.models[0];
}

function setProgress(progress: FetchProgress): void {
  state.progress = progress;
  state.error = progress.error;
  render("none");
}

async function loadData(manual = false): Promise<void> {
  if (state.refreshing) return;
  state.refreshing = true;
  state.error = null;
  if (manual) render("none");
  try {
    const result = await fetchSourceDataset(setProgress);
    const source = parseSourceDataset(result.data);
    const transformed = transformDataset(source);
    state.dataset = {
      version: transformed.contentHash,
      syncedAt: result.fetchedAt,
      providers: transformed.providers,
      offers: transformed.offers,
      counts: {
        providers: transformed.providers.length,
        models: new Set(transformed.offers.map((offer) => offer.modelId)).size,
        offers: transformed.offers.length,
      },
    };
    state.error = null;
    await runQuery();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.error = message;
    state.progress = { ...state.progress, phase: "error", error: message, message };
  } finally {
    state.refreshing = false;
    render("none");
  }
}

function setQuery(patch: Partial<QueryState>): void {
  state.query = { ...state.query, ...patch };
  state.page = 1;
  scheduleQuery();
}

function patchFilters(patch: Partial<Filters>): void {
  state.query = { ...state.query, filters: { ...state.query.filters, ...patch } };
  state.page = 1;
  scheduleQuery();
}

function resetFilters(): void {
  state.query = { ...state.query, filters: { ...DEFAULT_QUERY.filters } };
  state.page = 1;
  scheduleQuery();
}

function providerOptions(): { id: string; name: string }[] {
  return (state.dataset?.providers ?? [])
    .map((provider) => ({ id: provider.id, name: provider.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function selectedModelId(): string | null {
  return state.selected?.modelId ?? null;
}

function animateSelection(modelId: string): void {
  selectionMotion = "enter";
  selectionMotionModelId = modelId;
}

function selectionEnterAttribute(modelId: string, active: boolean): string {
  if (!active) return "";
  const direct = selectionMotion === "enter" && selectionMotionModelId === modelId;
  const virtual = virtualSelectionMotionModelId === modelId;
  return direct || virtual ? selectionMotionAttribute("enter") : "";
}

function selectionListAttribute(): string {
  return selectionMotion === "list" ? selectionMotionAttribute("list") : "";
}

function render(reason: MotionReason = "none"): void {
  applyAppearance();
  const root = document.getElementById("app");
  if (!root) return;
  logoObserver?.disconnect();
  const active = document.activeElement;
  const focusId = active instanceof HTMLInputElement ? active.id : null;
  const focusKey = active instanceof HTMLElement ? active.dataset.focusKey ?? null : null;
  const selectionStart = active instanceof HTMLInputElement ? active.selectionStart : null;
  const selectionEnd = active instanceof HTMLInputElement ? active.selectionEnd : null;
  const currentRows = q<HTMLElement>('[data-role="rows"]', root);
  if (currentRows && reason !== "query") state.rowsScrollTop = currentRows.scrollTop;
  const detailScrollTop = q<HTMLElement>(".detail-scroll", root)?.scrollTop ?? 0;
  const mobile = isMobile();

  root.innerHTML = `
    <div class="shell">
      ${renderTitlebar()}
      <main class="workspace">
        ${renderToolbar()}
        ${state.error ? `<p class="alert" role="alert">${icon("circle-alert", 14)}<span>${escapeHtml(state.error)}</span></p>` : ""}
        <div class="split" data-mobile-detail="${state.mobileDetail ? "true" : "false"}">
          <section class="model-pane" aria-label="模型列表"${selectionListAttribute()}>
            <div class="pane-head">${renderListHead()}</div>
            ${renderModelList()}
            ${renderPagination()}
          </section>
          <div class="splitter" role="separator" aria-label="调整列表与详情宽度" aria-orientation="vertical" tabindex="0" data-action="splitter" aria-valuemin="24" aria-valuemax="72" aria-valuenow="${Math.round(state.local.splitRatio * 100)}"></div>
          <aside class="detail-pane" aria-label="模型详情">
            ${renderDetail()}
          </aside>
        </div>
      </main>
      ${renderStatusbar()}
      ${state.settingsOpen ? renderSettings() : ""}
      ${renderMenu()}
    </div>`;
  virtualSelectionMotionModelId = selectionMotion === "enter" ? selectionMotionModelId : null;
  selectionMotion = null;
  selectionMotionModelId = null;

  pendingRowsScrollTop = mobile || reason === "query" || state.rowsScrollTop === 0
    ? null
    : state.rowsScrollTop;
  const detail = q<HTMLElement>(".detail-scroll", root);
  if (detail) detail.scrollTop = detailScrollTop;
  const motionContent = q<HTMLElement>(".motion-content", root);
  if (motionContent) {
    if (reason === "none") motionContent.removeAttribute("data-motion-reason");
    else motionContent.dataset.motionReason = reason;
  }
  applySplit();
  hydrateLogos(root);
  setupVirtualList();
  if (reason !== "none") playEnter({ reason, root, content: q<HTMLElement>(".split", root) });
  if (focusId) {
    const restored = document.getElementById(focusId);
    if (restored instanceof HTMLInputElement) {
      restored.focus();
      if (selectionStart !== null) restored.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
    }
  }
  if (focusKey) {
    const restored = qa<HTMLElement>("[data-focus-key]").find((element) => element.dataset.focusKey === focusKey);
    restored?.focus();
  }
  if (state.settingsOpen && active instanceof HTMLElement && !active.closest(".settings-modal")) {
    q<HTMLElement>('.settings-modal [data-action="settings-close"]')?.focus();
  }
}

function renderTitlebar(): string {
  const synced = state.dataset?.syncedAt
    ? new Date(state.dataset.syncedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "—";
  const label = state.progress.phase === "error" ? "同步失败" : `同步于 ${synced}`;
  return `<header class="titlebar mica-acrylic">
    <span class="brandmark">${icon("layers", 12)}</span>
    <span class="brand">LLMinfo</span>
    <span class="brand-sub">· 模型库</span>
    <span class="spacer"></span>
    <span class="sync-pill">${icon("circle-check", 12)}${escapeHtml(label)}</span>
    <button type="button" class="iconbtn" data-action="settings" aria-label="外观设置">${icon("settings", 15)}</button>
  </header>`;
}

function renderToolbar(): string {
  const count = activeFilterCount(state.query.filters);
  const providerCount = state.query.filters.providerIds.length;
  const statusCount = state.query.filters.statuses.length;
  const modalityCount = state.query.filters.inputModalities.length;
  const capabilityCount = CAPABILITY_FILTERS.filter((item) => state.query.filters[item.key]).length;
  return `<div class="toolbar">
    <label class="searchwrap">${icon("search", 14)}<input id="model-search" type="search" value="${escapeAttr(state.query.filters.search)}" placeholder="搜索模型、ID、家族或供应商" data-input="search" autocomplete="off" /><span class="kbd">/</span></label>
    <div class="menu-anchor">
      <button type="button" class="toolbtn${providerCount ? " active" : ""}" data-action="menu" data-menu="providers" aria-expanded="${state.menu === "providers"}">${icon("database", 14)}<span>供应商${providerCount ? ` ${providerCount}` : ""}</span></button>
      ${state.menu === "providers" ? renderFilterMenu("providers") : ""}
    </div>
    <div class="menu-anchor">
      <button type="button" class="toolbtn${statusCount ? " active" : ""}" data-action="menu" data-menu="statuses" aria-expanded="${state.menu === "statuses"}">${icon("circle-check", 14)}<span>状态${statusCount ? ` ${statusCount}` : ""}</span></button>
      ${state.menu === "statuses" ? renderFilterMenu("statuses") : ""}
    </div>
    <div class="menu-anchor">
      <button type="button" class="toolbtn${modalityCount ? " active" : ""}" data-action="menu" data-menu="modalities" aria-expanded="${state.menu === "modalities"}">${icon("table-2", 14)}<span>模态${modalityCount ? ` ${modalityCount}` : ""}</span></button>
      ${state.menu === "modalities" ? renderFilterMenu("modalities") : ""}
    </div>
    <div class="menu-anchor">
      <button type="button" class="toolbtn${capabilityCount ? " active" : ""}" data-action="menu" data-menu="capabilities" aria-expanded="${state.menu === "capabilities"}">${icon("list-filter", 14)}<span>能力${capabilityCount ? ` ${capabilityCount}` : ""}</span></button>
      ${state.menu === "capabilities" ? renderFilterMenu("capabilities") : ""}
    </div>
    <button type="button" class="toolbtn${count ? " active" : ""}" data-action="reset-filters" ${count ? "" : "disabled"}>${icon("x", 14)}<span>清空${count ? ` ${count}` : ""}</span></button>
    <button type="button" class="toolbtn" data-action="refresh" ${state.refreshing ? "disabled" : ""}>${icon("refresh-cw", 14)}<span>${state.refreshing ? "同步中" : "同步"}</span></button>
    <span class="spacer"></span>
    <span class="count-note">${state.models.length} / ${state.totalModels} 个模型</span>
  </div>`;
}

function renderListHead(): string {
  const current = SORT_OPTIONS.find((option) => option.key === state.query.sortKey);
  return `<div class="list-title"><b>模型</b><span>${state.models.length} 条</span></div>
    <div class="menu-anchor">
      <button type="button" class="toolbtn compact" data-action="menu" data-menu="sort" aria-expanded="${state.menu === "sort"}">${icon("arrow-up-down", 13)}<span>${escapeHtml(current?.label ?? "排序")} · ${state.query.sortDir === "asc" ? "升序" : "降序"}</span>${icon("chevron-down", 12)}</button>
      ${state.menu === "sort" ? renderSortMenu() : ""}
    </div>`;
}

function renderPagination(): string {
  if (!state.models.length) return "";
  const window = pageWindow(state.models, state.page, state.pageSize);
  const atStart = window.page <= 1;
  const atEnd = window.page >= window.totalPages;
  return `<nav class="pagination" aria-label="模型分页">
    <div class="pagination-summary num" aria-live="polite" aria-atomic="true">
      <span class="pagination-range">${window.start + 1}-${window.end} / ${window.totalItems}</span>
      <span class="pagination-page">${window.page} / ${window.totalPages} 页</span>
    </div>
    <div class="pagination-actions">
      <button type="button" class="iconbtn pagination-btn" data-action="page-prev" data-focus-key="page-prev" aria-label="上一页" title="上一页" ${atStart ? "disabled" : ""}>${icon("chevron-left", 18)}</button>
      <button type="button" class="iconbtn pagination-btn" data-action="page-next" data-focus-key="page-next" aria-label="下一页" title="下一页" ${atEnd ? "disabled" : ""}>${icon("chevron-right", 18)}</button>
      <div class="menu-anchor">
        <button type="button" class="toolbtn compact page-size-trigger" data-action="menu" data-menu="page-size" data-focus-key="page-size" aria-haspopup="menu" aria-expanded="${state.menu === "page-size"}" aria-label="每页数量，当前 ${window.pageSize} 条">${icon("rows-3", 14)}<span>${window.pageSize} 条</span>${icon("chevron-down", 12)}</button>
        ${state.menu === "page-size" ? renderPageSizeMenu(window.pageSize) : ""}
      </div>
    </div>
  </nav>`;
}

function renderPageSizeMenu(currentSize: PageSize): string {
  const close = `<button type="button" class="menu-close" data-action="menu-close" aria-label="关闭">${icon("x", 13)}</button>`;
  return `<div class="popover page-size-menu mica-acrylic-strong" role="dialog" aria-label="每页数量">
    <header>每页数量${close}</header>
    <div class="menu-options">
      ${PAGE_SIZE_OPTIONS.map((size) => `<button type="button" class="menu-option${currentSize === size ? " active" : ""}" role="menuitemradio" aria-checked="${currentSize === size}" data-action="page-size-option" data-value="${size}">${icon("check", 13)}<span>${size} 条</span></button>`).join("")}
    </div>
  </div>`;
}

function renderModelList(): string {
  if (state.refreshing && !state.dataset) {
    return `<div class="skeleton-list" aria-label="正在加载">${Array.from({ length: 8 }, () => '<div class="skeleton-row"><i></i><span></span><span></span></div>').join("")}</div>`;
  }
  if (!state.dataset) {
    return `<div class="empty">${icon("triangle-alert", 22)}<p>尚未取得数据</p><span>检查网络后点击同步。</span><button type="button" class="navbtn" data-action="refresh">${icon("refresh-cw", 14)}重试</button></div>`;
  }
  if (!state.models.length) {
    return `<div class="empty">${icon("search-x", 22)}<p>没有符合条件的模型</p><span>试试放宽筛选条件或清空搜索。</span><button type="button" class="navbtn" data-action="reset-filters">清空筛选</button></div>`;
  }
  const currentPage = pageWindow(state.models, state.page, state.pageSize);
  const virtual = currentPage.items.length > VIRTUAL_THRESHOLD;
  return `<div class="rows scroll-thin" data-role="rows" data-virtual="${virtual ? "model" : "none"}">
    ${
      virtual
        ? `<div class="vspacer" data-role="vspacer"></div><div class="vwindow" data-role="vwindow"></div>`
        : currentPage.items.map((model) => renderModelRow(model)).join("")
    }
  </div>`;
}

function statusTags(model: ModelAggregate): string {
  const tags = model.statuses.map((status) => `<span class="tag warn">${escapeHtml(status)}</span>`);
  if (model.experimental) tags.push('<span class="tag">实验性</span>');
  return tags.join("");
}

function reasoningLine(model: ModelAggregate): string {
  const summary = model.reasoningSummary;
  if (!summary.supported) return '<span class="meta-line muted">不支持推理</span>';
  const level = summary.highestLevel ? `最高 ${escapeHtml(summary.highestLevel)}` : "支持推理";
  const count = summary.levelCount ? `${summary.levelCount} 档` : "档位未声明";
  return `<span class="meta-line accent-text">${escapeHtml(level)} · ${escapeHtml(count)}</span>`;
}

function renderModelRow(model: ModelAggregate, animate = true): string {
  const active = selectedModelId() === model.modelId;
  return `<button type="button" class="model-row${active ? " active" : ""}" data-model="${escapeAttr(model.modelId)}" data-action="select-model"${selectionEnterAttribute(model.modelId, active)}${motionItemAttribute(animate)} aria-pressed="${active}">
    <span class="row-main">
      ${tile(initialsOf(model.family ?? model.name), model.family ?? model.name, 26)}
      <span class="row-name"><b>${escapeHtml(model.name)}</b><small class="mono">${escapeHtml(model.modelId)}</small></span>
      <span class="row-tags">${statusTags(model)}</span>
    </span>
    <span class="row-meta">
      <span class="meta-line"><em>上下文</em>${escapeHtml(formatContext(model.context))}</span>
      <span class="meta-line"><em>最大输出</em>${escapeHtml(formatContext(model.outputLimit))}</span>
      <span class="meta-line"><em>供应商</em>${model.providerCount} 家</span>
      ${reasoningLine(model)}
    </span>
  </button>`;
}

function renderDetail(): string {
  const motion =
    state.selected && selectionMotion === "enter" && selectionMotionModelId === state.selected.modelId
      ? selectionMotionAttribute("enter")
      : "";
  if (state.mobileDetail && state.selected) {
    return `<div class="detail-mobile-bar"><button type="button" class="iconbtn" data-action="mobile-back" aria-label="返回列表">${icon("chevron-down", 16)}</button><b>模型详情</b></div>${detailContent(state.selected, motion)}`;
  }
  if (!state.selected) {
    return `<div class="detail-empty">${icon("table-2", 26)}<p>选择模型查看详情</p><span>左侧列表中的模型信息会在这里展开。</span></div>`;
  }
  return detailContent(state.selected, motion);
}

function detailContent(model: ModelAggregate, motion = ""): string {
  const summary = model.reasoningSummary;
  const levels = summary.levels.length ? summary.levels.join(" / ") : "未声明";
  const budget = summary.budgetMin !== null || summary.budgetMax !== null
    ? `${summary.budgetMin?.toLocaleString() ?? "—"} - ${summary.budgetMax?.toLocaleString() ?? "—"} tokens`
    : "未声明";
  const optionRows = summary.options.length
    ? summary.options.map((option) => `<div class="reasoning-option"><b>${escapeHtml(option.type)}</b><span>${escapeHtml(reasoningOptionLabel(option))}</span></div>`).join("")
    : '<p class="hint small">上游未提供推理档位。</p>';
  return `<div class="detail-scroll scroll-thin"${motion}>
    <header class="detail-head">
      ${tile(initialsOf(model.family ?? model.name), model.family ?? model.name, 40)}
      <div class="detail-title"><h1>${escapeHtml(model.name)}</h1><span class="mono">${escapeHtml(model.modelId)}</span></div>
    </header>
    ${model.description ? `<p class="description">${escapeHtml(model.description)}</p>` : ""}
    <section class="detail-section">
      <h2>核心规格</h2>
      <dl class="spec-grid">
        ${spec("最大上下文", formatContext(model.context), model.minContext !== model.maxContext ? `${formatContext(model.minContext)} - ${formatContext(model.maxContext)}` : "")}
        ${spec("输入上限", formatContext(model.inputLimit))}
        ${spec("最大输出", formatContext(model.outputLimit), model.minOutputLimit !== model.maxOutputLimit ? `${formatContext(model.minOutputLimit)} - ${formatContext(model.maxOutputLimit)}` : "")}
        ${spec("推理", model.reasoning ? "支持" : "不支持")}
        ${spec("推理档位", levels)}
        ${spec("推理预算", budget)}
        ${spec("家族", model.family ?? "—")}
        ${spec("知识截止", model.knowledge ?? "—")}
        ${spec("发布日期", model.releaseDate ?? "—")}
        ${spec("最近更新", model.lastUpdated ?? "—")}
      </dl>
      <div class="capability-list">${capabilityTags(model)}</div>
    </section>
    <section class="detail-section">
      <h2>输入 / 输出模态</h2>
      <div class="capability-list">${model.inputModalities.map((modality) => `<span class="tag accent">输入 · ${modalityLabel(modality)}</span>`).join("")}${model.outputModalities.map((modality) => `<span class="tag">输出 · ${modalityLabel(modality)}</span>`).join("") || '<span class="hint small">未声明</span>'}</div>
    </section>
    <details class="detail-section fold" open>
      <summary>推理选项</summary>
      <div class="reasoning-options">${optionRows}</div>
    </details>
    <details class="detail-section fold" open>
      <summary>供应商差异 <small>${model.providerCount} 家</small></summary>
      <div class="provider-list">${model.offers.map((offer) => renderProvider(offer, model)).join("")}</div>
    </details>
  </div>`;
}

function spec(label: string, value: string, note = ""): string {
  return `<div class="spec"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}${note ? `<small>${escapeHtml(note)}</small>` : ""}</dd></div>`;
}

function capabilityTags(model: ModelAggregate): string {
  const entries: [string, boolean][] = [
    ["工具调用", model.toolCall],
    ["结构化输出", model.structuredOutput],
    ["附件", model.attachment],
    ["温度", model.temperature],
    ["交错思考", model.interleaved],
    ["开放权重", model.openWeights],
  ];
  return entries
    .filter(([, enabled]) => enabled)
    .map(([label]) => `<span class="tag ok">${label}</span>`)
    .join("") || '<span class="hint small">未声明额外能力</span>';
}

function providerDifference(offer: OfferDTO, model: ModelAggregate): string[] {
  const differences: string[] = [];
  if (offer.limits.context !== model.context) differences.push(`上下文 ${formatContext(offer.limits.context)}`);
  if (offer.limits.output !== model.outputLimit) differences.push(`输出 ${formatContext(offer.limits.output)}`);
  if (offer.reasoning !== model.reasoning) differences.push(offer.reasoning ? "支持推理" : "不支持推理");
  if (offer.reasoningOptions.length && offer.reasoningOptions !== model.reasoningSummary.options) differences.push("推理档位不同");
  return differences;
}

function renderProvider(offer: OfferDTO, model: ModelAggregate): string {
  const differences = providerDifference(offer, model);
  return `<details class="provider">
    <summary>
      <span class="provider-name">${escapeHtml(offer.providerName)}</span>
      <span class="provider-diff">${differences.length ? differences.map((value) => `<span class="tag warn">${escapeHtml(value)}</span>`).join("") : '<span class="tag ok">与聚合值一致</span>'}</span>
    </summary>
    <div class="provider-body">
      <dl class="provider-specs">
        ${spec("上下文", formatContext(offer.limits.context))}
        ${spec("输入上限", formatContext(offer.limits.input))}
        ${spec("最大输出", formatContext(offer.limits.output))}
        ${spec("推理", offer.reasoning ? "支持" : "不支持")}
        ${spec("推理档位", offer.reasoningOptions.length ? offer.reasoningOptions.map(reasoningOptionLabel).join("；") : "未声明")}
        ${spec("状态", offer.status ?? "—")}
      </dl>
      <div class="provider-links">
        ${offer.providerApi ? `<span class="mono">${escapeHtml(offer.providerApi)}</span>` : ""}
        ${offer.providerEnv.length ? `<span class="mono">${offer.providerEnv.map(escapeHtml).join(" · ")}</span>` : ""}
        ${offer.providerDoc ? `<a href="${escapeAttr(offer.providerDoc)}" target="_blank" rel="noreferrer">文档 ${icon("external-link", 12)}</a>` : ""}
      </div>
    </div>
  </details>`;
}

function renderStatusbar(): string {
  const synced = state.dataset?.syncedAt
    ? new Date(state.dataset.syncedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "—";
  return `<div class="statusbar">
    <span class="num">models.dev · ${state.pending ? "计算中…" : `${state.durationMs.toFixed(0)}ms`}</span>
    <span class="num">最后同步 ${synced}</span>
    <span class="spacer"></span>
    <span class="num">${state.models.length} / ${state.totalModels} 个模型</span>
  </div>`;
}

function menuLabel(id: FilterMenuId | "sort" | "page-size"): string {
  if (id === "providers") return "供应商";
  if (id === "statuses") return "状态";
  if (id === "modalities") return "输入模态";
  if (id === "capabilities") return "能力";
  if (id === "page-size") return "每页数量";
  return "排序";
}

function renderMenu(): string {
  if (!state.menu) return "";
  return "";
}

function renderSortMenu(): string {
  const close = `<button type="button" class="menu-close" data-action="menu-close" aria-label="关闭">${icon("x", 13)}</button>`;
  return `<div class="popover sort-menu mica-acrylic-strong" role="dialog" aria-label="排序">
    <header>${menuLabel("sort")}${close}</header>
    <div class="menu-options">${SORT_OPTIONS.map((option) => `<button type="button" class="menu-option${state.query.sortKey === option.key ? " active" : ""}" data-action="sort" data-key="${option.key}">${icon("check", 13)}<span>${option.label}</span></button>`).join("")}</div>
    <footer><button type="button" class="navbtn" data-action="sort-dir">${icon("arrow-up-down", 13)}${state.query.sortDir === "asc" ? "升序" : "降序"}</button></footer>
  </div>`;
}

function filterMenuItems(id: FilterMenuId): { value: string; label: string }[] {
  if (id === "providers") {
    return providerOptions().map((provider) => ({ value: provider.id, label: provider.name }));
  }
  if (id === "statuses") return STATUS_OPTIONS;
  if (id === "modalities") {
    return (["text", "image", "pdf", "video", "audio"] as Modality[]).map((modality) => ({
      value: modality,
      label: modalityLabel(modality),
    }));
  }
  return CAPABILITY_FILTERS.map((item) => ({ value: item.key, label: item.label }));
}

function selectedFilterValues(id: FilterMenuId): string[] {
  if (id === "providers") return state.query.filters.providerIds;
  if (id === "statuses") return state.query.filters.statuses;
  if (id === "modalities") return state.query.filters.inputModalities;
  return CAPABILITY_FILTERS.filter((item) => state.query.filters[item.key]).map((item) => item.key);
}

function renderFilterMenu(id: FilterMenuId): string {
  const close = `<button type="button" class="menu-close" data-action="menu-close" aria-label="关闭">${icon("x", 13)}</button>`;
  const needle = state.menuSearch.trim().toLowerCase();
  const items = filterMenuItems(id).filter((item) => !needle || item.label.toLowerCase().includes(needle));
  const selected = selectedFilterValues(id);
  const options = items.length
    ? items.map((item) => `<button type="button" class="menu-option${selected.includes(item.value) ? " active" : ""}" data-action="filter-option" data-menu="${id}" data-value="${escapeAttr(item.value)}">${icon("check", 13)}<span>${escapeHtml(item.label)}</span></button>`).join("")
    : '<p class="menu-empty">没有匹配项</p>';
  return `<div class="popover filter-menu mica-acrylic-strong" role="dialog" aria-label="${menuLabel(id)}筛选">
    <header>${menuLabel(id)}${close}</header>
    <div class="menu-search">${icon("search", 13)}<input id="menu-search" type="search" value="${escapeAttr(state.menuSearch)}" data-input="menu-search" placeholder="搜索…" autocomplete="off" /></div>
    <div class="menu-options scroll-thin">${options}</div>
    <footer><button type="button" class="navbtn" data-action="menu-clear">清空</button><button type="button" class="navbtn" data-action="menu-close">完成</button></footer>
  </div>`;
}

function renderSettings(motionState: "enter" | "exit" = "enter"): string {
  const appearance = state.local.appearance;
  return `<div class="modal-layer" data-action="settings-scrim" data-motion-state="${motionState}">
    <section class="settings-modal mica-acrylic-strong" role="dialog" aria-modal="true" aria-label="设置">
      <header>外观设置<button type="button" class="iconbtn" data-action="settings-close" aria-label="关闭">${icon("x", 14)}</button></header>
      <div class="settings-body">
        <h3>主题</h3>${segmented("主题", appearance.theme, [{ value: "system", label: "跟随系统" }, { value: "light", label: "亮色" }, { value: "dark", label: "暗色" }], "theme")}
        <h3>列表密度</h3>${segmented("列表密度", appearance.density, [{ value: "comfortable", label: "舒适" }, { value: "compact", label: "紧凑" }], "density")}
        <div class="settingrow"><span>毛玻璃材质</span><button type="button" class="switch" role="switch" aria-checked="${appearance.acrylic}" data-action="toggle-acrylic"><i></i></button></div>
        <h3>强调色</h3>
        <div class="swatches">${ACCENT_PRESETS.map((preset) => `<button type="button" class="swatch${appearance.accentId === preset.id ? " active" : ""}" style="background:${preset.light}" data-action="accent" data-value="${preset.id}" aria-label="${preset.label}" aria-pressed="${appearance.accentId === preset.id}">${appearance.accentId === preset.id ? "✓" : ""}</button>`).join("")}</div>
        <label class="settingrow"><span>自定义</span><input type="color" value="${escapeAttr(appearance.customAccent)}" data-color="custom" aria-label="自定义强调色" /></label>
        <button type="button" class="navbtn danger" data-action="data-clear">${icon("trash-2", 13)}清除本地设置</button>
      </div>
    </section>
  </div>`;
}

function segmented(label: string, value: string, options: { value: string; label: string }[], key: string): string {
  return `<div class="segmented" role="group" aria-label="${escapeAttr(label)}">${options.map((option) => `<button type="button" class="${value === option.value ? "active" : ""}" data-action="segment" data-key="${key}" data-value="${option.value}" aria-pressed="${value === option.value}">${option.label}</button>`).join("")}</div>`;
}

function setupVirtualList(): void {
  const container = q<HTMLElement>('[data-role="rows"][data-virtual]');
  if (!container || container.dataset.virtual === "none") {
    virtualData = [];
    pendingRowsScrollTop = null;
    return;
  }
  virtualData = pageWindow(state.models, state.page, state.pageSize).items;
  const rowPitch = virtualRowPitch();
  const spacer = q<HTMLElement>('[data-role="vspacer"]', container);
  if (spacer) spacer.style.height = `${virtualData.length * rowPitch}px`;
  container.addEventListener("scroll", scheduleVirtualRender, { passive: true });
  scheduleVirtualRender();
  if (pendingRowsScrollTop !== null) {
    const restore = pendingRowsScrollTop;
    pendingRowsScrollTop = null;
    window.requestAnimationFrame(() => {
      container.scrollTop = restore;
    });
  }
}

function scheduleVirtualRender(): void {
  if (virtualRaf) return;
  virtualRaf = window.requestAnimationFrame(() => {
    virtualRaf = 0;
    renderVirtualWindow();
  });
}

function renderVirtualWindow(): void {
  if (!virtualData.length) return;
  const container = q<HTMLElement>('[data-role="rows"][data-virtual="model"]');
  const windowNode = q<HTMLElement>('[data-role="vwindow"]', container ?? document);
  if (!container || !windowNode) return;
  const rowPitch = virtualRowPitch();
  const start = Math.max(0, Math.floor(container.scrollTop / rowPitch) - 6);
  const end = Math.min(virtualData.length, start + Math.ceil(container.clientHeight / rowPitch) + 12);
  const rows = virtualData.slice(start, end);
  windowNode.style.transform = `translateY(${start * rowPitch}px)`;
  windowNode.innerHTML = rows.map((model) => renderModelRow(model, false)).join("");
  if (virtualSelectionMotionModelId) {
    const target = q<HTMLElement>(
      `.model-row[data-model="${CSS.escape(virtualSelectionMotionModelId)}"]`,
      windowNode,
    );
    if (target) {
      const targetRect = target.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const visible = targetRect.bottom > containerRect.top && targetRect.top < containerRect.bottom;
      if (visible) virtualSelectionMotionModelId = null;
    }
  }
  hydrateLogos(windowNode);
}

function applySplit(): void {
  const split = q<HTMLElement>(".split");
  if (!split) return;
  const available = split.clientWidth;
  const ratio = canSplit() ? state.local.splitRatio : 0.5;
  const left = Math.min(available - MIN_RIGHT - SPLITTER_WIDTH, Math.max(MIN_LEFT, available * ratio));
  split.style.setProperty("--left-width", `${Math.max(MIN_LEFT, left)}px`);
}

function updateSplit(clientX: number): void {
  const split = q<HTMLElement>(".split");
  if (!split || !canSplit()) return;
  const rect = split.getBoundingClientRect();
  const available = rect.width - SPLITTER_WIDTH;
  const left = Math.min(available - MIN_RIGHT, Math.max(MIN_LEFT, clientX - rect.left));
  state.local.splitRatio = left / available;
  applySplit();
}

function stopDraggingSplit(): void {
  if (!draggingSplit) return;
  draggingSplit = false;
  document.body.classList.remove("dragging-split");
  saveLocal();
}

function hydrateLogos(root: ParentNode): void {
  logoObserver?.disconnect();
  const images = qa<HTMLImageElement>("img[data-logo]", root);
  if (!images.length) return;
  logoObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target as HTMLImageElement;
        logoObserver?.unobserve(img);
        img.src = logoUrl(img.dataset.logo!);
      }
    },
    { rootMargin: "120px" },
  );
  for (const image of images) logoObserver.observe(image);
}

function changePage(delta: number): void {
  const current = pageWindow(state.models, state.page, state.pageSize);
  const nextPage = clampPage(current.page + delta, current.totalItems, current.pageSize);
  if (nextPage === current.page) return;
  state.page = nextPage;
  state.rowsScrollTop = 0;
  render("none");
  q<HTMLElement>(`[data-focus-key="${delta < 0 ? "page-prev" : "page-next"}"]`)?.focus();
}

function changePageSize(value: number): void {
  if (!isPageSize(value)) return;
  state.page = pageAfterPageSizeChange(state.page, state.pageSize, value, state.models.length);
  state.pageSize = value;
  state.rowsScrollTop = 0;
  state.menu = null;
  state.menuSearch = "";
  render("none");
  q<HTMLElement>('[data-focus-key="page-size"]')?.focus();
}

function onClick(event: MouseEvent): void {
  const rows = q<HTMLElement>('[data-role="rows"]');
  if (rows) state.rowsScrollTop = rows.scrollTop;
  const target = event.target as HTMLElement;
  const actionNode = target.closest<HTMLElement>("[data-action]");
  if (!actionNode) {
    if (state.menu && !target.closest(".popover")) {
      state.menu = null;
      state.menuSearch = "";
      render("none");
    }
    return;
  }
  const action = actionNode.dataset.action;
  switch (action) {
    case "select-model": {
      const modelId = actionNode.dataset.model;
      const model = state.models.find((item) => item.modelId === modelId) ?? null;
      if (!model) break;
      const changed = selectedModelId() !== model.modelId;
      if (!changed && !isMobile()) break;
      if (changed) {
        state.selected = model;
        animateSelection(model.modelId);
      }
      if (isMobile()) {
        openMobileDetail();
      }
      render("none");
      break;
    }
    case "mobile-back":
      returnToMobileList();
      break;
    case "page-prev":
      changePage(-1);
      break;
    case "page-next":
      changePage(1);
      break;
    case "page-size-option":
      changePageSize(Number(actionNode.dataset.value));
      break;
    case "menu": {
      const menu = actionNode.dataset.menu as MenuId;
      state.menu = state.menu === menu ? null : menu;
      state.menuSearch = "";
      render("none");
      break;
    }
    case "menu-close":
      if (state.menu === "page-size") {
        state.menu = null;
        state.menuSearch = "";
        render("none");
        q<HTMLElement>('[data-focus-key="page-size"]')?.focus();
        break;
      }
      state.menu = null;
      state.menuSearch = "";
      render("none");
      break;
    case "menu-clear": {
      if (state.menu === "providers") patchFilters({ providerIds: [] });
      else if (state.menu === "statuses") patchFilters({ statuses: [] });
      else if (state.menu === "modalities") patchFilters({ inputModalities: [] });
      else if (state.menu === "capabilities") patchFilters({ reasoning: false, toolCall: false, structuredOutput: false, openWeights: false });
      state.menu = null;
      state.menuSearch = "";
      break;
    }
    case "filter-option": {
      const menu = actionNode.dataset.menu;
      const value = actionNode.dataset.value!;
      if (menu === "providers") {
        const list = state.query.filters.providerIds;
        patchFilters({ providerIds: list.includes(value) ? list.filter((item) => item !== value) : [...list, value] });
      } else if (menu === "statuses") {
        const list = state.query.filters.statuses;
        patchFilters({ statuses: list.includes(value) ? list.filter((item) => item !== value) : [...list, value] });
      } else if (menu === "modalities" && isModality(value)) {
        const list = state.query.filters.inputModalities;
        patchFilters({ inputModalities: list.includes(value) ? list.filter((item) => item !== value) : [...list, value] });
      } else if (menu === "capabilities") {
        const key = value as "reasoning" | "toolCall" | "structuredOutput" | "openWeights";
        patchFilters({ [key]: !state.query.filters[key] } as Partial<Filters>);
      }
      break;
    }
    case "sort": {
      const key = actionNode.dataset.key as SortKey;
      setQuery({ sortKey: key, sortDir: state.query.sortKey === key && state.query.sortDir === "asc" ? "desc" : "asc" });
      state.menu = null;
      break;
    }
    case "sort-dir":
      setQuery({ sortDir: state.query.sortDir === "asc" ? "desc" : "asc" });
      break;
    case "reset-filters":
      resetFilters();
      break;
    case "refresh":
      void loadData(true);
      break;
    case "settings":
      state.settingsOpen = !state.settingsOpen;
      state.menu = null;
      state.menuSearch = "";
      render("none");
      if (!state.settingsOpen) focusSettingsTrigger();
      break;
    case "settings-close":
      closeSettings();
      break;
    case "settings-scrim":
      if (target.closest(".settings-modal")) break;
      closeSettings();
      break;
    case "segment":
      if (actionNode.dataset.key === "theme") setAppearance({ theme: actionNode.dataset.value as ThemeMode });
      else if (actionNode.dataset.key === "density") setAppearance({ density: actionNode.dataset.value as Density });
      break;
    case "toggle-acrylic":
      setAppearance({ acrylic: !state.local.appearance.acrylic });
      break;
    case "accent":
      setAppearance({ accentId: actionNode.dataset.value as AccentId });
      break;
    case "data-clear":
      if (window.confirm("清除本机保存的外观和分栏设置？")) {
        localStorage.clear();
        state.local = { version: 2, appearance: { ...DEFAULT_APPEARANCE }, splitRatio: 0.38 };
        applyAppearance();
        closeSettings();
      }
      break;
  }
}

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  if (target.matches('[data-input="search"]')) {
    patchFilters({ search: target.value });
  } else if (target.matches('[data-input="menu-search"]')) {
    state.menuSearch = target.value;
    render("none");
  } else if (target.matches("[data-color]")) {
    setAppearance({ accentId: "custom", customAccent: target.value });
  }
}

function onKeyDown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (event.key === "/" && !typing) {
    event.preventDefault();
    q<HTMLInputElement>("#model-search")?.focus();
  }
  if (event.key === "Escape") {
    if (state.menu) {
      const closingMenu = state.menu;
      state.menu = null;
      state.menuSearch = "";
      render("none");
      if (closingMenu === "page-size") q<HTMLElement>('[data-focus-key="page-size"]')?.focus();
    } else if (state.settingsOpen) {
      closeSettings();
    } else if (state.mobileDetail) {
      returnToMobileList();
    }
  }
  if (event.key === "Tab" && state.settingsOpen) {
    const dialog = q<HTMLElement>(".settings-modal");
    if (!dialog) return;
    const focusable = qa<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
      dialog,
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
  if (typing || !state.models.length) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const currentPage = pageWindow(state.models, state.page, state.pageSize);
    const currentIndex = state.selected
      ? currentPage.items.findIndex((model) => model.modelId === state.selected!.modelId)
      : -1;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = currentIndex < 0
      ? direction > 0 ? 0 : currentPage.items.length - 1
      : currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= currentPage.items.length) return;
    const next = currentPage.items[nextIndex];
    if (next && next.modelId !== selectedModelId()) {
      state.selected = next;
      animateSelection(next.modelId);
      render("none");
      window.requestAnimationFrame(() => {
        q<HTMLElement>(`.model-row[data-model="${CSS.escape(next.modelId)}"]`)?.scrollIntoView({ block: "nearest" });
      });
    }
  } else if (event.key === "Enter" && state.selected && isMobile() && !target.closest(".pagination")) {
    openMobileDetail();
    render("none");
  }
}

function onMouseDown(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (!target.closest('[data-action="splitter"]')) return;
  event.preventDefault();
  draggingSplit = true;
  document.body.classList.add("dragging-split");
}

function onMouseMove(event: MouseEvent): void {
  if (draggingSplit) updateSplit(event.clientX);
}

function onSplitterKey(event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  if (!target.closest('[data-action="splitter"]')) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -16 : 16;
    const split = q<HTMLElement>(".split");
    if (!split) return;
    updateSplit(split.getBoundingClientRect().left + split.clientWidth * state.local.splitRatio + step);
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    state.local.splitRatio = event.key === "Home" ? 0.24 : 0.72;
    applySplit();
    saveLocal();
  }
}

function onDoubleClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (!target.closest('[data-action="splitter"]')) return;
  state.local.splitRatio = 0.38;
  applySplit();
  saveLocal();
}

function onPopState(): void {
  if (historyPushed && state.mobileDetail) {
    historyPushed = false;
    mobileBackPending = true;
    void playMobileDetailExit().then(commitMobileDetailExit);
  }
}

function init(): void {
  state.local = readLocalData();
  applyAppearance();
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keydown", onSplitterKey);
  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", stopDraggingSplit);
  document.addEventListener("dblclick", onDoubleClick);
  window.addEventListener("popstate", onPopState);
  window.addEventListener("resize", () => {
    applySplit();
    scheduleVirtualRender();
    if (!isMobile() && state.mobileDetail) {
      state.mobileDetail = false;
      render("none");
    }
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyAppearance);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void loadData();
  });
  window.setInterval(() => {
    if (!document.hidden) void loadData();
  }, 60 * 60 * 1000);
  render("startup");
  void loadData();
}

window.addEventListener("pagehide", () => {
  logoObserver?.disconnect();
  queryClient.dispose();
});

init();
