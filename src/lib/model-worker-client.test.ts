import { describe, expect, it, vi } from "vitest";
import { ModelWorkerClient, type WorkerLike } from "./model-worker-client";
import type { WorkerRequest } from "./worker-protocol";

class FakeWorker extends EventTarget implements WorkerLike {
  readonly posted: WorkerRequest[] = [];
  readonly terminate = vi.fn();

  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
  }

  emitMessage(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

describe("ModelWorkerClient", () => {
  it("forwards valid worker messages and drops malformed ones", () => {
    const worker = new FakeWorker();
    const responses = vi.fn();
    const client = new ModelWorkerClient(() => worker, responses);
    client.start();
    worker.emitMessage({ type: "ready", cached: true, dtype: "q4f16" });
    worker.emitMessage({ type: "ready", cached: "invalid", dtype: "q4f16" });
    expect(responses).toHaveBeenCalledTimes(1);
    expect(responses).toHaveBeenCalledWith({ type: "ready", cached: true, dtype: "q4f16" });
  });

  it("terminates the old worker, removes listeners, and checks the replacement", () => {
    const workers = [new FakeWorker(), new FakeWorker()];
    let index = 0;
    const responses = vi.fn();
    const client = new ModelWorkerClient(() => workers[index++], responses);
    client.start();
    client.restart();

    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers[1].posted).toEqual([{ type: "check" }]);
    workers[0].emitMessage({ type: "ready", dtype: "q4" });
    expect(responses).not.toHaveBeenCalled();

    client.stop();
    expect(workers[1].terminate).toHaveBeenCalledOnce();
  });

  it("does not create two active workers when start is repeated", () => {
    const factory = vi.fn(() => new FakeWorker());
    const client = new ModelWorkerClient(factory, vi.fn());
    client.start();
    client.start();
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
