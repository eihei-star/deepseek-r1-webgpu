import { describe, expect, it } from "vitest";
import { clampPercent, formatBytes, progressFromResponse, summarizeProgress } from "./progress";

describe("progress helpers", () => {
  it("clamps invalid and overflowing percentages", () => {
    expect(clampPercent(135)).toBe(100);
    expect(clampPercent(Number.NaN)).toBeUndefined();
    expect(clampPercent(-1)).toBeUndefined();
  });

  it("normalizes zero and unknown totals without NaN", () => {
    const zero = progressFromResponse({
      type: "load-progress",
      file: "zero.bin",
      loaded: 0,
      total: 0,
      status: "progress",
    });
    const unknown = progressFromResponse({
      type: "load-progress",
      file: "unknown.bin",
      loaded: Number.NaN,
      percent: Number.NaN,
      status: "progress",
    });
    expect(zero?.percent).toBeUndefined();
    expect(unknown).toMatchObject({ loaded: 0, total: undefined, percent: undefined });
  });

  it("aggregates byte-weighted progress when all totals are known", () => {
    const summary = summarizeProgress({
      a: { file: "a", loaded: 50, total: 100, percent: 50, status: "progress" },
      b: { file: "b", loaded: 300, total: 300, percent: 100, status: "done" },
    });
    expect(summary).toMatchObject({ loaded: 350, total: 400, percent: 87.5, estimated: false, completed: 1, count: 2 });
  });

  it("marks totals as estimated when a file size is unknown", () => {
    const summary = summarizeProgress({
      a: { file: "a", loaded: 50, total: 100, percent: 50, status: "progress" },
      b: { file: "b", loaded: 0, status: "initiate" },
    });
    expect(summary.total).toBeUndefined();
    expect(summary.estimated).toBe(true);
    expect(Number.isNaN(summary.percent)).toBe(false);
  });

  it("formats bytes from zero through gigabytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(undefined)).toBe("未知");
    expect(formatBytes(Number.NaN)).toBe("未知");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });
});
