import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type PrivacyLevel = 'class' | 'custom' | 'private';

// 登录/注册欢迎仪式。这里仅负责引导界面；真实隐私权限必须由数据库 RLS/API 实现。
export default function WelcomeOverlay({ nick, onDone }: { nick: string; onDone: () => void }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<'welcome' | 'privacy'>('welcome');
  const [privacy, setPrivacy] = useState<PrivacyLevel>('private');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const old = localStorage.getItem('ca_privacy_level');
    if (old === 'class' || old === 'custom' || old === 'private') setPrivacy(old);
  }, []);

  function finish() {
    setSaving(true);
    // 仅保存界面偏好，不能替代服务器端隐私控制；后续需与现有 profiles schema 对接。
    try { localStorage.setItem('ca_privacy_level', privacy); } catch {}
    onDone();
  }

  const panel: React.CSSProperties = {
    width: '100%', maxWidth: 440, boxSizing: 'border-box', padding: '30px 24px',
    borderRadius: 28, background: 'rgba(18,22,34,.78)', border: '1px solid rgba(210,225,255,.16)',
    boxShadow: '0 24px 90px rgba(0,0,0,.42)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
    color: '#f5f7ff', textAlign: 'center',
  };
  const option = (id: PrivacyLevel, title: string, desc: string) => (
    <button key={id} type="button" onClick={() => setPrivacy(id)} aria-pressed={privacy === id}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '15px 16px', marginTop: 10,
        borderRadius: 16, border: privacy === id ? '1px solid #a9c7ff' : '1px solid rgba(255,255,255,.12)',
        background: privacy === id ? 'rgba(115,155,230,.18)' : 'rgba(255,255,255,.035)',
        color: '#f5f7ff', cursor: 'pointer' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700 }}>
        <span style={{ width: 18, height: 18, borderRadius: 99, border: '1px solid #a9c7ff', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{privacy === id ? '•' : ''}</span>{title}
      </span>
      <span style={{ display: 'block', margin: '7px 0 0 28px', color: '#b7bfd2', fontSize: 12, lineHeight: 1.65 }}>{desc}</span>
    </button>
  );

  return (
    <motion.div role="dialog" aria-modal="true" aria-label="班级网站欢迎引导"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0.12 : 0.35 }}
      style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20, overflowY: 'auto', background: 'radial-gradient(ellipse at 50% 35%, #202b48 0%, #0a0d15 58%, #05060a 100%)' }}>
      <motion.div style={panel} initial={reduce ? false : { y: 18, scale: .985 }} animate={{ y: 0, scale: 1 }}
        transition={{ duration: reduce ? .12 : .55, ease: [0.22, 1, .36, 1] }}>
        <div style={{ width: 86, height: 86, margin: '0 auto 22px', borderRadius: 26, display: 'grid',
          placeItems: 'center', border: '1px solid rgba(196,218,255,.45)',
          background: 'linear-gradient(145deg,rgba(182,208,255,.18),rgba(83,110,163,.05))',
          boxShadow: '0 0 42px rgba(130,170,255,.14)', position: 'relative' }}>
          <motion.div aria-hidden="true" animate={reduce ? undefined : { rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
            style={{ position: 'absolute', inset: -8, border: '1px solid rgba(169,199,255,.42)', borderRadius: 30 }} />
          <span style={{ fontSize: 27, letterSpacing: 2, fontWeight: 800, color: '#dce8ff' }}>平中</span>
        </div>
        {step === 'welcome' ? <>
          <div style={{ fontSize: 11, letterSpacing: 4, color: '#aabfe8', marginBottom: 12 }}>SCHOOL · CLASS MEMORY</div>
          <h1 style={{ fontSize: 25, lineHeight: 1.4, margin: '0 0 8px', fontWeight: 750 }}>四川省平昌中学</h1>
          <div style={{ color: '#d4dced', fontSize: 15 }}>我们的班级 · 青春档案</div>
          <p style={{ color: '#aeb8cc', fontSize: 14, lineHeight: 1.8, margin: '22px 0 24px' }}>
            {nick ? `欢迎回来，${nick}` : '欢迎来到我们的班级档案'}<br />我们会帮助你更好地管理个人资料与隐私。
          </p>
          <button type="button" onClick={() => setStep('privacy')}
            style={{ width: '100%', padding: 14, border: 0, borderRadius: 999, color: '#101521',
              background: 'linear-gradient(110deg,#dce8ff,#a9c7ff)', fontSize: 15, fontWeight: 750 }}>继续设置隐私</button>
          <button type="button" onClick={() => setStep('privacy')}
            style={{ marginTop: 12, padding: 8, border: 0, background: 'transparent', color: '#9da9c0', fontSize: 12 }}>跳过动画，继续设置</button>
        </> : <>
          <div style={{ fontSize: 11, letterSpacing: 3, color: '#aabfe8', marginBottom: 10 }}>YOUR PRIVACY</div>
          <h2 style={{ fontSize: 23, margin: '0 0 8px' }}>选择资料展示方式</h2>
          <p style={{ color: '#aeb8cc', fontSize: 13, lineHeight: 1.7, margin: '0 0 14px' }}>你可以之后在个人设置中调整。</p>
          {option('class', '班级成员可见', '允许班级成员查看你选择公开的资料。')}
          {option('custom', '自定义展示', '逐项决定姓名、头像、年龄、性格等资料是否展示。')}
          {option('private', '隐私优先', '普通成员端优先使用匿名显示，尽量减少个人资料曝光。')}
          <p style={{ color: '#8793aa', fontSize: 11, lineHeight: 1.6, textAlign: 'left', marginTop: 14 }}>
            提醒：当前此界面只记录本机偏好，尚未与数据库权限联动。正式隐私保护需完成服务端/RLS 校验；管理员权限也必须单独验证。
          </p>
          <button type="button" disabled={saving} onClick={finish}
            style={{ width: '100%', marginTop: 10, padding: 14, border: 0, borderRadius: 999,
              color: '#101521', background: 'linear-gradient(110deg,#dce8ff,#a9c7ff)',
              fontSize: 15, fontWeight: 750, opacity: saving ? .65 : 1 }}>{saving ? '正在继续…' : '完成并进入班级'}</button>
        </>}
      </motion.div>
    </motion.div>
  );
}
