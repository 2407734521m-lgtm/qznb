import { stripChatBubbleEffect } from './chatMessageEffect';

export type ChatPlayableMediaMessage = {
  id: number;
  body: string;
  deleted_at?: string | null;
};

export function isChatPlayableMediaBody(body: string): boolean {
  const content = stripChatBubbleEffect(body);
  return content.startsWith('[[im-audio:') || content.startsWith('[[im-video:');
}

/** Find the next playable audio/video message in conversation order. */
export function findNextChatMediaMessageId(
  messages: readonly ChatPlayableMediaMessage[],
  currentMessageId: number,
): number | null {
  const currentIndex = messages.findIndex(message => message.id === currentMessageId);
  if (currentIndex < 0) return null;

  for (let index = currentIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.deleted_at || !isChatPlayableMediaBody(message.body)) continue;
    return message.id;
  }
  return null;
}

/** Browsers may reject audible autoplay even when the previous item ended naturally. */
export function isChatAutoplayBlocked(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'NotAllowedError';
}
