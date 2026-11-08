// 社交平台库 + 解析/拼装（存储格式：微信：xxx；B站：yyy）
export const SOCIAL_PLATFORMS = [
  { name: '微信', icon: '💬' },
  { name: 'QQ', icon: '🐧' },
  { name: '微博', icon: '📰' },
  { name: 'B站', icon: '📺' },
  { name: '抖音', icon: '🎵' },
  { name: '小红书', icon: '📕' },
  { name: '快手', icon: '⚡' },
  { name: '知乎', icon: '🧠' },
  { name: '豆瓣', icon: '📗' },
  { name: '网易云音乐', icon: '🎧' },
];

export type SocialItem = { p: string; a: string };

export function parseSocial(s: string): SocialItem[] {
  return (s || '').split(/[；;]/).map(x => x.trim()).filter(Boolean).map(part => {
    const i = part.search(/[：:]/);
    if (i < 0) return { p: '', a: part };
    return { p: part.slice(0, i).trim(), a: part.slice(i + 1).trim() };
  }).filter(x => x.a);
}

export function buildSocial(items: SocialItem[]): string {
  return items.filter(x => x.a.trim()).map(x => (x.p ? `${x.p}：${x.a.trim()}` : x.a.trim())).join('；');
}
