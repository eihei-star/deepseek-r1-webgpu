import { describe, expect, it } from "vitest";
import { isWorkerResponse } from "./worker-protocol";

describe("isWorkerResponse", () => {
  it("accepts a complete typed response", () => {
    expect(isWorkerResponse({
      type: "generation-complete",
      requestId: "r1",
      stats: { firstTokenMs: 10, totalMs: 100, tokenCount: 3, tokensPerSecond: 30 },
    })).toBe(true);
  });

  it("rejects known types with invalid payloads", () => {
    expect(isWorkerResponse({ type: "generation-delta", requestId: "r1", text: 42, tokenCount: 2 })).toBe(false);
    expect(isWorkerResponse({ type: "load-progress", file: "x", loaded: "5", status: "progress" })).toBe(false);
    expect(isWorkerResponse({ type: "ready", cached: "yes", dtype: "q4f16" })).toBe(false);
    expect(isWorkerResponse({ type: "ready", cached: true })).toBe(false);
  });

  it("rejects unknown or non-object values", () => {
    expect(isWorkerResponse({ type: "mystery" })).toBe(false);
    expect(isWorkerResponse(null)).toBe(false);
  });
});
