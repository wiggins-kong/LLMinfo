"use client";

import type { Modality, OfferDTO } from "@/lib/types";
import { formatContext } from "@/lib/normalize";
import { blendedPrice, formatPrice, type BlendWeights } from "@/lib/pricing";
import type { ModelAggregate } from "@/lib/query-engine";

export const MODALITY_LABEL: Record<Modality, string> = {
  text: "文本",
  image: "图像",
  pdf: "PDF",
  video: "视频",
  audio: "音频",
};

export function modalityLabel(m: Modality): string {
  return MODALITY_LABEL[m] ?? m;
}

export function shortDate(value: string | null): string {
  return value ? value.slice(5).replace("-", "/") : "—";
}

export function initialsOf(value: string): string {
  const parts = value
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const TONE_COUNT = 6;

/** Deterministic hue per family so a model keeps the same tile colour. */
export function toneOf(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  }
  return hash % TONE_COUNT;
}

const TONE_STYLES = [
  { bg: "#0f6cbd", fg: "#ffffff" },
  { bg: "#c2410c", fg: "#ffffff" },
  { bg: "#0f766e", fg: "#ffffff" },
  { bg: "#6d28d9", fg: "#ffffff" },
  { bg: "#a16207", fg: "#ffffff" },
  { bg: "#be123c", fg: "#ffffff" },
];

export function tileStyle(seed: string): React.CSSProperties {
  const tone = TONE_STYLES[toneOf(seed)];
  return { background: tone.bg, color: tone.fg };
}

export function ModelTile({
  seed,
  label,
  size = 26,
}: {
  seed: string;
  label: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[6px] font-semibold"
      style={{
        ...tileStyle(seed),
        width: size,
        height: size,
        fontSize: size <= 26 ? 11 : 15,
        fontFamily: "var(--font-display)",
        letterSpacing: "-0.3px",
        boxShadow: "var(--sh1)",
      }}
    >
      {label}
    </span>
  );
}

export function modelPrice(agg: ModelAggregate, blend: BlendWeights) {
  return {
    input: agg.minInput,
    output: agg.minOutput,
    cacheRead: agg.cacheRead,
    context: agg.context,
    blended: agg.best ? blendedPrice(agg.best.cost, blend) : null,
    provider: agg.best?.providerName ?? "—",
  };
}

export function offerBlendedText(offer: OfferDTO, blend: BlendWeights): string {
  return formatPrice(blendedPrice(offer.cost, blend));
}

export function contextText(value: number | null): string {
  return formatContext(value);
}

export function capabilityList(offer: OfferDTO | ModelAggregate): string[] {
  const list: string[] = [];
  if (offer.reasoning) list.push("推理");
  if (offer.toolCall) list.push("工具调用");
  if (offer.structuredOutput) list.push("结构化输出");
  if (offer.attachment) list.push("附件");
  if (offer.temperature) list.push("温度");
  if (offer.interleaved) list.push("交错思考");
  if (offer.openWeights) list.push("开放权重");
  return list;
}
