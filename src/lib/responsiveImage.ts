/**
 * 推特图片直链按需取小尺寸：pbs.twimg.com 支持
 * ?format=jpg&name=small（680px 宽）/ medium（1200px 宽）。
 * 动态卡片手机上只显示约 332px、桌面约 700px，直接拉原图白白多下几倍流量
 * （实测一张 891px 原图 223KB，small 只要 82KB）。
 * 只改 pbs.twimg.com/media/ 直链，其他地址原样返回 null。
 */
export function twimgVariants(url: string): { src: string; srcSet: string; sizes: string } | null {
  const match = /^https:\/\/pbs\.twimg\.com\/media\/([^?#]+)/.exec(url);
  if (!match) return null;
  // 去掉可能已带的 :small / :medium / :orig 这类尺寸后缀，再按需取尺寸。
  const name = match[1].replace(/:(thumb|small|medium|large|orig)$/, '');
  const base = `https://pbs.twimg.com/media/${name}`;
  return {
    src: `${base}?format=jpg&name=small`,
    srcSet: `${base}?format=jpg&name=small 680w, ${base}?format=jpg&name=medium 1200w`,
    sizes: '(max-width: 700px) 340px, 700px',
  };
}
