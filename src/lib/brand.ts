/**
 * Public brand defaults and compatibility for values saved by older releases.
 * The product is presented as Qianzhi, a general-purpose community space.
 */
export const BRAND_NAME = 'Qianzhi';
export const BRAND_SUBTITLE = 'Open Community';
export const BRAND_MARK = 'Q';

const RETIRED_TITLES = new Set([
  '堯',
  '我们的班级',
  '青春档案',
  'class',
  'class memory',
  'class-youth-archive',
]);

const RETIRED_SUBTITLES = new Set([
  '连接人与内容',
  '我们的班级',
  '青春档案',
  'our class · our story',
  'our class, our story',
  'class',
  'class-youth-archive',
]);

function isRetired(value: string, retired: Set<string>): boolean {
  return retired.has(value.toLocaleLowerCase());
}

export function resolveBrandTitle(saved?: string | null): string {
  const value = (saved ?? '').trim();
  return !value || isRetired(value, RETIRED_TITLES) ? BRAND_NAME : value;
}

export function resolveBrandSubtitle(saved?: string | null): string {
  const value = (saved ?? '').trim();
  return !value || isRetired(value, RETIRED_SUBTITLES) ? BRAND_SUBTITLE : value;
}
