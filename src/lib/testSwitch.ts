// 测试账号快切的「正在测试」标记。
// 管理后台在 admin.qianzhi.pw、主站在 qianzhi.pw，两个域名的 sessionStorage /
// localStorage 互不相通，标记只存 sessionStorage 时主站永远读不到、「结束测试」
// 按钮就永远不出现。qianzhi 域名下把标记放进父域 Cookie，两边都能读到；
// 其他域名（本地、预览）退回 sessionStorage。
const KEY = 'ca_testing_as';
const FROM_KEY = 'ca_testing_from';

function onQianzhi(): boolean {
  try { return /(^|\.)qianzhi\.pw$/i.test(window.location.hostname); } catch { return false; }
}

export function setTestingMark(label: string, fromEmail?: string): void {
  try {
    if (onQianzhi()) {
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${KEY}=${encodeURIComponent(label)}; Domain=.qianzhi.pw; Path=/; Max-Age=43200; SameSite=Lax${secure}`;
    }
    sessionStorage.setItem(KEY, label);
    if (fromEmail) sessionStorage.setItem(FROM_KEY, fromEmail);
  } catch { /* 存储不可用时静默，调用方可用 getTestingMark 复核 */ }
}

export function getTestingMark(): string | null {
  try {
    if (onQianzhi()) {
      const m = document.cookie.match(new RegExp(`(?:^|; )${KEY}=([^;]*)`));
      if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
    }
    return sessionStorage.getItem(KEY);
  } catch { return null; }
}

export function clearTestingMark(): void {
  try {
    if (onQianzhi()) {
      document.cookie = `${KEY}=; Domain=.qianzhi.pw; Path=/; Max-Age=0; SameSite=Lax`;
    }
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(FROM_KEY);
  } catch { /* 忽略 */ }
}
