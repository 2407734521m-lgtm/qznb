import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

type School = { id: string; name: string; slug: string; role: string; status: string };
type ClassRow = { id: string; school_id: string; grade_id: string | null; name: string; description: string | null; is_active: boolean };
type Membership = { class_id: string; profile_id: string; role: string; status: string };
type JoinRequest = { id: string; class_id: string; profile_id: string; status: string; message: string | null; created_at: string };

export default function Classes() {
  const { session } = useAuth();
  const me = session?.user.id;
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [globalRole, setGlobalRole] = useState('');

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    const [schoolResult, requestResult, roleResult] = await Promise.all([
      supabase.from('school_memberships').select('school_id, role, status, schools(id,name,slug)')
        .eq('profile_id', me).eq('status', 'active'),
      supabase.from('class_join_requests').select('id,class_id,profile_id,status,message,created_at')
        .eq('status', 'pending').order('created_at', { ascending: false }).limit(50),
      supabase.rpc('my_role'),
    ]);
    setGlobalRole(roleResult.data || '');
    if (schoolResult.error || requestResult.error) {
      setNotice({ kind: 'error', text: '班级组织数据库尚未启用，或当前账号没有相应权限。请先完成测试分支中的数据库迁移审核。' });
    }
    const schoolRows = ((schoolResult.data || []) as any[]).map(row => ({
      id: row.schools?.id || row.school_id,
      name: row.schools?.name || '我的学校',
      slug: row.schools?.slug || '',
      role: row.role,
      status: row.status,
    })) as School[];
    setSchools(schoolRows);
    setRequests((requestResult.data || []) as JoinRequest[]);
    const schoolIds = schoolRows.map(row => row.id).filter(Boolean);
    if (schoolIds.length) {
      const [classResult, memberResult] = await Promise.all([
        supabase.from('classes').select('id,school_id,grade_id,name,description,is_active')
          .in('school_id', schoolIds).eq('is_active', true).order('name'),
        supabase.from('class_memberships').select('class_id,profile_id,role,status'),
      ]);
      setClasses((classResult.data || []) as ClassRow[]);
      setMemberships((memberResult.data || []) as Membership[]);
    } else {
      setClasses([]);
      setMemberships([]);
    }
    const requestIds = [...new Set(((requestResult.data || []) as JoinRequest[]).map(row => row.profile_id))];
    if (requestIds.length) {
      const { data } = await supabase.rpc('member_directory', { q: '', lim: 50, skip: 0 });
      const map: Record<string, string> = {};
      ((data || []) as any[]).forEach(row => { map[row.id] = row.display_name || row.username || '同学'; });
      setNames(map);
    }
    setLoading(false);
  }, [me]);

  useEffect(() => { load(); }, [load]);

  async function submitJoin(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setNotice(null);
    const { data, error } = await supabase.rpc('request_class_join', {
      p_code: code.trim(), p_message: message.trim() || null,
    });
    setBusy(false);
    if (error) {
      setNotice({ kind: 'error', text: '提交失败：' + error.message });
      return;
    }
    if (!data) {
      setNotice({ kind: 'error', text: '邀请码无效、已过期或已达到使用上限。请向班级管理员确认。' });
      return;
    }
    setCode(''); setMessage('');
    setNotice({ kind: 'ok', text: '申请已提交，等待班级管理员审核。' });
    load();
  }

  async function review(row: JoinRequest, approve: boolean) {
    setBusy(true); setNotice(null);
    const { error } = await supabase.rpc('review_class_join', {
      p_request_id: row.id, p_approve: approve,
    });
    setBusy(false);
    if (error) setNotice({ kind: 'error', text: '审核失败：' + error.message });
    else {
      setNotice({ kind: 'ok', text: approve ? '已批准加入申请。' : '已拒绝该申请。' });
      load();
    }
  }

  const classMap = Object.fromEntries(classes.map(row => [row.id, row]));
  const myMemberships = memberships.filter(row => row.profile_id === me && row.status === 'active');
  const managedIds = new Set(memberships.filter(row => row.profile_id === me && row.status === 'active' && row.role === 'class_admin').map(row => row.class_id));
  const manageable = requests.filter(row => managedIds.has(row.class_id) || globalRole === 'admin' || globalRole === 'super_admin' || schools.some(s => ['owner', 'school_admin'].includes(s.role)));

  return (
    <main className="classes-page">
      <header className="classes-hero">
        <span className="classes-eyebrow">YOUR CAMPUS, YOUR PEOPLE</span>
        <h1>班级空间<span>。</span></h1>
        <p>每个班级都有自己的小世界。加入你的班级，和同学一起记录校园日常。</p>
        <div className="classes-hero-meta"><span>组织归属</span><span>班级动态</span><span>共同回忆</span></div>
      </header>

      <section className="classes-panel classes-join-panel">
        <div className="classes-panel-heading"><div><span className="classes-kicker">JOIN YOUR CLASS</span><h2>通过邀请码加入</h2></div><span className="classes-heading-icon">↗</span></div>
        <p className="classes-helper">输入班级管理员提供的邀请码。提交后需要管理员审核，通过后才会开放对应班级空间。</p>
        <form onSubmit={submitJoin} className="classes-join-form">
          <label htmlFor="class-invite-code">班级邀请码</label>
          <input id="class-invite-code" value={code} onChange={e => setCode(e.target.value)} placeholder="输入邀请码" autoComplete="off" maxLength={80} required />
          <label htmlFor="class-join-message">申请留言 <span>选填</span></label>
          <textarea id="class-join-message" value={message} onChange={e => setMessage(e.target.value)} placeholder="简单介绍一下自己，方便管理员确认" maxLength={300} rows={2} />
          <button className="classes-submit" type="submit" disabled={busy || !code.trim()}>{busy ? '正在提交…' : '提交入班申请'} <span>→</span></button>
        </form>
        {notice && <div className={'classes-notice ' + (notice.kind === 'error' ? 'is-error' : 'is-ok')} role="status">{notice.text}</div>}
      </section>

      <section className="classes-panel">
        <div className="classes-panel-heading"><div><span className="classes-kicker">YOUR COMMUNITIES</span><h2>我加入的班级</h2></div><Link to="/members" className="classes-small-link">同学档案 →</Link></div>
        {loading ? <div className="classes-empty">正在加载班级信息…</div> :
          myMemberships.length ? <div className="classes-list">{myMemberships.map(member => {
            const item = classMap[member.class_id];
            if (!item) return null;
            const school = schools.find(s => s.id === item.school_id);
            return <Link to={`/classes/${item.id}`} className="classes-card" key={item.id}>
              <div className="classes-card-mark">{item.name.slice(0, 1)}</div>
              <div className="classes-card-copy"><span>{school?.name || '校园社区'}</span><h3>{item.name}</h3><p>{item.description || '和同学一起分享日常、活动与班级回忆。'}</p></div>
              <span className="classes-member-pill">{member.role === 'class_admin' ? '班级管理员' : '已加入'}</span>
            </Link>;
          })}</div> :
          <div className="classes-empty"><span>◎</span><b>还没有加入班级</b><p>输入班级邀请码并通过审核后，班级空间会显示在这里。</p></div>}
      </section>

      {manageable.length > 0 && <section className="classes-panel">
        <div className="classes-panel-heading"><div><span className="classes-kicker">COMMUNITY CARE</span><h2>待处理的入班申请</h2></div><span className="classes-count">{manageable.length}</span></div>
        <div className="classes-request-list">{manageable.map(row => <article className="classes-request" key={row.id}>
          <div className="classes-request-avatar">{(names[row.profile_id] || '同').slice(0, 1)}</div>
          <div className="classes-request-copy"><b>{names[row.profile_id] || '申请同学'}</b><span>申请加入 {classMap[row.class_id]?.name || '本班'}</span>{row.message && <p>{row.message}</p>}<small>{new Date(row.created_at).toLocaleString()}</small></div>
          <div className="classes-request-actions"><button disabled={busy} onClick={() => review(row, true)}>通过</button><button disabled={busy} onClick={() => review(row, false)}>拒绝</button></div>
        </article>)}</div>
      </section>}
      <footer className="classes-footer">班级空间只对获准加入的成员开放，成员资料仍遵循个人隐私设置。</footer>
    </main>
  );
}
