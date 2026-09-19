"use client";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, Star } from "lucide-react";
import type { ModelAggregate, SortDir, SortKey } from "@/lib/query-engine";
import type { BlendWeights } from "@/lib/pricing";
import { formatPrice } from "@/lib/pricing";
import { formatContext } from "@/lib/normalize";
import { ModelTile, initialsOf, modalityLabel, shortDate } from "./format";
import { Tag } from "./ui/primitives";
import { useAppearance } from "./appearance-provider";

interface Column {
  key: SortKey | null;
  label: string;
  numeric?: boolean;
  /** Hides this column below 1440px. */
  narrow?: boolean;
}

const COLUMNS: Column[] = [
  { key: "name", label: "模型" },
  { key: "input", label: "输入", numeric: true },
  { key: "output", label: "输出", numeric: true },
  { key: "cacheRead", label: "缓存读", numeric: true, narrow: true },
  { key: "context", label: "上下文", numeric: true },
  { key: null, label: "模态 / 能力" },
  { key: "lastUpdated", label: "更新", numeric: true, narrow: true },
];

export function ModelTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  onOpen,
  favorites,
  onToggleFavorite,
}: {
  rows: ModelAggregate[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onOpen: (model: ModelAggregate) => void;
  favorites: Set<string>;
  onToggleFavorite: (modelId: string) => void;
  blend: BlendWeights;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { density } = useAppearance();
  const rowHeight = density === "compact" ? 34 : 42;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  // Row height is a user preference, so cached measurements must be dropped.
  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="tbl-head h-[34px] shrink-0 px-2"
        style={{ borderBottom: "1px solid var(--stroke2)" }}
      >
        {COLUMNS.map((column) => {
          const active = column.key !== null && sortKey === column.key;
          return (
            <button
              key={column.label}
              type="button"
              disabled={column.key === null}
              aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
              onClick={() => column.key && onSort(column.key)}
              className={`fluent-focus flex h-full items-center gap-1 rounded-[4px] px-2 text-[11.5px] font-semibold ${
                column.numeric ? "justify-end" : ""
              } ${column.narrow ? "tbl-col-cache" : ""} ${column.key === null ? "cursor-default" : ""}`}
              style={{ color: active ? "var(--text2)" : "var(--text3)" }}
            >
              {column.label}
              {column.key !== null && (
                <ArrowUpDown size={11} style={{ opacity: active ? 1 : 0, color: "var(--accent)" }} aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-auto px-2 pb-2">
        {rows.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 py-12 text-center text-[12.5px]"
            style={{ color: "var(--text3)" }}
          >
            <span>没有符合条件的模型。</span>
            <span className="text-[11.5px]">试试放宽筛选条件或清空搜索。</span>
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {virtualItems.map((item) => {
              const model = rows[item.index];
              if (!model) return null;
              return (
                <div key={model.modelId} className="absolute inset-x-0" style={{ top: item.start, height: rowHeight }}>
                  <DesktopRow
                    model={model}
                    isFavorite={favorites.has(model.modelId)}
                    onOpen={onOpen}
                    onToggleFavorite={onToggleFavorite}
                  />
                  <MobileCard
                    model={model}
                    isFavorite={favorites.has(model.modelId)}
                    onOpen={onOpen}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function rowTags(model: ModelAggregate): { label: string; tone: "neutral" | "accent" | "ok" | "warn" }[] {
  const tags: { label: string; tone: "neutral" | "accent" | "ok" | "warn" }[] = [];
  for (const m of model.inputModalities) tags.push({ label: modalityLabel(m), tone: "neutral" });
  if (model.reasoning) tags.push({ label: "推理", tone: "accent" });
  if (model.openWeights) tags.push({ label: "开放权重", tone: "ok" });
  if (model.toolCall) tags.push({ label: "工具", tone: "neutral" });
  if (model.attachment) tags.push({ label: "附件", tone: "neutral" });
  if (model.hasFree) tags.push({ label: "含免费", tone: "warn" });
  return tags;
}

function DesktopRow({
  model,
  isFavorite,
  onOpen,
  onToggleFavorite,
}: {
  model: ModelAggregate;
  isFavorite: boolean;
  onOpen: (model: ModelAggregate) => void;
  onToggleFavorite: (modelId: string) => void;
}) {
  return (
    <div className="tbl-row tbl-desktop group relative h-full rounded-[6px] border border-transparent transition-colors hover:border-[var(--stroke)] hover:bg-[var(--fill2)]">
      <div className="flex min-w-0 items-center gap-2 px-2">
        <ModelTile seed={model.family ?? model.name} label={initialsOf(model.family ?? model.name)} />
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 truncate text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            {model.name}
            {isFavorite && <Tag tone="warn">收藏</Tag>}
          </span>
          <span className="flex items-center gap-1.5 truncate text-[10.5px]" style={{ color: "var(--text3)" }}>
            <span style={{ fontFamily: "var(--font-code)" }}>{model.family ?? "—"}</span>
            <span>·</span>
            <span>{model.providerCount} 家报价</span>
            <span>·</span>
            <span className="truncate">{model.best?.providerName ?? "—"}</span>
          </span>
        </div>
      </div>

      <span className="tnum justify-self-end px-2 text-[12px] font-semibold" style={{ color: "var(--text)" }}>
        {formatPrice(model.minInput)}
      </span>
      <span className="tnum justify-self-end px-2 text-[12px]" style={{ color: "var(--text2)" }}>
        {formatPrice(model.minOutput)}
      </span>
      <span className="tnum tbl-col-cache justify-self-end px-2 text-[12px]" style={{ color: "var(--text3)" }}>
        {formatPrice(model.cacheRead)}
      </span>
      <span className="tnum justify-self-end px-2 text-[12px]" style={{ color: "var(--text3)" }}>
        {formatContext(model.context)}
      </span>
      <span className="flex max-h-[40px] flex-wrap gap-1 overflow-hidden px-2">
        {rowTags(model)
          .slice(0, 6)
          .map((tag) => (
            <Tag key={tag.label} tone={tag.tone}>
              {tag.label}
            </Tag>
          ))}
      </span>
      <span className="tnum tbl-col-updated justify-self-end px-2 text-[12px]" style={{ color: "var(--text3)" }}>
        {shortDate(model.lastUpdated)}
      </span>

      <button
        type="button"
        onClick={() => onOpen(model)}
        aria-label={`查看 ${model.name} 详情`}
        className="fluent-focus absolute inset-0 rounded-[6px]"
      />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite(model.modelId);
        }}
        aria-label={isFavorite ? `取消收藏 ${model.name}` : `收藏 ${model.name}`}
        className="fluent-focus absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-[4px] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        style={{ color: isFavorite ? "var(--accent-ink)" : "var(--text3)" }}
      >
        <Star size={13} fill={isFavorite ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

function MobileCard({
  model,
  isFavorite,
  onOpen,
}: {
  model: ModelAggregate;
  isFavorite: boolean;
  onOpen: (model: ModelAggregate) => void;
}) {
  return (
    <div className="tbl-mobile hidden h-full flex-col">
      <button
        type="button"
        onClick={() => onOpen(model)}
        className="fluent-focus flex h-full flex-col rounded-[8px] border p-3 text-left"
        style={{ borderColor: "var(--stroke)", background: "var(--fill2)", boxShadow: "var(--sh1)" }}
      >
        <span className="flex w-full items-start gap-2.5">
          <ModelTile seed={model.family ?? model.name} label={initialsOf(model.family ?? model.name)} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5 truncate text-[13px] font-semibold" style={{ color: "var(--text)" }}>
              {model.name}
              {isFavorite && <Tag tone="warn">收藏</Tag>}
            </span>
            <span className="flex items-center gap-1.5 truncate text-[10.5px]" style={{ color: "var(--text3)" }}>
              <span style={{ fontFamily: "var(--font-code)" }}>{model.family ?? "—"}</span>
              <span>·</span>
              <span>{model.providerCount} 家报价</span>
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className="tnum text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              {formatPrice(model.minInput)}
            </span>
            <span className="text-[9.5px]" style={{ color: "var(--text4)" }}>
              输入 / 百万 token
            </span>
          </span>
        </span>
        <span className="mt-2.5 grid w-full grid-cols-3 gap-2 border-t pt-2.5" style={{ borderColor: "var(--stroke)" }}>
          {[
            ["输出", formatPrice(model.minOutput)],
            ["上下文", formatContext(model.context)],
            ["缓存读", formatPrice(model.cacheRead)],
          ].map(([label, value]) => (
            <span key={label} className="flex flex-col gap-0.5">
              <span className="text-[10px]" style={{ color: "var(--text4)" }}>
                {label}
              </span>
              <span className="tnum text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                {value}
              </span>
            </span>
          ))}
        </span>
      </button>
    </div>
  );
}
