import type { ChatMessage as Message } from "../lib/worker-protocol";

export function ChatMessage({ message }: { message: Message }) {
  const label = message.role === "user" ? "你" : "DeepSeek-R1";
  return (
    <article className={`message ${message.role}`}>
      <div className="avatar" aria-hidden="true">{message.role === "user" ? "你" : "R1"}</div>
      <div className="message-body">
        <div className="message-label">
          <strong>{label}</strong>
          {message.status === "streaming" && <span className="streaming">生成中</span>}
          {message.status === "interrupted" && <span className="stopped">已停止</span>}
          {message.status === "error" && <span className="stopped">生成失败</span>}
        </div>
        <div className="message-content">
          {message.content || (message.status === "streaming" ? <span className="typing-dot">●</span> : "暂无内容")}
        </div>
      </div>
    </article>
  );
}
