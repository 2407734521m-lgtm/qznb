import { describe, expect, it } from 'vitest';
import { isBelowMinCode, isNewerAppCode } from '../installedApp';

describe('isNewerAppCode', () => {
  it('服务端序号更大才算新版', () => {
    expect(isNewerAppCode(5, 6)).toBe(true);
    expect(isNewerAppCode(1, 2)).toBe(true);
  });

  it('同版与回滚都不弹更新', () => {
    expect(isNewerAppCode(5, 5)).toBe(false);
    expect(isNewerAppCode(6, 5)).toBe(false);
  });

  it('服务端序号为 0（未配置）不算新版', () => {
    expect(isNewerAppCode(5, 0)).toBe(false);
  });
});

describe('isBelowMinCode', () => {
  it('低于最低序号时强制更新', () => {
    expect(isBelowMinCode(4, 5)).toBe(true);
    expect(isBelowMinCode(5, 5)).toBe(false);
    expect(isBelowMinCode(6, 5)).toBe(false);
  });

  it('minCode 为 0 表示未设下限，永不强制', () => {
    expect(isBelowMinCode(1, 0)).toBe(false);
    expect(isBelowMinCode(0, 0)).toBe(false);
  });
});
