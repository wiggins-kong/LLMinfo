"use client";

import { useMemo, useState } from "react";
import type { ModelAggregate } from "@/lib/query-engine";
import { monthlyCost, formatUsd } from "@/lib/pricing";
import { ModelTile, initialsOf } from "./format";

const PRESETS = [
  { label: "轻度", input: 2_000_000, output: 500_000 },
  { label: "中度", input: 20_000_000, output: 5_000_000 },
  { label: "重度", input: 200_000_000, output: 50_000_000 },
];

export function CostCalculator({ models }: { models: ModelAggregate[] }) {
  const [inputTokens, setInputTokens] = useState(20_000_000);
  const [outputTokens, setOutputTokens] = useState(5_000_000);
  const [cacheHitRate, setCacheHitRate] = useState(0.5);
  const [limit, setLimit] = useState(20);

  const results = useMemo(() => {
    return models
      .map((model) => {
        // Use each model's cheapest offer, which is the provider a user would
        // actually pick at this price point.
        const offer = model.best;
        if (!offer) return null;
        const breakdown = monthlyCost(offer.cost, { inputTokens, outputTokens, cacheHitRate });
        if (breakdown.total === null) return null;
        return { model, offer, breakdown };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => (a.breakdown.total ?? 0) - (b.breakdown.total ?? 0))
      .slice(0, limit);
  }, [models, inputTokens, outputTokens, cacheHitRate, limit]);

  const maxTotal = results.length ? (results[results.length - 1].breakdown.total ?? 1) : 1;

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px]" style={{ color: "var(--text3)" }}>
            月输入 tokens
          </span>
          <input
            type="number"
            min={0}
            step={1_000_000}
            value={inputTokens}
            onChange={(e) => setInputTokens(Math.max(0, Number(e.target.value)))}
            className="tnum fluent-focus h-8 w-[132px] rounded-[6px] border px-2.5 text-[12.5px] outline-none"
            style={{ borderColor: "var(--stroke2)", background: "var(--fill)", color: "var(--text)" }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px]" style={{ color: "var(--text3)" }}>
            月输出 tokens
          </span>
          <input
            type="number"
            min={0}
            step={1_000_000}
            value={outputTokens}
            onChange={(e) => setOutputTokens(Math.max(0, Number(e.target.value)))}
            className="tnum fluent-focus h-8 w-[132px] rounded-[6px] border px-2.5 text-[12.5px] outline-none"
            style={{ borderColor: "var(--stroke2)", background: "var(--fill)", color: "var(--text)" }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px]" style={{ color: "var(--text3)" }}>
            缓存命中率 {(cacheHitRate * 100).toFixed(0)}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={cacheHitRate * 100}
            onChange={(e) => setCacheHitRate(Number(e.target.value) / 100)}
            className="fluent-focus h-8 w-[140px]"
            aria-label="缓存命中率"
          />
        </label>

        <div className="flex gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setInputTokens(preset.input);
                setOutputTokens(preset.output);
              }}
              className="fluent-focus h-8 rounded-[6px] border px-2.5 text-[11.5px]"
              style={{ borderColor: "var(--stroke2)", background: "var(--fill2)", color: "var(--text2)" }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--text3)" }}>
        按每个模型的最低报价供应商估算，单位为 USD。缓存未标价时按输入价计费；未包含阶梯价与批处理折扣。
      </p>

      <div className="flex flex-col gap-1.5">
        {results.map(({ model, offer, breakdown }) => (
          <div
            key={model.modelId}
            className="flex items-center gap-3 rounded-[6px] border p-2.5"
            style={{ borderColor: "var(--stroke)", background: "var(--fill2)" }}
          >
            <ModelTile seed={model.family ?? model.name} label={initialsOf(model.family ?? model.name)} size={22} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12.5px] font-semibold" style={{ color: "var(--text)" }}>
                {model.name}
              </span>
              <span className="truncate text-[10.5px]" style={{ color: "var(--text3)" }}>
                {offer.providerName} · 输入 {formatUsd(breakdown.inputCost, 2)} · 缓存{" "}
                {formatUsd(breakdown.cacheCost, 2)} · 输出 {formatUsd(breakdown.outputCost, 2)}
              </span>
              <span
                className="mt-1 h-1 w-full overflow-hidden rounded-full"
                style={{ background: "var(--stroke)" }}
                aria-hidden
              >
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(2, ((breakdown.total ?? 0) / maxTotal) * 100)}%`,
                    background: "var(--accent)",
                  }}
                />
              </span>
            </span>
            <span className="tnum shrink-0 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              {formatUsd(breakdown.total, 2)}
            </span>
          </div>
        ))}
        {results.length === 0 && (
          <p className="py-8 text-center text-[12.5px]" style={{ color: "var(--text3)" }}>
            当前筛选结果中没有可估算价格的模型。
          </p>
        )}
      </div>

      {models.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((v) => v + 20)}
          className="fluent-focus self-start rounded-[6px] border px-3 py-1.5 text-[11.5px]"
          style={{ borderColor: "var(--stroke2)", color: "var(--text2)" }}
        >
          显示更多（已显示 {results.length} / {models.length}）
        </button>
      )}
    </div>
  );
}
