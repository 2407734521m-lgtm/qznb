export type ChatTypingPayload = {
  typing: boolean;
  profileId: string | null;
};

/**
 * Parses the private-channel typing event. profileId is optional so clients
 * running a previous deployment can still show a short-lived generic status.
 */
export function parseChatTypingPayload(payload: unknown): ChatTypingPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as { typing?: unknown; profileId?: unknown };
  if (typeof value.typing !== 'boolean') return null;
  return {
    typing: value.typing,
    profileId: typeof value.profileId === 'string' && value.profileId.trim()
      ? value.profileId
      : null,
  };
}

export function formatChatTypingLabel(names: string[], isGroup: boolean): string {
  const uniqueNames = [...new Set(names.map(name => name.trim()).filter(Boolean))];
  if (!uniqueNames.length) return '';
  if (!isGroup) return '正在输入…';
  if (uniqueNames.length <= 2) return `${uniqueNames.join('、')} 正在输入…`;
  return `${uniqueNames.slice(0, 2).join('、')} 等 ${uniqueNames.length} 人正在输入…`;
}
