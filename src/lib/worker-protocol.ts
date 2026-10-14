export type ModelStatus =
  | "checking"
  | "unsupported"
  | "idle"
  | "loading"
  | "ready"
  | "generating"
  | "interrupted"
  | "error";

export type ChatRole = "user" | "assistant";
export type MessageStatus = "streaming" | "complete" | "interrupted" | "error";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  status?: MessageStatus;
};

export type GenerationOptions = {
  maxNewTokens: 128 | 256 | 512;
  temperature: number;
  topP: number;
};

export type ModelDtype = "q4f16" | "q4";

export type GenerationStats = {
  firstTokenMs: number | null;
  totalMs: number;
  tokenCount: number;
  tokensPerSecond: number;
};

export type AdapterSummary = {
  features: string[];
  maxBufferSize?: number;
  maxStorageBufferBindingSize?: number;
};

export type ProgressStatus = "initiate" | "progress" | "done";

export type WorkerRequest =
  | { type: "check" }
  | { type: "load" }
  | { type: "generate"; requestId: string; messages: ChatMessage[]; options: GenerationOptions }
  | { type: "interrupt"; requestId: string }
  | { type: "reset" };

export type WorkerResponse =
  | { type: "capability"; supported: boolean; reason?: string; adapter?: AdapterSummary }
  | {
      type: "load-progress";
      file: string;
      loaded: number;
      total?: number;
      percent?: number;
      status: ProgressStatus;
    }
  | { type: "ready"; cached?: boolean; dtype: ModelDtype }
  | { type: "generation-start"; requestId: string }
  | { type: "generation-delta"; requestId: string; text: string; tokenCount: number }
  | { type: "generation-complete"; requestId: string; stats: GenerationStats }
  | { type: "generation-interrupted"; requestId: string; stats: GenerationStats }
  | {
      type: "error";
      phase: "check" | "load" | "generate" | "reset";
      message: string;
      recoverable: boolean;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStats(value: unknown): value is GenerationStats {
  if (!isRecord(value)) return false;
  return (value.firstTokenMs === null || isFiniteNumber(value.firstTokenMs))
    && isFiniteNumber(value.totalMs)
    && isFiniteNumber(value.tokenCount)
    && isFiniteNumber(value.tokensPerSecond);
}

export function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "capability") {
    return typeof value.supported === "boolean"
      && (value.reason === undefined || typeof value.reason === "string");
  }
  if (value.type === "load-progress") {
    return typeof value.file === "string"
      && isFiniteNumber(value.loaded)
      && (value.total === undefined || isFiniteNumber(value.total))
      && (value.percent === undefined || isFiniteNumber(value.percent))
      && (value.status === "initiate" || value.status === "progress" || value.status === "done");
  }
  if (value.type === "ready") {
    return (value.cached === undefined || typeof value.cached === "boolean")
      && (value.dtype === "q4f16" || value.dtype === "q4");
  }
  if (value.type === "generation-start") return typeof value.requestId === "string";
  if (value.type === "generation-delta") {
    return typeof value.requestId === "string"
      && typeof value.text === "string"
      && isFiniteNumber(value.tokenCount);
  }
  if (value.type === "generation-complete" || value.type === "generation-interrupted") {
    return typeof value.requestId === "string" && isStats(value.stats);
  }
  if (value.type === "error") {
    return (value.phase === "check" || value.phase === "load" || value.phase === "generate" || value.phase === "reset")
      && typeof value.message === "string"
      && typeof value.recoverable === "boolean";
  }
  return false;
}
