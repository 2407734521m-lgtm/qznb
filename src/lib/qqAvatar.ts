const QQ_EMAIL_RE = /^([1-9]\d{4,10})@qq\.com$/i;

/** Return the numeric QQ account only for the numeric QQ mailbox format accepted at registration. */
export function getQqNumberFromEmail(email: string): string | null {
  return email.trim().match(QQ_EMAIL_RE)?.[1] ?? null;
}

/** Public QQ avatar image used only for the registration preview. */
export function getQqAvatarPreviewUrl(email: string): string | null {
  const qq = getQqNumberFromEmail(email);
  if (!qq) return null;

  const url = new URL('https://q1.qlogo.cn/g');
  url.searchParams.set('b', 'qq');
  url.searchParams.set('nk', qq);
  url.searchParams.set('s', '100');
  return url.toString();
}
