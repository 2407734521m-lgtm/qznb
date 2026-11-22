import { useEffect, useRef } from 'react';
import { logAppClick, type AppClickApp } from '../lib/appClicks';
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
// app 区分主站 / 管理版：弹框、点更新、点忽略各记一次（软件点击统计）。
export default function AppUpdateDialog({ currentName, info, onIgnore, app }: {
  currentName: string;
  info: AppUpdateInfo;
  onIgnore: () => void;
  app: AppClickApp;
}) {
  const force = info.app_force_update === 'true';
  const notes = (info.app_update_notes || '').trim() || '修复了一些问题，体验更流畅了。';
  const shownRef = useRef(false);
  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    logAppClick(app, 'update_prompt_shown', 'update_dialog', {
      appVersionName: info.app_version_name,
      appVersionCode: info.app_version_code ? Number(info.app_version_code) : undefined,
    });
  }, [app, info.app_version_name, info.app_version_code]);
  const logIgnored = () => logAppClick(app, 'update_ignored', 'update_dialog', {
    appVersionName: info.app_version_name,
    appVersionCode: info.app_version_code ? Number(info.app_version_code) : undefined,
  });
  // APK 地址来自后台配置，只允许 HTTPS，避免错误或不安全协议触发跳转。
  let updateUrl = '';
  try {
    const parsed = new URL(info.app_apk_url || '', window.location.href);
    if (parsed.protocol === 'https:') updateUrl = parsed.href;
  } catch { /* Invalid update URL: keep the action disabled. */ }
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
          {!force && <button type="button" className="qz-update-close" aria-label="关闭" onClick={() => { logIgnored(); onIgnore(); }}>×</button>}
        </div>
        <div className="qz-update-versions">{currentName} → {info.app_version_name || '新版本'}{info.app_version_code ? ` · Build ${info.app_version_code}` : ''}</div>
        <div className="qz-update-notes">{notes}</div>
        <div className="qz-update-actions">
          <button type="button" className="qz-update-go" disabled={!updateUrl} onClick={() => { if (updateUrl) { logAppClick(app, 'update_click', 'update_dialog', { appVersionName: info.app_version_name, appVersionCode: info.app_version_code ? Number(info.app_version_code) : undefined }); window.location.assign(updateUrl); } }}>{updateUrl ? '下载并更新' : '更新链接暂不可用'}</button>
          {!force && <button type="button" className="qz-update-skip" onClick={() => { logIgnored(); onIgnore(); }}>忽略</button>}
        </div>
      </div>
    </div>
  );
}
