<script setup lang="ts">
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { HistoryPoint } from "~/types/targets";

const props = defineProps<{
  points: HistoryPoint[];
  from: string;
  to: string;
  bucketSec: number;
  unit: string | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
}>();

const HEIGHT = 180;

const container = ref<HTMLDivElement>();
let chart: uPlot | undefined;
let resizeObserver: ResizeObserver | undefined;

const fromSec = computed(() => Date.parse(props.from) / 1000);
const toSec = computed(() => Date.parse(props.to) / 1000);

// One slot per bucket across the whole range. Buckets without readings stay
// null, so the line breaks at an outage instead of bridging it.
const data = computed<uPlot.AlignedData>(() => {
  const byTime = new Map(props.points.map((point) => [Date.parse(point.t) / 1000, point]));
  const xs: number[] = [];
  const avg: (number | null)[] = [];
  const max: (number | null)[] = [];
  const first = Math.floor(fromSec.value / props.bucketSec) * props.bucketSec;
  for (let t = first; t <= toSec.value; t += props.bucketSec) {
    const point = byTime.get(t);
    xs.push(t);
    avg.push(point?.avg ?? null);
    max.push(point?.max ?? null);
  }
  return [xs, avg, max];
});

const thresholds = computed(() =>
  [
    { value: props.warningThreshold, color: "--ui-warning" },
    { value: props.criticalThreshold, color: "--ui-error" },
  ].filter((line): line is { value: number; color: string } => line.value !== null)
);

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function withAlpha(hex: string, alpha: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

// Dashed horizontal line per threshold, drawn over the plot area.
function drawThresholds(u: uPlot) {
  const { ctx, bbox } = u;
  ctx.save();
  ctx.lineWidth = uPlot.pxRatio;
  ctx.setLineDash([6 * uPlot.pxRatio, 4 * uPlot.pxRatio]);
  for (const line of thresholds.value) {
    const y = Math.round(u.valToPos(line.value, "y", true));
    ctx.strokeStyle = cssVar(line.color);
    ctx.beginPath();
    ctx.moveTo(bbox.left, y);
    ctx.lineTo(bbox.left + bbox.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

// Fits the data and the threshold lines, so the lines are always visible.
function yRange(_u: uPlot, dataMin: number | null, dataMax: number | null): uPlot.Range.MinMax {
  const values = [...thresholds.value.map((line) => line.value)];
  if (dataMin !== null) values.push(dataMin);
  if (dataMax !== null) values.push(dataMax);
  if (values.length === 0) return [0, 1];
  const low = Math.min(0, ...values);
  const high = Math.max(...values);
  return [low, high === low ? low + 1 : high * 1.05];
}

function options(width: number): uPlot.Options {
  const steel = cssVar("--color-steel");
  const muted = cssVar("--ui-text-muted");
  const rule = cssVar("--ui-border");
  const font = `12px ${cssVar("--font-sans")}`;
  const format = (value: number | null) => (value === null ? "—" : formatMetricValue(value, props.unit));
  const axis = { stroke: muted, font, grid: { stroke: rule, width: 1 }, ticks: { stroke: rule, width: 1 } };

  return {
    width,
    height: HEIGHT,
    scales: {
      x: { time: true, range: () => [fromSec.value, toSec.value] },
      y: { range: yRange },
    },
    axes: [axis, { ...axis, size: 72, values: (_u, ticks) => ticks.map((tick) => format(tick)) }],
    series: [
      {},
      { label: "avg", stroke: steel, width: 1.5, value: (_u, value) => format(value) },
      { label: "max", stroke: withAlpha(steel, 0.35), width: 1, value: (_u, value) => format(value) },
    ],
    // Shades from the average up to the peak of each bucket.
    bands: [{ series: [2, 1], fill: withAlpha(steel, 0.15) }],
    cursor: { drag: { x: false, y: false } },
    hooks: { draw: [drawThresholds] },
  };
}

onMounted(() => {
  const element = container.value!;
  chart = new uPlot(options(element.clientWidth), data.value, element);
  resizeObserver = new ResizeObserver(() => chart?.setSize({ width: element.clientWidth, height: HEIGHT }));
  resizeObserver.observe(element);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.destroy();
});

watch(data, (next) => chart?.setData(next));
watch(thresholds, () => chart?.redraw());
</script>

<template>
  <div ref="container" class="metric-chart w-full" />
</template>

<style scoped>
/* uPlot's legend defaults to light-theme colours. */
.metric-chart :deep(.u-legend) {
  color: var(--ui-text-muted);
  font-size: 12px;
  text-align: left;
}
.metric-chart :deep(.u-legend .u-marker) {
  border-radius: 1px;
}
.metric-chart :deep(.u-legend .u-value) {
  color: var(--ui-text-highlighted);
  font-family: var(--font-mono);
}
</style>
