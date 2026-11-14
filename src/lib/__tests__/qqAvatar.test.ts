import { describe, expect, it } from 'vitest';
import { getQqAvatarPreviewUrl, getQqNumberFromEmail } from '../qqAvatar';

describe('getQqNumberFromEmail', () => {
  it('从合法 QQ 邮箱取出 QQ 号', () => {
    expect(getQqNumberFromEmail('2407734521@qq.com')).toBe('2407734521');
    expect(getQqNumberFromEmail(' 123456@qq.com ')).toBe('123456');
  });

  it('非法邮箱返回 null', () => {
    expect(getQqNumberFromEmail('abc@qq.com')).toBe(null);
    expect(getQqNumberFromEmail('123456@163.com')).toBe(null);
    expect(getQqNumberFromEmail('')).toBe(null);
  });
});

describe('getQqAvatarPreviewUrl', () => {
  it('合法邮箱拼出 QQ 头像预览地址', () => {
    const url = getQqAvatarPreviewUrl('2407734521@qq.com');
    expect(url).toBe('https://q1.qlogo.cn/g?b=qq&nk=2407734521&s=100');
  });

  it('非法邮箱不拼地址', () => {
    expect(getQqAvatarPreviewUrl('abc@qq.com')).toBe(null);
  });

  it('重试时带上重试参数', () => {
    const url = getQqAvatarPreviewUrl('123456@qq.com', 2);
    expect(url).toContain('_preview_retry=2');
  });
});
