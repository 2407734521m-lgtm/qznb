import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { card, h3, mut, alog } from '../pages/admin/shared';
import { confirmDialog } from '../lib/dialog';

const KEYS = ['app_version_name', 'app_version_code', 'app_apk_url', 'app_update_notes', 'app_force_update', 'app_min_code',
  'admin_app_version_name', 'admin_app_version_code', 'admin_app_apk_url', 'admin_app_update_notes', 'admin_app_force_update', 'admin_app_min_code'];

// 应用管理：安卓 App 的版本推送独立成栏（原先在设置页里，现已移出）。
// 功能：线上状态概览、版本推送六项设置、更新框实时预览、下载链接与二维码分享、发版步骤。
// 数据仍是 site_settings 的 app_* 键，应用端经 public_app_update() 读取，保存即生效。
// 管理版「青春管理」另有一套 admin_app_* 键，管理版壳经 public_admin_app_update() 读取，两边分开推送、互不影响。
export default function AdminAppCenter({ setMsg }: { setMsg: (s: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [reach, setReach] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');

  async function load() {
    const { data } = await supabase.from('site_settings').select('key, value').in('key', KEYS);
    const o: Record<string, string> = {};
    (data ?? []).forEach((x: any) => { o[x.key] = x.value; });
    setVals(o);
    setSaved(o);
  }
  useEffect(() => { void load(); }, []);

  async function save(key: string, value: string) {
    const { error } = await supabase.from('site_settings').upsert({ key, value }, { onConflict: 'key' });
    if (error) { setMsg('保存失败：' + error.message); return; }
    await alog('setting_change', { key, value });
    setSaved(current => ({ ...current, [key]: value }));
    setMsg('已保存，打开应用的同学下次进入就会收到。');
  }

  function saveInt(key: string, label: string) {
    const v = (vals[key] ?? '').trim();
    if (!/^\d+$/.test(v)) { setMsg(label + '必须是整数'); return; }
    void save(key, v);
  }

  async function checkReach() {
    const url = (saved.app_apk_url ?? '').trim();
    if (!url) { setMsg('还没填下载地址。'); return; }
    setReach('checking');
    try {
      await fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
      setReach('ok');
    } catch {
      setReach('fail');
    }
  }

  async function copyUrl() {
    const url = (saved.app_apk_url ?? '').trim();
    if (!url) { setMsg('还没填下载地址。'); return; }
    try {
      await navigator.clipboard.writeText(url);
      setMsg('下载链接已复制，去班群粘贴发送即可。');
    } catch {
      setMsg('自动复制失败，链接在上面，长按就能复制。');
    }
  }

  const draftForce = vals.app_force_update === 'true';
  const draftAdminForce = vals.admin_app_force_update === 'true';
  const draftMin = Number(vals.app_min_code || 0) || 0;
  const previewNotes = (vals.app_update_notes ?? '').trim() || '修复了一些问题，体验更流畅了。';
  const savedUrl = (saved.app_apk_url ?? '').trim();

  return (
    <div>
      <div style={card}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h3 style={{ ...h3, margin: 0 }}>应用管理 · 线上状态</h3>
          <button className="mini ghost" onClick={() => void load()}>刷新</button>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 2, marginTop: 6 }}>
          <div>线上最新版本：<b>{saved.app_version_name || '（未设置）'}</b>（序号 {saved.app_version_code || '0'}）</div>
          <div>强制更新：{saved.app_force_update === 'true' ? '开（所有旧版必须更新）' : '关'}</div>
          <div>最低可用序号：{saved.app_min_code && saved.app_min_code !== '0' ? `${saved.app_min_code}（低于它的版本打开就必须更新）` : '不限'}</div>
          <div style={{ overflowWrap: 'anywhere' }}>下载地址：{savedUrl || '（未设置）'}</div>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center' }}>
          <button className="mini ghost" disabled={reach === 'checking'} onClick={() => void checkReach()}>
            {reach === 'checking' ? '检测中…' : '检测下载地址'}
          </button>
          {reach === 'ok' && <span style={{ fontSize: 12.5, color: '#16835d' }}>能连上（粗略检测，不保证文件就是最新包）</span>}
          {reach === 'fail' && <span style={{ fontSize: 12.5, color: '#d24545' }}>连不上，请检查地址是否填错</span>}
        </div>
      </div>

      <div style={card}>
        <h3 style={h3}>版本推送</h3>
        <p style={{ ...mut, margin: '0 0 10px' }}>同学打开应用时，应用拿自己的序号和这里比：这里更大就弹更新框。每项单独保存，保存即生效。</p>
        <label style={mut}>最新版本号（如 1.1）</label>
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input value={vals.app_version_name ?? ''} onChange={e => setVals({ ...vals, app_version_name: e.target.value })} style={{ flex: 1 }} placeholder="1.1" />
          <button className="mini" onClick={() => void save('app_version_name', (vals.app_version_name ?? '').trim())}>保存</button>
        </div>
        <label style={mut}>版本序号（整数，必须比上一版大，推送只认序号）</label>
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input value={vals.app_version_code ?? ''} inputMode="numeric" onChange={e => setVals({ ...vals, app_version_code: e.target.value.replace(/[^0-9]/g, '') })} style={{ flex: 1 }} placeholder="2" />
          <button className="mini" onClick={() => saveInt('app_version_code', '版本序号')}>保存</button>
        </div>
        <label style={mut}>安装包下载地址</label>
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input value={vals.app_apk_url ?? ''} onChange={e => setVals({ ...vals, app_apk_url: e.target.value })} style={{ flex: 1 }} placeholder="https://qianzhi.pw/app/qingchun-dangan.apk" />
          <button className="mini" onClick={() => void save('app_apk_url', (vals.app_apk_url ?? '').trim())}>保存</button>
        </div>
        <label style={mut}>更新说明（显示在更新框里，可多行）</label>
        <textarea value={vals.app_update_notes ?? ''} onChange={e => setVals({ ...vals, app_update_notes: e.target.value })} rows={5} style={{ width: '100%', marginBottom: 8 }} placeholder={'比如：\n新增了……\n修复了……'} />
        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          <button className="mini" onClick={() => void save('app_update_notes', vals.app_update_notes ?? '')}>保存说明</button>
        </div>
        <label style={mut}>最低可用序号（低于它的应用打开就必须更新，填 0 表示不限）</label>
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input value={vals.app_min_code ?? ''} inputMode="numeric" onChange={e => setVals({ ...vals, app_min_code: e.target.value.replace(/[^0-9]/g, '') })} style={{ flex: 1 }} placeholder="0" />
          <button className="mini" onClick={() => saveInt('app_min_code', '最低可用序号')}>保存</button>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13.5 }}>强制更新（所有旧版都不能忽略）</span>
          <button className={'mini' + (draftForce ? '' : ' ghost')}
            onClick={async () => {
              const next = draftForce ? 'false' : 'true';
              if (next === 'true' && !(await confirmDialog('开启强制更新后，所有旧版应用一打开就被更新框挡住，只能更新、不能忽略。确定开启？', { confirmText: '确认开启', danger: true }))) return;
              setVals({ ...vals, app_force_update: next });
              void save('app_force_update', next);
            }}>
            {draftForce ? '开' : '关'}
          </button>
        </div>
      </div>

      <div style={card}>
        <h3 style={h3}>更新框预览</h3>
        <p style={{ ...mut, margin: '0 0 10px' }}>按左边正在填的内容实时预览，同学在应用里看到的就是这样（旧版本号 1.0 为示意）。</p>
        <div style={{ maxWidth: 340, margin: '0 auto', background: '#eef1f6', borderRadius: 22, padding: 18 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '16px 16px 14px', boxShadow: '0 14px 34px rgba(10,25,50,.16)', color: '#1c2733' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'linear-gradient(140deg,#e8f1ff,#d3e4fd)', color: '#2456c8', fontWeight: 800, fontSize: 15 }}>↑</span>
              <span style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>版本更新</span>
              {!(draftForce || draftMin > 0) && <span style={{ color: '#98a2b3', fontSize: 20, lineHeight: 1 }}>×</span>}
            </div>
            <div style={{ margin: '9px 0 10px', fontSize: 12.5, color: '#7a8494' }}>1.0 → {(vals.app_version_name ?? '').trim() || '（未填）'}</div>
            <div style={{ background: '#f4f6f9', borderRadius: 13, padding: '11px 12px', fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 130, overflowY: 'auto' }}>{previewNotes}</div>
            <div style={{ display: 'flex', gap: 9, marginTop: 13 }}>
              <span style={{ flex: 1, height: 42, borderRadius: 999, background: '#2f6fed', color: '#fff', fontSize: 14.5, fontWeight: 650, display: 'grid', placeItems: 'center' }}>更新</span>
              {!(draftForce || draftMin > 0) && <span style={{ flex: 1, height: 42, borderRadius: 999, background: '#fff', border: '1px solid #dbe2ec', color: '#5d6575', fontSize: 14.5, display: 'grid', placeItems: 'center' }}>忽略</span>}
            </div>
            {(draftForce || draftMin > 0) && <p style={{ fontSize: 11.5, color: '#c23a3a', margin: '9px 0 0' }}>当前设置下是强制更新，框上没有忽略和关闭。</p>}
          </div>
        </div>
      </div>

      <div style={card}>
        <h3 style={h3}>下载与分享</h3>
        <p style={{ ...mut, margin: '0 0 8px' }}>把链接或二维码发到班群，同学点开/扫码就能装最新版；已经装了旧版的直接覆盖安装，不用卸载。</p>
        <div style={{ fontSize: 13, background: '#f4f6f9', borderRadius: 10, padding: '9px 11px', overflowWrap: 'anywhere', userSelect: 'text' }}>{savedUrl || '（先在上面填好下载地址并保存）'}</div>
        <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'flex-start' }}>
          <button className="mini" onClick={() => void copyUrl()}>复制链接</button>
          {savedUrl && (
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=176x176&margin=8&data=${encodeURIComponent(savedUrl)}`}
              alt="应用下载二维码"
              width={176}
              height={176}
              style={{ borderRadius: 12, border: '1px solid #e5eaf2', background: '#fff' }}
            />
          )}
        </div>
        <p style={{ ...mut, margin: '8px 0 0' }}>注意：现在装的 1.0 版收不到推送，得靠这个链接/二维码手动装一次 1.1；从 1.1 起就都能在上面推送了。</p>
      </div>

      <div style={card}>
        <h3 style={h3}>管理版应用 · 青春管理</h3>
        <p style={{ ...mut, margin: '0 0 10px' }}>管理员用的「青春管理」单独一套推送，和上面学生版互不影响。打开管理版时拿自己的序号和这里比，更大就弹更新框，点更新在应用内下载安装。</p>
        <div style={{ fontSize: 13.5, lineHeight: 2, marginBottom: 10 }}>
          <div>线上最新版本：<b>{saved.admin_app_version_name || '（未设置）'}</b>（序号 {saved.admin_app_version_code || '0'}）</div>
          <div>强制更新：{saved.admin_app_force_update === 'true' ? '开（所有旧版必须更新）' : '关'}</div>
          <div style={{ overflowWrap: 'anywhere' }}>下载地址：{(saved.admin_app_apk_url ?? '').trim() || '（未设置）'}</div>
        </div>
        <label style={mut}>最新版本号（如 1.1）</label>
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input value={vals.admin_app_version_name ?? ''} onChange={e => setVals({ ...vals, admin_app_version_name: e.target.value })} style={{ flex: 1 }} placeholder="1.1" />
          <button className="mini" onClick={() => void save('admin_app_version_name', (vals.admin_app_version_name ?? '').trim())}>保存</button>
        </div>
        <label style={mut}>版本序号（整数，必须比上一版大，推送只认序号）</label>
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input value={vals.admin_app_version_code ?? ''} inputMode="numeric" onChange={e => setVals({ ...vals, admin_app_version_code: e.target.value.replace(/[^0-9]/g, '') })} style={{ flex: 1 }} placeholder="2" />
          <button className="mini" onClick={() => saveInt('admin_app_version_code', '版本序号')}>保存</button>
        </div>
        <label style={mut}>安装包下载地址</label>
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input value={vals.admin_app_apk_url ?? ''} onChange={e => setVals({ ...vals, admin_app_apk_url: e.target.value })} style={{ flex: 1 }} placeholder="https://qianzhi.pw/app/qingchun-dangan-admin.apk" />
          <button className="mini" onClick={() => void save('admin_app_apk_url', (vals.admin_app_apk_url ?? '').trim())}>保存</button>
        </div>
        <label style={mut}>更新说明（显示在更新框里，可多行）</label>
        <textarea value={vals.admin_app_update_notes ?? ''} onChange={e => setVals({ ...vals, admin_app_update_notes: e.target.value })} rows={4} style={{ width: '100%', marginBottom: 8 }} placeholder={'比如：\n修复了……'} />
        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          <button className="mini" onClick={() => void save('admin_app_update_notes', vals.admin_app_update_notes ?? '')}>保存说明</button>
        </div>
        <label style={mut}>最低可用序号（低于它的管理版打开就必须更新，填 0 表示不限）</label>
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input value={vals.admin_app_min_code ?? ''} inputMode="numeric" onChange={e => setVals({ ...vals, admin_app_min_code: e.target.value.replace(/[^0-9]/g, '') })} style={{ flex: 1 }} placeholder="0" />
          <button className="mini" onClick={() => saveInt('admin_app_min_code', '最低可用序号')}>保存</button>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13.5 }}>强制更新（所有旧版都不能忽略）</span>
          <button className={'mini' + (draftAdminForce ? '' : ' ghost')}
            onClick={async () => {
              const next = draftAdminForce ? 'false' : 'true';
              if (next === 'true' && !(await confirmDialog('开启强制更新后，所有旧版管理版一打开就被更新框挡住，只能更新、不能忽略。确定开启？', { confirmText: '确认开启', danger: true }))) return;
              setVals({ ...vals, admin_app_force_update: next });
              void save('admin_app_force_update', next);
            }}>
            {draftAdminForce ? '开' : '关'}
          </button>
        </div>
        <p style={{ ...mut, margin: '10px 0 0' }}>注意：管理版第一次安装收不到推送（还没装上），先用下载地址手动装一次；装上之后再发新版就都是弹窗更新了。</p>
      </div>

      <div style={card}>
        <h3 style={h3}>发新版的步骤</h3>
        <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>
          <div>1. 先把新版安装包放好（替换网站里的安装包文件，或拿到新的直链）。</div>
          <div>2. 在「版本推送」里把版本号和版本序号一起改大，序号必须比现在的大。</div>
          <div>3. 写好更新说明，逐项点保存，保存完即生效。</div>
          <div>4. 想先自己验一遍：把序号临时再多加 1，打开自己的应用（装的得是旧一版）看弹不弹框，验完改回来。</div>
          <div>5. 重要版本可以打开强制更新，或把最低可用序号设成新版序号，老版本就必须更了。</div>
        </div>
      </div>
    </div>
  );
}
