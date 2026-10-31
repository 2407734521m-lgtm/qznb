import { useCallback, useEffect, useMemo, useState } from 'react';

type WorkflowRun = {
  id: number;
  name: string;
  path?: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  head_branch: string;
  html_url: string;
  run_number: number;
  run_started_at?: string;
  updated_at: string;
  head_commit?: { message?: string };
};
type WorkflowResponse = { workflow_runs?: WorkflowRun[] };

const panel: React.CSSProperties = {
  background: 'linear-gradient(155deg,rgba(24,34,56,.94),rgba(12,18,33,.98))',
  border: '1px solid rgba(190,210,255,.13)', borderRadius: 18,
  padding: 14, marginBottom: 12, color: '#edf3ff',
};
const muted: React.CSSProperties = { color: '#98a8c5', fontSize: 11.5, lineHeight: 1.65 };
const repoUrl = 'https://github.com/2407734521m-lgtm/qznb';
const actionsUrl = repoUrl + '/actions';

function shortSha(value?: string) {
  return value ? value.slice(0, 7) : '未知';
}
function formatTime(value?: string) {
  if (!value) return '时间未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString();
}
function statusLabel(run: WorkflowRun) {
  if (run.status !== 'completed') return run.status === 'queued' ? '排队中' : '执行中';
  if (run.conclusion === 'success') return '成功';
  if (run.conclusion === 'failure') return '失败';
  if (run.conclusion === 'cancelled') return '已取消';
  return run.conclusion || '已结束';
}
function statusColor(run: WorkflowRun) {
  if (run.status !== 'completed') return '#ffd18a';
  return run.conclusion === 'success' ? '#8de0b7' : run.conclusion === 'failure' ? '#ff9da7' : '#aab6cc';
}

export default function AdminReleaseCenter() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const buildSha = import.meta.env.VITE_GIT_COMMIT_SHA || '';
  const buildBranch = import.meta.env.VITE_BUILD_BRANCH || '—';
  const buildRunId = import.meta.env.VITE_GITHUB_RUN_ID || '';
  const buildRunNumber = import.meta.env.VITE_GITHUB_RUN_NUMBER || '';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('https://api.github.com/repos/2407734521m-lgtm/qznb/actions/runs?per_page=30', {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) {
        throw new Error(response.status === 403
          ? 'GitHub API 请求受限，请稍后刷新或打开 Actions 页面核对。'
          : 'GitHub API 返回 HTTP ' + response.status);
      }
      const payload = await response.json() as WorkflowResponse;
      setRuns(Array.isArray(payload.workflow_runs) ? payload.workflow_runs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取部署历史失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const deployments = useMemo(
    () => runs.filter(run => run.name === 'Deploy to GitHub Pages' || run.path?.endsWith('/deploy.yml')),
    [runs],
  );
  const latest = deployments[0] ?? null;
  const sameVersion = Boolean(buildSha && latest?.head_sha === buildSha);

  return <div style={{ display: 'grid', gap: 12 }}>
    <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 850 }}>版本发布中心</div>
          <div style={muted}>当前构建版本、GitHub Actions 部署历史与状态</div>
        </div>
        <button className="mini" disabled={loading} onClick={() => void load()}>{loading ? '刷新中…' : '刷新状态'}</button>
      </div>
      <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: '#ffffff08', border: '1px solid #ffffff12' }}>
        <div style={{ ...muted, fontSize: 10.5 }}>当前页面构建版本</div>
        <div style={{ fontSize: 21, fontWeight: 850, letterSpacing: '.4px', margin: '5px 0' }}>{shortSha(buildSha)}</div>
        <div style={muted}>分支：{buildBranch} · 部署运行编号：{buildRunNumber || '未注入'}</div>
        {buildRunId && <div style={muted}>GitHub Actions Run ID：{buildRunId}</div>}
        {buildSha && <a href={repoUrl + '/commit/' + buildSha} target="_blank" rel="noreferrer" style={{ display: 'inline-block', color: '#9fc1ff', fontSize: 11.5, marginTop: 7 }}>查看当前构建提交 ↗</a>}
      </div>
    </section>

    <section style={panel}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 9 }}>最近一次部署</div>
      {!latest ? <p style={muted}>{loading ? '正在读取 GitHub 部署记录…' : '暂时没有读取到部署记录。'}</p> : <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 15 }}>{statusLabel(latest)}</strong>
          <span style={{ color: statusColor(latest), fontSize: 11.5, fontWeight: 800 }}>{latest.conclusion === 'success' ? '部署成功' : latest.status === 'completed' ? '需要检查' : '正在部署'}</span>
        </div>
        <div style={{ ...muted, marginTop: 6 }}>Run #{latest.run_number} · {formatTime(latest.run_started_at || latest.updated_at)}</div>
        <div style={{ ...muted, marginTop: 3 }}>提交：{shortSha(latest.head_sha)} · 分支：{latest.head_branch}</div>
        {latest.head_commit?.message && <div style={{ fontSize: 12, marginTop: 8, overflowWrap: 'anywhere' }}>{latest.head_commit.message.split('\n')[0]}</div>}
        <div style={{ marginTop: 10, padding: 9, borderRadius: 10, background: sameVersion ? '#4ade8012' : '#f0b85a12', border: '1px solid ' + (sameVersion ? '#4ade8030' : '#f0b85a35'), color: sameVersion ? '#8de0b7' : '#ffd18a', fontSize: 11.5 }}>
          {sameVersion ? '当前页面构建版本与最近部署提交一致。' : buildSha ? '当前页面构建版本与最新部署记录不一致，请核对部署是否完成。' : '当前页面没有注入构建 SHA，无法自动比较版本。'}
        </div>
        <a href={latest.html_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', color: '#9fc1ff', fontSize: 11.5, marginTop: 9 }}>查看这次部署详情 ↗</a>
      </>}
      {error && <p style={{ color: '#ff9da7', fontSize: 11.5, marginBottom: 0 }}>{error}</p>}
    </section>

    <section style={panel}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>最近部署历史</div>
      {deployments.slice(0, 8).map(run => <div key={run.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 9, padding: '9px 0', borderBottom: '1px solid #ffffff0d' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 750 }}>Run #{run.run_number} · {shortSha(run.head_sha)}</div>
          <div style={muted}>{formatTime(run.run_started_at || run.updated_at)} · {run.head_branch}</div>
          {run.head_commit?.message && <div style={{ ...muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{run.head_commit.message.split('\n')[0]}</div>}
        </div>
        <a href={run.html_url} target="_blank" rel="noreferrer" style={{ color: statusColor(run), fontSize: 11, fontWeight: 800, flexShrink: 0, alignSelf: 'center' }}>{statusLabel(run)} ↗</a>
      </div>)}
      {!loading && deployments.length === 0 && <p style={muted}>没有可显示的部署历史。</p>}
    </section>

    <section style={panel}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>发布与回滚边界</div>
      <div style={muted}>此页面读取公开 GitHub Actions 元数据，不使用 GitHub 写入令牌。它可以查看构建和部署状态，但不会直接回滚生产版本。回滚前应先检查数据库迁移是否兼容；代码回滚不能自动撤销数据库数据变更。</div>
      <a href={actionsUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', color: '#9fc1ff', fontSize: 11.5, marginTop: 8 }}>打开 GitHub Actions ↗</a>
    </section>
  </div>;
}
