import { useAuth } from '../auth';
import { useUserPreferences } from '../lib/useUserPreferences';
import SettingsShell from '../components/SettingsShell';
import OptionSheet from '../components/OptionSheet';

type NotificationKey = 'comment' | 'like' | 'greeting' | 'notice' | 'feedback' | 'love_wall' | 'admin_message' | 'moderation' | 'friend_request';
const LABELS: Record<NotificationKey, string> = { comment: '评论与回复', like: '点赞提醒', greeting: '留言提醒', notice: '公告提醒', feedback: '反馈处理进度', love_wall: '表白墙提醒', admin_message: '管理员私信', moderation: '纪律处理通知', friend_request: '好友申请提醒' };

// 免打扰时间用站内选择（半小时一档），不用系统时间选择器。
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const t = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
  return { value: t, label: t };
});

/** 通知设置：独立子页（原为设置页内展开面板，2026-11-07 拆出） */
export default function MeNotifySettings() {
  const uid = useAuth().session!.user.id;
  const { prefs, setPrefs, syncState } = useUserPreferences(uid);

  return (
    <SettingsShell title="通知设置">
      <p>关闭某类通知后，只会在通知中心隐藏该类别，不会删除历史记录。</p>
      {(Object.keys(LABELS) as NotificationKey[]).map(key => (
        <label key={key} className="qz-sub-row"><span>{LABELS[key]}</span>
          <input type="checkbox" checked={prefs.notifications[key] !== false} onChange={e => setPrefs(old => ({ ...old, notifications: { ...old.notifications, [key]: e.target.checked } }))} />
        </label>
      ))}
      <div className="qz-settings-subsection">
        <p><b>免打扰时段</b></p>
        <label className="qz-sub-row"><span>启用未读角标免打扰</span>
          <input type="checkbox" checked={prefs.quietHours.enabled} onChange={e => setPrefs(old => ({ ...old, quietHours: { ...old.quietHours, enabled: e.target.checked } }))} />
        </label>
        <div className="qz-sub-time-row"><span>开始时间</span>
          <OptionSheet title="开始时间" value={prefs.quietHours.start} options={TIME_OPTIONS} buttonText={prefs.quietHours.start}
            onChange={v => setPrefs(old => ({ ...old, quietHours: { ...old.quietHours, start: v } }))} />
        </div>
        <div className="qz-sub-time-row"><span>结束时间</span>
          <OptionSheet title="结束时间" value={prefs.quietHours.end} options={TIME_OPTIONS} buttonText={prefs.quietHours.end}
            onChange={v => setPrefs(old => ({ ...old, quietHours: { ...old.quietHours, end: v } }))} />
        </div>
        <p className="qz-settings-row-note">按设备当地时间生效，只隐藏网站未读角标；消息仍会正常接收并保存在通知中心。开始和结束时间相同时，表示全天免打扰。时间按半小时一档选择，如需更精确的时间请告诉开发者。</p>
      </div>
      {syncState === 'loading' ? <div className="fx-skel-wrap" role="status" aria-label="正在读取账号级偏好" style={{ width: 200, height: 13 }}><div className="fx-skel" style={{ width: '100%', height: '100%' }} /></div> : <p>{syncState === 'saved' ? '设置已同步到账号。' : '云端同步暂不可用；当前设备仍保留本地设置。'}</p>}
    </SettingsShell>
  );
}
