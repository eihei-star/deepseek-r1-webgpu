import { useEffect, useRef } from "react";
import "./App.css";
import { ChatComposer } from "./components/ChatComposer";
import { ChatMessage } from "./components/ChatMessage";
import { CompatibilityPanel } from "./components/CompatibilityPanel";
import { LoadProgress } from "./components/LoadProgress";
import { RuntimeStats } from "./components/RuntimeStats";
import { useModelWorker } from "./hooks/useModelWorker";

const EXAMPLES = [
  "用三句话解释 WebGPU。",
  "写一个 TypeScript 防抖函数，并说明边界情况。",
  "比较浏览器本地推理与服务器推理的隐私边界。",
];
const STICKY_SCROLL_THRESHOLD = 120;
const STATUS_LABELS = {
  checking: "检测设备",
  unsupported: "设备不支持",
  idle: "等待加载",
  loading: "加载模型",
  ready: "模型就绪",
  generating: "本地生成中",
  interrupted: "生成已停止",
  error: "运行出错",
} as const;

export default function App() {
  const { state, load, recover, generate, interrupt, clearChat, reset } = useModelWorker();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const container = scrollRef.current;
    if (container && stickToBottom.current) container.scrollTop = container.scrollHeight;
  }, [state.messages]);

  const onScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    stickToBottom.current = container.scrollHeight - container.scrollTop - container.clientHeight < STICKY_SCROLL_THRESHOLD;
  };
  const active = ["ready", "generating", "interrupted"].includes(state.status);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="DeepSeek R1 WebGPU 首页">
          <span className="brand-mark">R1</span>
          <span><strong>DeepSeek-R1</strong><small>WebGPU Lab</small></span>
        </a>
        <div className="status-chip" data-status={state.status}>
          <span />{STATUS_LABELS[state.status]}
        </div>
      </header>

      {!active && (
        <div className="landing">
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">端侧推理 · 不上传对话</span>
              <h1>把推理模型，<br /><em>留在你的浏览器里。</em></h1>
              <p>DeepSeek-R1-Distill-Qwen-1.5B 通过 Transformers.js 与 WebGPU 在 Worker 中运行。首次下载模型需要网络，推理内容不发送到业务服务器；缓存完成后可尝试离线运行。</p>
              <div className="hero-facts">
                <span><strong>1.5B</strong> 参数规模</span>
                <span><strong>q4f16</strong> 优先量化</span>
                <span><strong>0</strong> 业务推理 API</span>
              </div>
            </div>
            <div className="orb" aria-hidden="true"><span>R1</span></div>
          </section>
          <CompatibilityPanel status={state.status} adapter={state.adapter} error={state.error} onLoad={load} onRecover={recover} />
          {state.status === "loading" && <LoadProgress items={state.progress} />}
          <section className="privacy-note">
            <strong>准确的隐私边界</strong>
            <p>首次加载会从 Hugging Face 下载模型文件；你的输入和生成内容不发送到业务服务器。应用 shell 与模型缓存完成后，可尝试离线刷新。</p>
          </section>
        </div>
      )}

      {active && (
        <section className="chat-layout">
          <div className="chat-toolbar">
            <div>
              <span className="eyebrow success">模型已在本地就绪</span>
              <h1>今天想推理什么？</h1>
              <p>{state.cached ? "本次主要从浏览器缓存加载。" : "模型已加载至 WebGPU。"} 当前 dtype：{state.dtype ?? "检测中"}</p>
            </div>
            <div className="toolbar-actions">
              <button className="button ghost" onClick={clearChat} disabled={state.status === "generating" || state.messages.length === 0}>清空对话</button>
              <button className="button secondary" onClick={reset}>重置模型</button>
            </div>
          </div>
          <RuntimeStats stats={state.stats} />
          <div className="conversation" ref={scrollRef} onScroll={onScroll}>
            {state.messages.length === 0 ? (
              <div className="empty-chat">
                <span className="eyebrow">快速开始</span>
                <div className="example-grid">
                  {EXAMPLES.map((example) => <button key={example} onClick={() => generate(example, { maxNewTokens: 256, temperature: 0.2, topP: 0.9 })}>{example}</button>)}
                </div>
              </div>
            ) : state.messages.map((message) => <ChatMessage key={message.id} message={message} />)}
          </div>
          <ChatComposer status={state.status} onSend={generate} onStop={interrupt} />
          <p className="local-caption">本地 WebGPU 推理 · 回答可能不准确，请核验重要信息</p>
        </section>
      )}
    </main>
  );
}
