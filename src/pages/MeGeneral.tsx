import { useAuth } from '../auth';
import { useUserPreferences } from '../lib/useUserPreferences';
import SettingsShell from '../components/SettingsShell';

/** 通用设置：独立子页（原为设置页内展开面板，2026-11-07 拆出） */
export default function MeGeneral() {
  const uid = useAuth().session!.user.id;
  const { prefs, setPrefs } = useUserPreferences(uid);

  return (
    <SettingsShell title="通用设置">
      <p>页面动效</p>
      <div className="qz-settings-choice">
        {([['system', '跟随设备'], ['reduce', '减少动画'], ['full', '完整动画']] as const).map(([value, label]) => (
          <button type="button" key={value} className={prefs.motion === value ? 'active' : ''} onClick={() => setPrefs(old => ({ ...old, motion: value }))}>{label}</button>
        ))}
      </div>
      <p className="qz-settings-row-note">完整动画仍会尊重设备的减少动态效果设置。</p>
    </SettingsShell>
  );
}
