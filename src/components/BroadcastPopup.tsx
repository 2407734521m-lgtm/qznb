import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isInApp } from '../lib/installedApp';
import { resolveApproximateRegion, saveSharedRegion } from '../lib/location';
import './BroadcastPopup.css';

type BroadcastKind = 'popup' | 'location' | 'vote' | 'form' | 'signup' | 'refresh';
type Broadcast = {
  id: number;
  kind: BroadcastKind;
  title: string;
  body: string;
  button_label: string;
  audience: string;
  created_at: string;
  expires_at: string | null;
  options: unknown;
  starts_at: string | null;
  poke_at: string | null;
  poke_count: number;
  image_url: string | null;
  action_url: string | null;
  action_label: string;
  visual_style: 'standard' | 'highlight' | 'compact';
  max_impressions: number;
  repeat_interval_hours: number;
  delivery_view_count: number;
  delivery_last_viewed_at: string | null;
  poke_target_matches: boolean;
};

const KICKER: Record<BroadcastKind, string> = {
  popup: '管理员广播',
  location: '位置共享',
  vote: '投票征集',
  form: '信息征集',
  signup: '活动报名',
  refresh: '远程刷新',
};
const DEFAULT_TITLE: Record<BroadcastKind, string> = {
  popup: '管理员消息',
  location: '位置共享邀请',
  vote: '投票征集',
  form: '信息征集',
  signup: '活动报名',
  refresh: '远程刷新',
};


function voteOptions(b: Broadcast): string[] {
  if (!Array.isArray(b.options)) return [];
  return b.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0);
}

// 管理员广播弹窗：后台「弹窗广播」发布后，成员端在主站 Shell 里轮询领取。
// - popup：普通弹窗，展示次数和重复间隔由管理员配置，并记录查看、点击与关闭事件。
// - location：位置征集，必须本人点同意才走定位；只保存城市/地区文字
//   （坐标在定位工具里先粗化到约 10 公里），拒绝/未授权也会回执给后台统计。
// - vote：投票征集，选项来自 options，选一项提交，回执 status=voted、answer=选项原文。
// - form：填写征集，填文字提交，回执 status=submitted、answer=填写内容。
// - signup：报名征集，参加回执 joined、不参加回执 not_joined。
// - refresh：远程刷新，不弹窗，领到后先写回执再刷新页面（sessionStorage 防重复刷新）。
// - 受众 selected：服务端只返回当前账号的收件记录，成员端不会接收到其他人的定向广播。
// - 定时发布：starts_at 在未来的广播对成员不可见，到点自动生效。
// - 催办重弹：管理员点「催办」后（poke_at 晚于本人 declined 回执），之前选了
//   「暂不参与」的人会被重新弹一次；其他已有回执的人仍不重复弹。refresh 不参与。
//   定向催办（poke_target_ids 非空）只重弹给名单内的人；位置征集里系统未授权
//   （denied）也可被催办重弹。重弹时弹窗顶上会写明「再次提醒 · 第 N 次」。
// 三种征集都可以点「暂不参与」跳过（回执 declined），之后不再重复弹。
export default function BroadcastPopup({ uid }: { uid: string }) {
  const [current, setCurrent] = useState<Broadcast | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const [sharedRegion, setSharedRegion] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [formText, setFormText] = useState('');
  const [answered, setAnswered] = useState<string | null>(null);
  const [pokeTimes, setPokeTimes] = useState<number | null>(null);
  const currentRef = useRef<Broadcast | null>(null);
  currentRef.current = current;

  const poll = useCallback(async () => {
    if (currentRef.current) return;
    try {
      const platform = isInApp() ? 'mobile' : 'web';
      const { data, error: loadError } = await supabase.rpc('member_active_broadcasts', {
        p_client_platform: platform,
      });
      if (loadError || !data?.length) return;
      const visible = data as Broadcast[];
      if (!visible.length) return;
      const ids = visible.map(d => d.id);
      const { data: mine } = await supabase.from('broadcast_receipts')
        .select('broadcast_id, status, updated_at')
        .eq('user_id', uid)
        .in('broadcast_id', ids);
      const mineMap = new Map((mine ?? []).map(r => [r.broadcast_id, r]));
      const next = visible.find(d => {
        const r = mineMap.get(d.id);
        const canRepeat = d.kind === 'popup'
          && d.delivery_view_count < d.max_impressions
          && (!d.delivery_last_viewed_at
            || Date.now() - new Date(d.delivery_last_viewed_at).getTime() >= d.repeat_interval_hours * 60 * 60 * 1000);
        if (!r) return canRepeat || d.kind !== 'popup';
        // 普通弹窗按后台配置的展示次数和间隔控制重复显示；
        // 征集类仍按一次提交/暂不参与的回执规则处理。
        const isPokeDue = d.kind !== 'refresh'
          && (r.status === 'declined' || (d.kind === 'location' && r.status === 'denied'))
          && !!d.poke_at
          && new Date(d.poke_at).getTime() > new Date(r.updated_at).getTime()
          && d.poke_target_matches;
        return isPokeDue || canRepeat;
      });
      if (next && next.kind === 'refresh') {
        // 远程刷新：不弹窗。先写回执（刷新后靠回执排除），再用 sessionStorage 守卫防循环。
        const guardKey = `bc_refresh_done_${next.id}`;
        try {
          await supabase.from('broadcast_receipts').upsert({
            broadcast_id: next.id,
            user_id: uid,
            status: 'seen',
            region: null,
            answer: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'broadcast_id,user_id' });
        } catch { /* 回执失败也继续靠守卫避免死循环 */ }
        if (!window.sessionStorage.getItem(guardKey)) {
          window.sessionStorage.setItem(guardKey, '1');
          window.location.reload();
        }
        return;
      }
      if (next) {
        const mine = mineMap.get(next.id);
        const isPokeReshow = !!mine
          && !!next.poke_at
          && new Date(next.poke_at).getTime() > new Date(mine.updated_at).getTime()
          && (mine.status === 'declined' || (next.kind === 'location' && mine.status === 'denied'));
        setPokeTimes(isPokeReshow ? (next.poke_count ?? 1) : null);
        setSharedRegion(null);
        setError('');
        setManual('');
        setSelected('');
        setFormText('');
        setAnswered(null);
        setCurrent(next as Broadcast);
      }
    } catch { /* 轮询失败不打扰使用 */ }
  }, [uid]);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
    }, 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll]);

  const currentId = current?.id;
  useEffect(() => {
    if (currentId === undefined) return;
    void supabase.rpc('record_broadcast_delivery_event', {
      p_broadcast_id: currentId,
      p_event: 'view',
    });
  }, [currentId]);

  async function receipt(status: 'seen' | 'declined' | 'shared' | 'denied' | 'voted' | 'submitted' | 'joined' | 'not_joined', region?: string, answer?: string) {
    if (!current) return;
    try {
      await supabase.from('broadcast_receipts').upsert({
        broadcast_id: current.id,
        user_id: uid,
        status,
        region: region ?? null,
        answer: answer ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'broadcast_id,user_id' });
    } catch { /* 回执失败不阻塞关闭 */ }
  }

  function close() {
    if (current) {
      void supabase.rpc('record_broadcast_delivery_event', {
        p_broadcast_id: current.id,
        p_event: 'dismiss',
      });
    }
    setCurrent(null);
    setPokeTimes(null);
    setBusy(false);
    setError('');
    setManual('');
    setSharedRegion(null);
    setSelected('');
    setFormText('');
    setAnswered(null);
    window.setTimeout(() => void poll(), 800);
  }

  async function openPopupAction() {
    if (!current?.action_url || !current.action_url.startsWith('/') || current.action_url.startsWith('//')) return;
    const destination = current.action_url;
    setBusy(true);
    await supabase.rpc('record_broadcast_delivery_event', {
      p_broadcast_id: current.id,
      p_event: 'click',
    });
    await receipt('seen');
    setBusy(false);
    close();
    window.location.assign(destination);
  }

  async function confirmPopup() {
    await receipt('seen');
    close();
  }

  async function declineLocation() {
    await receipt('declined');
    close();
  }

  async function skipCollect() {
    await receipt('declined');
    close();
  }

  async function submitVote() {
    if (!selected) return;
    setBusy(true);
    await receipt('voted', undefined, selected);
    setBusy(false);
    setAnswered(`你投了「${selected}」，谢谢参与。`);
  }

  async function submitForm() {
    const text = formText.trim();
    if (!text) return;
    setBusy(true);
    await receipt('submitted', undefined, text);
    setBusy(false);
    setAnswered('已提交，谢谢填写。');
  }

  async function submitSignup(join: boolean) {
    setBusy(true);
    await receipt(join ? 'joined' : 'not_joined', undefined, join ? '参加' : '不参加');
    setBusy(false);
    setAnswered(join ? '已报名，活动见。' : '已记下：这次不参加。');
  }

  async function shareDevice() {
    if (!current) return;
    setBusy(true);
    setError('');
    try {
      const region = await resolveApproximateRegion();
      const saved = await saveSharedRegion(region);
      await receipt('shared', saved);
      setSharedRegion(saved);
    } catch (e) {
      const message = e instanceof Error ? e.message : '分享失败，请稍后重试或手动填写城市/地区。';
      setError(message);
      // 系统权限被明确拒绝时先记一笔，之后改手动填写成功会覆盖为 shared。
      if (message.includes('没有允许')) void receipt('denied');
    } finally {
      setBusy(false);
    }
  }

  async function shareManual() {
    if (!current) return;
    setBusy(true);
    setError('');
    try {
      const saved = await saveSharedRegion(manual);
      await receipt('shared', saved);
      setSharedRegion(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请检查城市/地区名称。');
    } finally {
      setBusy(false);
    }
  }

  if (!current) return null;

  const kind = current.kind;
  const isLocation = kind === 'location';
  const title = current.title.trim() || DEFAULT_TITLE[kind];
  const options = kind === 'vote' ? voteOptions(current) : [];

  return (
    <div className="bc-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`bc-card bc-card--${current.visual_style || 'standard'}`}>
        {current.image_url && (
          <img className="bc-image" src={current.image_url} alt="" loading="lazy" />
        )}
        <div className="bc-kicker">{KICKER[kind]}</div>
        {pokeTimes !== null && (
          <>
            <p className="bc-note" style={{ color: '#b0404f', fontWeight: 700, margin: '0 0 4px' }}>再次提醒 · 第 {pokeTimes} 次</p>
            <p className="bc-note" style={{ margin: '0 0 8px' }}>管理员再次提醒，这条之前弹过一次，请抽空处理一下。</p>
          </>
        )}
        <h2 className="bc-title">{title}</h2>
        {current.body.trim() && <p className="bc-body">{current.body}</p>}

        {answered !== null && (
          <>
            <p className="bc-success">{answered}</p>
            <div className="bc-actions">
              <button type="button" className="bc-primary" onClick={close}>完成</button>
            </div>
          </>
        )}

        {answered === null && kind === 'popup' && (
          <div className="bc-actions">
            {current.action_url && (
              <button type="button" className="bc-primary" disabled={busy} onClick={() => void openPopupAction()}>
                {busy ? '正在打开…' : current.action_label.trim() || '查看详情'}
              </button>
            )}
            <button type="button" className={current.action_url ? 'bc-ghost' : 'bc-primary'} onClick={() => void confirmPopup()}>
              {current.action_url ? '知道了' : (current.button_label.trim() || '知道了')}
            </button>
          </div>
        )}

        {answered === null && kind === 'vote' && (
          <>
            <div className="bc-vote">
              {options.map(opt => (
                <button
                  key={opt}
                  type="button"
                  className={selected === opt ? 'bc-vote-opt bc-vote-opt-on' : 'bc-vote-opt'}
                  aria-pressed={selected === opt}
                  onClick={() => setSelected(opt)}
                >
                  <span className="bc-vote-dot" aria-hidden="true">{selected === opt ? '●' : '○'}</span>
                  {opt}
                </button>
              ))}
            </div>
            {options.length === 0 && <p className="bc-error">这条投票没有设置选项，请联系管理员。</p>}
            <div className="bc-actions">
              <button type="button" className="bc-primary" disabled={busy || !selected} onClick={() => void submitVote()}>
                {busy ? '提交中…' : '提交投票'}
              </button>
              <button type="button" className="bc-ghost" disabled={busy} onClick={() => void skipCollect()}>
                暂不参与
              </button>
            </div>
          </>
        )}

        {answered === null && kind === 'form' && (
          <>
            <textarea
              className="bc-form-input"
              value={formText}
              onChange={e => setFormText(e.target.value)}
              placeholder="在这里填写…"
              maxLength={500}
              rows={4}
            />
            <div className="bc-actions">
              <button type="button" className="bc-primary" disabled={busy || formText.trim().length === 0} onClick={() => void submitForm()}>
                {busy ? '提交中…' : '提交'}
              </button>
              <button type="button" className="bc-ghost" disabled={busy} onClick={() => void skipCollect()}>
                暂不填写
              </button>
            </div>
          </>
        )}

        {answered === null && kind === 'signup' && (
          <div className="bc-actions">
            <button type="button" className="bc-primary" disabled={busy} onClick={() => void submitSignup(true)}>
              {busy ? '提交中…' : '报名参加'}
            </button>
            <button type="button" className="bc-ghost" disabled={busy} onClick={() => void submitSignup(false)}>
              不参加
            </button>
          </div>
        )}

        {answered === null && isLocation && !sharedRegion && (
          <>
            <p className="bc-note">
              同意后会弹出系统定位授权，只获取城市 / 地区（定位先粗化到约 10 公里），不会保存精确位置和街道地址。不同意也不会有任何影响。
            </p>
            {error && <p className="bc-error">{error}</p>}
            <div className="bc-actions">
              <button type="button" className="bc-primary" disabled={busy} onClick={() => void shareDevice()}>
                {busy ? '正在识别城市 / 地区…' : '同意并分享所在地区'}
              </button>
              <button type="button" className="bc-ghost" disabled={busy} onClick={() => void declineLocation()}>
                暂不分享
              </button>
            </div>
            <div className="bc-manual">
              <label htmlFor="bc-manual-input">定位用不了时，也可以自己填写城市 / 地区</label>
              <div className="bc-manual-row">
                <input
                  id="bc-manual-input"
                  value={manual}
                  onChange={e => setManual(e.target.value)}
                  placeholder="例如：平昌县 · 四川省 · 中国"
                  maxLength={80}
                />
                <button
                  type="button"
                  className="bc-ghost"
                  disabled={busy || manual.trim().length < 2}
                  onClick={() => void shareManual()}
                >
                  保存
                </button>
              </div>
            </div>
          </>
        )}

        {answered === null && isLocation && sharedRegion && (
          <>
            <p className="bc-success">已分享：{sharedRegion}<br />谢谢配合，随时可以在「我的 · 隐私设置」里撤回。</p>
            <div className="bc-actions">
              <button type="button" className="bc-primary" onClick={close}>完成</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
