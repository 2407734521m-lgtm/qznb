const QQ_EMAIL_RE = /^([1-9]\d{4,10})@qq\.com$/i;

/** Return the numeric QQ account only for the numeric QQ mailbox format accepted at registration. */
export function getQqNumberFromEmail(email: string): string | null {
  return email.trim().match(QQ_EMAIL_RE)?.[1] ?? null;
}

/** Public QQ avatar image used only for the registration preview. */
export function getQqAvatarPreviewUrl(email: string, retryKey = 0): string | null {
  const qq = getQqNumberFromEmail(email);
  if (!qq) return null;

  const url = new URL('https://q1.qlogo.cn/g');
  url.searchParams.set('b', 'qq');
  url.searchParams.set('nk', qq);
  url.searchParams.set('s', '100');
  // A changing key lets the user retry a transient CDN failure without changing the mailbox.
  if (retryKey > 0) url.searchParams.set('_preview_retry', String(retryKey));
  return url.toString();
}
