import { useCallback, useEffect, useReducer, useRef } from "react";
import { ModelWorkerClient, type WorkerFactory } from "../lib/model-worker-client";
import type { ChatMessage, GenerationOptions } from "../lib/worker-protocol";
import { canGenerate, chatReducer, initialChatState } from "../state/chat-reducer";

const defaultFactory: WorkerFactory = () => new Worker(
  new URL("../worker/model.worker.ts", import.meta.url),
  { type: "module", name: "deepseek-webgpu" },
);

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function useModelWorker(factory: WorkerFactory = defaultFactory) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const clientRef = useRef<ModelWorkerClient | null>(null);

  useEffect(() => {
    const client = new ModelWorkerClient(factory, (response) => dispatch({ type: "worker", response }));
    client.start();
    client.post({ type: "check" });
    clientRef.current = client;
    return () => {
      client.stop();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [factory]);

  const load = useCallback(() => {
    if (state.status !== "idle") return;
    dispatch({ type: "load-requested" });
    clientRef.current?.post({ type: "load" });
  }, [state.status]);

  const recover = useCallback(() => dispatch({ type: "recover" }), []);

  const generate = useCallback((content: string, options: GenerationOptions): boolean => {
    const trimmed = content.trim();
    if (!trimmed || !canGenerate(state)) return false;
    const requestId = makeId("assistant");
    const user: ChatMessage = { id: makeId("user"), role: "user", content: trimmed, status: "complete" };
    const assistant: ChatMessage = { id: requestId, role: "assistant", content: "", status: "streaming" };
    const history = [...state.messages.filter((message) => message.content.trim()), user];
    dispatch({ type: "submit", user, assistant, requestId });
    clientRef.current?.post({ type: "generate", requestId, messages: history, options });
    return true;
  }, [state]);

  const interrupt = useCallback(() => {
    if (state.status === "generating" && state.activeRequestId) {
      clientRef.current?.post({ type: "interrupt", requestId: state.activeRequestId });
    }
  }, [state.activeRequestId, state.status]);

  const clearChat = useCallback(() => dispatch({ type: "clear-chat" }), []);

  const reset = useCallback(() => {
    clientRef.current?.post({ type: "reset" });
    dispatch({ type: "reset" });
    clientRef.current?.restart();
  }, []);

  return { state, load, recover, generate, interrupt, clearChat, reset };
}
