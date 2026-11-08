import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isInApp } from '../lib/installedApp';
import { resolveApproximateRegion, saveSharedRegion } from '../lib/location';
import './BroadcastPopup.css';

type Broadcast = {
  id: number;
  kind: 'popup' | 'location';
  title: string;
  body: string;
  button_label: string;
  audience: string;
  created_at: string;
  expires_at: string | null;
};

// 管理员广播弹窗：后台「弹窗广播」发布后，成员端在主站 Shell 里轮询领取。
// - popup：普通弹窗，点按钮记「已读」，每人只弹一次。
// - location：位置征集，必须本人点同意才走定位；只保存城市/地区文字
//   （坐标在定位工具里先粗化到约 10 公里），拒绝/未授权也会回执给后台统计。
export default function BroadcastPopup({ uid }: { uid: string }) {
  const [current, setCurrent] = useState<Broadcast | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const [sharedRegion, setSharedRegion] = useState<string | null>(null);
  const currentRef = useRef<Broadcast | null>(null);
  currentRef.current = current;

  const poll = useCallback(async () => {
    if (currentRef.current) return;
    try {
      const now = new Date().toISOString();
      const audiences = isInApp() ? ['all', 'app'] : ['all', 'web'];
      const { data } = await supabase.from('admin_broadcasts')
        .select('id, kind, title, body, button_label, audience, created_at, expires_at')
        .eq('revoked', false)
        .in('audience', audiences)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('created_at', { ascending: false })
        .limit(5);
      if (!data?.length) return;
      const ids = data.map(d => d.id);
      const { data: mine } = await supabase.from('broadcast_receipts')
        .select('broadcast_id')
        .eq('user_id', uid)
        .in('broadcast_id', ids);
      const done = new Set((mine ?? []).map(r => r.broadcast_id));
      const next = data.find(d => !done.has(d.id));
      if (next) {
        setSharedRegion(null);
        setError('');
        setManual('');
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

  async function receipt(status: 'seen' | 'declined' | 'shared' | 'denied', region?: string) {
    if (!current) return;
    try {
      await supabase.from('broadcast_receipts').upsert({
        broadcast_id: current.id,
        user_id: uid,
        status,
        region: region ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'broadcast_id,user_id' });
    } catch { /* 回执失败不阻塞关闭 */ }
  }

  function close() {
    setCurrent(null);
    setBusy(false);
    setError('');
    setManual('');
    setSharedRegion(null);
    window.setTimeout(() => void poll(), 800);
  }

  async function confirmPopup() {
    await receipt('seen');
    close();
  }

  async function declineLocation() {
    await receipt('declined');
    close();
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

  const isLocation = current.kind === 'location';
  const title = current.title.trim() || (isLocation ? '位置共享邀请' : '管理员消息');

  return (
    <div className="bc-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bc-card">
        <div className="bc-kicker">{isLocation ? '位置共享' : '管理员广播'}</div>
        <h2 className="bc-title">{title}</h2>
        {current.body.trim() && <p className="bc-body">{current.body}</p>}

        {!isLocation && (
          <div className="bc-actions">
            <button type="button" className="bc-primary" onClick={() => void confirmPopup()}>
              {current.button_label.trim() || '知道了'}
            </button>
          </div>
        )}

        {isLocation && !sharedRegion && (
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

        {isLocation && sharedRegion && (
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
