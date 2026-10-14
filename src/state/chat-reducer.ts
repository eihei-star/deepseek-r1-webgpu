import { mergeProgress, progressFromResponse, type ProgressItem } from "../lib/progress";
import type {
  AdapterSummary,
  ChatMessage,
  GenerationStats,
  ModelDtype,
  ModelStatus,
  WorkerResponse,
} from "../lib/worker-protocol";

export type ChatState = {
  status: ModelStatus;
  messages: ChatMessage[];
  progress: Record<string, ProgressItem>;
  activeRequestId: string | null;
  stats: GenerationStats | null;
  adapter: AdapterSummary | null;
  cached: boolean | null;
  dtype: ModelDtype | null;
  error: string | null;
};

export type ChatAction =
  | { type: "worker"; response: WorkerResponse }
  | { type: "load-requested" }
  | { type: "submit"; user: ChatMessage; assistant: ChatMessage; requestId: string }
  | { type: "clear-chat" }
  | { type: "recover" }
  | { type: "reset" };

export const initialChatState: ChatState = {
  status: "checking",
  messages: [],
  progress: {},
  activeRequestId: null,
  stats: null,
  adapter: null,
  cached: null,
  dtype: null,
  error: null,
};

const TRANSITIONS: Record<ModelStatus, readonly ModelStatus[]> = {
  checking: ["unsupported", "idle", "error"],
  unsupported: ["checking"],
  idle: ["loading", "checking"],
  loading: ["ready", "error", "checking"],
  ready: ["generating", "checking"],
  generating: ["ready", "interrupted", "error", "checking"],
  interrupted: ["generating", "ready", "checking"],
  error: ["idle", "checking"],
};

export function canTransition(from: ModelStatus, to: ModelStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function canGenerate(state: ChatState): boolean {
  return (state.status === "ready" || state.status === "interrupted") && state.activeRequestId === null;
}

function transition(state: ChatState, status: ModelStatus): ChatState {
  return canTransition(state.status, status) ? { ...state, status } : state;
}

function finishMessage(
  messages: ChatMessage[],
  requestId: string,
  status: "complete" | "interrupted" | "error",
): ChatMessage[] {
  return messages.map((message) => message.id === requestId ? { ...message, status } : message);
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.type === "reset") return initialChatState;
  if (action.type === "clear-chat") {
    return state.status === "generating" ? state : { ...state, messages: [], stats: null };
  }
  if (action.type === "recover") {
    return state.status === "error" ? { ...state, status: "idle", error: null } : state;
  }
  if (action.type === "load-requested") {
    const next = transition(state, "loading");
    return next === state ? state : { ...next, progress: {}, error: null, cached: null };
  }
  if (action.type === "submit") {
    if (!canGenerate(state)) return state;
    return {
      ...state,
      status: "generating",
      messages: [...state.messages, action.user, action.assistant],
      activeRequestId: action.requestId,
      stats: null,
      error: null,
    };
  }

  const response = action.response;
  if (response.type === "capability") {
    return {
      ...state,
      status: response.supported ? "idle" : "unsupported",
      adapter: response.adapter ?? null,
      error: response.reason ?? null,
    };
  }
  if (response.type === "load-progress") {
    const item = progressFromResponse(response);
    return item ? { ...state, progress: mergeProgress(state.progress, item) } : state;
  }
  if (response.type === "ready") {
    const next = transition(state, "ready");
    return { ...next, cached: response.cached ?? null, dtype: response.dtype, error: null };
  }
  if (response.type === "generation-start") return state;
  if (response.type === "generation-delta") {
    if (response.requestId !== state.activeRequestId) return state;
    return {
      ...state,
      messages: state.messages.map((message) => message.id === response.requestId
        ? { ...message, content: `${message.content}${response.text}` }
        : message),
    };
  }
  if (response.type === "generation-complete" || response.type === "generation-interrupted") {
    if (response.requestId !== state.activeRequestId) return state;
    const interrupted = response.type === "generation-interrupted";
    return {
      ...state,
      status: interrupted ? "interrupted" : "ready",
      activeRequestId: null,
      stats: response.stats,
      messages: finishMessage(state.messages, response.requestId, interrupted ? "interrupted" : "complete"),
    };
  }
  if (response.type === "error") {
    return {
      ...state,
      status: "error",
      error: response.message,
      activeRequestId: null,
      messages: state.activeRequestId
        ? finishMessage(state.messages, state.activeRequestId, "error")
        : state.messages,
    };
  }
  return state;
}
