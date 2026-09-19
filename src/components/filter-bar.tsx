"use client";

import { X } from "lucide-react";
import type { Filters } from "@/lib/query-engine";
import type { Modality } from "@/lib/types";
import { Chip } from "./ui/primitives";
import { modalityLabel } from "./format";

const MODALITIES: Modality[] = ["text", "image", "pdf", "video", "audio"];
const STATUSES = [
  { value: "stable", label: "稳定" },
  { value: "beta", label: "Beta" },
  { value: "deprecated", label: "已弃用" },
];

export function FilterBar({
  filters,
  patch,
  reset,
  providers,
  families,
  activeCount,
  hidden,
}: {
  filters: Filters;
  patch: (patch: Partial<Filters>) => void;
  reset: () => void;
  providers: { id: string; name: string }[];
  families: string[];
  activeCount: number;
  hidden: boolean;
}) {
  function toggleModality(m: Modality) {
    const next = filters.inputModalities.includes(m)
      ? filters.inputModalities.filter((x) => x !== m)
      : [...filters.inputModalities, m];
    patch({ inputModalities: next });
  }

  function toggleStatus(value: string) {
    const next = filters.statuses.includes(value)
      ? filters.statuses.filter((s) => s !== value)
      : [...filters.statuses, value];
    patch({ statuses: next });
  }

  return (
    <div
      hidden={hidden}
      role="group"
      aria-label="筛选条件"
      className="scroll-thin flex flex-wrap items-center gap-1.5 px-3.5 pb-3 max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:pb-2.5"
    >
      <span
        className="inline-flex h-[27px] shrink-0 items-center gap-1.5 rounded-full border px-2.5"
        style={{
          borderColor: filters.providerId ? "var(--accent-line)" : "var(--stroke2)",
          background: filters.providerId ? "var(--accent-soft)" : "var(--fill2)",
        }}
      >
        <label className="sr-only" htmlFor="filter-provider">
          供应商筛选
        </label>
        <select
          id="filter-provider"
          value={filters.providerId}
          onChange={(e) => patch({ providerId: e.target.value })}
          className="fluent-focus max-w-[150px] cursor-pointer appearance-none bg-transparent text-[11.5px] outline-none"
          style={{ color: filters.providerId ? "var(--accent-ink)" : "var(--text2)" }}
        >
          <option value="">全部供应商</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </span>

      <span
        className="inline-flex h-[27px] shrink-0 items-center gap-1.5 rounded-full border px-2.5"
        style={{
          borderColor: filters.family ? "var(--accent-line)" : "var(--stroke2)",
          background: filters.family ? "var(--accent-soft)" : "var(--fill2)",
        }}
      >
        <label className="sr-only" htmlFor="filter-family">
          模型家族筛选
        </label>
        <select
          id="filter-family"
          value={filters.family}
          onChange={(e) => patch({ family: e.target.value })}
          className="fluent-focus max-w-[150px] cursor-pointer appearance-none bg-transparent text-[11.5px] outline-none"
          style={{ color: filters.family ? "var(--accent-ink)" : "var(--text2)" }}
        >
          <option value="">全部家族</option>
          {families.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </span>

      <span className="h-[18px] w-px shrink-0" style={{ background: "var(--stroke2)" }} aria-hidden />

      {MODALITIES.map((m) => (
        <Chip key={m} active={filters.inputModalities.includes(m)} onClick={() => toggleModality(m)}>
          {modalityLabel(m)}
        </Chip>
      ))}

      <span className="h-[18px] w-px shrink-0" style={{ background: "var(--stroke2)" }} aria-hidden />

      <Chip active={filters.reasoning} onClick={() => patch({ reasoning: !filters.reasoning })}>
        推理
      </Chip>
      <Chip active={filters.toolCall} onClick={() => patch({ toolCall: !filters.toolCall })}>
        工具调用
      </Chip>
      <Chip active={filters.structuredOutput} onClick={() => patch({ structuredOutput: !filters.structuredOutput })}>
        结构化输出
      </Chip>
      <Chip active={filters.attachment} onClick={() => patch({ attachment: !filters.attachment })}>
        附件
      </Chip>
      <Chip active={filters.openWeights} onClick={() => patch({ openWeights: !filters.openWeights })}>
        开放权重
      </Chip>

      <span className="h-[18px] w-px shrink-0" style={{ background: "var(--stroke2)" }} aria-hidden />

      {STATUSES.map((s) => (
        <Chip key={s.value} active={filters.statuses.includes(s.value)} onClick={() => toggleStatus(s.value)}>
          {s.label}
        </Chip>
      ))}

      <span className="h-[18px] w-px shrink-0" style={{ background: "var(--stroke2)" }} aria-hidden />

      <Chip active={filters.freeOnly} onClick={() => patch({ freeOnly: !filters.freeOnly })}>
        仅免费
      </Chip>
      <Chip active={filters.unpricedOnly} onClick={() => patch({ unpricedOnly: !filters.unpricedOnly })}>
        仅未标价
      </Chip>

      <span className="h-[18px] w-px shrink-0" style={{ background: "var(--stroke2)" }} aria-hidden />

      <label
        className="inline-flex h-[27px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px]"
        style={{
          borderColor: filters.maxInputPrice !== null ? "var(--accent-line)" : "var(--stroke2)",
          background: filters.maxInputPrice !== null ? "var(--accent-soft)" : "var(--fill2)",
          color: filters.maxInputPrice !== null ? "var(--accent-ink)" : "var(--text2)",
        }}
      >
        输入价 ≤
        <input
          type="number"
          min={0}
          step={0.1}
          value={filters.maxInputPrice ?? ""}
          onChange={(e) => patch({ maxInputPrice: e.target.value === "" ? null : Number(e.target.value) })}
          placeholder="任意"
          className="tnum w-14 bg-transparent text-[11.5px] outline-none"
          style={{ color: "inherit" }}
        />
      </label>

      <label
        className="inline-flex h-[27px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px]"
        style={{
          borderColor: filters.minContext !== null ? "var(--accent-line)" : "var(--stroke2)",
          background: filters.minContext !== null ? "var(--accent-soft)" : "var(--fill2)",
          color: filters.minContext !== null ? "var(--accent-ink)" : "var(--text2)",
        }}
      >
        上下文 ≥
        <select
          value={filters.minContext ?? ""}
          onChange={(e) => patch({ minContext: e.target.value === "" ? null : Number(e.target.value) })}
          className="fluent-focus cursor-pointer appearance-none bg-transparent text-[11.5px] outline-none"
          style={{ color: "inherit" }}
        >
          <option value="">任意</option>
          <option value="32768">32K</option>
          <option value="131072">128K</option>
          <option value="262144">256K</option>
          <option value="1048576">1M</option>
        </select>
      </label>

      {activeCount > 0 && (
        <Chip onClick={reset} className="ml-0.5">
          <X size={12} />
          清除 {activeCount}
        </Chip>
      )}
    </div>
  );
}
