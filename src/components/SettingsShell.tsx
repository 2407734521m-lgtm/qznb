import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

// 设置子页外壳：与设置页同一套浅色纸面样式，顶部居中标题 + 左上返回设置页。
// 2026-11-07 设置六项拆独立子页时新增，各子页共用，避免每页各写一份样式。
export default function SettingsShell({ title, children }: { title: string; children: ReactNode }) {
  const nav = useNavigate();
  return (
    <main className="page qz-settings-page">
      <style>{`
        .qz-settings-page{box-sizing:border-box;min-height:100dvh;width:100%;max-width:none;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 4px) 0 24px!important;background:transparent;color:#2b2823}
        .qz-settings-page *{box-sizing:border-box}
        body:has(.qz-settings-page){color-scheme:light;background:#f5f1e9!important;color:#2b2823!important}
        body:has(.qz-settings-page) .glow,body:has(.qz-settings-page) .app-bg{display:none!important}
        body:has(.qz-settings-page) .wrap{padding-bottom:calc(150px + env(safe-area-inset-bottom))!important}
        body:has(.qz-settings-page) .topnav{background:rgba(250,247,240,.96)!important;border-bottom:1px solid #e8dfd3!important;color:#29251f!important}
        body:has(.qz-settings-page) .topnav .brand{color:#29251f!important}
        body:has(.qz-settings-page) .topnav a,body:has(.qz-settings-page) .topnav button{color:#6d6256!important}
        body:has(.qz-settings-page) .topnav a.on{color:#704632!important;background:#f1e7dc!important;box-shadow:none!important}
        .qz-settings-top{height:64px;display:flex;align-items:center;justify-content:center;position:relative;margin:0 0 18px}
        .qz-settings-top h1{font-size:22px;font-weight:500;letter-spacing:.02em;margin:0;color:#2b2823}
        .qz-settings-back{position:absolute;left:-7px;top:50%;transform:translateY(-50%);width:42px;height:42px;display:grid;place-items:center;border:0;background:transparent;color:#2b2823;cursor:pointer;padding:0}
        .qz-sub-card{background:#fff;border:0;border-radius:16px;overflow:hidden;padding:14px 18px 16px}
        .qz-sub-card p{font-size:12px;line-height:1.65;color:#786f63;margin:7px 0}
        .qz-sub-card label.qz-sub-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #eee7dd;font-size:14px;color:#2b2823}
        .qz-sub-card input[type=checkbox]{width:18px;height:18px;accent-color:#9b654b;flex:0 0 auto}
        .qz-settings-choice{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}
        .qz-settings-choice button{border:1px solid #e6dccf;border-radius:999px;background:#fff;color:#39332c;padding:8px 12px;font:inherit;font-size:13px;cursor:pointer}
        .qz-settings-choice button.active{border-color:#9b654b;background:#f4e9df;color:#80513c}
        .qz-settings-choice button:disabled{opacity:.5;cursor:default}
        .qz-settings-row-note{font-size:11px;color:#83786c;margin-top:8px}
        .qz-settings-subsection{margin-top:16px;padding-top:10px;border-top:1px solid #e9e1d6}
        .qz-sub-key-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #eee7dd;font-size:14px;color:#2b2823}
        .qz-sub-key-row button{border:1px solid #e6dccf;border-radius:999px;background:#fff;color:#a33f2e;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
        .qz-sub-time-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #eee7dd;font-size:14px;color:#2b2823}
        .qz-sub-time-row>button{border:1px solid #e6dccf!important;border-radius:9px!important;background:#fff!important;color:#302b24!important;padding:7px 10px!important;font:inherit;font-size:14px;cursor:pointer;box-shadow:none!important}
        @media(min-width:700px){
          .qz-settings-page{max-width:900px;padding:24px 0 24px!important}
          .qz-settings-top{margin-bottom:22px}
        }
      `}</style>

      <header className="qz-settings-top">
        <button className="qz-settings-back" aria-label="返回设置" onClick={() => nav('/me/settings')}>
          <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <h1>{title}</h1>
      </header>

      <div className="qz-sub-card">{children}</div>
    </main>
  );
}
