import { describe, expect, it } from 'vitest';
import { BRAND_NAME, BRAND_SUBTITLE, resolveBrandSubtitle, resolveBrandTitle } from '../brand';

describe('resolveBrandTitle', () => {
  it('空值与废弃名回退到 Class Memory', () => {
    expect(resolveBrandTitle()).toBe(BRAND_NAME);
    expect(resolveBrandTitle(null)).toBe(BRAND_NAME);
    expect(resolveBrandTitle('')).toBe(BRAND_NAME);
    expect(resolveBrandTitle('   ')).toBe(BRAND_NAME);
    for (const retired of ['堯', '我们的班级', '青春档案', 'class', 'class-youth-archive']) {
      expect(resolveBrandTitle(retired)).toBe(BRAND_NAME);
    }
  });

  it('废弃名前后带空格也回退', () => {
    expect(resolveBrandTitle('  青春档案  ')).toBe(BRAND_NAME);
    expect(resolveBrandTitle(' 堯 ')).toBe(BRAND_NAME);
  });

  it('非废弃的自定义标题原样保留', () => {
    expect(resolveBrandTitle('Class Memory')).toBe('Class Memory');
    expect(resolveBrandTitle('十三班的记忆')).toBe('十三班的记忆');
  });
});

describe('resolveBrandSubtitle', () => {
  it('空值与废弃名回退到“我们的班级”', () => {
    expect(resolveBrandSubtitle()).toBe(BRAND_SUBTITLE);
    expect(resolveBrandSubtitle(null)).toBe(BRAND_SUBTITLE);
    expect(resolveBrandSubtitle('')).toBe(BRAND_SUBTITLE);
    for (const retired of ['连接人与内容', '青春档案', 'class', 'class-youth-archive']) {
      expect(resolveBrandSubtitle(retired)).toBe(BRAND_SUBTITLE);
    }
  });

  it('非废弃的自定义副标题原样保留', () => {
    expect(resolveBrandSubtitle('我们的班级')).toBe(BRAND_SUBTITLE);
    expect(resolveBrandSubtitle('初二 13 班')).toBe('初二 13 班');
  });
});
