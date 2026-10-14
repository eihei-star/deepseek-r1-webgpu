import type { ProgressStatus, WorkerResponse } from "./worker-protocol";

export type ProgressItem = {
  file: string;
  loaded: number;
  total?: number;
  percent?: number;
  status: ProgressStatus;
};

export type ProgressSummary = {
  loaded: number;
  total?: number;
  percent?: number;
  estimated: boolean;
  completed: number;
  count: number;
};

function finiteNonNegative(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function clampPercent(value: number | undefined): number | undefined {
  const finite = finiteNonNegative(value);
  return finite === undefined ? undefined : Math.min(100, finite);
}

export function progressFromResponse(response: WorkerResponse): ProgressItem | null {
  if (response.type !== "load-progress") return null;
  const loaded = finiteNonNegative(response.loaded) ?? 0;
  const total = finiteNonNegative(response.total);
  const calculated = total && total > 0 ? (loaded / total) * 100 : response.percent;
  return {
    file: response.file,
    loaded,
    total,
    percent: response.status === "done" ? 100 : clampPercent(calculated),
    status: response.status,
  };
}

export function mergeProgress(
  items: Record<string, ProgressItem>,
  item: ProgressItem,
): Record<string, ProgressItem> {
  return { ...items, [item.file]: item };
}

export function summarizeProgress(items: Record<string, ProgressItem>): ProgressSummary {
  const values = Object.values(items);
  const withTotals = values.filter((item) => item.total !== undefined && item.total > 0);
  const loaded = withTotals.reduce((sum, item) => sum + Math.min(item.loaded, item.total ?? item.loaded), 0);
  const total = withTotals.length === values.length && values.length > 0
    ? withTotals.reduce((sum, item) => sum + (item.total ?? 0), 0)
    : undefined;
  const knownPercent = values
    .map((item) => item.percent)
    .filter((value): value is number => value !== undefined);
  const percent = total && total > 0
    ? clampPercent((loaded / total) * 100)
    : knownPercent.length > 0
      ? clampPercent(knownPercent.reduce((sum, value) => sum + value, 0) / values.length)
      : undefined;
  return {
    loaded,
    total,
    percent,
    estimated: total === undefined,
    completed: values.filter((item) => item.status === "done").length,
    count: values.length,
  };
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "未知";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
