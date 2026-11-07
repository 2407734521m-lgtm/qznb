// 识别安卓应用壳：新版壳 UA 带 QianzhiApp/版本名 (序号)；1.0 旧壳没这个标识，
// 但系统 WebView 的 UA 带「; wv)」记号且没有微信/QQ 等第三方内置浏览器标记，
// 据此把旧壳按 1.0 对待，让它也能收到更新弹窗（点更新会跳浏览器下载安装包）。
// 文案适配（定位等）也用它判断「在应用里还是浏览器里」。
export function detectInstalledApp(): { name: string; code: number } | null {
  const ua = navigator.userAgent;
  const m = ua.match(/QianzhiApp\/([0-9.]+) \((\d+)\)/);
  if (m) return { name: m[1], code: Number(m[2]) };
  if (/Android/.test(ua) && /; wv\)/.test(ua) && !/MicroMessenger|QQ\/|Weibo|DingTalk|AlipayClient/.test(ua)) {
    return { name: '1.0', code: 1 };
  }
  return null;
}

export function isInApp(): boolean {
  return detectInstalledApp() !== null;
}
