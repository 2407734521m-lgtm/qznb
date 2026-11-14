import { describe, expect, it } from 'vitest';
import { isPasswordLongEnough, isPhoneNumber, isQQEmail } from '../validate';

describe('isQQEmail', () => {
  it('接受数字 QQ 号 + @qq.com', () => {
    expect(isQQEmail('123456@qq.com')).toBe(true);
    expect(isQQEmail('2407734521@qq.com')).toBe(true);
    expect(isQQEmail('  123456@qq.com  ')).toBe(true);
    expect(isQQEmail('123456@QQ.COM')).toBe(true);
  });

  it('拒绝非 QQ 邮箱与不合规 QQ 号', () => {
    expect(isQQEmail('123456@qq.con')).toBe(false);
    expect(isQQEmail('123456@163.com')).toBe(false);
    expect(isQQEmail('abc123@qq.com')).toBe(false);
    expect(isQQEmail('1234@qq.com')).toBe(false); // 少于 5 位
    expect(isQQEmail('012345@qq.com')).toBe(false); // 0 开头
    expect(isQQEmail('123456789012@qq.com')).toBe(false); // 超过 11 位
    expect(isQQEmail('')).toBe(false);
  });
});

describe('isPhoneNumber', () => {
  it('接受 11 位、1 开头的手机号', () => {
    expect(isPhoneNumber('13800138000')).toBe(true);
    expect(isPhoneNumber(' 13800138000 ')).toBe(true);
  });

  it('拒绝位数不对或非 1 开头的号码', () => {
    expect(isPhoneNumber('1380013800')).toBe(false);
    expect(isPhoneNumber('138001380000')).toBe(false);
    expect(isPhoneNumber('23800138000')).toBe(false);
    expect(isPhoneNumber('1380013800a')).toBe(false);
    expect(isPhoneNumber('')).toBe(false);
  });
});

describe('isPasswordLongEnough', () => {
  it('至少 8 位才通过', () => {
    expect(isPasswordLongEnough('12345678')).toBe(true);
    expect(isPasswordLongEnough('1234567')).toBe(false);
    expect(isPasswordLongEnough('')).toBe(false);
  });
});
