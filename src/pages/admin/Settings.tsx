import { useEffect, useState } from 'react';
import { supabase, supabaseBaseUrl } from '../../lib/supabase';
import { card, h3, mut, alog } from './shared';
import MaintenanceAccessManager from './MaintenanceAccessManager';
import { confirmDialog } from '../../lib/dialog';
import DateTimeField from '../../components/DateTimeField';

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
  const [notifyCount, setNotifyCount] = useState(0);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyConfirm, setNotifyConfirm] = useState(false);

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
    const { data: bl } = await supabase.from('backup_logs').select('*').order('created_at', { ascending: false }).limit(10);
    setBackups(bl ?? []);
  }
  useEffect(() => { load(); }, []);

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

  return (<>
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
      <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: '#ffffff08', border: '1px solid #ffffff14' }}>
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
        {scheduleEnabled && <p style={{ ...mut, margin: '9px 0 0', color: '#86efac' }}>定时计划已启用 · {scheduleStart ? new Date(scheduleStart).toLocaleString() : '未设置'} 至 {scheduleEnd ? new Date(scheduleEnd).toLocaleString() : '未设置'}</p>}
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
      <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: '#ffffff08', border: '1px solid #ffffff14' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>恢复邮件通知</div>
        <p style={{ ...mut, margin: '0 0 10px' }}>维护期间在维护页登记邮箱的访客（当前 {notifyCount} 人）。关闭维护后点发送，系统会给他们每人发一封「网站已恢复」邮件；发送成功的人会自动从名单移除，失败的保留待重试。</p>
        <button className="pri" style={{ width: 'auto' }} disabled={notifyBusy || notifyCount === 0} onClick={() => void sendNotify()}>
          {notifyBusy ? '发送中…' : notifyConfirm ? `确认发送给 ${notifyCount} 人？` : `发送恢复通知（${notifyCount} 人）`}
        </button>
      </div>
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
  </>);
}

/* ---------------- 邀请码 ---------------- */
/* ---------------- 反馈 ---------------- */
/* ---------------- 段位审核 ---------------- */
/* ---------------- 测试工具 ---------------- */
