import { formatBytes, summarizeProgress, type ProgressItem } from "../lib/progress";

type Props = { items: Record<string, ProgressItem> };

function shortName(file: string): string {
  const parts = file.split("/");
  return parts.at(-1) || file;
}

export function LoadProgress({ items }: Props) {
  const summary = summarizeProgress(items);
  const files = Object.values(items).sort((a, b) => a.file.localeCompare(b.file));
  return (
    <section className="card progress-panel" aria-live="polite">
      <div className="progress-heading">
        <div>
          <span className="eyebrow">模型加载</span>
          <h2>{summary.count ? `${summary.completed}/${summary.count} 个文件完成` : "正在准备下载…"}</h2>
        </div>
        <strong>{summary.percent === undefined ? "计算中" : `${summary.percent.toFixed(1)}%${summary.estimated ? " 估算" : ""}`}</strong>
      </div>
      <div className="progress-track"><span style={{ width: `${summary.percent ?? 2}%` }} /></div>
      <p className="muted size-line">
        {formatBytes(summary.loaded)}{summary.total === undefined ? " 已处理" : ` / ${formatBytes(summary.total)}`}
      </p>
      <div className="file-list">
        {files.map((item) => (
          <div className="file-row" key={item.file}>
            <div className="file-meta">
              <span title={item.file}>{shortName(item.file)}</span>
              <small>{item.status === "done" ? "完成" : item.total ? `${formatBytes(item.loaded)} / ${formatBytes(item.total)}` : "等待大小信息"}</small>
            </div>
            <div className="mini-track"><span style={{ width: `${item.percent ?? (item.status === "initiate" ? 3 : 12)}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}
