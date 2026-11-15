/**
 * 站点品牌的唯一来源。
 * 品牌名与副标题都用英文；开场动画、标识、标题与邮件共用这里的写法。
 * 旧版本写进数据库或本地缓存的品牌值（堯 / 我们的班级 / 青春档案 等），读取时统一回退到当前默认值。
 */
export const BRAND_NAME = 'Class Memory';
export const BRAND_SUBTITLE = 'Our Class · Our Story';
export const BRAND_MARK = 'CM';

const RETIRED_TITLES = ['堯', '我们的班级', '青春档案', 'class', 'class-youth-archive'];
const RETIRED_SUBTITLES = ['连接人与内容', '我们的班级', '青春档案', 'class', 'class-youth-archive'];

export function resolveBrandTitle(saved?: string | null): string {
  const value = (saved ?? '').trim();
  return !value || RETIRED_TITLES.includes(value) ? BRAND_NAME : value;
}

export function resolveBrandSubtitle(saved?: string | null): string {
  const value = (saved ?? '').trim();
  return !value || RETIRED_SUBTITLES.includes(value) ? BRAND_SUBTITLE : value;
}
