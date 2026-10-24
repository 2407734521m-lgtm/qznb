import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';

export default function FirstLoginProfileSetup({ uid, onDone }: { uid: string; onDone: () => void }) {
  const reduce = useReducedMotion();
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('profiles').select('bio').eq('id', uid).maybeSingle();
      if (alive && !error) {
        setBio(data?.bio || '');
        setReady(true);
      } else if (alive) {
        setErr('资料读取失败，请刷新后重试。');
      }
    })();
    return () => { alive = false; };
  }, [uid]);

  async function finish() {
    if (busy || !ready) return;
    setBusy(true); setErr('');
    try {
      const cleanBio = bio.trim().slice(0, 500);
      if (cleanBio) {
        const { error: bioError } = await supabase.from('profiles').update({ bio: cleanBio }).eq('id', uid);
        if (bioError) throw bioError;
      }
      // 以 Auth user_metadata 作为跨邮箱验证/跨会话的完成信号，不依赖 profile_privacy 行是否存在。
      const { error: metaError } = await supabase.auth.updateUser({
        data: { first_profile_setup_pending: false },
      });
      if (metaError) throw metaError;
      try { localStorage.setItem('ca_profile_setup_done_' + uid, '1'); } catch {}
      try { localStorage.setItem('ca_onboard_done_' + uid, '1'); } catch {}
      onDone();
    } catch (e: any) {
      setErr('保存失败：' + (e?.message || '请检查网络后重试'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div role="dialog" aria-modal="true" aria-label="首次资料设置"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0.12 : 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20, overflowY: 'auto', background: 'radial-gradient(ellipse at 50% 30%, #202b48 0%, #0a0d15 62%, #05060a 100%)' }}>
      <motion.div initial={reduce ? false : { opacity: 0, y: 18, scale: .985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduce ? 0.12 : 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: 440, boxSizing: 'border-box', padding: '28px 22px',
          borderRadius: 26, color: '#f5f7ff', background: 'rgba(18,22,34,.92)',
          border: '1px solid rgba(210,225,255,.16)', boxShadow: '0 18px 55px rgba(0,0,0,.34)' }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: '#aabfe8', marginBottom: 12 }}>YOUR CLASS · YOUR STORY</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>建立你的青春档案</h1>
        <p style={{ color: '#b7c1d5', fontSize: 13, lineHeight: 1.75, margin: '0 0 22px' }}>
          昵称已在注册时填写。头像和性格介绍都可以以后再补充。
        </p>
        <div style={{ padding: 14, borderRadius: 16, background: '#ffffff08', border: '1px solid #ffffff15', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>🙂 头像</div>
          <div style={{ color: '#b7c1d5', fontSize: 13 }}>稍后设置 · 现在可以直接跳过</div>
        </div>
        <label htmlFor="first-profile-bio" style={{ display: 'block', fontSize: 13, margin: '14px 0 8px' }}>性格介绍（选填）</label>
        <textarea id="first-profile-bio" value={bio} onChange={e => setBio(e.target.value)} maxLength={500}
          placeholder="以后再写也可以" rows={3}
          style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', borderRadius: 14, padding: 12,
            color: '#fff', background: '#ffffff08', border: '1px solid #ffffff20', font: 'inherit' }} />
        <div style={{ padding: 14, borderRadius: 16, background: '#ffffff08', border: '1px solid #ffffff15', marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>👥 资料偏好：班级成员可见</div>
          <div style={{ color: '#b7c1d5', fontSize: 12, lineHeight: 1.7 }}>
            默认资料偏好为班级成员可见；联系方式和社交账号仍默认关闭。实际访问权限仍取决于服务器端 RLS/API 设置。
          </div>
        </div>
        {err && <p role="alert" style={{ color: '#ff9a9a', fontSize: 12.5, lineHeight: 1.6 }}>{err}</p>}
        <button type="button" onClick={finish} disabled={busy || !ready}
          style={{ width: '100%', marginTop: 20, padding: 14, border: 0, borderRadius: 999,
            color: '#101521', background: 'linear-gradient(110deg,#dce8ff,#a9c7ff)',
            fontSize: 15, fontWeight: 750, opacity: busy || !ready ? .6 : 1 }}>
          {busy ? '保存中…' : !ready ? '正在读取资料…' : '完成并进入班级'}
        </button>
      </motion.div>
    </motion.div>
  );
}
