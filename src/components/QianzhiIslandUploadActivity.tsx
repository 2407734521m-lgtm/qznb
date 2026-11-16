import type { ActivityOptions } from '../lib/island';
import './QianzhiIslandUploadActivity.css';

export type UploadIslandStatus = 'uploading' | 'completed' | 'failed';

export interface UploadIslandActivityInput {
  count: number;
  progress: number | null;
  status: UploadIslandStatus;
  label?: string;
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15V3.8M7.8 8 12 3.8 16.2 8" />
      <path d="M4.5 14.5v4.2c0 .8.6 1.4 1.4 1.4h12.2c.8 0 1.4-.6 1.4-1.4v-4.2" />
    </svg>
  );
}

export function createUploadIslandActivity(input: UploadIslandActivityInput): ActivityOptions {
  const progress = input.progress === null ? null : Math.max(0, Math.min(100, Math.round(input.progress)));
  const title = input.status === 'completed'
    ? '上传完成'
    : input.status === 'failed'
      ? '上传失败'
      : input.label || (input.count > 1 ? `正在上传 ${input.count} 项` : '正在上传文件');
  const detail = input.status === 'uploading'
    ? progress === null ? '正在传输数据' : `已完成 ${progress}%`
    : input.status === 'completed' ? '文件已保存' : '请检查网络后重试';

  return {
    id: 'qz-upload-progress',
    label: title,
    priority: 22,
    task: {
      status: input.status === 'completed' ? 'done' : input.status === 'failed' ? 'error' : 'running',
      detail,
      progress,
    },
    compact: {
      leading: (
        <span className="qz-upload-island-compact">
          <span className="qz-upload-island-icon"><UploadIcon /></span>
          <span>{input.status === 'uploading' ? '上传中' : input.status === 'completed' ? '已完成' : '失败'}</span>
        </span>
      ),
      trailing: <span className="qz-upload-island-percent">{progress === null ? (input.status === 'uploading' ? '…' : '') : `${progress}%`}</span>,
    },
    minimal: <span className="qz-upload-island-minimal"><UploadIcon /></span>,
    expanded: {
      leading: <span className="qz-upload-island-label">文件传输</span>,
      center: (
        <span className="qz-upload-island-copy">
          <strong>{title}</strong>
          <small>{input.count > 1 && input.status === 'uploading' ? `${input.count} 项 · ${detail}` : detail}</small>
        </span>
      ),
      bottom: (
        <span className="qz-upload-island-track" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined}>
          <span className={progress === null ? 'is-indeterminate' : ''} style={progress === null ? undefined : { width: `${progress}%` }} />
        </span>
      ),
    },
  };
}
