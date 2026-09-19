"use client";

import { X } from "lucide-react";
import type { ModelAggregate } from "@/lib/query-engine";
import { formatPrice } from "@/lib/pricing";
import { formatContext } from "@/lib/normalize";
import { ModelTile, initialsOf, modalityLabel } from "./format";

interface Row {
  label: string;
  value: (m: ModelAggregate) => string;
  /** Larger is better; used to highlight the winning cell. */
  better?: "higher" | "lower";
  numeric?: (m: ModelAggregate) => number | null;
}

const ROWS: Row[] = [
  { label: "家族", value: (m) => m.family ?? "—" },
  { label: "供应商数", value: (m) => String(m.providerCount) },
  { label: "输入价", value: (m) => formatPrice(m.minInput), better: "lower", numeric: (m) => m.minInput },
  { label: "输出价", value: (m) => formatPrice(m.minOutput), better: "lower", numeric: (m) => m.minOutput },
  { label: "缓存读", value: (m) => formatPrice(m.cacheRead), better: "lower", numeric: (m) => m.cacheRead },
  { label: "最大上下文", value: (m) => formatContext(m.context), better: "higher", numeric: (m) => m.context },
  { label: "最大输出", value: (m) => formatContext(m.outputLimit), better: "higher", numeric: (m) => m.outputLimit },
  { label: "能力数", value: (m) => String(m.capabilityCount), better: "higher", numeric: (m) => m.capabilityCount },
  { label: "推理", value: (m) => (m.reasoning ? "✓" : "–") },
  { label: "工具调用", value: (m) => (m.toolCall ? "✓" : "–") },
  { label: "结构化输出", value: (m) => (m.structuredOutput ? "✓" : "–") },
  { label: "开放权重", value: (m) => (m.openWeights ? "✓" : "–") },
  { label: "输入模态", value: (m) => m.inputModalities.map(modalityLabel).join(" / ") || "—" },
  { label: "发布日", value: (m) => m.releaseDate ?? "—" },
  { label: "更新日", value: (m) => m.lastUpdated ?? "—" },
];

export function ComparePanel({
  models,
  onRemove,
  onClear,
}: {
  models: ModelAggregate[];
  onRemove: (modelId: string) => void;
  onClear: () => void;
}) {
  if (models.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
        <p className="text-[13px]" style={{ color: "var(--text2)" }}>
          还没有选择要对比的模型
        </p>
        <p className="max-w-[420px] text-[11.5px]" style={{ color: "var(--text3)" }}>
          在模型库中点击任意模型打开详情，再点击「加入对比」即可并排比较，最多 4 个。
        </p>
      </div>
    );
  }

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px]" style={{ color: "var(--text3)" }}>
          并排对比 {models.length} 个模型，差异项已标注最优值。
        </p>
        <button
          type="button"
          onClick={onClear}
          className="fluent-focus rounded-[6px] border px-2.5 py-1 text-[11.5px]"
          style={{ borderColor: "var(--stroke2)", color: "var(--text2)" }}
        >
          清空
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-[132px] p-2 text-left text-[11px] font-semibold"
                style={{ color: "var(--text4)", background: "var(--panel-solid)" }}
              >
                指标
              </th>
              {models.map((model) => (
                <th key={model.modelId} scope="col" className="min-w-[150px] p-2 text-left align-top">
                  <span className="flex items-start gap-2">
                    <ModelTile
                      seed={model.family ?? model.name}
                      label={initialsOf(model.family ?? model.name)}
                      size={22}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[12.5px] font-semibold" style={{ color: "var(--text)" }}>
                        {model.name}
                      </span>
                      <span className="truncate text-[10.5px]" style={{ color: "var(--text3)" }}>
                        {model.best?.providerName ?? "—"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(model.modelId)}
                      aria-label={`从对比中移除 ${model.name}`}
                      className="fluent-focus ml-auto grid size-5 place-items-center rounded-[4px]"
                      style={{ color: "var(--text3)" }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              // Highlight the best cell only when the row is comparable.
              let bestValue: number | null = null;
              if (row.better && row.numeric) {
                const values = models
                  .map((m) => row.numeric!(m))
                  .filter((v): v is number => v !== null);
                if (values.length > 1) {
                  bestValue = row.better === "lower" ? Math.min(...values) : Math.max(...values);
                }
              }

              return (
                <tr key={row.label} style={{ borderTop: "1px solid var(--stroke)" }}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 p-2 text-left text-[11.5px] font-medium"
                    style={{ color: "var(--text4)", background: "var(--panel-solid)" }}
                  >
                    {row.label}
                  </th>
                  {models.map((model) => {
                    const numeric = row.numeric?.(model) ?? null;
                    const isBest = bestValue !== null && numeric === bestValue;
                    return (
                      <td
                        key={model.modelId}
                        className="tnum p-2"
                        style={{
                          color: isBest ? "var(--accent-ink)" : "var(--text2)",
                          fontWeight: isBest ? 600 : 400,
                          background: isBest ? "var(--accent-soft)" : undefined,
                        }}
                      >
                        {row.value(model)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
