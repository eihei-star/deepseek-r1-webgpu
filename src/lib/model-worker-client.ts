import { isWorkerResponse, type WorkerRequest, type WorkerResponse } from "./worker-protocol";

export type WorkerLike = {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  addEventListener(type: "message" | "error", listener: EventListener): void;
  removeEventListener(type: "message" | "error", listener: EventListener): void;
};
export type WorkerFactory = () => WorkerLike;

export class ModelWorkerClient {
  private worker: WorkerLike | null = null;
  private readonly factory: WorkerFactory;
  private readonly onResponse: (response: WorkerResponse) => void;
  private readonly onMessage = (event: MessageEvent<unknown>) => {
    if (isWorkerResponse(event.data)) this.onResponse(event.data);
  };
  private readonly onError = (event: ErrorEvent) => {
    this.onResponse({
      type: "error",
      phase: "load",
      message: event.message || "Worker 发生未知错误",
      recoverable: true,
    });
  };

  constructor(
    factory: WorkerFactory,
    onResponse: (response: WorkerResponse) => void,
  ) {
    this.factory = factory;
    this.onResponse = onResponse;
  }

  start(): void {
    if (this.worker) return;
    const worker = this.factory();
    worker.addEventListener("message", this.onMessage as EventListener);
    worker.addEventListener("error", this.onError as EventListener);
    this.worker = worker;
  }

  post(request: WorkerRequest): void {
    if (!this.worker) throw new Error("模型 Worker 尚未启动");
    this.worker.postMessage(request);
  }

  restart(): void {
    this.stop();
    this.start();
    this.post({ type: "check" });
  }

  stop(): void {
    if (!this.worker) return;
    this.worker.removeEventListener("message", this.onMessage as EventListener);
    this.worker.removeEventListener("error", this.onError as EventListener);
    this.worker.terminate();
    this.worker = null;
  }
}
