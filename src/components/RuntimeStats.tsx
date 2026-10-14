import type { GenerationStats } from "../lib/worker-protocol";

export function RuntimeStats({ stats }: { stats: GenerationStats | null }) {
  if (!stats) return null;
  return (
    <div className="stats" aria-label="本次生成性能">
      <span><strong>{stats.firstTokenMs === null ? "—" : `${(stats.firstTokenMs / 1000).toFixed(2)}s`}</strong> 首 token</span>
      <span><strong>{stats.tokenCount}</strong> tokens</span>
      <span><strong>{(stats.totalMs / 1000).toFixed(2)}s</strong> 总耗时</span>
      <span><strong>{stats.tokensPerSecond.toFixed(2)}</strong> tokens/s</span>
    </div>
  );
}
