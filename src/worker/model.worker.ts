/// <reference lib="webworker" />
import type { AdapterSummary, ModelDtype, WorkerRequest, WorkerResponse } from "../lib/worker-protocol";
import { ModelRuntime, PREFERRED_MODEL_DTYPE } from "./model-runtime";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const runtime = new ModelRuntime();
let loadTask: Promise<void> | null = null;
let activeRequestId: string | null = null;
let selectedDtype: ModelDtype = PREFERRED_MODEL_DTYPE;

function post(response: WorkerResponse): void {
  scope.postMessage(response);
}

function errorMessage(error: unknown, phase: "check" | "load" | "generate" | "reset"): string {
  if (typeof error === "number" || typeof error === "bigint") {
    const amount = Number(error);
    const size = Number.isFinite(amount) && amount > 1024 ** 3
      ? `（约 ${(amount / 1024 ** 3).toFixed(2)} GB）`
      : "";
    const action = phase === "load"
      ? "这通常表示 ONNX Runtime 创建 WebGPU 会话或分配缓冲区失败。请关闭占用 GPU/内存的程序，确认浏览器硬件加速已开启，然后重置模型重试。若刚从旧 q4 版本升级，请先在 DevTools 的 Application → Storage 中清除此站点数据，避免旧模型占用缓存配额。"
      : "这通常是 ONNX Runtime 的底层 WebGPU 异常，请重置模型后重试。";
    return `${phase === "load" ? "模型加载" : "模型运行"}失败：底层返回数值异常 ${String(error)}${size}。${action}`;
  }
  if (error instanceof DOMException) return `${error.name}：${error.message}`;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.reason === "string") return record.reason;
  }
  return String(error);
}

function reportError(phase: "check" | "load" | "generate" | "reset", error: unknown): void {
  console.error(`[DeepSeek Worker] ${phase} failed`, error);
  post({ type: "error", phase, message: errorMessage(error, phase), recoverable: true });
}

async function checkCapability(): Promise<void> {
  if (!globalThis.isSecureContext) {
    post({ type: "capability", supported: false, reason: "WebGPU 需要 HTTPS 或 localhost 安全上下文。" });
    return;
  }
  if (!("gpu" in navigator) || !navigator.gpu) {
    post({ type: "capability", supported: false, reason: "当前浏览器未暴露 navigator.gpu。" });
    return;
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) {
    post({ type: "capability", supported: false, reason: "浏览器未能获取 WebGPU adapter，请检查 GPU 驱动和浏览器设置。" });
    return;
  }
  const summary: AdapterSummary = {
    features: Array.from(adapter.features.values()).sort(),
    maxBufferSize: Number(adapter.limits.maxBufferSize),
    maxStorageBufferBindingSize: Number(adapter.limits.maxStorageBufferBindingSize),
  };
  selectedDtype = adapter.features.has("shader-f16") ? "q4f16" : "q4";
  post({ type: "capability", supported: true, adapter: summary });
}

async function loadModel(): Promise<void> {
  if (runtime.ready) {
    post({ type: "ready", cached: true, dtype: selectedDtype });
    return;
  }
  if (loadTask) return loadTask;
  loadTask = runtime.load((event) => post(event), selectedDtype).then(({ cached }) => {
    post({ type: "ready", cached, dtype: selectedDtype });
  }).catch((error: unknown) => {
    reportError("load", error);
    loadTask = null;
  });
  return loadTask;
}

async function generate(request: Extract<WorkerRequest, { type: "generate" }>): Promise<void> {
  if (activeRequestId) {
    post({ type: "error", phase: "generate", message: "已有回答正在生成，请先停止。", recoverable: true });
    return;
  }
  if (!runtime.ready) {
    post({ type: "error", phase: "generate", message: "请先加载模型。", recoverable: true });
    return;
  }
  activeRequestId = request.requestId;
  post({ type: "generation-start", requestId: request.requestId });
  try {
    const result = await runtime.generate(request.requestId, request.messages, request.options, post);
    post(result.interrupted
      ? { type: "generation-interrupted", requestId: request.requestId, stats: result.stats }
      : { type: "generation-complete", requestId: request.requestId, stats: result.stats });
  } catch (error) {
    reportError("generate", error);
  } finally {
    activeRequestId = null;
  }
}

scope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "check") {
    checkCapability().catch((error: unknown) => {
      reportError("check", error);
    });
  } else if (request.type === "load") {
    void loadModel();
  } else if (request.type === "generate") {
    void generate(request);
  } else if (request.type === "interrupt") {
    if (request.requestId === activeRequestId) runtime.interrupt();
  } else if (request.type === "reset") {
    runtime.reset().catch((error: unknown) => {
      reportError("reset", error);
    });
  }
});
