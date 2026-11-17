export type ChatBubbleEffect = 'slam' | 'loud' | 'gentle' | 'invisible-ink';

const EFFECT_PREFIX = /^\\[\\[im-bubble-effect:(slam|loud|gentle|invisible-ink)\\]\\]/;

export function getChatBubbleEffect(body: string): ChatBubbleEffect | null {
  return (body.match(EFFECT_PREFIX)?.[1] as ChatBubbleEffect | undefined) ?? null;
}

export function stripChatBubbleEffect(body: string): string {
  return body.replace(EFFECT_PREFIX, '');
}

export function withChatBubbleEffect(body: string, effect: ChatBubbleEffect | null): string {
  return effect ? `[[im-bubble-effect:${effect}]]${body}` : body;
}
