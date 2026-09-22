import { formatContext } from "../lib/normalize";
import type { Modality, OfferDTO } from "../lib/types";
import type { ModelAggregate } from "../lib/query-engine";

export const MODALITY_LABEL: Record<Modality, string> = {
  text: "文本",
  image: "图像",
  pdf: "PDF",
  video: "视频",
  audio: "音频",
};

export function modalityLabel(modality: Modality): string {
  return MODALITY_LABEL[modality] ?? modality;
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
  if (!parts.length) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const TONE_STYLES = [
  ["#0f6cbd", "#ffffff"],
  ["#c2410c", "#ffffff"],
  ["#0f766e", "#ffffff"],
  ["#6d28d9", "#ffffff"],
  ["#a16207", "#ffffff"],
  ["#be123c", "#ffffff"],
] as const;

export function toneOf(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) % 997;
  return hash % TONE_STYLES.length;
}

export function tileStyle(seed: string): string {
  const [background, color] = TONE_STYLES[toneOf(seed)];
  return `background:${background};color:${color}`;
}

export function tile(label: string, seed: string, size = 26): string {
  return `<span class="tile" style="${tileStyle(seed)};width:${size}px;height:${size}px;font-size:${
    size <= 26 ? 13 : 17
  }px">${escapeHtml(label)}</span>`;
}

export function context(value: number | null): string {
  return formatContext(value);
}

export function capabilityList(model: ModelAggregate | OfferDTO): string[] {
  const list: string[] = [];
  if (model.reasoning) list.push("推理");
  if (model.toolCall) list.push("工具调用");
  if (model.structuredOutput) list.push("结构化输出");
  if (model.attachment) list.push("附件");
  if (model.temperature) list.push("温度");
  if (model.interleaved) list.push("交错思考");
  if (model.openWeights) list.push("开放权重");
  return list;
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}
