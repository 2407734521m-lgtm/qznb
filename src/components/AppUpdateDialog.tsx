import './AppUpdateDialog.css';

export type AppUpdateInfo = {
  app_version_name?: string;
  app_version_code?: string;
  app_update_notes?: string;
  app_apk_url?: string;
  app_force_update?: string;
};

// 安卓应用更新框：只在应用壳内（UA 带 QianzhiApp 标识）且后台版本更高时由
// App Shell 挂载。样式照用户给的参考图：标题行、版本 A → B、说明面板可滚、
// 更新/忽略双按钮；强制更新时没有忽略与关闭。
export default function AppUpdateDialog({ currentName, info, onIgnore }: {
  currentName: string;
  info: AppUpdateInfo;
  onIgnore: () => void;
}) {
  const force = info.app_force_update === 'true';
  const notes = (info.app_update_notes || '').trim() || '修复了一些问题，体验更流畅了。';
  return (
    <div className="qz-update-overlay" role="dialog" aria-modal="true" aria-label="版本更新">
      <div className="qz-update-card">
        <div className="qz-update-head">
          <span className="qz-update-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 16V5m0 0-4 4m4-4 4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="qz-update-title">版本更新</span>
          {!force && <button type="button" className="qz-update-close" aria-label="关闭" onClick={onIgnore}>×</button>}
        </div>
        <div className="qz-update-versions">{currentName} → {info.app_version_name || ''}</div>
        <div className="qz-update-notes">{notes}</div>
        <div className="qz-update-actions">
          <button type="button" className="qz-update-go" onClick={() => { window.location.href = info.app_apk_url || ''; }}>更新</button>
          {!force && <button type="button" className="qz-update-skip" onClick={onIgnore}>忽略</button>}
        </div>
      </div>
    </div>
  );
}
