import { useEffect, useState } from 'react';
import { supabase, supabaseBaseUrl } from '../../lib/supabase';
import { card, h3, mut, alog } from './shared';
import MaintenanceAccessManager from './MaintenanceAccessManager';
import { confirmDialog } from '../../lib/dialog';
import DateTimeField from '../../components/DateTimeField';

const GUEST_SESSION_DURATIONS = [
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '1 小时' },
  { value: 120, label: '2 小时' },
  { value: 240, label: '4 小时' },
  { value: 480, label: '8 小时' },
  { value: 720, label: '12 小时' },
  { value: 1440, label: '24 小时' },
] as const;

const FEATURE_FLAGS = [
  { key: 'posts', label: '动态与日常发帖', detail: '暂停新帖子发布；已有内容仍可浏览。' },
  { key: 'comments', label: '评论与回复', detail: '暂停新评论提交；已有评论仍可浏览。' },
  { key: 'albums', label: '创建相册', detail: '暂停创建新相册。' },
  { key: 'album_photos', label: '相册照片上传', detail: '暂停向相册添加新照片。' },
  { key: 'chat', label: '私聊消息', detail: '暂停发送新私聊消息；历史消息仍可查看。' },
  { key: 'greetings', label: '留言功能', detail: '暂停发布新留言。' },
  { key: 'love_wall', label: '表白墙', detail: '暂停发布表白、评论及相关媒体提交。' },
  { key: 'songs', label: '歌声墙', detail: '暂停发布新歌声内容。' },
  { key: 'board_posts', label: '普通公告留言', detail: '暂停成员发布普通留言；管理员公告不受影响。' },
] as const;

function toLocalDateTimeInput(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function Settings({ me, setMsg }: { me: string; setMsg: (s: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [guestScheduleStart, setGuestScheduleStart] = useState('');
  const [guestScheduleEnd, setGuestScheduleEnd] = useState('');
  const [guestScheduleEnabled, setGuestScheduleEnabled] = useState(false);
  const [guestScheduleBusy, setGuestScheduleBusy] = useState(false);
  const [guestRevokeBusy, setGuestRevokeBusy] = useState(false);
  const [notifyCount, setNotifyCount] = useState(0);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyConfirm, setNotifyConfirm] = useState(false);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [featureBusy, setFeatureBusy] = useState<string | null>(null);

  async function loadNotifyCount() {
    const { count } = await supabase.from('maintenance_notify_emails').select('id', { count: 'exact', head: true });
    setNotifyCount(count ?? 0);
  }
  useEffect(() => { void loadNotifyCount(); }, []);

  async function sendNotify() {
    if (!notifyConfirm) { setNotifyConfirm(true); return; }
    setNotifyConfirm(false);
    setNotifyBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('maintenance-notify', { body: {} });
      if (error) {
        let detail = error.message;
        try {
          const payload = await (error as any).context?.clone().json();
          if (payload?.error) detail = payload.error;
        } catch { /* Keep the original Functions error message. */ }
        setMsg('发送失败：' + detail);
        return;
      }
      if (data?.error) { setMsg('发送失败：' + data.error); return; }
      setMsg(`恢复通知已发送：成功 ${data?.sent ?? 0} 人，失败 ${data?.failed ?? 0} 人。${data?.detail ? '失败原因：' + data.detail : ''}`);
      void loadNotifyCount();
    } finally { setNotifyBusy(false); }
  }

  async function load() {
    const { data } = await supabase.from('site_settings').select('key, value');
    const o: Record<string, string> = {};
    (data ?? []).forEach((x: any) => { o[x.key] = x.value; });
    setVals(o);
    setFeatureFlags(Object.fromEntries(FEATURE_FLAGS.map(({ key }) => [key, o['feature_' + key] !== 'false'])));
    try {
      const schedule = JSON.parse(o.maintenance_schedule || '{}');
      setScheduleStart(toLocalDateTimeInput(schedule.start_at || ''));
      setScheduleEnd(toLocalDateTimeInput(schedule.end_at || ''));
      setScheduleEnabled(schedule.enabled === true);
    } catch {
      setScheduleStart('');
      setScheduleEnd('');
      setScheduleEnabled(false);
    }
    try {
      const guestSchedule = JSON.parse(o.guest_schedule || '{}');
      setGuestScheduleStart(toLocalDateTimeInput(guestSchedule.start_at || ''));
      setGuestScheduleEnd(toLocalDateTimeInput(guestSchedule.end_at || ''));
      setGuestScheduleEnabled(guestSchedule.enabled === true);
    } catch {
      setGuestScheduleStart('');
      setGuestScheduleEnd('');
      setGuestScheduleEnabled(false);
    }
    const { data: bl } = await supabase.from('backup_logs').select('*').order('created_at', { ascending: false }).limit(10);
    setBackups(bl ?? []);
  }
  useEffect(() => { load(); }, []);

  async function saveFeatureFlag(key: string, enabled: boolean) {
    const feature = FEATURE_FLAGS.find(item => item.key === key);
    if (!feature) return;
    if (!enabled && !(await confirmDialog(
      `暂停「${feature.label}」？用户将无法提交新的相关内容，但已有内容不会被删除。`,
      { danger: true }
    ))) return;
    setFeatureBusy(key);
    const { error } = await supabase.from('site_settings').upsert(
      { key: 'feature_' + key, value: String(enabled) },
      { onConflict: 'key' }
    );
    setFeatureBusy(null);
    if (error) {
      setMsg('功能开关保存失败：' + error.message);
      return;
    }
    setFeatureFlags(current => ({ ...current, [key]: enabled }));
    await alog('feature_flag_changed', { feature: key, enabled });
    setMsg(`「${feature.label}」已${enabled ? '恢复开放' : '暂停'}。数据库写入权限已同步更新。`);
  }

  async function save(key: string, value: string) {
    const { error } = await supabase.from('site_settings').upsert({ key, value }, { onConflict: 'key' });
    if (!error) { await alog('setting_change', { key, value }); setMsg('已保存'); load(); }
    else setMsg('保存失败：' + error.message);
  }

  async function saveMaintenanceSchedule() {
    if (!scheduleStart || !scheduleEnd) return setMsg('请同时设置自动开启和自动关闭时间。');
    const start = new Date(scheduleStart);
    const end = new Date(scheduleEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return setMsg('时间格式无效，请重新选择。');
    if (end <= start) return setMsg('自动关闭时间必须晚于自动开启时间。');
    if (end <= new Date()) return setMsg('自动关闭时间必须晚于当前时间。');
    const value = JSON.stringify({ enabled: true, start_at: start.toISOString(), end_at: end.toISOString() });
    setScheduleBusy(true);
    const { error } = await supabase.from('site_settings').upsert({ key: 'maintenance_schedule', value }, { onConflict: 'key' });
    setScheduleBusy(false);
    if (error) return setMsg('定时计划保存失败：' + error.message);
    setScheduleEnabled(true);
    setVals(current => ({ ...current, maintenance_schedule: value }));
    await alog('maintenance_schedule_saved', { start_at: start.toISOString(), end_at: end.toISOString() });
    setMsg('定时维护计划已启用。到达设定时间后会自动开启，并在结束时间自动关闭。');
  }

  async function clearMaintenanceSchedule() {
    if (!(await confirmDialog('取消当前定时维护计划？不会改变手动维护开关的设置。'))) return;
    setScheduleBusy(true);
    const value = JSON.stringify({ enabled: false, start_at: null, end_at: null });
    const { error } = await supabase.from('site_settings').upsert({ key: 'maintenance_schedule', value }, { onConflict: 'key' });
    setScheduleBusy(false);
    if (error) return setMsg('取消计划失败：' + error.message);
    setScheduleEnabled(false);
    setScheduleStart('');
    setScheduleEnd('');
    setVals(current => ({ ...current, maintenance_schedule: value }));
    await alog('maintenance_schedule_cleared', {});
    setMsg('定时维护计划已取消，维护模式恢复由手动开关控制。');
  }

  async function saveGuestSchedule() {
    if (!guestScheduleStart || !guestScheduleEnd) return setMsg('请同时设置游客开放开始和结束时间。');
    const start = new Date(guestScheduleStart);
    const end = new Date(guestScheduleEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return setMsg('游客开放时间格式无效，请重新选择。');
    if (end <= start) return setMsg('游客开放结束时间必须晚于开始时间。');
    if (end <= new Date()) return setMsg('游客开放结束时间必须晚于当前时间。');

    const value = JSON.stringify({ enabled: true, start_at: start.toISOString(), end_at: end.toISOString() });
    setGuestScheduleBusy(true);
    const { error } = await supabase.from('site_settings').upsert({ key: 'guest_schedule', value }, { onConflict: 'key' });
    setGuestScheduleBusy(false);
    if (error) return setMsg('游客定时开放计划保存失败：' + error.message);
    setGuestScheduleEnabled(true);
    setVals(current => ({ ...current, guest_schedule: value }));
    await alog('guest_schedule_saved', { start_at: start.toISOString(), end_at: end.toISOString() });
    setMsg('游客开放计划已保存；仅在设定时间段内显示游客入口。');
  }

  async function clearGuestSchedule() {
    if (!(await confirmDialog('取消游客定时开放计划？游客入口将改为由总开关控制。'))) return;
    setGuestScheduleBusy(true);
    const value = JSON.stringify({ enabled: false, start_at: null, end_at: null });
    const { error } = await supabase.from('site_settings').upsert({ key: 'guest_schedule', value }, { onConflict: 'key' });
    setGuestScheduleBusy(false);
    if (error) return setMsg('取消游客开放计划失败：' + error.message);
    setGuestScheduleEnabled(false);
    setGuestScheduleStart('');
    setGuestScheduleEnd('');
    setVals(current => ({ ...current, guest_schedule: value }));
    await alog('guest_schedule_cleared', {});
    setMsg('游客定时开放计划已取消。');
  }

  async function revokeGuestSessions() {
    if (!(await confirmDialog('立即结束所有游客会话？已进入的游客会在下一次配置刷新时退出，最迟约 15 秒；今后仍可按设置重新进入。', { danger: true, confirmText: '立即清退' }))) return;
    const currentEpoch = Math.max(1, Number.parseInt(vals.guest_session_epoch || '1', 10) || 1);
    const nextEpoch = currentEpoch + 1;
    setGuestRevokeBusy(true);
    const { error } = await supabase.from('site_settings').upsert(
      { key: 'guest_session_epoch', value: String(nextEpoch) },
      { onConflict: 'key' }
    );
    setGuestRevokeBusy(false);
    if (error) return setMsg('清退游客失败：' + error.message);
    setVals(current => ({ ...current, guest_session_epoch: String(nextEpoch) }));
    await alog('guest_sessions_revoked', { epoch: nextEpoch });
    setMsg('清退指令已生效，当前游客会话将在配置刷新后自动结束。');
  }

  async function checkHealth() {
    const r: any = {};
    try { const t0 = Date.now(); const { error } = await supabase.from('profiles').select('id', { head: true }).limit(1); r.db = error ? '异常' : `正常（${Date.now() - t0}ms）`; }
    catch { r.db = '异常'; }
    try { const { data } = await supabase.storage.listBuckets(); r.storage = (data ?? []).map((b: any) => b.name).join('、') || '无'; }
    catch { r.storage = '异常'; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${supabaseBaseUrl}/functions/v1/notify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': 'sb_publishable_4dNtXkAYz6Q2KE0hZdZyKw_vF7b9T5q' }, body: '{}',
      });
      r.notify = resp.status === 401 ? '正常' : `异常（${resp.status}）`;
    } catch { r.notify = '异常'; }
    setHealth(r);
    await alog('health_check', r);
  }

  async function backup() {
    if (!(await confirmDialog('导出全部业务数据库数据与存储文件清单？此版本不包含照片、音频、视频等文件本体；不能替代 Supabase 完整备份。'))) return;
    setMsg('正在逐表导出，请勿关闭页面…');
    const tableNames = [
      'profiles', 'profile_emails', 'profile_privacy', 'profile_contacts',
      'posts', 'comments', 'post_likes', 'favorites', 'timelines',
      'albums', 'album_photos', 'board_messages', 'board_reads',
      'friendships', 'conversations', 'conversation_members', 'messages',
      'notifications', 'reports', 'feedbacks', 'invite_codes',
      'admin_audit_logs', 'backup_logs', 'site_settings', 'app_settings',
      'hot_snippets', 'greetings', 'wishes', 'events', 'event_regs',
      'game_profiles', 'love_wall_posts', 'love_wall_media', 'love_wall_comments',
      'song_posts', 'song_audio_uploads', 'member_presence', 'time_capsules',
      'maintenance_notify_emails',
    ];
    const primaryKeys: Record<string, string[]> = {
      profiles: ['id'], profile_emails: ['profile_id'], profile_privacy: ['profile_id'], profile_contacts: ['profile_id'],
      posts: ['id'], comments: ['id'], post_likes: ['post_id', 'profile_id'], favorites: ['profile_id', 'target_type', 'target_id'],
      timelines: ['id'], albums: ['id'], album_photos: ['id'], board_messages: ['id'], board_reads: ['profile_id'],
      friendships: ['id'], conversations: ['id'], conversation_members: ['conversation_id', 'profile_id'], messages: ['id'],
      notifications: ['id'], reports: ['id'], feedbacks: ['id'], invite_codes: ['id'], admin_audit_logs: ['id'],
      backup_logs: ['id'], site_settings: ['key'], app_settings: ['id'], hot_snippets: ['id'], greetings: ['id'],
      wishes: ['id'], events: ['id'], event_regs: ['event_id', 'profile_id'], game_profiles: ['id'],
      love_wall_posts: ['id'], love_wall_media: ['id'], love_wall_comments: ['id'], song_posts: ['id'],
      song_audio_uploads: ['path'], member_presence: ['profile_id'], time_capsules: ['id'],
      maintenance_notify_emails: ['id'],
    };
    const pageSize = 500;
    const tables: Record<string, { expected_rows: number; exported_rows: number; rows: any[] }> = {};
    try {
      for (const table of tableNames) {
        const rows: any[] = [];
        let expected: number | null = null;
        for (let offset = 0; ; offset += pageSize) {
          let request = supabase.from(table as any).select('*', { count: 'exact' });
          for (const key of primaryKeys[table]) request = request.order(key, { ascending: true });
          const { data, error, count } = await request.range(offset, offset + pageSize - 1);
          if (error) throw new Error(table + ' 导出失败：' + error.message);
          if (expected === null) {
            if (count === null) throw new Error(table + ' 无法取得总行数，不能验证完整性。');
            expected = count;
          }
          rows.push(...(data ?? []));
          if (!data || data.length < pageSize) break;
        }
        if (rows.length !== expected) {
          throw new Error(table + ' 行数校验失败：数据库报告 ' + expected + ' 行，实际导出 ' + rows.length + ' 行。请在数据稳定后重试。');
        }
        tables[table] = { expected_rows: expected, exported_rows: rows.length, rows };
      }

      const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
      if (bucketError) throw new Error('读取存储桶失败：' + bucketError.message);
      const storageManifest: Record<string, any[]> = {};
      async function listFolder(bucket: string, folder: string): Promise<any[]> {
        const entries: any[] = [];
        for (let offset = 0; ; offset += 100) {
          const { data, error } = await supabase.storage.from(bucket).list(folder, {
            limit: 100, offset, sortBy: { column: 'name', order: 'asc' },
          });
          if (error) throw new Error('读取存储桶 ' + bucket + '/' + folder + ' 失败：' + error.message);
          const page = data ?? [];
          for (const item of page) {
            const path = folder ? folder + '/' + item.name : item.name;
            if (item.id == null) entries.push(...await listFolder(bucket, path));
            else entries.push({
              path, id: item.id, created_at: item.created_at ?? null,
              updated_at: item.updated_at ?? null, last_accessed_at: item.last_accessed_at ?? null,
              metadata: item.metadata ?? null,
            });
          }
          if (page.length < 100) break;
        }
        return entries;
      }
      for (const bucket of buckets ?? []) {
        storageManifest[bucket.name] = await listFolder(bucket.name, '');
      }

      const exportedAt = new Date().toISOString();
      const totalRows = Object.values(tables).reduce((sum, item) => sum + item.exported_rows, 0);
      const storageObjects = Object.values(storageManifest).reduce((sum, items) => sum + items.length, 0);
      const data = {
        format: 'qznb-database-export-v2',
        backup_at: exportedAt,
        scope: 'all-public-business-tables-and-storage-manifest',
        completeness: {
          database_tables: tableNames.length,
          database_rows: totalRows,
          storage_buckets: Object.keys(storageManifest).length,
          storage_objects: storageObjects,
          storage_file_bodies_included: false,
          transactional_snapshot: false,
        },
        warning: '本文件包含全部已列入清单的 public 业务表数据及 Storage 文件清单，但不包含文件二进制内容，也不是同一事务时间点的数据库快照。真正灾备仍需 Supabase 数据库备份及 Storage 文件本体归档。',
        tables,
        storage_manifest: storageManifest,
      };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '班级数据库导出_' + exportedAt.slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);

      const note = '业务表 ' + tableNames.length + ' 张；数据行 ' + totalRows + '；存储桶 ' + Object.keys(storageManifest).length + ' 个；文件清单 ' + storageObjects + ' 项；未含文件本体';
      const { error: logError } = await supabase.from('backup_logs').insert({
        created_by: me, scope: 'database+storage-manifest', status: 'ok', note,
      });
      await alog('database_export', { tables: tableNames.length, rows: totalRows, storage_objects: storageObjects });
      setMsg(logError
        ? '数据导出完成，但备份日志写入失败：' + logError.message + '。注意：未包含媒体文件本体。'
        : '数据库数据导出完成：' + tableNames.length + ' 张表、' + totalRows + ' 行、' + storageObjects + ' 个文件清单项。注意：未包含媒体文件本体，不能视为完整灾备。');
      load();
    } catch (e: any) {
      const message = e instanceof Error ? e.message : String(e);
      setMsg('导出中止，未生成成功备份：' + message);
      try {
        await supabase.from('backup_logs').insert({
          created_by: me, scope: 'database+storage-manifest', status: 'fail', note: message.slice(0, 1000),
        });
      } catch { /* Keep the original export failure visible. */ }
    }
  }

  return <div className="admin-settings-page">
    <div style={card}>
      <h3 style={h3}>全站设置</h3>
      <label style={mut}>网站标题</label>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <input value={vals.site_title ?? ''} onChange={e => setVals({ ...vals, site_title: e.target.value })} style={{ flex: 1 }} />
        <button className="mini" onClick={() => save('site_title', vals.site_title ?? '')}>保存</button>
      </div>
      <label style={mut}>副标题</label>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <input value={vals.site_subtitle ?? ''} onChange={e => setVals({ ...vals, site_subtitle: e.target.value })} style={{ flex: 1 }} />
        <button className="mini" onClick={() => save('site_subtitle', vals.site_subtitle ?? '')}>保存</button>
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13.5 }}>注册强制邀请码</span>
        <button className={'mini' + (vals.require_invite === 'true' ? '' : ' ghost')}
          onClick={() => save('require_invite', vals.require_invite === 'true' ? 'false' : 'true')}>
          {vals.require_invite === 'true' ? '开' : '关'}
        </button>
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 13.5, fontWeight: 650 }}>关闭登录入口</span>
        <button className={'mini' + (vals.close_login_entry === 'true' ? '' : ' ghost')}
          onClick={async () => {
            const next = vals.close_login_entry === 'true' ? 'false' : 'true';
            if (next === 'true' && !(await confirmDialog('关闭后，网站普通登录和注册入口将隐藏；已有登录会话不受影响，管理员后台入口仍保留。确定继续？'))) return;
            save('close_login_entry', next);
          }}>
          {vals.close_login_entry === 'true' ? '已关闭' : '开放中'}
        </button>
      </div>
      <p style={{ ...mut, margin: '0 0 12px' }}>关闭后，未登录访客不能从网站登录或注册；已有账号不会被强制退出。</p>
      <div className="row" style={{ gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 13.5, fontWeight: 650 }}>跳过登录界面（访客浏览）</span>
        <button className={'mini' + (vals.skip_login_screen === 'true' ? '' : ' ghost')}
          onClick={async () => {
            const next = vals.skip_login_screen === 'true' ? 'false' : 'true';
            if (next === 'true' && !(await confirmDialog('开启后，未登录访客可直接查看公开首页和管理员公告；成员资料、动态、私聊、个人中心及所有互动仍需登录。确定开启？'))) return;
            save('skip_login_screen', next);
          }}>
          {vals.skip_login_screen === 'true' ? '开启' : '关闭'}
        </button>
      </div>
      <p style={{ ...mut, margin: '0 0 12px' }}>访客仅能查看公开首页与管理员公告，不会获得成员身份，也不能写入内容。</p>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13.5 }}>维护模式（手动开关）</span>
        <button className={'mini' + (vals.maintenance === 'true' ? '' : ' ghost')}
          onClick={async () => {
            if (vals.maintenance !== 'true' && !(await confirmDialog('开启维护模式？所有人打开网站都只看到维护页（后台入口除外）。'))) return;
            save('maintenance', vals.maintenance === 'true' ? 'false' : 'true');
          }}>
          {vals.maintenance === 'true' ? '开' : '关'}
        </button>
      </div>
      <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e5eaf2' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>定时开启与关闭</div>
        <p style={{ ...mut, margin: '0 0 10px' }}>按当前设备时区设置。计划启用后优先于手动开关：到开启时间自动进入维护模式，到关闭时间自动恢复网站；取消计划后恢复手动控制。</p>
        <label style={mut}>自动开启时间</label>
        <DateTimeField value={scheduleStart} onChange={setScheduleStart} style={{ margin: '5px 0 10px' }} />
        <label style={mut}>自动关闭时间</label>
        <DateTimeField value={scheduleEnd} onChange={setScheduleEnd} style={{ margin: '5px 0 10px' }} />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="pri" style={{ width: 'auto' }} disabled={scheduleBusy} onClick={() => void saveMaintenanceSchedule()}>{scheduleBusy ? '处理中…' : '保存并启用计划'}</button>
          <button className="mini ghost" disabled={scheduleBusy || !scheduleEnabled} onClick={() => void clearMaintenanceSchedule()}>取消定时计划</button>
        </div>
        {scheduleEnabled && <p style={{ ...mut, margin: '9px 0 0', color: '#16835d' }}>定时计划已启用 · {scheduleStart ? new Date(scheduleStart).toLocaleString() : '未设置'} 至 {scheduleEnd ? new Date(scheduleEnd).toLocaleString() : '未设置'}</p>}
      </div>
      <label style={{ ...mut, marginTop: 8 }}>维护标题</label>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <input value={vals.maintenance_title ?? ''} onChange={e => setVals({ ...vals, maintenance_title: e.target.value })} style={{ flex: 1 }} placeholder="默认：系统维护中" />
        <button className="mini" onClick={() => save('maintenance_title', vals.maintenance_title ?? '')}>保存</button>
      </div>
      <label style={mut}>维护提示语</label>
      <div className="row" style={{ gap: 8 }}>
        <input value={vals.maintenance_msg ?? ''} onChange={e => setVals({ ...vals, maintenance_msg: e.target.value })} style={{ flex: 1 }} placeholder="默认：系统维护中，稍后再来" />
        <button className="mini" onClick={() => save('maintenance_msg', vals.maintenance_msg ?? '')}>保存</button>
      </div>
      <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e5eaf2' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>恢复邮件通知</div>
        <p style={{ ...mut, margin: '0 0 10px' }}>维护期间在维护页登记邮箱的访客（当前 {notifyCount} 人）。关闭维护后点发送，系统会给他们每人发一封「网站已恢复」邮件；发送成功的人会自动从名单移除，失败的保留待重试。</p>
        <button className="pri" style={{ width: 'auto' }} disabled={notifyBusy || notifyCount === 0} onClick={() => void sendNotify()}>
          {notifyBusy ? '发送中…' : notifyConfirm ? `确认发送给 ${notifyCount} 人？` : `发送恢复通知（${notifyCount} 人）`}
        </button>
      </div>
    </div>

    <div style={card}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h3 style={h3}>游客访问管理</h3>
        <span style={{ ...mut, fontSize: 11 }}>只读访问 · 不计入成员</span>
      </div>
      <p style={mut}>游客无需邮箱和密码，只能查看你允许公开的内容。游客昵称保存在当前标签页，不创建正式账号，也不会计入成员人数或在线成员统计。</p>

      <div style={{ display: 'grid', gap: 9 }}>
        {([
          { key: 'guest_browse_enabled', label: '游客浏览总开关', detail: '关闭后停止新的游客进入，并让现有游客会话自动退出。' },
          { key: 'guest_entry_visible', label: '显示「游客登录」按钮', detail: '关闭后隐藏登录页、公开首页和入口关闭页中的游客按钮。' },
          { key: 'guest_show_love_wall', label: '允许游客查看表白墙', detail: '关闭后游客无法读取表白内容、评论数量及表白墙附件。' },
          { key: 'guest_show_announcements', label: '允许游客查看公告', detail: '关闭后游客首页不再显示公开公告，也无法打开公告列表。' },
        ] as const).map(item => {
          const enabled = vals[item.key] !== 'false';
          return <div key={item.key} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '11px 12px', borderRadius: 12, border: '1px solid #e5eaf2', background: '#f8fafc',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{item.label}</div>
              <div style={{ ...mut, fontSize: 11.5 }}>{item.detail}</div>
              <div style={{ fontSize: 10.5, marginTop: 3, color: enabled ? '#16835d' : '#a33f48' }}>{enabled ? '已开启' : '已关闭'}</div>
            </div>
            <button type="button" className={enabled ? 'mini ghost' : 'mini'}
              style={{ minWidth: 74, flexShrink: 0 }}
              onClick={async () => {
                const next = !enabled;
                if (!next && !(await confirmDialog(
                  item.key === 'guest_browse_enabled'
                    ? '关闭游客浏览后，游客将不能继续浏览；正式账号不受影响。确定关闭？'
                    : `关闭「${item.label}」后，游客将无法再看到对应入口或内容。确定继续？`,
                  { danger: true }
                ))) return;
                void save(item.key, String(next));
              }}>
              {enabled ? '关闭' : '开启'}
            </button>
          </div>;
        })}
      </div>

      <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e5eaf2' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>游客会话有效期</div>
        <p style={{ ...mut, margin: '0 0 9px' }}>从游客进入时开始计时，到期自动退出；浏览期间不会自动延长。关闭浏览器标签页也会结束本次游客身份。</p>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {GUEST_SESSION_DURATIONS.map(option => {
            const active = Number(vals.guest_session_minutes || 60) === option.value;
            return <button key={option.value} type="button"
              className={active ? 'mini' : 'mini ghost'}
              onClick={() => void save('guest_session_minutes', String(option.value))}
              style={{ minWidth: 72 }}>
              {option.label}
            </button>;
          })}
        </div>
        <p style={{ ...mut, margin: '8px 0 0' }}>当前有效期：{GUEST_SESSION_DURATIONS.find(x => x.value === Number(vals.guest_session_minutes || 60))?.label || '1 小时'}</p>
      </div>

      <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e5eaf2' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>定时开放游客入口</div>
        <p style={{ ...mut, margin: '0 0 10px' }}>按当前设备时区设置。计划启用后，只有在开始与结束时间之间允许游客进入；到期自动关闭，不需要管理员在线。</p>
        <label style={mut}>开放开始时间</label>
        <DateTimeField value={guestScheduleStart} onChange={setGuestScheduleStart} style={{ margin: '5px 0 10px' }} />
        <label style={mut}>开放结束时间</label>
        <DateTimeField value={guestScheduleEnd} onChange={setGuestScheduleEnd} style={{ margin: '5px 0 10px' }} />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="pri" style={{ width: 'auto' }} disabled={guestScheduleBusy} onClick={() => void saveGuestSchedule()}>{guestScheduleBusy ? '处理中…' : '保存并启用计划'}</button>
          <button className="mini ghost" disabled={guestScheduleBusy || !guestScheduleEnabled} onClick={() => void clearGuestSchedule()}>取消定时计划</button>
        </div>
        {guestScheduleEnabled && <p style={{ ...mut, margin: '9px 0 0', color: '#16835d' }}>定时计划已启用 · {guestScheduleStart ? new Date(guestScheduleStart).toLocaleString() : '未设置'} 至 {guestScheduleEnd ? new Date(guestScheduleEnd).toLocaleString() : '未设置'}</p>}
      </div>

      <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: '#fff7f7', border: '1px solid #f2dddd' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#963f4a', marginBottom: 5 }}>紧急清退游客</div>
        <p style={{ ...mut, margin: '0 0 10px' }}>立即撤销所有当前游客会话。清退后游客需要重新输入昵称进入；不会影响正式成员或管理员。</p>
        <button type="button" className="mini" disabled={guestRevokeBusy} onClick={() => void revokeGuestSessions()}>
          {guestRevokeBusy ? '正在清退…' : '立即结束全部游客会话'}
        </button>
      </div>
    </div>

    <div style={card}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h3 style={h3}>全站功能开关中心</h3>
        <span style={{ ...mut, fontSize: 11 }}>数据库权限强制执行</span>
      </div>
      <p style={mut}>关闭某项功能后，数据库会拒绝普通成员提交对应的新内容；已有内容不会被删除。管理员公告保留独立权限。每次修改都会写入管理员审计日志。</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {FEATURE_FLAGS.map(feature => {
          const enabled = featureFlags[feature.key] !== false;
          return <div key={feature.key} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '11px 12px', borderRadius: 12, border: '1px solid #e5eaf2', background: '#f8fafc',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{feature.label}</div>
              <div style={{ ...mut, fontSize: 11.5 }}>{feature.detail}</div>
              <div style={{ fontSize: 10.5, marginTop: 3, color: enabled ? '#16835d' : '#ffb4b4' }}>
                {enabled ? '当前开放' : '当前暂停'}
              </div>
            </div>
            <button
              type="button"
              className={enabled ? 'mini ghost' : 'mini'}
              disabled={featureBusy !== null}
              onClick={() => void saveFeatureFlag(feature.key, !enabled)}
              style={{ minWidth: 76, flexShrink: 0 }}
            >
              {featureBusy === feature.key ? '保存中…' : enabled ? '暂停功能' : '恢复开放'}
            </button>
          </div>;
        })}
      </div>
      <p style={{ ...mut, marginBottom: 0, marginTop: 10 }}>
        说明：这些开关控制数据库写入权限，不会自动撤回已发出的消息，也不会删除历史数据。文件存储上传入口及客户端按钮的完整联动会在后续阶段继续覆盖。
      </p>
    </div>

    <MaintenanceAccessManager setMsg={setMsg} />

    <div style={card}>
      <h3 style={h3}>健康检查</h3>
      <button className="pri" style={{ width: 'auto', padding: '10px 26px' }} onClick={checkHealth}>开始检查</button>
      {health && (
        <div style={{ fontSize: 13.5, lineHeight: 2, marginTop: 8 }}>
          <div>数据库：{health.db}</div>
          <div>存储桶：{health.storage}</div>
          <div>邮件函数：{health.notify}</div>
        </div>
      )}
    </div>

    <div style={card}>
      <h3 style={h3}>数据库数据导出</h3>
      <p style={mut}>逐表分页导出全部业务数据并校验行数，同时记录 Storage 文件清单。当前导出不包含照片、音频、视频等文件本体，也不是事务级快照，不能代替完整灾备。</p>
      <button className="pri" style={{ width: 'auto', padding: '10px 26px' }} onClick={backup}>导出数据库数据与文件清单</button>
      <div style={{ marginTop: 10 }}>
        {backups.map(b => (
          <div key={b.id} style={{ fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid #ffffff0c' }}>
            {(b.created_at || '').slice(0, 16).replace('T', ' ')} · {b.scope} · {b.status === 'ok' ? '成功' : '失败'}
            {b.note ? ` · ${b.note}` : ''}
          </div>
        ))}
        {backups.length === 0 && <p style={mut}>暂无备份记录</p>}
      </div>
    </div>
  </div>;
}

/* ---------------- 邀请码 ---------------- */
/* ---------------- 反馈 ---------------- */
/* ---------------- 段位审核 ---------------- */
/* ---------------- 测试工具 ---------------- */
