import "./styles.css";
import { parseSourceDataset } from "./lib/source-schema";
import { transformDataset } from "./lib/transform";
import { fetchSourceDataset, logoUrl, type FetchProgress } from "./lib/source";
import {
  ACCENT_PRESETS,
  DEFAULT_APPEARANCE,
  DEFAULT_QUERY,
  activeFilterCount,
  clearLocalData,
  exportLocalData,
  importLocalData,
  queryString,
  parseQueryState,
  readLocalData,
  readQueryState,
  syncUrl,
  writeLocalData,
  type AccentId,
  type AppearanceState,
  type Density,
  type LocalData,
  type QueryState,
  type SavedView,
  type ThemeMode,
} from "./lib/client-store";
import {
  aggregate,
  filterModels,
  filterOffers,
  sortModels,
  sortOffers,
  type Filters,
  type ModelAggregate,
  type SortDir,
  type SortKey,
  type ViewMode,
} from "./lib/query-engine";
import { blendedPrice, formatPrice, formatUsd, monthlyCost, type BlendWeights } from "./lib/pricing";
import { formatContext } from "./lib/normalize";
import { downloadFile, modelsToCsv, modelsToJson, offersToCsv, offersToJson } from "./lib/export";
import type { DatasetDTO, Modality, OfferDTO } from "./lib/types";
import { contextHistogram, disposeCharts, providerDistribution, valueScatter } from "./ui/charts";
import { createQueryClient } from "./lib/worker-client";
import { icon, type IconName } from "./ui/icons";
import {
  capabilityList,
  context as contextText,
  escapeAttr,
  escapeHtml,
  initialsOf,
  modalityLabel,
  price,
  shortDate,
  tile,
  usd,
} from "./ui/format";

type Tab = "models" | "charts" | "compare" | "favorites" | "cost";

interface AppState {
  tab: Tab;
  filtersOpen: boolean;
  settingsOpen: boolean;
  exportOpen: boolean;
  filtersPanelOpen: boolean;
  selected: ModelAggregate | null;
  refreshing: boolean;
  progress: FetchProgress;
  local: LocalData;
  query: QueryState;
  dataset: DatasetDTO | null;
  models: ModelAggregate[];
  offers: OfferDTO[];
  totalModels: number;
  durationMs: number;
  pending: boolean;
  error: string | null;
  cost: { inputTokens: number; outputTokens: number; cacheHitRate: number; limit: number };
}

const TABS: { id: Tab; label: string; icon: IconName; desktopOnly?: boolean }[] = [
  { id: "models", label: "模型库", icon: "table-2" },
  { id: "charts", label: "分析图表", icon: "chart-scatter", desktopOnly: true },
  { id: "compare", label: "对比", icon: "git-compare" },
  { id: "favorites", label: "收藏", icon: "star" },
  { id: "cost", label: "成本估算", icon: "calculator" },
];

const MODALITIES: Modality[] = ["text", "image", "pdf", "video", "audio"];
const STATUSES = [
  { value: "stable", label: "稳定" },
  { value: "beta", label: "Beta" },
  { value: "deprecated", label: "已弃用" },
];

const state: AppState = {
  tab: "models",
  filtersOpen: true,
  settingsOpen: false,
  exportOpen: false,
  filtersPanelOpen: false,
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
  local: { version: 1, favorites: [], savedViews: [], appearance: DEFAULT_APPEARANCE, compare: [] },
  query: DEFAULT_QUERY,
  dataset: null,
  models: [],
  offers: [],
  totalModels: 0,
  durationMs: 0,
  pending: false,
  error: null,
  cost: { inputTokens: 20_000_000, outputTokens: 5_000_000, cacheHitRate: 0.5, limit: 20 },
};

let queryTimer: number | null = null;
let logoObserver: IntersectionObserver | null = null;
const queryClient = createQueryClient();
const VIRTUAL_THRESHOLD = 120;
const VIRTUAL_ROW_HEIGHT = 42;
const VIRTUAL_MOBILE_HEIGHT = 104;

let virtualRaf = 0;
let virtualMode: "model" | "offer" | null = null;
let virtualData: ModelAggregate[] | OfferDTO[] = [];

function q<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

function qa<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

function saveLocal(): void {
  try {
    writeLocalData(state.local);
  } catch {
    // Storage can be disabled; the app still works for the current session.
  }
}

function applyAppearance(): void {
  const root = document.documentElement;
  const a = state.local.appearance;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = a.theme === "system" ? (prefersDark ? "dark" : "light") : a.theme;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
  root.dataset.density = a.density;
  root.dataset.acrylic = a.acrylic ? "on" : "off";
  const preset = ACCENT_PRESETS.find((p) => p.id === a.accentId);
  const isDark = resolved === "dark";
  const base = preset ? (isDark ? preset.dark : preset.light) : a.customAccent;
  const ink = preset ? (isDark ? preset.inkDark : preset.ink) : a.customAccent;
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
  render();
}

function setQuery(patch: Partial<QueryState>): void {
  state.query = { ...state.query, ...patch };
  syncUrl(state.query);
  scheduleQuery();
}

function patchFilters(patch: Partial<Filters>): void {
  state.query = { ...state.query, filters: { ...state.query.filters, ...patch } };
  syncUrl(state.query);
  scheduleQuery();
  render();
}

function resetFilters(): void {
  state.query = { ...state.query, filters: { ...DEFAULT_QUERY.filters } };
  syncUrl(state.query);
  scheduleQuery();
  render();
}

function scheduleQuery(): void {
  if (queryTimer !== null) window.clearTimeout(queryTimer);
  state.pending = true;
  renderStatus();
  queryTimer = window.setTimeout(() => void runQuery(), 90);
}

function renderStatus(): void {
  const node = q<HTMLElement>(".statusbar");
  if (node) node.outerHTML = renderStatusbar();
  const source = q<HTMLElement>(".source-status");
  if (source) {
    source.innerHTML = `${icon(state.progress.phase === "error" ? "triangle-alert" : "circle-check", 12)}${
      state.progress.phase === "error" ? "数据源异常" : "数据源正常"
    }`;
  }
}

async function runQuery(): Promise<void> {
  if (!state.dataset) return;
  const response = await queryClient.run({
    dataset: state.dataset,
    filters: state.query.filters,
    sortKey: state.query.sortKey,
    sortDir: state.query.sortDir,
    view: state.query.view,
    blend: state.query.blend,
  });
  state.models = response.models;
  state.offers = response.offers;
  state.totalModels = response.totalModels;
  state.durationMs = response.durationMs;
  state.pending = false;
  render();
}

function setProgress(progress: FetchProgress): void {
  state.progress = progress;
  state.error = progress.error;
  renderStatus();
}

async function loadData(manual = false): Promise<void> {
  if (state.refreshing) return;
  state.refreshing = true;
  state.error = null;
  if (manual) render();
  try {
    const result = await fetchSourceDataset(setProgress);
    const source = parseSourceDataset(result.data);
    const transformed = transformDataset(source);
    state.dataset = {
      version: transformed.contentHash,
      syncedAt: result.fetchedAt,
      offers: transformed.offers,
      counts: {
        providers: transformed.providers.length,
        models: transformed.models.length,
        offers: transformed.offers.length,
      },
    };
    state.error = null;
    void runQuery();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.error = message;
    state.progress = { ...state.progress, phase: "error", error: message, message };
  } finally {
    state.refreshing = false;
    render();
  }
}

function toggleFavorite(modelId: string): void {
  const set = new Set(state.local.favorites);
  if (set.has(modelId)) set.delete(modelId);
  else set.add(modelId);
  state.local.favorites = [...set];
  saveLocal();
  render();
}

function toggleCompare(modelId: string): void {
  const list = [...state.local.compare];
  const index = list.indexOf(modelId);
  if (index >= 0) list.splice(index, 1);
  else if (list.length < 4) list.push(modelId);
  else list.splice(0, 1, modelId);
  state.local.compare = list;
  saveLocal();
  render();
}

function saveCurrentView(): void {
  const suggested = state.query.filters.search || state.query.filters.family || `视图 ${state.local.savedViews.length + 1}`;
  const name = window.prompt("保存当前筛选视图", suggested)?.trim();
  if (!name) return;
  const view: SavedView = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    query: queryString(state.query),
    createdAt: new Date().toISOString(),
  };
  state.local.savedViews = [...state.local.savedViews.filter((v) => v.name !== name), view];
  saveLocal();
  render();
}

function applySavedView(view: SavedView): void {
  state.query = readQueryStateFromSearch(view.query);
  syncUrl(state.query);
  render();
  void runQuery();
}

function readQueryStateFromSearch(search: string): QueryState {
  const parsed = parseQueryState(search);
  return parsed;
}

function deleteSavedView(id: string): void {
  state.local.savedViews = state.local.savedViews.filter((v) => v.id !== id);
  saveLocal();
  render();
}

function providersOf(): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const offer of state.dataset?.offers ?? []) map.set(offer.providerId, offer.providerName);
  return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

function familiesOf(): string[] {
  const set = new Set<string>();
  for (const offer of state.dataset?.offers ?? []) if (offer.family) set.add(offer.family);
  return [...set].sort();
}

function favoriteModels(): ModelAggregate[] {
  const favorites = new Set(state.local.favorites);
  return state.models.filter((m) => favorites.has(m.modelId));
}

function compareModels(): ModelAggregate[] {
  const ids = state.local.compare;
  const pool = state.dataset ? aggregate(state.dataset, state.query.blend) : [];
  return ids.map((id) => pool.find((m) => m.modelId === id)).filter((m): m is ModelAggregate => Boolean(m));
}

function chip(label: string, active: boolean, action: string, extra = ""): string {
  return `<button type="button" class="chip${active ? " active" : ""}" aria-pressed="${active}" data-action="${action}" ${extra}>${label}</button>`;
}

function toolButton(label: string, iconName: IconName, action: string, active = false, extra = ""): string {
  return `<button type="button" class="toolbtn${active ? " active" : ""}" aria-pressed="${active}" data-action="${action}" ${extra}>${icon(iconName, 14)}<span>${label}</span></button>`;
}

function tag(label: string, tone = "neutral"): string {
  return `<span class="tag ${tone}">${escapeHtml(label)}</span>`;
}

function render(): void {
  applyAppearance();
  const root = document.getElementById("app");
  if (!root) return;
  disposeCharts(root);
  logoObserver?.disconnect();
  const active = document.activeElement;
  const focusId = active instanceof HTMLInputElement || active instanceof HTMLSelectElement ? active.id : null;
  const selectionStart = active instanceof HTMLInputElement ? active.selectionStart : null;
  const selectionEnd = active instanceof HTMLInputElement ? active.selectionEnd : null;
  root.innerHTML = `
    <div class="shell">
      ${renderTitlebar()}
      <div class="shell-grid">
        ${renderNav()}
        <main class="main">
          ${renderToolbar()}
          ${state.tab === "models" ? renderFilterBar() : ""}
          ${renderSavedViewsBar()}
          ${state.error ? `<p class="alert" role="alert">${icon("circle-alert", 14)}<span>${escapeHtml(state.error)}</span></p>` : ""}
          ${renderContent()}
          ${renderStatusbar()}
        </main>
      </div>
      ${renderMobileNav()}
      ${state.settingsOpen ? renderSettings() : ""}
      ${renderDrawer()}
      ${state.selected ? renderCompareAction() : ""}
      ${state.filtersPanelOpen ? renderFilterPanel() : ""}
    </div>`;
  hydrateLogos(root);
  setupVirtualList();
  if (state.tab === "charts") renderCharts();
  if (focusId) {
    const restored = document.getElementById(focusId);
    if (restored instanceof HTMLInputElement || restored instanceof HTMLSelectElement) {
      restored.focus();
      if (restored instanceof HTMLInputElement && selectionStart !== null) {
        restored.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
      }
    }
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
    <span class="brand-sub">· 模型信息看板</span>
    <span class="spacer"></span>
    <span class="sync-pill">${icon("circle-check", 12)}${escapeHtml(label)}</span>
    <button type="button" class="iconbtn mobile-only" data-action="settings" aria-label="外观设置">${icon("sun-moon", 14)}</button>
  </header>`;
}

function renderNav(): string {
  return `<nav class="nav mica-acrylic" aria-label="主导航">
    ${TABS.map((tab) => {
      const active = state.tab === tab.id;
      const count =
        tab.id === "compare" && state.local.compare.length
          ? `<span class="badge">${state.local.compare.length}</span>`
          : tab.id === "favorites" && state.local.favorites.length
            ? `<span class="badge neutral">${state.local.favorites.length}</span>`
            : "";
      return `<button type="button" class="navitem${active ? " active" : ""}${tab.desktopOnly ? " desktop-only" : ""}" data-action="tab" data-tab="${tab.id}" aria-current="${active ? "page" : "false"}">
        ${icon(tab.icon, 16)}<span>${tab.label}</span>${count}
      </button>`;
    }).join("")}
    <div class="navfoot">
      <span class="source-status">${icon(state.progress.phase === "error" ? "triangle-alert" : "circle-check", 12)}${state.progress.phase === "error" ? "数据源异常" : "数据源正常"}</span>
      <button type="button" class="navbtn" data-action="refresh" ${state.refreshing ? "disabled" : ""}>${icon(state.refreshing ? "loader-circle" : "refresh-cw", 14)}<span>${state.refreshing ? "同步中…" : "立即同步"}</span></button>
      <button type="button" class="navbtn" data-action="settings" aria-expanded="${state.settingsOpen}">${icon("settings", 14)}<span>设置</span></button>
      <span class="local-note">数据仅存本机</span>
    </div>
  </nav>`;
}

function renderSavedViews(): string {
  if (!state.local.savedViews.length) {
    return `<div class="savedviews"><span class="hint small">暂无保存视图</span><button type="button" class="chip" data-action="view-save">${icon("save", 12)}保存当前</button></div>`;
  }
  return `<div class="savedviews">
    <span class="savedlabel">保存视图</span>
    ${state.local.savedViews
      .map(
        (view) => `<span class="saveditem"><button type="button" class="chip" data-action="view-apply" data-view="${escapeAttr(view.id)}" title="${escapeAttr(view.query)}">${escapeHtml(view.name)}</button><button type="button" class="xbtn" data-action="view-delete" data-view="${escapeAttr(view.id)}" aria-label="删除视图 ${escapeAttr(view.name)}">${icon("x", 11)}</button></span>`,
      )
      .join("")}
    <button type="button" class="chip" data-action="view-save">${icon("save", 12)}保存当前</button>
  </div>`;
}

function renderToolbar(): string {
  const isModels = state.tab === "models";
  return `<div class="toolbar">
    <div class="searchwrap">
      ${icon("search", 14)}
      <label class="sr-only" for="model-search">搜索模型</label>
      <input id="model-search" type="search" value="${escapeAttr(state.query.filters.search)}" placeholder="搜索模型、供应商、家族…" autocomplete="off" data-input="search" />
      <span class="kbd">/</span>
    </div>
    ${isModels ? segmented("数据视角", state.query.view, [{ value: "model", label: "模型聚合" }, { value: "offer", label: "供应商报价" }], "view") : ""}
    <span class="spacer"></span>
    <span class="count-note">${state.models.length} 个模型 · ${(state.dataset?.counts.offers ?? 0).toLocaleString()} 条报价</span>
    ${toolButton(`筛选${activeFilterCount(state.query.filters) ? ` ${activeFilterCount(state.query.filters)}` : ""}`, "list-filter", "filters", activeFilterCount(state.query.filters) > 0, `aria-expanded="${state.filtersOpen}"`)}
    <div class="desktop-only menuwrap">
      ${toolButton("导出", "download", "export", state.exportOpen, `aria-expanded="${state.exportOpen}"`)}
      ${
        state.exportOpen
          ? `<div class="menu mica-acrylic-strong" role="menu">
              <button type="button" role="menuitem" data-action="export-csv">${icon("file-spreadsheet", 14)}CSV（当前结果）</button>
              <button type="button" role="menuitem" data-action="export-json">${icon("file-json", 14)}JSON（当前结果）</button>
            </div>`
          : ""
      }
    </div>
  </div>`;
}

function segmented(label: string, value: string, options: { value: string; label: string }[], key: string): string {
  return `<div class="segmented" role="group" aria-label="${escapeAttr(label)}">
    ${options
      .map(
        (option) =>
          `<button type="button" class="${option.value === value ? "active" : ""}" aria-pressed="${option.value === value}" data-action="segment" data-key="${key}" data-value="${option.value}">${option.label}</button>`,
      )
      .join("")}
  </div>`;
}

function renderFilterBar(): string {
  if (!state.filtersOpen) return "";
  const filters = state.query.filters;
  const providers = providersOf();
  const families = familiesOf();
  const separator = `<span class="sep" aria-hidden="true"></span>`;
  return `<div class="filterbar" role="group" aria-label="筛选条件">
    <label class="selectpill${filters.providerId ? " active" : ""}"><span class="sr-only">供应商筛选</span>
      <select data-select="providerId"><option value="">全部供应商</option>${providers.map((p) => `<option value="${escapeAttr(p.id)}"${filters.providerId === p.id ? " selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}</select>
    </label>
    <label class="selectpill${filters.family ? " active" : ""}"><span class="sr-only">模型家族筛选</span>
      <select data-select="family"><option value="">全部家族</option>${families.map((f) => `<option value="${escapeAttr(f)}"${filters.family === f ? " selected" : ""}>${escapeHtml(f)}</option>`).join("")}</select>
    </label>
    ${separator}
    ${MODALITIES.map((m) => chip(modalityLabel(m), filters.inputModalities.includes(m), "modality", `data-value="${m}"`)).join("")}
    ${separator}
    ${chip("推理", filters.reasoning, "toggle-filter", 'data-key="reasoning"')}
    ${chip("工具调用", filters.toolCall, "toggle-filter", 'data-key="toolCall"')}
    ${chip("结构化输出", filters.structuredOutput, "toggle-filter", 'data-key="structuredOutput"')}
    ${chip("附件", filters.attachment, "toggle-filter", 'data-key="attachment"')}
    ${chip("开放权重", filters.openWeights, "toggle-filter", 'data-key="openWeights"')}
    ${separator}
    ${STATUSES.map((s) => chip(s.label, filters.statuses.includes(s.value), "status", `data-value="${s.value}"`)).join("")}
    ${separator}
    ${chip("仅免费", filters.freeOnly, "toggle-filter", 'data-key="freeOnly"')}
    ${chip("仅未标价", filters.unpricedOnly, "toggle-filter", 'data-key="unpricedOnly"')}
    ${separator}
    <label class="selectpill${filters.maxInputPrice !== null ? " active" : ""}">输入价 ≤
      <input type="number" min="0" step="0.1" value="${filters.maxInputPrice ?? ""}" placeholder="任意" data-input="maxInputPrice" />
    </label>
    <label class="selectpill${filters.minContext !== null ? " active" : ""}">上下文 ≥
      <select data-select="minContext"><option value="">任意</option>${[
        [32768, "32K"],
        [131072, "128K"],
        [262144, "256K"],
        [1048576, "1M"],
      ]
        .map(([v, l]) => `<option value="${v}"${filters.minContext === v ? " selected" : ""}>${l}</option>`)
        .join("")}</select>
    </label>
    <button type="button" class="chip" data-action="filters-more">${icon("sliders-horizontal", 12)}更多筛选</button>
    ${
      activeFilterCount(filters)
        ? `<button type="button" class="chip" data-action="reset-filters">${icon("x", 12)}清除 ${activeFilterCount(filters)}</button>`
        : ""
    }
  </div>`;
}

function renderSavedViewsBar(): string {
  if (state.tab !== "models" && state.tab !== "favorites") return "";
  return renderSavedViews();
}

function renderContent(): string {
  if (state.refreshing && !state.dataset) {
    return `<div class="loading">${icon("loader-circle", 24)}<p>正在载入 models.dev 数据…</p><span>${escapeHtml(state.progress.message)}</span></div>`;
  }
  if (!state.dataset) {
    return `<div class="loading">${icon("triangle-alert", 24)}<p>尚未取得数据</p><span>检查网络后点击“立即同步”。</span><button type="button" class="navbtn" data-action="refresh">${icon("refresh-cw", 14)}重试</button></div>`;
  }
  if (state.tab === "models") {
    return state.query.view === "offer" ? renderOfferList(state.offers) : renderModelList(state.models);
  }
  if (state.tab === "favorites") return renderModelList(favoriteModels());
  if (state.tab === "charts") return renderChartsPanel();
  if (state.tab === "compare") return renderCompare();
  return renderCost();
}

function rowTags(model: ModelAggregate): string {
  const tags: string[] = [];
  for (const m of model.inputModalities) tags.push(tag(modalityLabel(m)));
  if (model.reasoning) tags.push(tag("推理", "accent"));
  if (model.openWeights) tags.push(tag("开放权重", "ok"));
  if (model.toolCall) tags.push(tag("工具"));
  if (model.attachment) tags.push(tag("附件"));
  if (model.hasFree) tags.push(tag("含免费", "warn"));
  return tags.slice(0, 6).join("");
}

function renderModelList(models: ModelAggregate[]): string {
  if (!models.length) {
    return `<div class="empty">${icon("search-x", 22)}<p>没有符合条件的模型。</p><span>试试放宽筛选条件或清空搜索。</span></div>`;
  }
  const columns: { key: SortKey | null; label: string; numeric?: boolean; narrow?: boolean }[] = [
    { key: "name", label: "模型" },
    { key: "input", label: "输入", numeric: true },
    { key: "output", label: "输出", numeric: true },
    { key: "cacheRead", label: "缓存读", numeric: true, narrow: true },
    { key: "context", label: "上下文", numeric: true },
    { key: null, label: "模态 / 能力" },
    { key: "lastUpdated", label: "更新", numeric: true, narrow: true },
  ];
  return `<div class="tablewrap">
    <div class="thead">${columns
      .map((c) => {
        const active = c.key && state.query.sortKey === c.key;
        return `<button type="button" class="th${c.numeric ? " num" : ""}${c.narrow ? " narrow" : ""}" data-action="sort" data-key="${c.key ?? ""}" ${c.key ? "" : "disabled"} aria-sort="${active ? (state.query.sortDir === "asc" ? "ascending" : "descending") : "none"}">${c.label}${c.key ? icon("arrow-up-down", 11, active ? { style: "opacity:1" } : { style: "opacity:0" }) : ""}</button>`;
      })
      .join("")}</div>
    <div class="tbody scroll-thin" data-role="rows" data-virtual="${models.length > VIRTUAL_THRESHOLD ? "model" : "none"}">
      ${
        models.length > VIRTUAL_THRESHOLD
          ? `<div class="vspacer" data-role="vspacer"></div><div class="vwindow" data-role="vwindow"></div>`
          : models.map((model) => renderModelRow(model)).join("")
      }
    </div>
  </div>`;
}

function renderModelRow(model: ModelAggregate): string {
  const favorite = state.local.favorites.includes(model.modelId);
  const provider = model.best?.providerName ?? "—";
  return `<div class="row" data-model="${escapeAttr(model.modelId)}">
    <div class="cell modelcell">
      ${logoOrTile(model.best?.providerId ?? model.modelId, model.best?.providerName ?? model.family ?? model.name, initialsOf(model.family ?? model.name), model.family ?? model.name)}
      <span class="modelmeta">
        <span class="modelname">${escapeHtml(model.name)}${favorite ? tag("收藏", "warn") : ""}</span>
        <span class="modelsub"><span class="mono">${escapeHtml(model.family ?? "—")}</span><span>·</span><span>${model.providerCount} 家报价</span><span>·</span><span class="truncate">${escapeHtml(provider)}</span></span>
      </span>
    </div>
    <span class="cell num strong">${price(model.minInput)}</span>
    <span class="cell num">${price(model.minOutput)}</span>
    <span class="cell num narrow">${price(model.cacheRead)}</span>
    <span class="cell num dim">${contextText(model.context)}</span>
    <span class="cell tags">${rowTags(model)}</span>
    <span class="cell num dim narrow">${shortDate(model.lastUpdated)}</span>
    <button type="button" class="rowopen" data-action="open" aria-label="查看 ${escapeAttr(model.name)} 详情"></button>
    <button type="button" class="favbtn" data-action="favorite" aria-label="${favorite ? "取消收藏" : "收藏"} ${escapeAttr(model.name)}" aria-pressed="${favorite}">${icon("star", 13, favorite ? { fill: "currentColor" } : {})}</button>
  </div>`;
}

function logoOrTile(providerId: string, providerName: string, label: string, seed: string, size = 26): string {
  const fallback = tile(label, seed, size);
  if (!providerId) return fallback;
  return `<span class="logowrap" style="width:${size}px;height:${size}px">${fallback}<img data-logo="${escapeAttr(providerId)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" onerror="this.remove()" /></span>`;
}

function renderOfferList(offers: OfferDTO[]): string {
  if (!offers.length) return `<div class="empty">${icon("search-x", 22)}<p>没有符合条件的报价。</p></div>`;
  return `<div class="offers scroll-thin" data-role="rows" data-virtual="${offers.length > VIRTUAL_THRESHOLD ? "offer" : "none"}">
    ${
      offers.length > VIRTUAL_THRESHOLD
        ? `<div class="vspacer" data-role="vspacer"></div><div class="vwindow" data-role="vwindow"></div>`
        : offers.map((offer) => renderOfferRow(offer)).join("")
    }
  </div>`;
}

function renderOfferRow(offer: OfferDTO): string {
  return `<div class="offerrow">
    ${logoOrTile(offer.providerId, offer.providerName, initialsOf(offer.providerName), offer.providerName)}
    <span class="offerprovider"><b>${escapeHtml(offer.providerName)}</b><span>${escapeHtml(offer.name)} · <span class="mono">${escapeHtml(offer.modelId)}</span></span></span>
    <span class="num strong">${price(offer.cost.input)}</span>
    <span class="num">${price(offer.cost.output)}</span>
    <span class="num dim">${contextText(offer.limits.context)}</span>
    <span class="tags">${offer.reasoning ? tag("推理", "accent") : ""}${offer.openWeights ? tag("开放权重", "ok") : ""}${offer.hasTieredPricing ? tag("阶梯价", "warn") : ""}</span>
  </div>`;
}

function setupVirtualList(): void {
  const container = q<HTMLElement>('[data-role="rows"][data-virtual]');
  if (!container) {
    virtualMode = null;
    virtualData = [];
    return;
  }
  const mode = container.dataset.virtual as "model" | "offer" | "none";
  if (mode === "none") {
    virtualMode = null;
    virtualData = [];
    return;
  }
  virtualMode = mode;
  virtualData = mode === "model" ? state.models : state.offers;
  const mobile = window.matchMedia("(max-width: 1023px)").matches;
  const rowHeight = mobile ? VIRTUAL_MOBILE_HEIGHT : VIRTUAL_ROW_HEIGHT;
  const spacer = q<HTMLElement>('[data-role="vspacer"]', container);
  if (spacer) spacer.style.height = `${virtualData.length * rowHeight}px`;
  container.addEventListener("scroll", scheduleVirtualRender, { passive: true });
  scheduleVirtualRender();
}

function scheduleVirtualRender(): void {
  if (virtualRaf) return;
  virtualRaf = window.requestAnimationFrame(() => {
    virtualRaf = 0;
    renderVirtualWindow();
  });
}

function renderVirtualWindow(): void {
  if (!virtualMode) return;
  const container = q<HTMLElement>('[data-role="rows"][data-virtual]');
  const windowNode = q<HTMLElement>('[data-role="vwindow"]', container ?? document);
  if (!container || !windowNode) return;
  const mobile = window.matchMedia("(max-width: 1023px)").matches;
  const rowHeight = mobile ? VIRTUAL_MOBILE_HEIGHT : VIRTUAL_ROW_HEIGHT;
  const start = Math.max(0, Math.floor(container.scrollTop / rowHeight) - 6);
  const end = Math.min(virtualData.length, start + Math.ceil(container.clientHeight / rowHeight) + 12);
  windowNode.style.transform = `translateY(${start * rowHeight}px)`;
  windowNode.innerHTML =
    virtualMode === "model"
      ? (virtualData as ModelAggregate[]).slice(start, end).map(renderModelRow).join("")
      : (virtualData as OfferDTO[]).slice(start, end).map(renderOfferRow).join("");
  hydrateLogos(windowNode);
}

function renderChartsPanel(): string {
  return `<div class="panel scroll-thin">
    <p class="hint">以下图表随筛选条件实时联动，共 ${state.models.length} 个模型。</p>
    <figure><div class="chart" data-chart="scatter" role="img" aria-label="性价比散点图"></div><figcaption data-caption="scatter"></figcaption></figure>
    <figure><div class="chart" data-chart="providers" role="img" aria-label="供应商分布条形图"></div><figcaption>当前筛选结果中，覆盖报价数最多的 12 家供应商。</figcaption></figure>
    <figure><div class="chart" data-chart="context" role="img" aria-label="上下文上限分布直方图"></div><figcaption>按最大上下文窗口分桶统计当前筛选结果，共 ${state.models.length} 个模型。</figcaption></figure>
    <p class="hint small">价格单位为 USD / 百万 token。</p>
  </div>`;
}

function renderCharts(): void {
  const models = state.models;
  const scatter = q<HTMLElement>('[data-chart="scatter"]');
  const providers = q<HTMLElement>('[data-chart="providers"]');
  const context = q<HTMLElement>('[data-chart="context"]');
  if (scatter) {
    const count = valueScatter(scatter, models);
    const caption = q('[data-caption="scatter"]');
    if (caption) caption.textContent = `共 ${count} 个模型；气泡大小表示能力数量。横轴越低越便宜，纵轴越高上下文越大。`;
  }
  if (providers) providerDistribution(providers, models);
  if (context) contextHistogram(context, models);
}

function renderCompare(): string {
  const models = compareModels();
  if (!models.length) {
    return `<div class="empty">${icon("git-compare", 24)}<p>还没有选择要对比的模型</p><span>在模型库中打开详情，再点击「加入对比」，最多 4 个。</span></div>`;
  }
  const rows: { label: string; value: (m: ModelAggregate) => string; better?: "higher" | "lower"; numeric?: (m: ModelAggregate) => number | null }[] = [
    { label: "家族", value: (m) => m.family ?? "—" },
    { label: "供应商数", value: (m) => String(m.providerCount) },
    { label: "输入价", value: (m) => price(m.minInput), better: "lower", numeric: (m) => m.minInput },
    { label: "输出价", value: (m) => price(m.minOutput), better: "lower", numeric: (m) => m.minOutput },
    { label: "缓存读", value: (m) => price(m.cacheRead), better: "lower", numeric: (m) => m.cacheRead },
    { label: "最大上下文", value: (m) => contextText(m.context), better: "higher", numeric: (m) => m.context },
    { label: "最大输出", value: (m) => contextText(m.outputLimit), better: "higher", numeric: (m) => m.outputLimit },
    { label: "能力数", value: (m) => String(m.capabilityCount), better: "higher", numeric: (m) => m.capabilityCount },
    { label: "推理", value: (m) => (m.reasoning ? "✓" : "–") },
    { label: "工具调用", value: (m) => (m.toolCall ? "✓" : "–") },
    { label: "结构化输出", value: (m) => (m.structuredOutput ? "✓" : "–") },
    { label: "开放权重", value: (m) => (m.openWeights ? "✓" : "–") },
    { label: "输入模态", value: (m) => m.inputModalities.map(modalityLabel).join(" / ") || "—" },
    { label: "发布日", value: (m) => m.releaseDate ?? "—" },
    { label: "更新日", value: (m) => m.lastUpdated ?? "—" },
  ];
  return `<div class="panel scroll-thin">
    <div class="compare-head"><p class="hint">并排对比 ${models.length} 个模型，最优值已标注。</p><button type="button" class="chip" data-action="compare-clear">清空</button></div>
    <div class="table-scroll"><table class="compare"><thead><tr><th>指标</th>${models
      .map(
        (m) => `<th>${tile(initialsOf(m.family ?? m.name), m.family ?? m.name, 22)}<span><b>${escapeHtml(m.name)}</b><small>${escapeHtml(m.best?.providerName ?? "—")}</small></span><button type="button" class="xbtn" data-action="compare-toggle" data-model="${escapeAttr(m.modelId)}" aria-label="移除">${icon("x", 12)}</button></th>`,
      )
      .join("")}</tr></thead><tbody>${rows
      .map((row) => {
        let best: number | null = null;
        if (row.better && row.numeric) {
          const values = models.map((m) => row.numeric!(m)).filter((v): v is number => v !== null);
          if (values.length > 1) best = row.better === "lower" ? Math.min(...values) : Math.max(...values);
        }
        return `<tr><th>${row.label}</th>${models
          .map((m) => {
            const numeric = row.numeric?.(m) ?? null;
            const isBest = best !== null && numeric === best;
            return `<td class="${isBest ? "best" : ""}">${escapeHtml(row.value(m))}</td>`;
          })
          .join("")}</tr>`;
      })
      .join("")}</tbody></table></div>
  </div>`;
}

function renderCost(): string {
  const models = state.models;
  const cost = state.cost;
  const results = models
    .map((model) => {
      const offer = model.best;
      if (!offer) return null;
      const breakdown = monthlyCost(offer.cost, {
        inputTokens: cost.inputTokens,
        outputTokens: cost.outputTokens,
        cacheHitRate: cost.cacheHitRate,
      });
      if (breakdown.total === null) return null;
      return { model, offer, breakdown };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => (a.breakdown.total ?? 0) - (b.breakdown.total ?? 0));
  const shown = results.slice(0, cost.limit);
  const max = shown.length ? (shown[shown.length - 1].breakdown.total ?? 1) : 1;
  return `<div class="panel scroll-thin">
    <div class="cost-controls">
      <label>月输入 tokens<input type="number" min="0" step="1000000" value="${cost.inputTokens}" data-cost="inputTokens" /></label>
      <label>月输出 tokens<input type="number" min="0" step="1000000" value="${cost.outputTokens}" data-cost="outputTokens" /></label>
      <label>缓存命中率 ${(cost.cacheHitRate * 100).toFixed(0)}%<input type="range" min="0" max="100" step="5" value="${cost.cacheHitRate * 100}" data-cost="cacheHitRate" /></label>
      <div class="presets">${[
        ["轻度", 2_000_000, 500_000],
        ["中度", 20_000_000, 5_000_000],
        ["重度", 200_000_000, 50_000_000],
      ]
        .map(([label, input, output]) => `<button type="button" class="chip" data-action="cost-preset" data-input="${input}" data-output="${output}">${label}</button>`)
        .join("")}</div>
    </div>
    <p class="hint">按每个模型的最低报价供应商估算，单位为 USD。缓存未标价时按输入价计费。</p>
    <div class="costlist">${shown
      .map(
        ({ model, offer, breakdown }) => `<div class="costrow">${tile(initialsOf(model.family ?? model.name), model.family ?? model.name, 22)}
          <span class="costmeta"><b>${escapeHtml(model.name)}</b><small>${escapeHtml(offer.providerName)} · 输入 ${usd(breakdown.inputCost)} · 缓存 ${usd(breakdown.cacheCost)} · 输出 ${usd(breakdown.outputCost)}</small><span class="bar"><i style="width:${Math.max(2, ((breakdown.total ?? 0) / max) * 100)}%"></i></span></span>
          <b class="num">${usd(breakdown.total)}</b></div>`,
      )
      .join("")}</div>
    ${!results.length ? `<div class="empty"><p>当前筛选结果中没有可估算价格的模型。</p></div>` : ""}
    ${results.length > cost.limit ? `<button type="button" class="chip" data-action="cost-more">显示更多（${shown.length} / ${results.length}）</button>` : ""}
  </div>`;
}

function renderStatusbar(): string {
  const synced = state.dataset?.syncedAt
    ? new Date(state.dataset.syncedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "—";
  return `<div class="statusbar">
    <span class="num">models.dev · ${state.pending ? "计算中…" : `${state.durationMs.toFixed(0)}ms`}</span>
    <span class="num">最后同步 ${synced}</span>
    <span class="spacer"></span>
    <span class="num">${state.tab === "models" ? `显示 ${state.models.length} / ${state.totalModels}` : `共 ${state.totalModels} 个模型`}</span>
    <span>USD / 百万 token</span>
  </div>`;
}

function renderMobileNav(): string {
  return `<nav class="mobilenav mica-acrylic" aria-label="移动端导航">${TABS.filter((t) => !t.desktopOnly)
    .map((tab) => {
      const active = state.tab === tab.id;
      return `<button type="button" class="${active ? "active" : ""}" data-action="tab" data-tab="${tab.id}" aria-current="${active ? "page" : "false"}">${icon(tab.icon, 19)}<span>${tab.label}</span></button>`;
    })
    .join("")}</nav>`;
}

function renderSettings(): string {
  const a = state.local.appearance;
  return `<div class="flyout mica-acrylic-strong" role="dialog" aria-label="设置">
    <h3>主题</h3>${segmented("主题", a.theme, [{ value: "system", label: "跟随系统" }, { value: "light", label: "亮色" }, { value: "dark", label: "暗色" }], "theme")}
    <h3>表格密度</h3>${segmented("表格密度", a.density, [{ value: "comfortable", label: "舒适" }, { value: "compact", label: "紧凑" }], "density")}
    <div class="settingrow"><span>毛玻璃材质</span><button type="button" class="switch" role="switch" aria-checked="${a.acrylic}" data-action="toggle-acrylic"><i></i></button></div>
    <h3>强调色</h3>
    <div class="swatches">${ACCENT_PRESETS.map(
      (p) => `<button type="button" class="swatch${a.accentId === p.id ? " active" : ""}" style="background:${p.light}" data-action="accent" data-value="${p.id}" aria-label="${p.label}" aria-pressed="${a.accentId === p.id}">${a.accentId === p.id ? "✓" : ""}</button>`,
    ).join("")}</div>
    <label class="settingrow"><span>自定义</span><input type="color" value="${escapeAttr(a.customAccent)}" data-color="custom" aria-label="自定义强调色" /></label>
    <h3>本地数据</h3>
    <p class="hint small">收藏、保存视图、外观与对比保存在浏览器中。</p>
    <div class="buttonrow">
      <button type="button" class="navbtn" data-action="data-export">${icon("upload", 13)}导出</button>
      <button type="button" class="navbtn" data-action="data-import">${icon("download", 13)}导入</button>
    </div>
    <button type="button" class="navbtn danger" data-action="data-clear">${icon("trash-2", 13)}清除本地数据</button>
    <input type="file" accept="application/json,.json" data-role="import-file" hidden />
    <button type="button" class="navbtn" data-action="settings-close">关闭</button>
  </div>`;
}

function renderDrawer(): string {
  const model = state.selected;
  const open = Boolean(model);
  return `<div class="scrim" data-action="drawer-close" style="opacity:${open ? 1 : 0};visibility:${open ? "visible" : "hidden"}"></div>
  <aside class="drawer mica-acrylic-strong" data-open="${open}" aria-hidden="${!open}" aria-label="模型详情">
    ${model ? drawerContent(model) : ""}
  </aside>`;
}

function drawerContent(model: ModelAggregate): string {
  const favorite = state.local.favorites.includes(model.modelId);
  const ranked = [...model.offers]
    .filter((o) => o.cost.input !== null || o.cost.output !== null)
    .sort((a, b) => (a.cost.input ?? 0) * 3 + (a.cost.output ?? 0) - ((b.cost.input ?? 0) * 3 + (b.cost.output ?? 0)));
  const cheapest = ranked[0] ?? null;
  const best = model.best;
  return `<header class="drawerhead">
    ${tile(initialsOf(model.family ?? model.name), model.family ?? model.name, 38)}
    <div><h2>${escapeHtml(model.name)}</h2><div class="drawersub">${tag(model.family ?? "未分类", "accent")}<span>${model.providerCount} 家报价</span><span>·</span><span>更新 ${escapeHtml(model.lastUpdated ?? "—")}</span>${model.statuses.map((s) => tag(s, "warn")).join("")}</div></div>
    <button type="button" class="iconbtn" data-action="favorite" data-model="${escapeAttr(model.modelId)}" aria-pressed="${favorite}" aria-label="${favorite ? "取消收藏" : "收藏"}">${icon("star", 15, favorite ? { fill: "currentColor" } : {})}</button>
    <button type="button" class="iconbtn" data-action="drawer-close" aria-label="关闭详情">${icon("x", 15)}</button>
  </header>
  <div class="drawerbody scroll-thin">
    <section><h3>概览 <small class="mono">${escapeHtml(model.modelId)}</small></h3><p>${escapeHtml(best?.description || "上游未提供描述。")}</p></section>
    <section><h3>关键指标</h3><dl class="statgrid">
      ${[
        ["最低输入价", price(model.minInput), "/M"],
        ["最低输出价", price(model.minOutput), "/M"],
        ["缓存读", price(model.cacheRead), "/M"],
        ["最大上下文", contextText(model.context), ""],
        ["报价供应商", String(model.providerCount), "家"],
        ["最近更新", model.lastUpdated ?? "—", ""],
      ]
        .map(([label, value, unit]) => `<div><dt>${label}</dt><dd class="num">${escapeHtml(value)}${unit ? `<small>${unit}</small>` : ""}</dd></div>`)
        .join("")}
    </dl></section>
    <section><h3>跨供应商比价 <small>USD / 百万 token</small></h3>
      <div class="offerhead"><span>供应商</span><span>输入</span><span>输出</span><span>上下文</span></div>
      ${ranked
        .slice(0, 24)
        .map(
          (offer) => `<div class="offerline${cheapest?.providerId === offer.providerId ? " cheapest" : ""}">
            <span>${cheapest?.providerId === offer.providerId ? icon("check", 11) : ""}${escapeHtml(offer.providerName)}</span>
            <span class="num">${price(offer.cost.input)}</span><span class="num">${price(offer.cost.output)}</span><span class="num">${contextText(offer.limits.context)}</span>
          </div>`,
        )
        .join("")}
      ${ranked.length > 24 ? `<p class="hint small">仅显示最便宜的 24 家，共 ${ranked.length} 家。</p>` : ""}
    </section>
    ${
      best?.hasTieredPricing
        ? `<section><h3>阶梯价</h3><div class="tiers">
            ${best.cost.context_over_200k ? `<div>上下文超过 200K：输入 ${price(best.cost.context_over_200k.input)} / 输出 ${price(best.cost.context_over_200k.output)}</div>` : ""}
            ${(best.cost.tiers ?? []).map((tier) => `<div>${tier.tier.type === "context" ? "上下文" : escapeHtml(tier.tier.type)} ≥ ${contextText(tier.tier.size)}：输入 ${price(tier.input)} / 输出 ${price(tier.output)}</div>`).join("")}
          </div></section>`
        : ""
    }
    <section><h3>能力</h3><div class="caps">${[
      ["推理", model.reasoning],
      ["工具调用", model.toolCall],
      ["结构化输出", model.structuredOutput],
      ["附件", model.attachment],
      ["温度", model.temperature],
      ["交错思考", model.interleaved],
      ["开放权重", model.openWeights],
    ]
      .map(([label, enabled]) => `<span class="${enabled ? "on" : ""}">${enabled ? "✓" : "–"} ${label}</span>`)
      .join("")}</div></section>
    <section><h3>输入模态</h3><div class="caps">${model.inputModalities.map((m) => `<span class="on">${modalityLabel(m)}</span>`).join("")}</div></section>
    ${
      best
        ? `<section><h3>接入片段 <small>${escapeHtml(best.providerName)}</small></h3><pre># 环境变量
${best.providerEnv.map((e) => `${e}=...`).join("\n") || "（上游未声明）"}

# 基础地址
${best.providerApi ?? "（上游未声明）"}

import { createOpenAI } from "@ai-sdk/openai";

const provider = createOpenAI({
  baseURL: "${best.providerApi ?? "https://api.example.com/v1"}",
  apiKey: process.env.${best.providerEnv[0] ?? "LLM_API_KEY"},
});

const model = provider("${model.modelId}");</pre></section>`
        : ""
    }
    <section><h3>原始信息</h3><dl class="rawgrid">${[
      ["模型 ID", model.modelId],
      ["家族", model.family ?? "—"],
      ["发布日", model.releaseDate ?? "—"],
      ["更新日", model.lastUpdated ?? "—"],
      ["最大输出", contextText(model.outputLimit)],
      ["能力数", String(model.capabilityCount)],
    ]
      .map(([label, value]) => `<div><dt>${label}</dt><dd title="${escapeAttr(value)}">${escapeHtml(value)}</dd></div>`)
      .join("")}</dl><p class="hint small">能力标签：${escapeHtml(capabilityList(model).join("、") || "—")}</p></section>
  </div>`;
}

function renderCompareAction(): string {
  const model = state.selected!;
  const included = state.local.compare.includes(model.modelId);
  const full = state.local.compare.length >= 4;
  return `<div class="compare-action"><button type="button" class="primary" data-action="compare-toggle" data-model="${escapeAttr(model.modelId)}">${icon("git-compare", 14)}${included ? "从对比中移除" : "加入对比"}${!included && full ? '<span>（将替换最早的）</span>' : ""}</button></div>`;
}

function renderFilterPanel(): string {
  const f = state.query.filters;
  const number = (key: keyof Filters, label: string, step = "1") =>
    `<label class="field"><span>${label}</span><input type="number" min="0" step="${step}" value="${f[key] ?? ""}" data-filter="${String(key)}" /></label>`;
  return `<div class="modal-scrim" data-action="filters-close"></div>
  <div class="filterpanel mica-acrylic-strong" role="dialog" aria-label="更多筛选">
    <header><h2>更多筛选</h2><button type="button" class="iconbtn" data-action="filters-close" aria-label="关闭">${icon("x", 15)}</button></header>
    <div class="filtergrid">
      ${number("minInputPrice", "最低输入价", "0.1")}
      ${number("maxInputPrice", "最高输入价", "0.1")}
      ${number("minContext", "最小上下文", "1000")}
      ${number("maxContext", "最大上下文", "1000")}
      ${number("minOutputLimit", "最小输出上限", "1000")}
      <label class="field"><span>知识截止 ≥</span><input type="month" value="${f.knowledgeAfter ?? ""}" data-filter="knowledgeAfter" /></label>
      <label class="field"><span>发布日期 ≥</span><input type="date" value="${f.releasedAfter ?? ""}" data-filter="releasedAfter" /></label>
      <label class="field"><span>更新日期 ≥</span><input type="date" value="${f.updatedAfter ?? ""}" data-filter="updatedAfter" /></label>
    </div>
    <div class="filterchecks">
      ${chip("温度", f.temperature, "toggle-filter", 'data-key="temperature"')}
      ${chip("交错思考", f.interleaved, "toggle-filter", 'data-key="interleaved"')}
    </div>
    <footer><button type="button" class="navbtn" data-action="reset-filters">重置全部</button><button type="button" class="primary" data-action="filters-close">完成</button></footer>
  </div>`;
}

function bindGlobalListeners(): void {
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", onKeyDown);
}

function onClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const actionNode = target.closest<HTMLElement>("[data-action]");
  if (!actionNode) {
    if (state.exportOpen && !target.closest(".menuwrap")) {
      state.exportOpen = false;
      render();
    }
    return;
  }
  const action = actionNode.dataset.action;
  switch (action) {
    case "tab":
      state.tab = actionNode.dataset.tab as Tab;
      state.settingsOpen = false;
      state.exportOpen = false;
      render();
      break;
    case "refresh":
      void loadData(true);
      break;
    case "settings":
      state.settingsOpen = !state.settingsOpen;
      state.exportOpen = false;
      render();
      break;
    case "settings-close":
      state.settingsOpen = false;
      render();
      break;
    case "filters":
      state.filtersOpen = !state.filtersOpen;
      render();
      break;
    case "filters-more":
      state.filtersPanelOpen = true;
      render();
      break;
    case "filters-close":
      state.filtersPanelOpen = false;
      render();
      break;
    case "export":
      state.exportOpen = !state.exportOpen;
      render();
      break;
    case "export-csv": {
      const isOffer = state.query.view === "offer";
      downloadFile(
        `llminfo-${isOffer ? "offers" : "models"}-${Date.now()}.csv`,
        isOffer ? offersToCsv(state.offers) : modelsToCsv(state.models),
        "text/csv",
      );
      state.exportOpen = false;
      render();
      break;
    }
    case "export-json": {
      const isOffer = state.query.view === "offer";
      downloadFile(
        `llminfo-${isOffer ? "offers" : "models"}-${Date.now()}.json`,
        isOffer ? offersToJson(state.offers) : modelsToJson(state.models),
        "application/json",
      );
      state.exportOpen = false;
      render();
      break;
    }
    case "segment":
      if (actionNode.dataset.key === "view") setQuery({ view: actionNode.dataset.value as ViewMode });
      else if (actionNode.dataset.key === "theme") setAppearance({ theme: actionNode.dataset.value as ThemeMode });
      else if (actionNode.dataset.key === "density") setAppearance({ density: actionNode.dataset.value as Density });
      break;
    case "toggle-filter": {
      const key = actionNode.dataset.key as keyof Filters;
      patchFilters({ [key]: !state.query.filters[key] } as Partial<Filters>);
      break;
    }
    case "modality": {
      const value = actionNode.dataset.value as Modality;
      const current = state.query.filters.inputModalities;
      patchFilters({ inputModalities: current.includes(value) ? current.filter((m) => m !== value) : [...current, value] });
      break;
    }
    case "status": {
      const value = actionNode.dataset.value!;
      const current = state.query.filters.statuses;
      patchFilters({ statuses: current.includes(value) ? current.filter((s) => s !== value) : [...current, value] });
      break;
    }
    case "reset-filters":
      resetFilters();
      break;
    case "sort": {
      const key = actionNode.dataset.key as SortKey;
      setQuery({ sortKey: key, sortDir: state.query.sortKey === key && state.query.sortDir === "asc" ? "desc" : "asc" });
      break;
    }
    case "open": {
      const row = actionNode.closest<HTMLElement>("[data-model]");
      const modelId = row?.dataset.model;
      const model =
        state.models.find((m) => m.modelId === modelId) ??
        (state.dataset ? aggregate(state.dataset, state.query.blend).find((m) => m.modelId === modelId) : undefined) ??
        null;
      state.selected = model;
      render();
      break;
    }
    case "drawer-close":
      state.selected = null;
      render();
      break;
    case "favorite": {
      const row = actionNode.closest<HTMLElement>("[data-model]");
      const modelId = actionNode.dataset.model ?? row?.dataset.model;
      if (modelId) toggleFavorite(modelId);
      break;
    }
    case "compare-toggle": {
      const modelId = actionNode.dataset.model ?? state.selected?.modelId;
      if (modelId) toggleCompare(modelId);
      break;
    }
    case "compare-clear":
      state.local.compare = [];
      saveLocal();
      render();
      break;
    case "cost-preset":
      state.cost.inputTokens = Number(actionNode.dataset.input);
      state.cost.outputTokens = Number(actionNode.dataset.output);
      render();
      break;
    case "cost-more":
      state.cost.limit += 20;
      render();
      break;
    case "toggle-acrylic":
      setAppearance({ acrylic: !state.local.appearance.acrylic });
      break;
    case "accent":
      setAppearance({ accentId: actionNode.dataset.value as AccentId });
      break;
    case "data-export":
      downloadFile(`llminfo-local-${Date.now()}.json`, exportLocalData(state.local), "application/json");
      break;
    case "data-import":
      q<HTMLInputElement>('[data-role="import-file"]')?.click();
      break;
    case "data-clear":
      if (window.confirm("清除本机保存的收藏、视图、外观与对比数据？此操作不可撤销。")) {
        clearLocalData();
        state.local = { version: 1, favorites: [], savedViews: [], appearance: { ...DEFAULT_APPEARANCE }, compare: [] };
        state.settingsOpen = false;
        render();
      }
      break;
    case "view-save":
      saveCurrentView();
      break;
    case "view-apply": {
      const view = state.local.savedViews.find((v) => v.id === actionNode.dataset.view);
      if (view) applySavedView(view);
      break;
    }
    case "view-delete":
      if (actionNode.dataset.view) deleteSavedView(actionNode.dataset.view);
      break;
  }
}

function onChange(event: Event): void {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target.matches("[data-select]")) {
    const key = target.dataset.select as keyof Filters;
    const value = target.value;
    const numericKeys = ["minContext"];
    patchFilters({
      [key]: value === "" ? null : numericKeys.includes(String(key)) ? Number(value) : value,
    } as Partial<Filters>);
    return;
  }
  if (target.matches("[data-filter]")) {
    const key = target.dataset.filter as keyof Filters;
    const raw = target.value;
    const numericKeys = ["minInputPrice", "maxInputPrice", "minContext", "maxContext", "minOutputLimit"];
    patchFilters({ [key]: raw === "" ? null : numericKeys.includes(String(key)) ? Number(raw) : raw } as Partial<Filters>);
    return;
  }
  if (target.matches("[data-cost]")) {
    const key = target.dataset.cost as "inputTokens" | "outputTokens" | "cacheHitRate";
    state.cost[key] = key === "cacheHitRate" ? Number(target.value) / 100 : Math.max(0, Number(target.value));
    render();
    return;
  }
  if (target.matches('[data-role="import-file"]')) {
    if (!(target instanceof HTMLInputElement)) return;
    const file = target.files?.[0];
    if (!file) return;
    void file.text().then((text: string) => {
      try {
        const imported = importLocalData(text);
        if (!window.confirm("导入将整体替换当前本地数据，继续？")) return;
        state.local = imported;
        saveLocal();
        applyAppearance();
        render();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : String(error));
      }
    });
  }
}

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  if (target.matches('[data-input="search"]')) {
    patchFilters({ search: target.value });
  } else if (target.matches('[data-input="maxInputPrice"]')) {
    patchFilters({ maxInputPrice: target.value === "" ? null : Number(target.value) });
  } else if (target.matches("[data-cost]")) {
    const key = target.dataset.cost as "inputTokens" | "outputTokens" | "cacheHitRate";
    state.cost[key] = key === "cacheHitRate" ? Number(target.value) / 100 : Math.max(0, Number(target.value));
  } else if (target.matches("[data-color]")) {
    setAppearance({ accentId: "custom", customAccent: target.value });
  }
}

function onKeyDown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if (event.key === "/" && !typing) {
    event.preventDefault();
    q<HTMLInputElement>("#model-search")?.focus();
  }
  if (event.key === "Escape") {
    if (state.selected) state.selected = null;
    else if (state.filtersPanelOpen) state.filtersPanelOpen = false;
    else if (state.settingsOpen) state.settingsOpen = false;
    else if (state.exportOpen) state.exportOpen = false;
    render();
  }
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
  for (const img of images) logoObserver.observe(img);
}

function init(): void {
  state.local = readLocalData();
  state.query = readQueryState();
  applyAppearance();
  bindGlobalListeners();
  render();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyAppearance);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void loadData();
  });
  window.setInterval(() => {
    if (!document.hidden) void loadData();
  }, 60 * 60 * 1000);
  void loadData();
}

window.addEventListener("pagehide", () => {
  disposeCharts(document);
  logoObserver?.disconnect();
});

init();
