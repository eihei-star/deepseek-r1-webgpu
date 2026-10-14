import {
  AutoModelForCausalLM,
  AutoTokenizer,
  InterruptableStoppingCriteria,
  StoppingCriteriaList,
  TextStreamer,
  type Tensor,
} from "@huggingface/transformers";
import type {
  ChatMessage,
  GenerationOptions,
  GenerationStats,
  ModelDtype,
  ProgressStatus,
  WorkerResponse,
} from "../lib/worker-protocol";

export const MODEL_ID = "onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX";
export const PREFERRED_MODEL_DTYPE = "q4f16" as const;
const MAX_CONTEXT_MESSAGES = 8;
const MAX_CONTEXT_TOKENS = 2048;

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
type Model = Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>>;
type TokenizedChat = { input_ids: Tensor; attention_mask: Tensor };
type ProgressCallback = (response: Extract<WorkerResponse, { type: "load-progress" }>) => void;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeProgress(value: unknown): Extract<WorkerResponse, { type: "load-progress" }> | null {
  const info = asRecord(value);
  if (!info || typeof info.file !== "string" || typeof info.status !== "string") return null;
  const status: ProgressStatus = info.status === "done"
    ? "done"
    : info.status === "progress"
      ? "progress"
      : "initiate";
  const loaded = asFiniteNumber(info.loaded) ?? 0;
  const total = asFiniteNumber(info.total);
  const reported = asFiniteNumber(info.progress);
  const percent = status === "done"
    ? 100
    : total && total > 0
      ? Math.min(100, (loaded / total) * 100)
      : reported === undefined
        ? undefined
        : Math.min(100, reported);
  const name = typeof info.name === "string" ? info.name : MODEL_ID;
  return {
    type: "load-progress",
    file: `${name}/${info.file}`,
    loaded,
    total,
    percent,
    status,
  };
}

export class ModelRuntime {
  private tokenizer: Tokenizer | null = null;
  private model: Model | null = null;
  private tokenizerPromise: Promise<Tokenizer> | null = null;
  private modelPromise: Promise<Model> | null = null;
  private readonly stoppingCriteria = new InterruptableStoppingCriteria();

  get ready(): boolean {
    return this.tokenizer !== null && this.model !== null;
  }

  async load(onProgress: ProgressCallback, dtype: ModelDtype): Promise<{ cached: boolean }> {
    let downloaded = false;
    const progressCallback = (value: unknown) => {
      const event = normalizeProgress(value);
      if (!event) return;
      if (event.status === "progress" && event.loaded > 0) downloaded = true;
      onProgress(event);
    };

    this.tokenizerPromise ??= AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: progressCallback });
    this.modelPromise ??= AutoModelForCausalLM.from_pretrained(MODEL_ID, {
      device: "webgpu",
      dtype,
      progress_callback: progressCallback,
    });
    try {
      [this.tokenizer, this.model] = await Promise.all([this.tokenizerPromise, this.modelPromise]);
      return { cached: !downloaded };
    } catch (error) {
      this.tokenizerPromise = null;
      this.modelPromise = null;
      this.tokenizer = null;
      this.model = null;
      throw error;
    }
  }

  async generate(
    requestId: string,
    messages: ChatMessage[],
    options: GenerationOptions,
    post: (response: WorkerResponse) => void,
  ): Promise<{ interrupted: boolean; stats: GenerationStats }> {
    if (!this.tokenizer || !this.model) throw new Error("模型尚未加载");
    this.stoppingCriteria.reset();
    const startedAt = performance.now();
    let firstTokenAt: number | null = null;
    let tokenCount = 0;
    const streamer = new TextStreamer(this.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        if (!text) return;
        post({ type: "generation-delta", requestId, text, tokenCount });
      },
      token_callback_function: (tokens: bigint[]) => {
        if (firstTokenAt === null) firstTokenAt = performance.now();
        tokenCount += tokens.length;
      },
    });
    const stoppingCriteria = new StoppingCriteriaList();
    stoppingCriteria.push(this.stoppingCriteria);
    const chat = messages.slice(-MAX_CONTEXT_MESSAGES).map(({ role, content }) => ({ role, content }));
    const inputs = this.tokenizer.apply_chat_template(chat, {
      add_generation_prompt: true,
      tokenize: true,
      return_dict: true,
      return_tensor: true,
      truncation: true,
      max_length: MAX_CONTEXT_TOKENS,
    }) as TokenizedChat;
    const generationOptions = {
      ...inputs,
      max_new_tokens: options.maxNewTokens,
      do_sample: options.temperature > 0,
      temperature: options.temperature,
      top_p: options.topP,
      streamer,
      stopping_criteria: stoppingCriteria,
    } as Parameters<Model["generate"]>[0];
    await this.model.generate(generationOptions);
    const endedAt = performance.now();
    const totalMs = Math.max(0, endedAt - startedAt);
    const stats: GenerationStats = {
      firstTokenMs: firstTokenAt === null ? null : Math.max(0, firstTokenAt - startedAt),
      totalMs,
      tokenCount,
      tokensPerSecond: totalMs > 0 ? tokenCount / (totalMs / 1000) : 0,
    };
    return { interrupted: this.stoppingCriteria.interrupted, stats };
  }

  interrupt(): void {
    this.stoppingCriteria.interrupt();
  }

  async reset(): Promise<void> {
    this.stoppingCriteria.interrupt();
    if (this.model) await this.model.dispose();
    this.tokenizer = null;
    this.model = null;
    this.tokenizerPromise = null;
    this.modelPromise = null;
  }
}
