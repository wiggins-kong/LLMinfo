"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Calculator,
  Check,
  Download,
  FileJson,
  FileSpreadsheet,
  GitCompare,
  Layers,
  ListFilter,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  Star,
  SunMoon,
  Table2,
} from "lucide-react";
import { useDataset } from "@/lib/use-dataset";
import { useQueryState } from "@/lib/use-query-state";
import { useQueryWorker } from "@/lib/use-query-worker";
import { useFavorites } from "@/lib/use-favorites";
import { useCompare } from "@/lib/use-compare";
import type { ModelAggregate, SortKey } from "@/lib/query-engine";
import { downloadFile, modelsToCsv, modelsToJson, offersToCsv, offersToJson } from "@/lib/export";
import { ModelTable } from "./model-table";
import { FilterBar } from "./filter-bar";
import { DetailDrawer } from "./detail-drawer";
import { SettingsFlyout } from "./settings-flyout";
import { ComparePanel } from "./compare-panel";
import { CostCalculator } from "./cost-calculator";
import { ChartsPanel } from "./charts";
import { SegmentedControl, Spinner, ToolButton } from "./ui/primitives";
import { useAppearance } from "./appearance-provider";

type Tab = "models" | "charts" | "compare" | "favorites" | "cost";

const TABS: { id: Tab; label: string; icon: typeof Table2; desktopOnly?: boolean }[] = [
  { id: "models", label: "模型库", icon: Table2 },
  { id: "charts", label: "分析图表", icon: BarChart3, desktopOnly: true },
  { id: "compare", label: "对比", icon: GitCompare },
  { id: "favorites", label: "收藏", icon: Star },
  { id: "cost", label: "成本估算", icon: Calculator },
];

export function Dashboard({ user }: { user: { email: string; name: string | null } }) {
  const { dataset, status, loading, error, stale, refresh } = useDataset();
  const query = useQueryState();
  const favorites = useFavorites();
  const compare = useCompare();
  const { density, setDensity, acrylic, setAcrylic } = useAppearance();

  const [tab, setTab] = useState<Tab>("models");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<ModelAggregate | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const result = useQueryWorker(dataset, {
    filters: query.filters,
    sortKey: query.sortKey,
    sortDir: query.sortDir,
    view: query.view,
    blend: query.blend,
  });

  const providers = useMemo(() => {
    if (!dataset) return [];
    const map = new Map<string, string>();
    for (const offer of dataset.offers) map.set(offer.providerId, offer.providerName);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [dataset]);

  const families = useMemo(() => {
    if (!dataset) return [];
    const set = new Set<string>();
    for (const offer of dataset.offers) if (offer.family) set.add(offer.family);
    return Array.from(set).sort();
  }, [dataset]);

  const favoriteModels = useMemo(
    () => result.aggregates.filter((m) => favorites.favorites.has(m.modelId)),
    [result.aggregates, favorites.favorites],
  );

  const compareModels = useMemo(
    () =>
      compare.compare
        .map((id) => result.aggregates.find((m) => m.modelId === id))
        .filter((m): m is ModelAggregate => m !== undefined),
    [compare.compare, result.aggregates],
  );

  const visibleModels = tab === "favorites" ? favoriteModels : result.models;

  const handleSort = useCallback(
    (key: SortKey) => {
      query.setSort(key, query.sortKey === key && query.sortDir === "asc" ? "desc" : "asc");
    },
    [query],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // Keyboard shortcuts: "/" focuses search, Escape closes overlays.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        document.getElementById("model-search")?.focus();
      }
      if (event.key === "Escape") {
        if (selected) setSelected(null);
        else if (settingsOpen) setSettingsOpen(false);
        else if (exportOpen) setExportOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, settingsOpen, exportOpen]);

  const syncedLabel = status?.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
      {/* Title bar — Acrylic (transient chrome) */}
      <header
        className="mica-acrylic flex h-10 shrink-0 items-center gap-2.5 border-b pl-3.5"
        style={{ borderColor: "var(--stroke)" }}
      >
        <span
          className="grid size-5 place-items-center rounded-[6px]"
          style={{
            background: "linear-gradient(145deg, var(--accent), var(--accent-hi))",
            color: "var(--on-accent)",
            boxShadow: "var(--sh1)",
          }}
          aria-hidden
        >
          <Layers size={12} />
        </span>
        <span className="text-[12.5px] font-semibold tracking-[0.15px]">LLMinfo</span>
        <span className="hidden text-[11.5px] sm:inline" style={{ color: "var(--text3)" }}>
          · 模型信息看板
        </span>
        <span className="flex-1" />
        <span
          className="hidden items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] sm:inline-flex"
          style={{
            borderColor: "color-mix(in srgb, #0d6b3f 26%, transparent)",
            color: "#0d6b3f",
          }}
        >
          <Check size={12} />
          {stale ? "显示缓存" : `同步于 ${syncedLabel}`}
        </span>
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
          aria-label="外观设置"
          className="fluent-focus mr-1 grid size-8 place-items-center rounded-[6px] lg:hidden"
          style={{ color: "var(--text3)" }}
        >
          <SunMoon size={14} />
        </button>
      </header>

      <div
        className="shell-grid grid min-h-0 flex-1"
        style={{ gridTemplateColumns: "212px minmax(0,1fr)" }}
      >
        {/* Side navigation — Mica (long-lived surface) */}
        <nav className="shell-nav mica-acrylic flex flex-col gap-0.5 border-r p-2 pt-2.5" style={{ borderColor: "var(--stroke)" }} aria-label="主导航">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setTab(item.id)}
                className={`fluent-focus relative flex h-[38px] w-full items-center gap-2.5 rounded-[6px] border px-2.5 pl-3.5 text-left text-[13px] transition-colors ${
                  item.desktopOnly ? "desktop-only" : ""
                }`}
                style={{
                  borderColor: active ? "var(--stroke)" : "transparent",
                  background: active ? "var(--fill)" : "transparent",
                  color: active ? "var(--text)" : "var(--text2)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {active && (
                  <span
                    className="absolute left-1 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-[2px]"
                    style={{ background: "var(--accent)" }}
                    aria-hidden
                  />
                )}
                <Icon size={16} />
                {item.label}
                {item.id === "compare" && compare.compare.length > 0 && (
                  <span
                    className="ml-auto inline-flex h-[17px] min-w-[18px] items-center justify-center rounded-full border px-1.5 text-[10.5px] font-semibold"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent-ink)",
                      borderColor: "var(--accent-line)",
                    }}
                  >
                    {compare.compare.length}
                  </span>
                )}
                {item.id === "favorites" && favorites.favorites.size > 0 && (
                  <span
                    className="ml-auto inline-flex h-[17px] min-w-[18px] items-center justify-center rounded-full border px-1.5 text-[10.5px] font-semibold"
                    style={{ background: "var(--fill2)", color: "var(--text3)", borderColor: "var(--stroke2)" }}
                  >
                    {favorites.favorites.size}
                  </span>
                )}
              </button>
            );
          })}

          <div className="mt-auto flex flex-col gap-2 border-t px-1.5 pt-2.5" style={{ borderColor: "var(--stroke)" }}>
            <span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--text3)" }}>
              <span
                className="size-1.5 rounded-full"
                style={{ background: "#0d6b3f", boxShadow: "0 0 0 3px color-mix(in srgb, #0d6b3f 15%, transparent)" }}
                aria-hidden
              />
              {status?.lastError ? "上次同步失败" : "数据源正常"}
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="fluent-focus inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border text-[12px] disabled:opacity-60"
              style={{ borderColor: "var(--stroke2)", background: "var(--fill)", color: "var(--text2)" }}
            >
              {refreshing ? <Spinner /> : <RefreshCw size={14} />}
              立即同步
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              className="fluent-focus inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border text-[12px]"
              style={{ borderColor: "var(--stroke2)", background: "var(--fill)", color: "var(--text2)" }}
            >
              <Settings size={14} />
              设置
            </button>
            <span className="truncate text-[11px]" style={{ color: "var(--text3)" }} title={user.email}>
              {user.email}
            </span>
            <form action="/api/auth/sign-out" method="post">
              <button
                type="submit"
                className="fluent-focus inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[6px] border text-[12px]"
                style={{ borderColor: "var(--stroke2)", background: "var(--fill2)", color: "var(--text3)" }}
              >
                <LogOut size={13} />
                退出登录
              </button>
            </form>
          </div>

        </nav>

        {/* Main content */}
        <main className="flex min-h-0 min-w-0 flex-col">
          <div
            className="flex shrink-0 flex-wrap items-center gap-2.5 border-b px-3.5 py-3"
            style={{ borderColor: "var(--stroke)" }}
          >
            <div className="relative min-w-[170px] flex-1 sm:max-w-[330px]">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
                style={{ color: "var(--text3)" }}
                aria-hidden
              />
              <label className="sr-only" htmlFor="model-search">
                搜索模型
              </label>
              <input
                id="model-search"
                type="search"
                value={query.filters.search}
                onChange={(e) => query.setFilter("search", e.target.value)}
                placeholder="搜索模型、供应商、家族…"
                autoComplete="off"
                className="fluent-focus h-8 w-full rounded-[6px] border pr-7 pl-7.5 text-[12.5px] outline-none"
                style={{ borderColor: "var(--stroke2)", background: "var(--fill)", color: "var(--text)" }}
              />
              <span
                className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-[3px] border px-1 text-[10px]"
                style={{
                  borderColor: "var(--stroke2)",
                  background: "var(--fill2)",
                  color: "var(--text4)",
                  fontFamily: "var(--font-code)",
                }}
                aria-hidden
              >
                /
              </span>
            </div>

            {tab === "models" && (
              <SegmentedControl
                label="数据视角"
                value={query.view}
                onChange={query.setView}
                options={[
                  { value: "model", label: "模型聚合" },
                  { value: "offer", label: "供应商报价" },
                ]}
              />
            )}

            <span className="flex-1" />

            <span className="hidden text-[11.5px] tnum md:inline" style={{ color: "var(--text3)" }}>
              <b style={{ color: "var(--text2)", fontWeight: 600 }}>{result.models.length}</b> 个模型 ·{" "}
              <b style={{ color: "var(--text2)", fontWeight: 600 }}>
                {(dataset?.counts.offers ?? 0).toLocaleString()}
              </b>{" "}
              条报价
            </span>

            <ToolButton
              active={query.activeFilterCount > 0}
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
            >
              <ListFilter size={14} />
              筛选
              {query.activeFilterCount > 0 && (
                <span
                  className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]"
                  style={{ background: "var(--accent)", color: "var(--on-accent)" }}
                >
                  {query.activeFilterCount}
                </span>
              )}
            </ToolButton>

            <div className="desktop-only relative">
              <ToolButton onClick={() => setExportOpen((v) => !v)} aria-expanded={exportOpen}>
                <Download size={14} />
                导出
              </ToolButton>
              {exportOpen && (
                <div
                  className="mica-acrylic-strong absolute top-9 right-0 z-30 flex w-[190px] flex-col rounded-[8px] border p-1.5"
                  style={{ borderColor: "var(--stroke2)", boxShadow: "var(--sh2)" }}
                  role="menu"
                >
                  {[
                    {
                      label: "CSV（当前结果）",
                      icon: FileSpreadsheet,
                      run: () => {
                        const isOffer = query.view === "offer";
                        downloadFile(
                          `llminfo-${isOffer ? "offers" : "models"}-${Date.now()}.csv`,
                          isOffer ? offersToCsv(result.offers) : modelsToCsv(result.models),
                          "text/csv",
                        );
                      },
                    },
                    {
                      label: "JSON（当前结果）",
                      icon: FileJson,
                      run: () => {
                        const isOffer = query.view === "offer";
                        downloadFile(
                          `llminfo-${isOffer ? "offers" : "models"}-${Date.now()}.json`,
                          isOffer ? offersToJson(result.offers) : modelsToJson(result.models),
                          "application/json",
                        );
                      },
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          item.run();
                          setExportOpen(false);
                        }}
                        className="fluent-focus flex h-8 items-center gap-2 rounded-[6px] px-2 text-left text-[12px]"
                        style={{ color: "var(--text2)" }}
                      >
                        <Icon size={14} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {tab === "models" && (
            <FilterBar
              filters={query.filters}
              patch={query.patchFilters}
              reset={query.resetFilters}
              providers={providers}
              families={families}
              activeCount={query.activeFilterCount}
              hidden={!filtersOpen}
            />
          )}

          {error && (
            <p
              role="alert"
              className="mx-3.5 mb-2 rounded-[6px] border px-3 py-2 text-[12px]"
              style={{
                borderColor: "color-mix(in srgb, #dc2626 40%, transparent)",
                background: "color-mix(in srgb, #dc2626 10%, transparent)",
                color: "#dc2626",
              }}
            >
              {error}
            </p>
          )}

          {loading && !dataset ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <Spinner className="size-6" />
              <p className="text-[12.5px]" style={{ color: "var(--text3)" }}>
                正在载入 models.dev 数据…
              </p>
            </div>
          ) : tab === "models" || tab === "favorites" ? (
            <ModelTable
              rows={visibleModels}
              sortKey={query.sortKey}
              sortDir={query.sortDir}
              onSort={handleSort}
              onOpen={setSelected}
              favorites={favorites.favorites}
              onToggleFavorite={favorites.toggle}
              blend={query.blend}
            />
          ) : tab === "charts" ? (
            <ChartsPanel models={result.models} />
          ) : tab === "compare" ? (
            <ComparePanel
              models={compareModels}
              onRemove={compare.toggle}
              onClear={compare.clear}
            />
          ) : (
            <CostCalculator models={result.models} />
          )}

          {/* Status bar */}
          <div
            className="flex h-7 shrink-0 items-center gap-3 border-t px-3.5 text-[11px]"
            style={{ borderColor: "var(--stroke)", color: "var(--text3)" }}
          >
            <span className="tnum">
              models.dev · {result.pending ? "计算中…" : `${result.durationMs.toFixed(0)}ms`}
            </span>
            <span className="tnum">最后同步 {syncedLabel}</span>
            <span className="flex-1" />
            <span className="tnum">
              {tab === "models"
                ? `显示 ${result.models.length} / ${result.totalModels}`
                : `共 ${result.totalModels} 个模型`}
            </span>
            <span className="whitespace-nowrap">USD / 百万 token</span>
          </div>
        </main>
      </div>

      {/* Mobile tab bar — Acrylic */}
      <nav
        className="shell-tabbar mica-acrylic hidden h-[52px] shrink-0 items-stretch border-t px-1"
        style={{ borderColor: "var(--stroke)" }}
        aria-label="移动端导航"
      >
        {TABS.filter((t) => !t.desktopOnly).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => setTab(item.id)}
              className="fluent-focus flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[6px] text-[10px]"
              style={{ color: active ? "var(--accent)" : "var(--text3)" }}
            >
              <Icon size={19} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/*
        Exactly ONE appearance flyout instance. Mounting a second copy for the
        other breakpoint would register a duplicate global light-dismiss
        listener, and the hidden copy would close the visible one on click.
      */}
      {settingsOpen && (
        <div className="shell-flyout absolute z-40">
          <SettingsFlyout onClose={() => setSettingsOpen(false)} />
        </div>
      )}

      <DetailDrawer
        model={selected}
        blend={query.blend}
        isFavorite={selected ? favorites.favorites.has(selected.modelId) : false}
        onToggleFavorite={favorites.toggle}
        onClose={() => setSelected(null)}
      />

      {selected && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[25] flex justify-center px-4">
          <button
            type="button"
            onClick={() => compare.toggle(selected.modelId)}
            className="fluent-focus pointer-events-auto inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[12.5px] font-semibold"
            style={{
              borderColor: "var(--accent-line)",
              background: "var(--panel-solid)",
              color: "var(--accent-ink)",
              boxShadow: "var(--sh2)",
            }}
          >
            <GitCompare size={14} />
            {compare.compare.includes(selected.modelId) ? "从对比中移除" : "加入对比"}
            {compare.isFull && !compare.compare.includes(selected.modelId) && (
              <span className="text-[11px] font-normal" style={{ color: "var(--text3)" }}>
                （将替换最早的）
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
