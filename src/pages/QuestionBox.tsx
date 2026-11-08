import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabase';
import { alertDialog, confirmDialog, promptDialog } from '../lib/dialog';
import './QuestionBox.css';

type MemberResult = { id: string; username: string; display_name: string | null; signature?: string | null; avatar_path?: string | null };
type InboxQuestion = { id: string; question: string; answer: string | null; status: string; is_public: boolean; created_at: string; answered_at: string | null };
type SentQuestion = { id: string; question: string; answer: string | null; status: string; created_at: string; answered_at: string | null; recipient_name: string };
type PublicAnswer = { id: string; question: string; answer: string; answered_at: string };

async function callQuestionRpc<T>(name: string, args?: Record<string, unknown>) {
  return (supabase as any).rpc(name, args) as Promise<{ data: T | null; error: { message: string } | null }>;
}
function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function QuestionBox() {
  const me = useAuth().session?.user.id ?? '';
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const targetId = routeId && routeId !== me ? routeId : '';
  const [tab, setTab] = useState<'inbox' | 'sent' | 'public'>('inbox');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [members, setMembers] = useState<MemberResult[]>([]);
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<MemberResult | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [inbox, setInbox] = useState<InboxQuestion[]>([]);
  const [sent, setSent] = useState<SentQuestion[]>([]);
  const [publicAnswers, setPublicAnswers] = useState<PublicAnswer[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [publishAnswers, setPublishAnswers] = useState<Record<string, boolean>>({});

  async function loadOwn() {
    setLoading(true);
    const [received, outgoing, published] = await Promise.all([
      callQuestionRpc<InboxQuestion[]>('my_anonymous_question_inbox'),
      callQuestionRpc<SentQuestion[]>('my_sent_anonymous_questions'),
      callQuestionRpc<PublicAnswer[]>('public_anonymous_question_answers', { p_profile_id: me }),
    ]);
    if (received.error) setMessage('收件箱暂时无法加载：' + received.error.message);
    else setInbox(received.data ?? []);
    if (outgoing.error) setMessage('已发出的提问暂时无法加载：' + outgoing.error.message);
    else setSent(outgoing.data ?? []);
    if (published.error) setMessage('公开回答暂时无法加载：' + published.error.message);
    else setPublicAnswers(published.data ?? []);
    setLoading(false);
  }

  async function loadTarget() {
    setLoading(true);
    setTarget(null);
    const [memberResult, answers] = await Promise.all([
      supabase.from('profiles').select('id, username, display_name').eq('id', targetId).maybeSingle(),
      callQuestionRpc<PublicAnswer[]>('public_anonymous_question_answers', { p_profile_id: targetId }),
    ]);
    if (memberResult.error || !memberResult.data) setMessage('暂时无法打开这个成员的提问主页。');
    else setTarget(memberResult.data as MemberResult);
    if (answers.error) setMessage('公开回答暂时无法加载。');
    else setPublicAnswers(answers.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (!me) { setLoading(false); return; }
    if (targetId) void loadTarget();
    else void loadOwn();
  }, [me, targetId]);

  async function searchMembers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const needle = search.trim();
    if (!needle) { setMembers([]); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('member_directory', { q: needle, lim: 12, skip: 0 });
    setBusy(false);
    if (error) { setMessage('搜索成员失败：' + error.message); return; }
    setMembers((data ?? []) as MemberResult[]);
  }

  async function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = questionText.trim();
    if (!target || !content || busy) return;
    setBusy(true); setMessage('');
    const { error } = await callQuestionRpc<string>('submit_anonymous_question', {
      p_recipient_id: target.id,
      p_content: content,
    });
    setBusy(false);
    if (error) { setMessage('发送失败：' + error.message); return; }
    setQuestionText('');
    setMessage('提问已匿名送达。对方不会看到你的账号信息。');
  }

  async function answerQuestion(question: InboxQuestion) {
    const answer = (draftAnswers[question.id] ?? '').trim();
    if (!answer || busy) return;
    setBusy(true); setMessage('');
    const { error } = await callQuestionRpc<boolean>('answer_anonymous_question', {
      p_question_id: question.id,
      p_answer: answer,
      p_publish: publishAnswers[question.id] === true,
    });
    setBusy(false);
    if (error) { setMessage('回答失败：' + error.message); return; }
    setDraftAnswers(current => ({ ...current, [question.id]: '' }));
    await loadOwn();
    setMessage(publishAnswers[question.id] ? '回答已保存并公开。' : '回答已保存，仅提问者可见。');
  }

  async function removeQuestion(questionId: string) {
    if (!(await confirmDialog('确定从当前列表移除这条提问吗？'))) return;
    const { error } = await callQuestionRpc<boolean>('delete_anonymous_question', { p_question_id: questionId });
    if (error) { setMessage('操作失败：' + error.message); return; }
    await loadOwn();
  }

  async function reportQuestion(questionId: string) {
    const reason = await promptDialog('请简单说明举报原因：');
    if (reason === null || !reason.trim()) return;
    const { error } = await callQuestionRpc<boolean>('report_anonymous_question', {
      p_question_id: questionId,
      p_reason: reason.trim().slice(0, 200),
    });
    await alertDialog(error ? '举报失败：' + error.message : '举报已提交，管理员会进行审核。');
  }

  return (
    <motion.main className="question-page"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : .3, ease: [0.22, 1, .36, 1] }}>
      <header className="question-head">
        <button type="button" className="question-back" onClick={() => navigate(-1)}>‹ 返回</button>
        <span className="question-kicker">PRIVATE · ANONYMOUS</span>
        <h1>{targetId ? (target?.display_name ?? target?.username ?? '成员') + ' 的提问箱' : '匿名提问箱'}</h1>
        <p>{targetId ? '在这里留下一个问题，对方不会看到你的账号信息。' : '向成员匿名提问，也可以在这里处理收到的问题。'}</p>
      </header>

      {targetId ? (
        <>
          <section className="question-compose question-panel">
            <div className="question-panel-title">写给 {target?.display_name ?? target?.username ?? 'TA'}</div>
            <p className="question-muted">问题会以匿名形式送达。平台会保留必要记录用于防骚扰和违规处理。</p>
            <form onSubmit={sendQuestion}>
              <textarea value={questionText} maxLength={300} onChange={event => setQuestionText(event.target.value)}
                placeholder="想问 TA 什么？" rows={4} />
              <div className="question-form-foot">
                <span>{questionText.length}/300</span>
                <button type="submit" disabled={busy || !questionText.trim() || !target}>{busy ? '发送中…' : '匿名发送'}</button>
              </div>
            </form>
          </section>
          <section className="question-section">
            <div className="question-section-heading"><h2>公开回答</h2><span>{publicAnswers.length} 条</span></div>
            {publicAnswers.map(item => (
              <article className="question-answer-card" key={item.id}>
                <span className="question-label">匿名问题</span>
                <p className="question-text">{item.question}</p>
                <div className="question-answer"><span>TA 的回答</span><p>{item.answer}</p></div>
                <time>{formatDate(item.answered_at)}</time>
              </article>
            ))}
            {publicAnswers.length === 0 && <div className="question-empty">这位成员还没有公开回答。</div>}
          </section>
        </>
      ) : (
        <>
          <section className="question-panel question-search-panel">
            <div className="question-panel-title">向谁提问？</div>
            <form onSubmit={searchMembers} className="question-search">
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索成员昵称或用户名" />
              <button type="submit" disabled={busy || !search.trim()}>{busy ? '搜索中…' : '搜索'}</button>
            </form>
            {members.length > 0 && <div className="question-member-results">
              {members.map(member => (
                <button type="button" key={member.id} className="question-member-result" onClick={() => navigate('/questions/' + member.id)}>
                  <span className="question-member-avatar">{(member.display_name ?? member.username ?? '?').slice(0, 1)}</span>
                  <span><strong>{member.display_name ?? member.username}</strong><small>@{member.username}</small></span>
                  <span className="question-arrow">›</span>
                </button>
              ))}
            </div>}
          </section>

          <nav className="question-tabs" aria-label="提问箱分类">
            <button type="button" className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}>收到的（{inbox.length}）</button>
            <button type="button" className={tab === 'sent' ? 'active' : ''} onClick={() => setTab('sent')}>我发出的（{sent.length}）</button>
            <button type="button" className={tab === 'public' ? 'active' : ''} onClick={() => setTab('public')}>已公开回答（{publicAnswers.length}）</button>
          </nav>

          {loading ? <div className="question-empty">正在加载…</div> : (
            <section className="question-section">
              {tab === 'inbox' && inbox.map(question => (
                <article className="question-answer-card" key={question.id}>
                  <div className="question-card-head"><span className="question-label">匿名提问</span><time>{formatDate(question.created_at)}</time></div>
                  <p className="question-text">{question.question}</p>
                  {question.status === 'pending' ? (
                    <div className="question-reply">
                      <textarea rows={3} maxLength={600} value={draftAnswers[question.id] ?? ''}
                        onChange={event => setDraftAnswers(current => ({ ...current, [question.id]: event.target.value }))}
                        placeholder="写下你的回答…" />
                      <label><input type="checkbox" checked={publishAnswers[question.id] === true}
                        onChange={event => setPublishAnswers(current => ({ ...current, [question.id]: event.target.checked }))} />
                        <span>公开到我的提问主页</span></label>
                      <div className="question-form-foot">
                        <span>仅在你主动选择公开时，其他成员才能看到。</span>
                        <button type="button" disabled={busy || !(draftAnswers[question.id] ?? '').trim()}
                          onClick={() => void answerQuestion(question)}>{busy ? '保存中…' : '回答'}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="question-answer"><span>{question.is_public ? '已公开回答' : '你的回答（仅提问者可见）'}</span><p>{question.answer}</p></div>
                  )}
                  <div className="question-card-actions">
                    <button type="button" onClick={() => void reportQuestion(question.id)}>举报</button>
                    <button type="button" onClick={() => void removeQuestion(question.id)}>移除</button>
                  </div>
                </article>
              ))}
              {tab === 'inbox' && inbox.length === 0 && <div className="question-empty">还没有收到匿名提问。</div>}

              {tab === 'sent' && sent.map(question => (
                <article className="question-answer-card" key={question.id}>
                  <div className="question-card-head"><span className="question-label">发给 {question.recipient_name}</span><time>{formatDate(question.created_at)}</time></div>
                  <p className="question-text">{question.question}</p>
                  <div className="question-answer"><span>{question.answer ? '已收到回答' : '等待回答'}</span>{question.answer && <p>{question.answer}</p>}</div>
                  <div className="question-card-actions">
                    <button type="button" onClick={() => void reportQuestion(question.id)}>举报</button>
                    <button type="button" onClick={() => void removeQuestion(question.id)}>从我的记录移除</button>
                  </div>
                </article>
              ))}
              {tab === 'sent' && sent.length === 0 && <div className="question-empty">你还没有发送过匿名提问。</div>}

              {tab === 'public' && publicAnswers.map(item => (
                <article className="question-answer-card" key={item.id}>
                  <span className="question-label">匿名问题 · 已公开</span>
                  <p className="question-text">{item.question}</p>
                  <div className="question-answer"><span>我的回答</span><p>{item.answer}</p></div>
                  <time>{formatDate(item.answered_at)}</time>
                </article>
              ))}
              {tab === 'public' && publicAnswers.length === 0 && <div className="question-empty">你还没有公开回答。</div>}
            </section>
          )}
        </>
      )}
      {message && <p className="question-message" role="status">{message}</p>}
    </motion.main>
  );
}
