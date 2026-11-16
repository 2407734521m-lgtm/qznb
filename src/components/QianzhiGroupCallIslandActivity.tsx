import { CallElapsedTime } from './QianzhiCallIslandActivity';
import type { ActivityOptions } from '../lib/island';

export interface GroupCallIslandInput {
  groupName: string;
  participantCount: number;
  startedAt: number | null;
  muted: boolean;
  onRestore: () => void;
  onToggleMute: () => void;
  onHangUp: () => void;
}

function GroupVoiceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
    </svg>
  );
}

function IslandAction({ label, onClick, danger = false }: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={'qz-group-island-action' + (danger ? ' is-danger' : '')}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

export function createGroupCallIslandActivity(input: GroupCallIslandInput): ActivityOptions {
  const groupName = input.groupName || '群聊';
  const people = input.participantCount + ' 人';
  return {
    id: 'qz-group-call-session',
    label: groupName + '群语音进行中',
    priority: 116,
    onPress: input.onRestore,
    compact: {
      leading: <span className="qz-group-island-compact"><GroupVoiceIcon /><span>群语音</span></span>,
      trailing: (
        <span className="qz-group-island-time">
          {input.startedAt === null ? '连接中' : <CallElapsedTime startedAt={input.startedAt} />}
        </span>
      ),
    },
    minimal: <span className="qz-group-island-minimal"><GroupVoiceIcon /></span>,
    expanded: {
      leading: <span className="qz-group-island-heading">群语音</span>,
      center: (
        <span className="qz-group-island-copy">
          <strong>{groupName}</strong>
          <small>{people} · {input.muted ? '已静音' : '麦克风已开启'}</small>
        </span>
      ),
      bottom: (
        <div className="qz-group-island-actions">
          <IslandAction label="返回通话" onClick={input.onRestore} />
          <IslandAction label={input.muted ? '取消静音' : '静音'} onClick={input.onToggleMute} />
          <IslandAction label="挂断" onClick={input.onHangUp} danger />
        </div>
      ),
    },
  };
}
