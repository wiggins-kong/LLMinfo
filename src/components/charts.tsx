"use client";

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { ScatterChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  DatasetComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ModelAggregate } from "@/lib/query-engine";
import { blendedPrice } from "@/lib/pricing";
import { formatContext } from "@/lib/normalize";

echarts.use([ScatterChart, BarChart, GridComponent, TooltipComponent, TitleComponent, DatasetComponent, CanvasRenderer]);

/**
 * Charts are drawn on the transparent host surface with a thin neutral grid and
 * a single accent hue, matching the table's low-ink language. Each chart also
 * exposes a text summary so the data is never colour-only.
 */
function useChart(
  build: () => echarts.EChartsCoreOption,
  deps: unknown[],
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const chart = echarts.init(node, undefined, { renderer: "canvas" });
    const apply = () => {
      chart.setOption(build(), true);
      chart.resize();
    };
    apply();

    const observer = new ResizeObserver(apply);
    observer.observe(node);

    // Theme and accent live in CSS variables, which canvas cannot read, so the
    // option is rebuilt whenever the resolved colours change.
    const mutation = new MutationObserver(apply);
    mutation.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });

    return () => {
      observer.disconnect();
      mutation.disconnect();
      chart.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

function palette() {
  const styles = getComputedStyle(document.documentElement);
  return {
    accent: styles.getPropertyValue("--accent").trim() || "#0f6cbd",
    text: styles.getPropertyValue("--text").trim() || "#1b1b1b",
    text3: styles.getPropertyValue("--text3").trim() || "#737373",
    stroke: styles.getPropertyValue("--stroke2").trim() || "rgba(0,0,0,.13)",
  };
}

function baseOption(title: string) {
  const p = palette();
  return {
    backgroundColor: "transparent",
    title: {
      text: title,
      left: 0,
      top: 0,
      textStyle: { color: p.text, fontSize: 12, fontWeight: 600, fontFamily: "var(--font-ui)" },
    },
    grid: { left: 64, right: 16, top: 34, bottom: 44, containLabel: false },
    tooltip: {
      trigger: "item" as const,
      backgroundColor: "rgba(20,20,20,.92)",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 11.5 },
    },
  };
}

function axisStyle(name: string) {
  const p = palette();
  return {
    name,
    nameLocation: "middle" as const,
    nameGap: 26,
    nameTextStyle: { color: p.text3, fontSize: 11 },
    axisLine: { lineStyle: { color: p.stroke } },
    axisLabel: { color: p.text3, fontSize: 11 },
    splitLine: { lineStyle: { color: p.stroke, width: 1 } },
  };
}

export function ValueScatter({ models }: { models: ModelAggregate[] }) {
  const points = useMemo(
    () =>
      models
        .filter((m) => m.best && m.context)
        .map((m) => ({
          name: m.name,
          value: [blendedPrice(m.best!.cost) ?? 0, m.context ?? 0, m.capabilityCount, m.providerCount],
        })),
    [models],
  );

  const ref = useChart(
    () => ({
      ...baseOption("性价比分布（混合价 vs 上下文）"),
      xAxis: {
        type: "value",
        ...axisStyle("混合价 USD / 百万 token"),
        min: 0,
      },
      yAxis: {
        type: "log",
        ...axisStyle("上下文 tokens"),
      },
      series: [
        {
          type: "scatter",
          symbolSize: (data: number[]) => 6 + Math.min(data[2] ?? 0, 7) * 1.6,
          itemStyle: { color: palette().accent, opacity: 0.72 },
          emphasis: { itemStyle: { opacity: 1 } },
          data: points,
        },
      ],
    }),
    [points],
  );

  return (
    <figure className="flex flex-col gap-2">
      <div ref={ref} className="h-[280px] w-full" role="img" aria-label="性价比散点图" />
      <figcaption className="text-[11px]" style={{ color: "var(--text3)" }}>
        共 {points.length} 个模型；气泡大小表示能力数量。横轴越低越便宜，纵轴越高上下文越大。
      </figcaption>
    </figure>
  );
}

export function ProviderDistribution({ models }: { models: ModelAggregate[] }) {
  const data = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of models) {
      for (const offer of model.offers) {
        counts.set(offer.providerName, (counts.get(offer.providerName) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({ name, count }));
  }, [models]);

  const ref = useChart(
    () => ({
      ...baseOption("供应商覆盖（报价数 Top 12）"),
      grid: { left: 16, right: 40, top: 34, bottom: 16, containLabel: true },
      xAxis: { type: "value", ...axisStyle("报价数") },
      yAxis: {
        type: "category",
        data: data.map((d) => d.name).reverse(),
        axisLine: { lineStyle: { color: palette().stroke } },
        axisLabel: { color: palette().text3, fontSize: 11 },
        splitLine: { show: false },
      },
      series: [
        {
          type: "bar",
          data: data.map((d) => d.count).reverse(),
          itemStyle: { color: palette().accent, opacity: 0.8, borderRadius: [0, 3, 3, 0] },
          barMaxWidth: 14,
        },
      ],
    }),
    [data],
  );

  return (
    <figure className="flex flex-col gap-2">
      <div ref={ref} className="h-[280px] w-full" role="img" aria-label="供应商分布条形图" />
      <figcaption className="text-[11px]" style={{ color: "var(--text3)" }}>
        当前筛选结果中，覆盖报价数最多的 12 家供应商。
      </figcaption>
    </figure>
  );
}

export function ContextHistogram({ models }: { models: ModelAggregate[] }) {
  const data = useMemo(() => {
    const buckets = [
      { label: "<32K", test: (v: number) => v < 32_768 },
      { label: "32K", test: (v: number) => v >= 32_768 && v < 131_072 },
      { label: "128K", test: (v: number) => v >= 131_072 && v < 262_144 },
      { label: "256K", test: (v: number) => v >= 262_144 && v < 1_048_576 },
      { label: "1M", test: (v: number) => v >= 1_048_576 && v < 10_000_000 },
      { label: "≥10M", test: (v: number) => v >= 10_000_000 },
    ];
    return buckets.map((bucket) => ({
      label: bucket.label,
      count: models.filter((m) => m.context !== null && bucket.test(m.context)).length,
    }));
  }, [models]);

  const ref = useChart(
    () => ({
      ...baseOption("上下文上限分布"),
      xAxis: {
        type: "category",
        data: data.map((d) => d.label),
        ...axisStyle("上下文窗口"),
      },
      yAxis: { type: "value", ...axisStyle("模型数") },
      series: [
        {
          type: "bar",
          data: data.map((d) => d.count),
          itemStyle: { color: palette().accent, opacity: 0.8, borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 40,
        },
      ],
    }),
    [data],
  );

  return (
    <figure className="flex flex-col gap-2">
      <div ref={ref} className="h-[280px] w-full" role="img" aria-label="上下文上限分布直方图" />
      <figcaption className="text-[11px]" style={{ color: "var(--text3)" }}>
        按最大上下文窗口分桶统计当前筛选结果，共 {models.length} 个模型。
      </figcaption>
    </figure>
  );
}

export function ChartsPanel({ models }: { models: ModelAggregate[] }) {
  const totalContext = models.reduce((sum, m) => sum + (m.context ?? 0), 0);
  void totalContext;

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
      <p className="text-[12px]" style={{ color: "var(--text3)" }}>
        以下图表随左侧筛选条件实时联动，共 {models.length} 个模型。
      </p>
      <ValueScatter models={models} />
      <ProviderDistribution models={models} />
      <ContextHistogram models={models} />
      <p className="text-[11px]" style={{ color: "var(--text3)" }}>
        价格单位为 USD / 百万 token。分布桶使用 {formatContext(1_048_576)} 作为百万级分界。
      </p>
    </div>
  );
}
