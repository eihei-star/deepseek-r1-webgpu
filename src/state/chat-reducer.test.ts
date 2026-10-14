import { describe, expect, it } from "vitest";
import type { ChatMessage, GenerationStats } from "../lib/worker-protocol";
import { canGenerate, canTransition, chatReducer, initialChatState, type ChatState } from "./chat-reducer";

const stats: GenerationStats = { firstTokenMs: 20, totalMs: 200, tokenCount: 4, tokensPerSecond: 20 };
const user: ChatMessage = { id: "u1", role: "user", content: "问题", status: "complete" };
const assistant: ChatMessage = { id: "r1", role: "assistant", content: "", status: "streaming" };

function generatingState(): ChatState {
  return chatReducer(
    { ...initialChatState, status: "ready" },
    { type: "submit", user, assistant, requestId: "r1" },
  );
}

describe("chat state machine", () => {
  it("recognizes legal and illegal transitions", () => {
    expect(canTransition("idle", "loading")).toBe(true);
    expect(canTransition("loading", "ready")).toBe(true);
    expect(canTransition("idle", "generating")).toBe(false);
    expect(canTransition("unsupported", "ready")).toBe(false);
  });

  it("atomically appends the user and assistant placeholder", () => {
    const state = generatingState();
    expect(state.status).toBe("generating");
    expect(state.messages).toEqual([user, assistant]);
    expect(state.activeRequestId).toBe("r1");
  });

  it("blocks a second submit while generation is active", () => {
    const state = generatingState();
    const result = chatReducer(state, {
      type: "submit",
      requestId: "r2",
      user: { ...user, id: "u2" },
      assistant: { ...assistant, id: "r2" },
    });
    expect(result).toBe(state);
    expect(canGenerate(result)).toBe(false);
  });

  it("ignores stale deltas and appends current deltas", () => {
    const state = generatingState();
    const stale = chatReducer(state, { type: "worker", response: { type: "generation-delta", requestId: "old", text: "旧", tokenCount: 1 } });
    const current = chatReducer(stale, { type: "worker", response: { type: "generation-delta", requestId: "r1", text: "新回答", tokenCount: 2 } });
    expect(stale).toBe(state);
    expect(current.messages[1].content).toBe("新回答");
  });

  it("completes, interrupts, and errors the active answer", () => {
    const complete = chatReducer(generatingState(), { type: "worker", response: { type: "generation-complete", requestId: "r1", stats } });
    expect(complete).toMatchObject({ status: "ready", activeRequestId: null, stats });
    expect(complete.messages[1].status).toBe("complete");

    const interrupted = chatReducer(generatingState(), { type: "worker", response: { type: "generation-interrupted", requestId: "r1", stats } });
    expect(interrupted.status).toBe("interrupted");
    expect(interrupted.messages[1].status).toBe("interrupted");

    const failed = chatReducer(generatingState(), { type: "worker", response: { type: "error", phase: "generate", message: "失败", recoverable: true } });
    expect(failed.status).toBe("error");
    expect(failed.messages[1].status).toBe("error");
  });

  it("ignores stale completion events", () => {
    const state = generatingState();
    const result = chatReducer(state, { type: "worker", response: { type: "generation-complete", requestId: "old", stats } });
    expect(result).toBe(state);
  });
});
