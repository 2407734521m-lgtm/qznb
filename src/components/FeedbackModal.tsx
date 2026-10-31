import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

// 反馈弹窗：登录页（未登录也能用）与站内共用
export default function FeedbackModal({ kind, onClose }: { kind: 'login' | 'general'; onClose: () => void }) {
  const session = useAuth().session;
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    const c = content.trim();
    if (!c) return setErr('请填写反馈内容');
    setBusy(true); setErr('');
    const { error } = await supabase.from('feedbacks').insert({
      user_id: session?.user.id ?? null,
      name: name.trim() || null,
      contact: contact.trim() || null,
      content: c.slice(0, 1000),
      kind,
    });
    setBusy(false);
    if (error) return setErr('提交失败：' + error.message);
    // 站内反馈同时发一封邮件给开发者（best-effort：邮件失败也不影响已存入后台的反馈记录）
    if (kind === 'general' && session) {
      supabase.functions.invoke('dev-feedback', {
        body: { name: name.trim(), contact: contact.trim(), content: c.slice(0, 1000) },
      }).catch(() => {});
    }
    setDone(true);
  }

  return (
    <div className="crop-mask" onClick={onClose}>
      <div className="card" style={{ width: 'min(92vw, 420px)', margin: 0, maxHeight: '86vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        {done ? (
          <>
            <h3 style={{ marginTop: 0 }}>✓ 已收到</h3>
            <p className="mut">感谢反馈，已经发给开发者了。留了联系方式的话，处理后会回复你。</p>
            <button className="pri" onClick={onClose}>好的</button>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>{kind === 'login' ? '登录问题反馈' : '意见反馈'}</h3>
            <label>怎么称呼你</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="昵称 / 姓名" maxLength={30} />
            <label>联系方式（选填）</label>
            <input value={contact} onChange={e => setContact(e.target.value)} placeholder="QQ / 微信 / 手机号" maxLength={100} />
            <label>{kind === 'login' ? '说说登录时遇到的问题' : '反馈内容'}</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} maxLength={1000}
              placeholder={kind === 'login' ? '比如：点登录没反应 / 提示密码错误…' : '想说的话…'} />
            {err && <p className="err">{err}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="ghost" style={{ flex: 1 }} onClick={onClose}>取消</button>
              <button className="pri" style={{ flex: 1 }} disabled={busy} onClick={submit}>
                {busy ? '提交中…' : '提交反馈'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
