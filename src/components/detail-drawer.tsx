"use client";

import { useEffect, useRef } from "react";
import { X, Check, Star } from "lucide-react";
import type { ModelAggregate } from "@/lib/query-engine";
import type { BlendWeights } from "@/lib/pricing";
import { formatPrice } from "@/lib/pricing";
import { formatContext } from "@/lib/normalize";
import {
  ModelTile,
  capabilityList,
  contextText,
  initialsOf,
  modalityLabel,
  shortDate,
} from "./format";
import { Tag } from "./ui/primitives";

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3
        className="flex items-baseline justify-between gap-2 text-[11px] font-bold tracking-[0.6px] uppercase"
        style={{ color: "var(--text4)" }}
      >
        {title}
        {meta && (
          <span className="text-[11px] font-medium normal-case tracking-normal" style={{ color: "var(--text3)" }}>
            {meta}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

export function DetailDrawer({
  model,
  blend,
  isFavorite,
  onToggleFavorite,
  onClose,
}: {
  model: ModelAggregate | null;
  blend: BlendWeights;
  isFavorite: boolean;
  onToggleFavorite: (modelId: string) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = model !== null;

  // Escape closes; focus moves into the panel so keyboard users are not stranded.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const ranked = model
    ? [...model.offers]
        .filter((o) => o.cost.input !== null || o.cost.output !== null)
        .sort((a, b) => {
          const av = (a.cost.input ?? 0) * 3 + (a.cost.output ?? 0);
          const bv = (b.cost.input ?? 0) * 3 + (b.cost.output ?? 0);
          if (av !== bv) return av - bv;
          return a.providerName.localeCompare(b.providerName);
        })
    : [];

  const cheapest = ranked[0] ?? null;

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 z-[15] transition-opacity duration-200"
        style={{
          background: "color-mix(in srgb, #000 38%, transparent)",
          opacity: open ? 1 : 0,
          visibility: open ? "visible" : "hidden",
        }}
      />
      <aside
        aria-label="模型详情"
        data-open={open ? "true" : "false"}
        aria-hidden={!open}
        className="mica-acrylic-strong absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l transition-transform duration-250 sm:w-[430px]"
        style={{
          borderColor: "var(--stroke2)",
          boxShadow: "var(--sh2)",
          transform: open ? "none" : "translateX(102%)",
          visibility: open ? "visible" : "hidden",
          transitionTimingFunction: "var(--ease-fluent)",
        }}
      >
        {model && (
          <>
            <header
              className="flex items-start gap-3 border-b p-4"
              style={{ borderColor: "var(--stroke)" }}
            >
              <ModelTile seed={model.family ?? model.name} label={initialsOf(model.family ?? model.name)} size={38} />
              <div className="min-w-0 flex-1">
                <h2 className="text-[16px] leading-tight font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  {model.name}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px]" style={{ color: "var(--text3)" }}>
                  <Tag tone="accent">{model.family ?? "未分类"}</Tag>
                  <span>{model.providerCount} 家报价</span>
                  <span>·</span>
                  <span>更新 {model.lastUpdated ?? "—"}</span>
                  {model.statuses.map((s) => (
                    <Tag key={s} tone="warn">
                      {s}
                    </Tag>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleFavorite(model.modelId)}
                aria-pressed={isFavorite}
                aria-label={isFavorite ? "取消收藏" : "收藏"}
                className="fluent-focus grid size-8 shrink-0 place-items-center rounded-[6px] transition-colors"
                style={{ color: isFavorite ? "var(--accent-ink)" : "var(--text3)" }}
              >
                <Star size={15} fill={isFavorite ? "currentColor" : "none"} />
              </button>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="关闭详情"
                className="fluent-focus grid size-8 shrink-0 place-items-center rounded-[6px]"
                style={{ color: "var(--text3)" }}
              >
                <X size={15} />
              </button>
            </header>

            <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pb-6">
              {model.best && (
                <Section title="概览" meta={model.modelId}>
                  <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--text2)" }}>
                    {model.best.description || "上游未提供描述。"}
                  </p>
                </Section>
              )}

              <Section title="关键指标">
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { label: "最低输入价", value: formatPrice(model.minInput), unit: "/M" },
                    { label: "最低输出价", value: formatPrice(model.minOutput), unit: "/M" },
                    { label: "缓存读", value: formatPrice(model.cacheRead), unit: "/M" },
                    { label: "最大上下文", value: contextText(model.context) },
                    { label: "报价供应商", value: String(model.providerCount), unit: "家" },
                    { label: "最近更新", value: model.lastUpdated ?? "—" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="flex flex-col gap-0.5 rounded-[6px] border p-2.5"
                      style={{ borderColor: "var(--stroke)", background: "var(--fill2)" }}
                    >
                      <dt className="text-[10.5px]" style={{ color: "var(--text4)" }}>
                        {stat.label}
                      </dt>
                      <dd className="tnum m-0 text-[13px]" style={{ color: "var(--text)" }}>
                        {stat.value}
                        {stat.unit && (
                          <span className="ml-0.5 text-[10px]" style={{ color: "var(--text3)" }}>
                            {stat.unit}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Section>

              <Section title="跨供应商比价" meta="USD / 百万 token">
                <div
                  className="grid gap-1.5 px-1.5 pb-1 text-[10.5px]"
                  style={{ gridTemplateColumns: "minmax(0,1.6fr) 62px 62px 70px", color: "var(--text4)" }}
                  aria-hidden
                >
                  <span>供应商</span>
                  <span className="text-right">输入</span>
                  <span className="text-right">输出</span>
                  <span className="text-right">上下文</span>
                </div>
                <div className="flex flex-col">
                  {ranked.slice(0, 24).map((offer) => {
                    const isCheapest = cheapest?.providerId === offer.providerId;
                    return (
                      <div
                        key={offer.providerId}
                        className="grid h-[30px] items-center gap-1.5 rounded-[4px] px-1.5 text-[12px]"
                        style={{
                          gridTemplateColumns: "minmax(0,1.6fr) 62px 62px 70px",
                          background: isCheapest ? "var(--accent-soft)" : undefined,
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-1.5" style={{ color: "var(--text2)" }}>
                          {isCheapest && <Check size={11} style={{ color: "#0d6b3f" }} />}
                          <span className="truncate">{offer.providerName}</span>
                        </span>
                        <span
                          className="tnum text-right text-[11.5px]"
                          style={{ color: isCheapest ? "var(--text)" : "var(--text2)", fontWeight: isCheapest ? 600 : 400 }}
                        >
                          {formatPrice(offer.cost.input)}
                        </span>
                        <span className="tnum text-right text-[11.5px]" style={{ color: "var(--text2)" }}>
                          {formatPrice(offer.cost.output)}
                        </span>
                        <span className="tnum text-right text-[11.5px]" style={{ color: "var(--text2)" }}>
                          {formatContext(offer.limits.context)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {ranked.length > 24 && (
                  <p className="text-[11px]" style={{ color: "var(--text3)" }}>
                    仅显示最便宜的 24 家，共 {ranked.length} 家。
                  </p>
                )}
              </Section>

              {model.best && model.best.hasTieredPricing && (
                <Section title="阶梯价">
                  <div className="flex flex-col gap-1.5 text-[11.5px]" style={{ color: "var(--text2)" }}>
                    {model.best.cost.context_over_200k && (
                      <div className="rounded-[6px] border p-2.5" style={{ borderColor: "var(--stroke)" }}>
                        上下文超过 200K：输入 {formatPrice(model.best.cost.context_over_200k.input)} / 输出{" "}
                        {formatPrice(model.best.cost.context_over_200k.output)}
                      </div>
                    )}
                    {model.best.cost.tiers?.map((tier) => (
                      <div
                        key={`${tier.tier.type}-${tier.tier.size}`}
                        className="rounded-[6px] border p-2.5"
                        style={{ borderColor: "var(--stroke)" }}
                      >
                        {tier.tier.type === "context" ? "上下文" : tier.tier.type} ≥{" "}
                        {formatContext(tier.tier.size)}：输入 {formatPrice(tier.input)} / 输出{" "}
                        {formatPrice(tier.output)}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="能力">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ["推理", model.reasoning],
                    ["工具调用", model.toolCall],
                    ["结构化输出", model.structuredOutput],
                    ["附件", model.attachment],
                    ["温度", model.temperature],
                    ["交错思考", model.interleaved],
                    ["开放权重", model.openWeights],
                  ].map(([label, enabled]) => (
                    <span
                      key={String(label)}
                      className="inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px]"
                      style={{
                        borderColor: enabled ? "var(--accent-line)" : "var(--stroke2)",
                        background: enabled ? "var(--accent-soft)" : "var(--fill2)",
                        color: enabled ? "var(--accent-ink)" : "var(--text3)",
                      }}
                    >
                      {enabled ? "✓" : "–"} {String(label)}
                    </span>
                  ))}
                </div>
              </Section>

              <Section title="输入模态">
                <div className="flex flex-wrap gap-1.5">
                  {model.inputModalities.map((m) => (
                    <span
                      key={m}
                      className="inline-flex h-6 items-center rounded-full border px-2.5 text-[11.5px]"
                      style={{
                        borderColor: "var(--accent-line)",
                        background: "var(--accent-soft)",
                        color: "var(--accent-ink)",
                      }}
                    >
                      {modalityLabel(m)}
                    </span>
                  ))}
                </div>
              </Section>

              {model.best && (
                <Section title="接入片段" meta={model.best.providerName}>
                  <pre
                    className="scroll-thin overflow-x-auto rounded-[8px] border p-3 text-[11.5px] leading-relaxed"
                    style={{
                      borderColor: "var(--stroke)",
                      background: "color-mix(in srgb, #000 22%, transparent)",
                      fontFamily: "var(--font-code)",
                      color: "var(--text2)",
                    }}
                  >
{`# 环境变量
${model.best.providerEnv.map((e) => `${e}=...`).join("\n") || "（上游未声明）"}

# 基础地址
${model.best.providerApi ?? "（上游未声明）"}

# AI SDK
import { createOpenAI } from "@ai-sdk/openai";

const provider = createOpenAI({
  baseURL: "${model.best.providerApi ?? "https://api.example.com/v1"}",
  apiKey: process.env.${model.best.providerEnv[0] ?? "LLM_API_KEY"},
});

const model = provider("${model.modelId}");`}
                  </pre>
                </Section>
              )}

              <Section title="原始信息">
                <dl className="grid grid-cols-2 gap-2 text-[11.5px]">
                  {[
                    ["模型 ID", model.modelId],
                    ["家族", model.family ?? "—"],
                    ["发布日", model.releaseDate ?? "—"],
                    ["更新日", model.lastUpdated ?? "—"],
                    ["最大输出", contextText(model.outputLimit)],
                    ["能力数", String(model.capabilityCount)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <dt style={{ color: "var(--text4)" }}>{label}</dt>
                      <dd className="tnum m-0 truncate" style={{ color: "var(--text2)" }} title={String(value)}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-[11px]" style={{ color: "var(--text3)" }}>
                  能力标签：{capabilityList(model).join("、") || "—"}
                </p>
              </Section>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
