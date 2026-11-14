// 表单校验纯函数：登录/注册与个人资料页共用同一口径。
// 正则与此前各页内联写死的值完全一致，抽出来只为可单测、不改校验行为。
// QQ 邮箱只接受数字 QQ 号 + @qq.com（与 qqAvatar.ts 的 QQ_EMAIL_RE 同口径）。
export function isQQEmail(email: string): boolean {
  return /^[1-9]\d{4,10}@qq\.com$/i.test(email.trim());
}

// 手机号：留空由调用方自己判断；这里只校验“填了的话是否合法”。
// 11 位数字、以 1 开头（与登录页、个人资料页原正则同义）。
export function isPhoneNumber(phone: string): boolean {
  return /^1\d{10}$/.test(phone.trim());
}

// 密码长度门槛：登录/注册与找回密码共用“至少 8 位”。
export function isPasswordLongEnough(pw: string): boolean {
  return pw.length >= 8;
}
