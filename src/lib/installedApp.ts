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

// 识别管理员版应用壳（青春管理）：UA 带 QianzhiAdmin/版本名 (序号)。
// 管理版壳故意去掉了「; wv)」记号且不带 QianzhiApp 标识，所以上面的学生版
// 识别不会误认它；它走独立的更新通道 public_admin_app_update()，与学生版分开推送。
export function detectInstalledAdminApp(): { name: string; code: number } | null {
  const ua = navigator.userAgent;
  const nameM = ua.match(/QianzhiAdmin\/([0-9.]+)/);
  if (!nameM) return null;
  // 序号在 UA 末尾的括号里（壳拼的是「QianzhiAdmin/1.0 (1)」）；个别 WebView
  // 可能改写空格或括号格式，认不到序号时按 1 处理，至少保证能收到更新框。
  const codeM = ua.match(/\((\d+)\)\s*$/);
  return { name: nameM[1], code: codeM ? Number(codeM[1]) : 1 };
}

export function isInApp(): boolean {
  return detectInstalledApp() !== null;
}
