import type { SettingIconName } from '../components/SettingIcon';

/**
 * 个人中心快捷入口：把设置页里最常用的 8 个入口直接放到 /me，
 * 不用先进设置再找。其余入口（账号与安全、隐私、灵动岛、通知、
 * 字体大小等）仍在设置页里。
 */
export type MeQuickEntry = {
  label: string;
  icon: SettingIconName;
  /** 我的主页需要当前用户 id，其余入口是固定路径。 */
  href: (me: string) => string;
};

export const ME_QUICK_ENTRIES: MeQuickEntry[] = [
  { label: '我的主页', icon: 'account', href: (me) => `/members/${me}` },
  { label: '编辑资料', icon: 'settings', href: () => '/me/edit?sec=base' },
  { label: '我的相册', icon: 'photo', href: () => '/albums' },
  { label: '内容日历', icon: 'calendar', href: () => '/calendar' },
  { label: '热门特效', icon: 'palette', href: () => '/hot' },
  { label: '我的留言', icon: 'chat', href: () => '/me/greetings' },
  { label: '活动', icon: 'play', href: () => '/events' },
  { label: '我的内容管理', icon: 'content', href: () => '/me/content' },
];
