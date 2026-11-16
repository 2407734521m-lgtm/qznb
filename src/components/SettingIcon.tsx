/** 设置页同款线条图标（1.8px 描边、圆角端点），供设置页与个人中心快捷入口共用。 */
export type SettingIconName =
  | 'account' | 'lock' | 'settings' | 'bell' | 'chat' | 'play' | 'wallpaper'
  | 'palette' | 'font' | 'device' | 'key' | 'history' | 'content' | 'help'
  | 'photo' | 'calendar';

export default function SettingIcon({ name, size = 23 }: { name: SettingIconName; size?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...common}>
      {name === 'account' && <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M6.5 18c.8-2.5 2.7-3.8 5.5-3.8s4.7 1.3 5.5 3.8"/></>}
      {name === 'lock' && <><rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>}
      {name === 'settings' && <><path d="m12 2 1.3 2.4 2.7.7 2.3-1.4 2 2-1.4 2.3.7 2.7L22 12l-2.4 1.3-.7 2.7 1.4 2.3-2 2-2.3-1.4-2.7.7L12 22l-1.3-2.4-2.7-.7-2.3 1.4-2-2 1.4-2.3-.7-2.7L2 12l2.4-1.3.7-2.7-1.4-2.3 2-2 2.3 1.4 2.7-.7L12 2Z"/><circle cx="12" cy="12" r="3"/></>}
      {name === 'bell' && <><path d="M18 9a6 6 0 0 0-12 0c0 7-2.5 7-2.5 9h17C20.5 16 18 16 18 9Z"/><path d="M10 21h4"/></>}
      {name === 'chat' && <><path d="M20.5 11.5a8.5 8.5 0 0 1-9 8.5 9.8 9.8 0 0 1-4.3-1L3 20l1.2-3.7A8.1 8.1 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 8.5 8.5Z"/><circle cx="8" cy="11.5" r=".8"/><circle cx="12" cy="11.5" r=".8"/><circle cx="16" cy="11.5" r=".8"/></>}
      {name === 'play' && <><rect x="4" y="3" width="12" height="18" rx="2"/><path d="m10 8 4 4-4 4"/><path d="M19 7v10"/></>}
      {name === 'wallpaper' && <><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4m0-15.6-1.4 1.4M5.6 18.4l-1.4 1.4"/></>}
      {name === 'palette' && <><path d="M12 3a9 9 0 1 0 0 18h1.2a2.2 2.2 0 0 0 1.6-3.7 1.8 1.8 0 0 1 1.3-3h1.4A3.5 3.5 0 0 0 21 10.8C21 6.5 17 3 12 3Z"/><circle cx="7.5" cy="10" r=".9"/><circle cx="10.5" cy="6.8" r=".9"/><circle cx="15" cy="7.5" r=".9"/></>}
      {name === 'font' && <><path d="M4 19 10 5h2l6 14M6.5 13h9"/><path d="M18 17h4"/></>}
      {name === 'device' && <><rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M10 18.5h4"/></>}
      {name === 'key' && <><circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 8-8 2 2-2 2 1.5 1.5-2 2-1.5-1.5-3 3"/></>}
      {name === 'history' && <><path d="M3 12a9 9 0 1 0 2.4-6.1L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>}
      {name === 'content' && <><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h4M8 12h8M8 16h8"/></>}
      {name === 'help' && <><circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.5 1.5c-.9 1.1-2.1 1.4-2.1 3M12 17.5v.1"/></>}
      {name === 'photo' && <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 4.5-4.5 3 3L16 12l3 3"/></>}
      {name === 'calendar' && <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>}
    </svg>
  );
}
