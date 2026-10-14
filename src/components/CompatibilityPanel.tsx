import type { AdapterSummary, ModelStatus } from "../lib/worker-protocol";

type Props = {
  status: ModelStatus;
  adapter: AdapterSummary | null;
  error: string | null;
  onLoad: () => void;
  onRecover: () => void;
};

export function CompatibilityPanel({ status, adapter, error, onLoad, onRecover }: Props) {
  if (status === "checking") {
    return <section className="card compatibility"><span className="pulse-dot" />正在请求 WebGPU adapter…</section>;
  }
  if (status === "unsupported") {
    return (
      <section className="card compatibility error-card">
        <span className="eyebrow">当前设备不可用</span>
        <h2>需要支持 WebGPU 的 Chrome 或 Edge</h2>
        <p>{error}</p>
        <p className="muted">请使用 HTTPS 或 localhost，并在 <code>chrome://gpu</code> 或 <code>edge://gpu</code> 检查 WebGPU 状态。</p>
      </section>
    );
  }
  if (status === "error") {
    return (
      <section className="card compatibility error-card">
        <span className="eyebrow">运行出错</span>
        <h2>模型流程已安全停止</h2>
        <p>{error}</p>
        <button className="button secondary" onClick={onRecover}>返回加载页</button>
      </section>
    );
  }
  if (status !== "idle") return null;
  return (
    <section className="card compatibility">
      <div>
        <span className="eyebrow success">WebGPU 可用</span>
        <h2>设备已通过实际 adapter 检测</h2>
        <p className="muted">
          {adapter?.features.includes("shader-f16") ? "支持 shader-f16。" : "未报告 shader-f16，将使用模型兼容配置。"}
          首次下载体积较大，建议至少 8 GB 系统内存。
        </p>
      </div>
      <button className="button primary" onClick={onLoad}>加载 1.5B 模型</button>
    </section>
  );
}
