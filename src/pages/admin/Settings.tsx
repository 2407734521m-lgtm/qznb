import { useEffect, useState } from 'react';
import { supabase, supabaseBaseUrl } from '../../lib/supabase';
import { card, h3, mut, alog } from './shared';
import MaintenanceAccessManager from './MaintenanceAccessManager';

export default function Settings({ me, setMsg }: { me: string; setMsg: (s: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase.from('site_settings').select('key, value');
    const o: Record<string, string> = {};
    (data ?? []).forEach((x: any) => { o[x.key] = x.value; });
    setVals(o);
    const { data: bl } = await supabase.from('backup_logs').select('*').order('created_at', { ascending: false }).limit(10);
    setBackups(bl ?? []);
  }
  useEffect(() => { load(); }, []);

  async function save(key: string, value: string) {
    const { error } = await supabase.from('site_settings').upsert({ key, value }, { onConflict: 'key' });
    if (!error) { await alog('setting_change', { key, value }); setMsg('已保存'); load(); }
    else setMsg('保存失败：' + error.message);
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
    if (!confirm('导出全站数据备份？文件会直接下载到本机，不经过公开链接。')) return;
    setMsg('正在备份…');
    try {
      const [p, po, cm, al, ap, bm, fb] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, real_name, role, joined, created_at, age, personality, signature, bio, hobbies'),
        supabase.from('posts').select('*').limit(2000),
        supabase.from('comments').select('*').limit(5000),
        supabase.from('albums').select('*').limit(500),
        supabase.from('album_photos').select('id, album_id, photo_url, caption, created_at').limit(5000),
        supabase.from('board_messages').select('*').limit(2000),
        supabase.from('feedbacks').select('*').limit(2000),
      ]);
      const data = {
        backup_at: new Date().toISOString(), scope: 'full',
        profiles: p.data ?? [], posts: po.data ?? [], comments: cm.data ?? [],
        albums: al.data ?? [], album_photos: ap.data ?? [], board: bm.data ?? [], feedbacks: fb.data ?? [],
      };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `班级备份_${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(a.href);
      await supabase.from('backup_logs').insert({ created_by: me, scope: 'full', status: 'ok', note: `成员${(p.data ?? []).length} 动态${(po.data ?? []).length}` });
      await alog('backup', { scope: 'full' });
      setMsg('备份完成，文件已下载'); load();
    } catch (e: any) {
      setMsg('备份失败：' + (e.message || ''));
      try { await supabase.from('backup_logs').insert({ created_by: me, scope: 'full', status: 'fail', note: e.message || '' }); } catch {}
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
          onClick={() => {
            const next = vals.close_login_entry === 'true' ? 'false' : 'true';
            if (next === 'true' && !confirm('关闭后，网站普通登录和注册入口将隐藏；已有登录会话不受影响，管理员后台入口仍保留。确定继续？')) return;
            save('close_login_entry', next);
          }}>
          {vals.close_login_entry === 'true' ? '已关闭' : '开放中'}
        </button>
      </div>
      <p style={{ ...mut, margin: '0 0 12px' }}>关闭后，未登录访客不能从网站登录或注册；已有账号不会被强制退出。</p>
      <div className="row" style={{ gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 13.5, fontWeight: 650 }}>跳过登录界面（访客浏览）</span>
        <button className={'mini' + (vals.skip_login_screen === 'true' ? '' : ' ghost')}
          onClick={() => {
            const next = vals.skip_login_screen === 'true' ? 'false' : 'true';
            if (next === 'true' && !confirm('开启后，未登录访客可直接查看公开首页和管理员公告；成员资料、动态、私聊、个人中心及所有互动仍需登录。确定开启？')) return;
            save('skip_login_screen', next);
          }}>
          {vals.skip_login_screen === 'true' ? '开启' : '关闭'}
        </button>
      </div>
      <p style={{ ...mut, margin: '0 0 12px' }}>访客仅能查看公开首页与管理员公告，不会获得成员身份，也不能写入内容。</p>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13.5 }}>维护模式</span>
        <button className={'mini' + (vals.maintenance === 'true' ? '' : ' ghost')}
          onClick={() => {
            if (vals.maintenance !== 'true' && !confirm('开启维护模式？所有人打开网站都只看到维护页（后台入口除外）。')) return;
            save('maintenance', vals.maintenance === 'true' ? 'false' : 'true');
          }}>
          {vals.maintenance === 'true' ? '开' : '关'}
        </button>
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
      <h3 style={h3}>备份</h3>
      <p style={mut}>备份文件直接下载到本机，不生成公开链接。恢复前请先确认，避免覆盖新数据。</p>
      <button className="pri" style={{ width: 'auto', padding: '10px 26px' }} onClick={backup}>一键备份</button>
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
