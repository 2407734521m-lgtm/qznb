import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { withRetry } from '../lib/retry';
import { confirmDialog } from '../lib/dialog';
import { resolveApproximateRegion, revokeSharedRegion, saveSharedRegion } from '../lib/location';
import SettingsShell from '../components/SettingsShell';

// 与编辑资料页隐私折叠栏同一批开关、同一张 profile_privacy 表（2026-11-07 从设置页拆成独立子页）。
const ROWS: [string, string][] = [
  ['show_avatar', '个人照片'], ['show_name', '名字'], ['show_age', '年龄'],
  ['show_personality', '性格'], ['show_signature', '个性签名'], ['show_bio', '个人简介'],
  ['show_hobbies', '兴趣爱好'], ['show_contact', '联系方式'], ['show_social', '社交平台'],
];
const ALL_FLAGS = [...ROWS.map(([f]) => f), 'show_game_id', 'hide_love_wall_name'];

const locationButton: React.CSSProperties = {
  border: '1px solid var(--admin-border, #dbe2ea)', borderRadius: 10, padding: '10px 12px',
  background: 'var(--qz26-surface, #fff)', color: 'var(--qz26-ink, #243044)',
  fontSize: 13, fontWeight: 650, cursor: 'pointer',
};

export default function MePrivacy() {
  const uid = useAuth().session!.user.id;
  const [priv, setPriv] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('');
  const privRef = useRef<Record<string, boolean>>({});
  const [sharedLocation, setSharedLocation] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationInput, setLocationInput] = useState('');
  const [locationStatus, setLocationStatus] = useState('');

  useEffect(() => {
    let active = true;
    supabase.from('profile_privacy').select('*').eq('profile_id', uid).single().then(({ data, error }) => {
      if (!active) return;
      if (error || !data) { setStatus('隐私设置加载失败，请刷新重试'); return; }
      const next: Record<string, boolean> = {};
      for (const f of ALL_FLAGS) next[f] = !!(data as Record<string, unknown>)[f];
      // 与编辑资料页一致：表白墙隐藏姓名缺省视为开启
      next.hide_love_wall_name = (data as Record<string, unknown>).hide_love_wall_name !== false;
      privRef.current = next; setPriv(next); setLoaded(true);
    });
    return () => { active = false; };
  }, [uid]);

  useEffect(() => {
    let active = true;
    supabase.from('member_presence')
      .select('location, location_share_enabled')
      .eq('profile_id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setLocationStatus('所在地区分享状态读取失败，请刷新重试。');
        } else {
          setSharedLocation(data?.location_share_enabled && data.location ? data.location : null);
        }
        setLocationLoading(false);
      });
    return () => { active = false; };
  }, [uid]);

  async function toggle(flag: string) {
    if (!loaded) return;
    const next = { ...privRef.current, [flag]: !privRef.current[flag] };
    privRef.current = next; setPriv(next);
    setStatus('保存中…');
    const payload = {
      show_avatar: !!next.show_avatar, show_name: !!next.show_name, show_age: !!next.show_age,
      show_personality: !!next.show_personality, show_signature: !!next.show_signature,
      show_bio: !!next.show_bio, show_hobbies: !!next.show_hobbies,
      show_contact: !!next.show_contact, show_social: !!next.show_social,
      show_game_id: !!next.show_game_id, hide_love_wall_name: !!next.hide_love_wall_name,
    };
    const { error } = await withRetry(() => supabase.from('profile_privacy').update(payload).eq('profile_id', uid));
    setStatus(error ? '保存失败：' + error.message : '已保存');
  }

  async function saveLocation(value: string) {
    setLocationBusy(true);
    setLocationStatus('正在保存…');
    try {
      const saved = await saveSharedRegion(uid, value);
      setSharedLocation(saved);
      setLocationInput('');
      setLocationStatus('已保存。该地区仅超级管理员可见。');
    } catch (error) {
      setLocationStatus(error instanceof Error ? error.message : '保存失败，请稍后重试。');
    } finally {
      setLocationBusy(false);
    }
  }

  async function shareDeviceLocation() {
    setLocationBusy(true);
    setLocationStatus('正在获取城市 / 地区…');
    try {
      const region = await resolveApproximateRegion();
      const saved = await saveSharedRegion(uid, region);
      setSharedLocation(saved);
      setLocationStatus('已保存。该地区仅超级管理员可见。');
    } catch (error) {
      setLocationStatus(error instanceof Error ? error.message : '获取失败，请手动填写城市或地区。');
    } finally {
      setLocationBusy(false);
    }
  }

  async function revokeLocation() {
    const confirmed = await confirmDialog('撤回后会立即删除已保存的城市 / 地区，管理员也将不再看到。确定撤回吗？', {
      danger: true, confirmText: '撤回并删除',
    });
    if (!confirmed) return;
    setLocationBusy(true);
    setLocationStatus('正在删除…');
    try {
      await revokeSharedRegion(uid);
      setSharedLocation(null);
      setLocationStatus('已撤回，保存的地区已删除。');
    } catch (error) {
      setLocationStatus(error instanceof Error ? error.message : '撤回失败，请稍后重试。');
    } finally {
      setLocationBusy(false);
    }
  }

  const openCount = ROWS.filter(([f]) => priv[f]).length;

  return (
    <SettingsShell title="隐私设置">
      <p>哪些资料对其他成员公开，点一下开关就行{loaded ? `（${openCount}/${ROWS.length} 项公开）` : ''}</p>
      {ROWS.map(([flag, label]) => (
        <label key={flag} className="qz-sub-row"><span>{label}</span>
          <input type="checkbox" disabled={!loaded} checked={!!priv[flag]} onChange={() => void toggle(flag)} />
        </label>
      ))}
      <div className="qz-settings-subsection">
        <p>表白墙：开启后，新发布的表白默认匿名；关闭后，新帖子显示你的昵称。只影响新帖子，老帖子保持原样。</p>
        <label className="qz-sub-row"><span>表白墙隐藏姓名</span>
          <input type="checkbox" disabled={!loaded} checked={priv.hide_love_wall_name !== false} onChange={() => void toggle('hide_love_wall_name')} />
        </label>
      </div>

      <div className="qz-settings-subsection" style={{ marginTop: 16 }}>
        <h3 style={{ margin: '0 0 7px', fontSize: 15 }}>所在地区分享</h3>
        <p style={{ margin: '0 0 10px', lineHeight: 1.7 }}>
          自愿分享城市 / 地区后，只有超级管理员能在后台成员管理中看到；普通成员看不到。这里只保存地区文字，不保存 GPS 坐标或街道门牌。
        </p>
        <div style={{ padding: 12, borderRadius: 12, border: '1px solid var(--qz26-border, #e4e8ee)', background: 'var(--qz26-surface, #fff)' }}>
          <div style={{ fontSize: 12, color: 'var(--qz26-muted, #697586)' }}>当前状态</div>
          <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: 'var(--qz26-ink, #243044)' }}>
            {locationLoading ? '正在读取…' : sharedLocation ? sharedLocation : '未分享所在地区'}
          </div>
        </div>
        {!sharedLocation && (
          <>
            <button type="button" style={{ ...locationButton, width: '100%', marginTop: 10 }}
              disabled={locationLoading || locationBusy} onClick={() => void shareDeviceLocation()}>
              {locationBusy ? '正在处理…' : '获取并分享设备所在地区'}
            </button>
            <div style={{ marginTop: 10 }}>
              <label htmlFor="privacy-manual-region" style={{ display: 'block', fontSize: 12, fontWeight: 650, marginBottom: 6 }}>
                无法定位？也可以手动填写城市 / 地区
              </label>
              <input id="privacy-manual-region" value={locationInput} maxLength={80}
                onChange={event => setLocationInput(event.target.value)}
                placeholder="例如：四川省巴中市" autoComplete="off"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
                  border: '1px solid var(--qz26-border, #dce2e9)', background: 'var(--qz26-surface, #fff)',
                  color: 'var(--qz26-ink, #243044)' }} />
              <button type="button" style={{ ...locationButton, width: '100%', marginTop: 8 }}
                disabled={locationBusy || locationInput.trim().length < 2}
                onClick={() => void saveLocation(locationInput)}>
                保存填写的地区
              </button>
            </div>
          </>
        )}
        {sharedLocation && (
          <button type="button" style={{ ...locationButton, marginTop: 10, borderColor: '#dc7777', color: '#a83f48' }}
            disabled={locationBusy} onClick={() => void revokeLocation()}>
            {locationBusy ? '正在处理…' : '撤回分享并删除地区'}
          </button>
        )}
        {locationStatus && <p role="status" style={{ margin: '9px 0 0', fontSize: 12, lineHeight: 1.6 }}>{locationStatus}</p>}
        <p style={{ margin: '8px 0 0', color: 'var(--qz26-muted, #7b8794)', fontSize: 11, lineHeight: 1.5 }}>
          设备定位会先粗略到约 10 公里级别，再由地区识别服务转换为城市 / 地区。地区识别：<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>。
        </p>
      </div>
      {status && <p role="status">{status}</p>}
    </SettingsShell>
  );
}
