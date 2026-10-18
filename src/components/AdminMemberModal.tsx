import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSignedUrl } from '../lib/media';

type Props = {
  memberId: string;
  onClose: () => void;
  onChanged: () => void; // 改完后刷新列表
};

type Full = {
  id: string; username: string; display_name: string | null; real_name: string | null;
  role: string; joined: boolean; created_at: string;
  age: number | null; personality: string | null; signature: string | null;
  bio: string | null; hobbies: string | null; avatar_path: string | null;
  intro_video_path: string | null; intro_video_status: string;
};

/** 管理员点进成员的详情：看基础信息 + 高级修改 + 视频审核 */
export default function AdminMemberModal({ memberId, onClose, onChanged }: Props) {
  const [f, setF] = useState<Full | null>(null);
  const [email, setEmail] = useState('');
  const [game, setGame] = useState('');
  const [presence, setPresence] = useState('');
  const [contact, setContact] = useState('');
  const [stats, setStats] = useState('');
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ display_name: '', signature: '', bio: '', personality: '', hobbies: '', age: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const videoUrl = useSignedUrl('videos', f?.intro_video_path);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select(
        'id, username, display_name, real_name, role, joined, created_at, age, personality, signature, bio, hobbies, avatar_path, intro_video_path, intro_video_status'
      ).eq('id', memberId).maybeSingle();
      if (data) {
        setF(data as Full);
        setForm({
          display_name: data.display_name || '',
          signature: data.signature || '', bio: data.bio || '',
          personality: data.personality || '', hobbies: data.hobbies || '',
          age: data.age != null ? String(data.age) : '',
        });
      }
      const { data: em } = await supabase.from('profile_emails').select('email').eq('profile_id', memberId).maybeSingle();
      if (em) setEmail((em as any).email || '');
      const { data: gp } = await supabase.from('game_profiles').select('game_name, rank, status').eq('profile_id', memberId).maybeSingle();
      if (gp) setGame(`${(gp as any).game_name}${(gp as any).rank ? ' · ' + (gp as any).rank : ''}（${(gp as any).status === 'approved' ? '已通过' : (gp as any).status === 'pending' ? '待审核' : '已驳回'}）`);
      const { data: pr } = await supabase.from('member_presence').select('location, device, updated_at').eq('profile_id', memberId).maybeSingle();
      if (pr) setPresence(`${(pr as any).location || ''}${(pr as any).location && (pr as any).device ? ' · ' : ''}${(pr as any).device || ''}`);
      const { data: ct } = await supabase.from('profile_contacts').select('contact, social').eq('profile_id', memberId).maybeSingle();
      if (ct) {
        const parts: string[] = [];
        if ((ct as any).contact) parts.push((ct as any).contact);
        if ((ct as any).social) parts.push((ct as any).social);
        if (parts.length) setContact(parts.join('；'));
      }
      const pc = await supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', memberId);
      const hc = await supabase.from('album_photos').select('id', { count: 'exact', head: true }).eq('uploaded_by', memberId);
      setStats(`${pc.count ?? 0}条动态 · ${hc.count ?? 0}张照片`);
    })();
  }, [memberId]);

  async function save() {
    setBusy(true); setMsg('');
    const ageNum = form.age.trim() === '' ? null : parseInt(form.age, 10);
    const { error } = await supabase.rpc('admin_update_profile', {
      target: memberId,
      p_display_name: form.display_name.trim() || null,
      p_signature: form.signature.trim() || null,
      p_bio: form.bio.trim() || null,
      p_personality: form.personality.trim() || null,
      p_hobbies: form.hobbies.trim() || null,
      p_age: ageNum,
    });
    setBusy(false);
    if (error) { setMsg('保存失败：' + error.message); return; }
    setMsg('已保存');
    setEdit(false);
    onChanged();
    // 刷新本地显示
    setF(prev => prev ? { ...prev, display_name: form.display_name.trim() || prev.display_name } : prev);
  }

  async function reviewVideo(ok: boolean) {
    if (!confirm(ok ? '通过这个视频？通过后成员主页会显示它。' : '驳回这个视频？')) return;
    setBusy(true); setMsg('');
    const { error } = await supabase.rpc('admin_update_profile', {
      target: memberId, p_video_status: ok ? 'approved' : 'rejected',
    });
    setBusy(false);
    if (error) { setMsg('操作失败：' + error.message); return; }
    setMsg(ok ? '已通过' : '已驳回');
    setF(prev => prev ? { ...prev, intro_video_status: ok ? 'approved' : 'rejected' } : prev);
    onChanged();
    // 邮件通知上传者（Edge Function 发，失败不影响审核结果）
    if (email) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch('https://wnddwkdfndrkxivvrxcy.supabase.co/functions/v1/notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({
            to: email,
            subject: ok ? '你的自我介绍视频已通过审核' : '你的自我介绍视频未通过审核',
            body: ok
              ? `你好，你上传的自我介绍视频已通过管理员审核，现在可以在你的主页看到了。`
              : `你好，你上传的自我介绍视频未通过管理员审核，可以修改后重新上传。`,
          }),
        });
      } catch {}
    }
  }

  const vStatus = f?.intro_video_status || 'none';
  const vLabel = vStatus === 'pending' ? '待审核' : vStatus === 'approved' ? '已通过' : vStatus === 'rejected' ? '已驳回' : '无';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000a', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div className="card" onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', borderRadius: '18px 18px 0 0', margin: 0 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>成员详情</h3>
          <button className="mini" onClick={onClose}>关闭</button>
        </div>
        {msg && <p className="priv-note" style={{ margin: '0 0 8px' }}>{msg}</p>}
        {!f ? <p className="mut">加载中…</p> : (<>
          <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 30, fontWeight: 800, width: 52, height: 52, borderRadius: '50%',
              background: 'linear-gradient(135deg,var(--a),var(--b))', color: '#1c2030',
              display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {(f.display_name || f.username || '?').slice(0, 1)}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{f.display_name || f.username}</div>
              <div className="mut" style={{ fontSize: 12 }}>@{f.username}{f.real_name ? ` · ${f.real_name}` : ''}</div>
            </div>
          </div>

          <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>基础信息</h4>
          <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 12 }}>
            <div>用户名：{f.username}</div>
            <div>邮箱：{email || '—'}</div>
            <div>真实姓名：{f.real_name || '—'}</div>
            {contact && <div>联系方式：{contact}</div>}
            <div>站内动态：{stats || '—'}</div>
            <div>角色：{f.role === 'super_admin' ? '超级管理员' : f.role === 'admin' ? '管理员' : '成员'}</div>
            <div>状态：{f.joined ? '已加入班级' : '未加入'}</div>
            <div>注册：{(f.created_at || '').slice(0, 16).replace('T', ' ')}</div>
            {presence && <div>位置设备：{presence}</div>}
            {game && <div>游戏：{game}</div>}
          </div>

          <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>详细资料</h4>
          <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 12 }}>
            <div>年龄：{f.age ?? '—'}</div>
            <div>性格：{f.personality || '—'}</div>
            <div>签名：{f.signature || '—'}</div>
            <div>简介：{f.bio || '—'}</div>
            <div>爱好：{f.hobbies || '—'}</div>
          </div>

          {(vStatus !== 'none' || f.intro_video_path) && (
            <>
              <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>自我介绍视频 · {vLabel}</h4>
              <div style={{ marginBottom: 12 }}>
                {videoUrl ? (
                  <video src={videoUrl} controls playsInline style={{ width: '100%', borderRadius: 10, background: '#000' }} />
                ) : <p className="mut" style={{ fontSize: 12.5 }}>视频加载中…</p>}
                {vStatus === 'pending' && (
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <button className="mini" disabled={busy} onClick={() => reviewVideo(true)}>通过</button>
                    <button className="mini danger" disabled={busy} onClick={() => reviewVideo(false)}>驳回</button>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="row" style={{ gap: 8, marginBottom: edit ? 10 : 0 }}>
            <button className="mini" onClick={() => setEdit(e => !e)}>{edit ? '取消编辑' : '高级修改'}</button>
          </div>
          {edit && (
            <div style={{ marginBottom: 8 }}>
              {[['display_name', '显示名'], ['age', '年龄'], ['personality', '性格'], ['signature', '签名'], ['bio', '个人简介'], ['hobbies', '兴趣爱好']].map(([k, label]) => (
                <div key={k} style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12.5 }} className="mut">{label}</label>
                  {k === 'bio' || k === 'hobbies' ? (
                    <textarea rows={2} value={(form as any)[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} style={{ marginTop: 4 }} />
                  ) : (
                    <input value={(form as any)[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                      inputMode={k === 'age' ? 'numeric' : undefined} style={{ marginTop: 4 }} />
                  )}
                </div>
              ))}
              <button className="pri" disabled={busy} onClick={save} style={{ width: '100%' }}>保存修改</button>
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}
