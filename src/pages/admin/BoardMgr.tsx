import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { card, h3, mut, rowBtn, alog } from './shared';
import { confirmDialog } from '../../lib/dialog';

/* ---------------- 内容审核 ---------------- */
function BoardMgr({ me, setMsg }: { me: string; setMsg: (s: string) => void }) {
  const [bannerText, setBannerText] = useState('把我们的青春，留在这里');
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerBusy, setBannerBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [exp, setExp] = useState('0');
  const [popupTimes, setPopupTimes] = useState('1');
  const [list, setList] = useState<any[]>([]);
  const POP_CYCLE = ['0', '1', '2', '3', '999'];
  const popLabel = (v: any) => ({ '0': '关', '1': '1次', '2': '2次', '3': '3次', '999': '每次' } as any)[String(v ?? '0')] ?? '关';
  async function load() {
    const { data } = await supabase.from('board_messages')
      .select('id, title, content, is_pinned, popup_on_login, popup_times, expires_at, created_at').eq('is_admin_msg', true).is('deleted_at', null)
      .order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20);
    setList(data ?? []);
  }
  useEffect(() => { load(); supabase.from('site_settings').select('key,value').in('key',['home_banner_text','home_banner_url']).then(({data}) => { (data ?? []).forEach((x:any) => { if(x.key==='home_banner_text') setBannerText(x.value || '把我们的青春，留在这里'); if(x.key==='home_banner_url') setBannerUrl(x.value || ''); }); }); }, []);
  async function saveBanner() {
    setBannerBusy(true); let failure = '';
    for (const item of [{key:'home_banner_text',value:bannerText.trim().slice(0,100) || '把我们的青春，留在这里'},{key:'home_banner_url',value:bannerUrl.trim()}]) {
      const {data: found,error: readError} = await supabase.from('site_settings').select('key').eq('key',item.key).maybeSingle();
      if(readError) { failure=readError.message; break; }
      const result = found ? await supabase.from('site_settings').update({value:item.value}).eq('key',item.key) : await supabase.from('site_settings').insert(item);
      if(result.error) { failure=result.error.message; break; }
    }
    setBannerBusy(false); setMsg(failure ? '横幅保存失败：'+failure : '首页横幅设置已保存');
  }
  async function post() {
    const c = text.trim(); if (!c) return setMsg('先写点公告内容');
    const days = parseInt(exp, 10);
    const pt = parseInt(popupTimes, 10);
    const { error } = await supabase.from('board_messages').insert({
      author_id: me, title: title.trim().slice(0, 60) || null, content: c.slice(0, 500), is_admin_msg: true,
      expires_at: days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : null,
      popup_on_login: pt > 0, popup_times: pt,
    });
    if (!error) { await alog('notice_post', { len: c.length, popup_times: pt }); setTitle(''); setText(''); setExp('0'); setPopupTimes('1'); load(); setMsg('公告已发布'); }
    else setMsg('发布失败：' + error.message);
  }
  async function togglePin(n: any) {
    const { error } = await supabase.from('board_messages').update({ is_pinned: !n.is_pinned }).eq('id', n.id);
    if (!error) { await alog(n.is_pinned ? 'notice_unpin' : 'notice_pin', { id: n.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function cyclePopup(n: any) {
    const cur = String(n.popup_times ?? (n.popup_on_login ? 1 : 0));
    const next = POP_CYCLE[(POP_CYCLE.indexOf(cur) + 1) % POP_CYCLE.length];
    const pt = parseInt(next, 10);
    const { error } = await supabase.from('board_messages').update({ popup_on_login: pt > 0, popup_times: pt }).eq('id', n.id);
    if (!error) { await alog('notice_popup_set', { id: n.id, times: pt }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function del(id: number) {
    if (!(await confirmDialog('删除这条公告？', { danger: true }))) return;
    // 软删除进回收站
    const { error } = await supabase.from('board_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (!error) { await alog('notice_hide', { id }); load(); }
    else setMsg('失败：' + error.message);
  }
  return (
    <div style={card}>
      <h3 style={h3}>首页 16:9 横幅</h3>
      <p style={mut}>在这里设置首页横幅文字和图片地址；图片建议使用横向 16:9 图片的 HTTPS 地址。</p>
      <input value={bannerText} onChange={e=>setBannerText(e.target.value)} maxLength={100} placeholder="横幅标题文字" />
      <input value={bannerUrl} onChange={e=>setBannerUrl(e.target.value)} placeholder="图片 HTTPS 地址（可留空）" />
      <div style={rowBtn}><button className="pri" style={{width:'auto',padding:'10px 20px'}} disabled={bannerBusy} onClick={saveBanner}>{bannerBusy?'保存中…':'保存横幅'}</button><button className="mini ghost" disabled={bannerBusy} onClick={()=>setBannerUrl('')}>移除图片</button></div>
      <hr style={{border:0,borderTop:'1px solid #e5e7eb',margin:'18px 0'}} />
      <h3 style={h3}>公告管理</h3>
      <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60} placeholder="公告标题（可选）" style={{ marginBottom: 8 }} />
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={500} placeholder="写公告…" style={{ width: '100%' }} />
      <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="pri" style={{ width: 'auto', padding: '10px 26px' }} onClick={post}>发布公告</button>
        <span style={mut}>过期：</span>
        <select value={exp} onChange={e => setExp(e.target.value)} style={{ width: 'auto', padding: '8px' }}>
          <option value="0">不过期</option><option value="1">1 天</option>
          <option value="3">3 天</option><option value="7">7 天</option><option value="30">30 天</option>
        </select>
        <span style={mut}>登录弹窗：</span>
        <select value={popupTimes} onChange={e => setPopupTimes(e.target.value)} style={{ width: 'auto', padding: '8px' }}>
          <option value="0">不弹窗</option><option value="1">弹1次</option>
          <option value="2">弹2次</option><option value="3">弹3次</option>
          <option value="999">每次都弹</option>
        </select>
      </div>
      <div style={{ marginTop: 12 }}>
        {list.map(n => (
          <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid #ffffff0c' }}>
            <div style={{ fontSize: 13.5 }}>
              {n.is_pinned && '📌 '}
              {n.title && <b style={{ color: '#fff' }}>{n.title} </b>}
              {(n.content || '').slice(0, 80)}
            </div>
            <div style={mut}>{(n.created_at || '').slice(0, 16).replace('T', ' ')}
              {n.expires_at ? ` · 过期 ${n.expires_at.slice(0, 16).replace('T', ' ')}` : ' · 不过期'}
              {(n.popup_on_login || (n.popup_times ?? 0) > 0) ? ` · 弹窗${popLabel(n.popup_times)}` : ''}</div>
            <div style={rowBtn}>
              <button className="mini ghost" onClick={() => togglePin(n)}>{n.is_pinned ? '取消置顶' : '置顶'}</button>
              <button className="mini ghost" onClick={() => cyclePopup(n)}>弹窗：{popLabel(n.popup_times ?? (n.popup_on_login ? 1 : 0))}</button>
              <button className="mini danger" onClick={() => del(n.id)}>撤下</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p style={mut}>暂无公告</p>}
      </div>
    </div>
  );
}

