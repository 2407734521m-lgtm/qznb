/**
 * Recognize legacy date-only rows that were stored as message bodies and present
 * them as centered timeline separators instead of ordinary sender bubbles.
 */
export function parseChatDateOnlyLabel(
  body: string,
  createdAt: string,
  now: Date = new Date(),
): string | null {
  const match = body.trim().match(/^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsedDate = new Date(year, month - 1, day);
  if (
    parsedDate.getFullYear() !== year
    || parsedDate.getMonth() !== month - 1
    || parsedDate.getDate() !== day
  ) return null;

  const messageDate = new Date(createdAt);
  if (Number.isNaN(messageDate.getTime())) return null;
  const hour = match[4] === undefined ? messageDate.getHours() : Number(match[4]);
  const minute = match[5] === undefined ? messageDate.getMinutes() : Number(match[5]);
  if (hour > 23 || minute > 59) return null;

  parsedDate.setHours(hour, minute, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const separatorDay = new Date(year, month - 1, day).getTime();
  const daysAgo = Math.round((today - separatorDay) / 86400000);
  const timeLabel = parsedDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  if (daysAgo === 0) return '今天 · ' + timeLabel;
  if (daysAgo === 1) return '昨天 · ' + timeLabel;
  return parsedDate.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }) + ' · ' + timeLabel;
}
