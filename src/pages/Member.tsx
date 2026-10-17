import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import Photo from '../components/Photo';
import type { M } from './Members';

export default function Member() {
  const { id = '' } = useParams(); const nav = useNavigate(); const reduce = useReducedMotion();
  const pre = (useLocation().state as { m?: M } | null)?.m;
  const [m, setM] = useState<any>(pre ?? null); const [err, setErr] = useState('');

  useEffect(() => {
    supabase.rpc('member_detail', { uid: id }).then(({ data, error }) => {
      if (error || !data?.length) setErr('无法加载该成员，可能尚未加入班级。'); else setM(data[0]);
    });
  }, [id]);
  useEffect(() => {
    const el = document.documentElement; const t = m?.theme ?? {};
    el.dataset.theme = t.theme ?? 'aurora'; el.dataset.layout = t.layout ?? 'left';
    return () => { delete el.dataset.theme; delete el.dataset.layout; };
  }, [m?.theme]);

  if (err) return <div className="center"><div className="card">{err}</div></div>;
  const name = m?.display_name ?? m?.username ?? '';
  const rows = m ? ([['性格', m.personality], ['年龄', m.age], ['个性签名', m.signature], ['简介', m.bio],
    ['兴趣爱好', m.hobbies], ['联系方式', m.contact], ['社交账号', m.social]] as [string, any][]).filter(([, v]) => v) : [];
  return (
    <>
      <button onClick={() => nav(-1)}>← 返回</button>
      <div className="profile">
        <Photo id={id} path={m?.avatar_path} name={name || '?'} />
        <div className="info">
          {[<h1 key="n">{name}</h1>, ...rows.map(([k, v]) => <p key={k}><b>{k}</b><br />{v}</p>)].map((el, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: reduce ? 0 : 40 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.25 + i * 0.07 }}>{el}</motion.div>
          ))}
        </div>
      </div>
    </>
  );
}
