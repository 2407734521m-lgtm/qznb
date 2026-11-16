import type { ActivityOptions } from '../lib/island';
import './QianzhiIslandDownloadActivity.css';

export type DownloadIslandStatus = 'downloading' | 'completed' | 'failed';

export interface DownloadIslandActivityInput {
  count: number;
  progress: number | null;
  status: DownloadIslandStatus;
  label?: string;
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.8v11.4M7.8 11l4.2 4.2 4.2-4.2" />
      <path d="M4.5 15v4c0 .8.6 1.5 1.4 1.5h12.2c.8 0 1.4-.7 1.4-1.5v-4" />
    </svg>
  );
}

export function createDownloadIslandActivity(input: DownloadIslandActivityInput): ActivityOptions {
  const progress = input.progress === null ? null : Math.max(0, Math.min(100, Math.round(input.progress)));
  const title = input.status === 'completed'
    ? '下载完成'
    : input.status === 'failed'
      ? '下载失败'
      : input.label || (input.count > 1 ? '正在下载 ' + input.count + ' 项' : '正在下载文件');
  const detail = input.status === 'downloading'
    ? progress === null ? '正在接收数据' : '已下载 ' + progress + '%'
    : input.status === 'completed' ? '文件已保存到设备' : '请检查链接或网络后重试';

  return {
    id: 'qz-download-progress',
    label: title,
    priority: 22,
    task: {
      status: input.status === 'completed' ? 'done' : input.status === 'failed' ? 'error' : 'running',
      detail,
      progress,
    },
    compact: {
      leading: (
        // Keyed on status so the arrival animation replays when the transfer
        // settles: downloading → completed is a visible change, not a silent swap.
        <span key={input.status} className="qz-download-island-compact">
          <span className="qz-download-island-icon"><DownloadIcon /></span>
          <span>{input.status === 'downloading' ? '下载中' : input.status === 'completed' ? '已完成' : '失败'}</span>
        </span>
      ),
      trailing: <span className="qz-download-island-percent">{progress === null ? (input.status === 'downloading' ? '…' : '') : progress + '%'}</span>,
    },
    minimal: <span className="qz-download-island-minimal"><DownloadIcon /></span>,
    expanded: {
      leading: <span className="qz-download-island-label">文件下载</span>,
      center: (
        <span className="qz-download-island-copy">
          <strong>{title}</strong>
          <small>{input.count > 1 && input.status === 'downloading' ? input.count + ' 项 · ' + detail : detail}</small>
        </span>
      ),
      bottom: (
        <span className="qz-download-island-track" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined}>
          <span className={progress === null ? 'is-indeterminate' : ''} style={progress === null ? undefined : { width: progress + '%' }} />
        </span>
      ),
    },
  };
}
