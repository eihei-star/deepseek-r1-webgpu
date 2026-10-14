import { useState, type KeyboardEvent } from "react";
import type { GenerationOptions, ModelStatus } from "../lib/worker-protocol";

type Props = {
  status: ModelStatus;
  onSend: (value: string, options: GenerationOptions) => boolean;
  onStop: () => void;
};

export function ChatComposer({ status, onSend, onStop }: Props) {
  const [value, setValue] = useState("");
  const [maxNewTokens, setMaxNewTokens] = useState<128 | 256 | 512>(256);
  const generating = status === "generating";
  const ready = status === "ready" || status === "interrupted";
  const submit = () => {
    if (onSend(value, { maxNewTokens, temperature: 0.2, topP: 0.9 })) setValue("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer-shell">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="输入问题；Enter 发送，Shift+Enter 换行"
        disabled={!ready || generating}
        rows={3}
      />
      <div className="composer-actions">
        <label>
          最大输出
          <select
            value={maxNewTokens}
            onChange={(event) => setMaxNewTokens(Number(event.target.value) as 128 | 256 | 512)}
            disabled={generating}
          >
            <option value={128}>128 tokens</option>
            <option value={256}>256 tokens</option>
            <option value={512}>512 tokens</option>
          </select>
        </label>
        {generating
          ? <button className="button danger" onClick={onStop}>停止生成</button>
          : <button className="button primary" onClick={submit} disabled={!ready || !value.trim()}>发送</button>}
      </div>
    </div>
  );
}
