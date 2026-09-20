import * as echarts from "echarts/core";
import { BarChart, ScatterChart } from "echarts/charts";
import {
  DatasetComponent,
  GridComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { formatContext } from "../lib/normalize";
import { blendedPrice } from "../lib/pricing";
import type { ModelAggregate } from "../lib/query-engine";

echarts.use([
  ScatterChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  DatasetComponent,
  CanvasRenderer,
]);

type Chart = ReturnType<typeof echarts.init>;

const charts = new WeakMap<HTMLElement, Chart>();

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
    animation: false,
    title: {
      text: title,
      left: 0,
      top: 0,
      textStyle: { color: p.text, fontSize: 12, fontWeight: 600 },
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

function draw(node: HTMLElement, option: echarts.EChartsCoreOption): void {
  let chart = charts.get(node);
  if (!chart) {
    chart = echarts.init(node, undefined, { renderer: "canvas" });
    charts.set(node, chart);
    const observer = new ResizeObserver(() => chart?.resize());
    observer.observe(node);
  }
  chart.setOption(option, true);
  chart.resize();
}

export function valueScatter(node: HTMLElement, models: ModelAggregate[]): number {
  const points = models
    .filter((m) => m.best && m.context)
    .map((m) => ({
      name: m.name,
      value: [blendedPrice(m.best!.cost) ?? 0, m.context ?? 0, m.capabilityCount, m.providerCount],
    }));
  draw(node, {
    ...baseOption("性价比分布（混合价 vs 上下文）"),
    xAxis: { type: "value", ...axisStyle("混合价 USD / 百万 token"), min: 0 },
    yAxis: { type: "log", ...axisStyle("上下文 tokens") },
    series: [
      {
        type: "scatter",
        symbolSize: (data: number[]) => 6 + Math.min(data[2] ?? 0, 7) * 1.6,
        itemStyle: { color: palette().accent, opacity: 0.72 },
        emphasis: { itemStyle: { opacity: 1 } },
        data: points,
      },
    ],
  });
  return points.length;
}

export function providerDistribution(node: HTMLElement, models: ModelAggregate[]): void {
  const counts = new Map<string, number>();
  for (const model of models) {
    for (const offer of model.offers) counts.set(offer.providerName, (counts.get(offer.providerName) ?? 0) + 1);
  }
  const data = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));
  draw(node, {
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
  });
}

export function contextHistogram(node: HTMLElement, models: ModelAggregate[]): void {
  const buckets = [
    { label: "<32K", test: (v: number) => v < 32_768 },
    { label: "32K", test: (v: number) => v >= 32_768 && v < 131_072 },
    { label: "128K", test: (v: number) => v >= 131_072 && v < 262_144 },
    { label: "256K", test: (v: number) => v >= 262_144 && v < 1_048_576 },
    { label: "1M", test: (v: number) => v >= 1_048_576 && v < 10_000_000 },
    { label: "≥10M", test: (v: number) => v >= 10_000_000 },
  ];
  const data = buckets.map((bucket) => ({
    label: bucket.label,
    count: models.filter((m) => m.context !== null && bucket.test(m.context)).length,
  }));
  draw(node, {
    ...baseOption("上下文上限分布"),
    xAxis: { type: "category", data: data.map((d) => d.label), ...axisStyle("上下文窗口") },
    yAxis: { type: "value", ...axisStyle("模型数") },
    series: [
      {
        type: "bar",
        data: data.map((d) => d.count),
        itemStyle: { color: palette().accent, opacity: 0.8, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 40,
      },
    ],
  });
  void formatContext(1_048_576);
}

export function disposeCharts(root: ParentNode): void {
  for (const node of root.querySelectorAll<HTMLElement>("[data-chart]")) {
    charts.get(node)?.dispose();
    charts.delete(node);
  }
}
