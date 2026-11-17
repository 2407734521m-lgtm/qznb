export type BubbleEffectKind = 'slam' | 'loud' | 'gentle' | 'invisible-ink';
export type ScreenEffectKind = 'echo' | 'spotlight' | 'balloons' | 'confetti' | 'love' | 'lasers' | 'fireworks' | 'celebration';
export type ChatBubbleEffect = BubbleEffectKind | `screen-${ScreenEffectKind}`;

const EFFECT_PREFIX = '[[im-bubble-effect:';
const VALID_EFFECTS = new Set<ChatBubbleEffect>([
  'slam', 'loud', 'gentle', 'invisible-ink',
  'screen-echo', 'screen-spotlight', 'screen-balloons', 'screen-confetti',
  'screen-love', 'screen-lasers', 'screen-fireworks', 'screen-celebration',
]);

export function getChatBubbleEffect(body: string): ChatBubbleEffect | null {
  if (!body.startsWith(EFFECT_PREFIX)) return null;
  const markerEnd = body.indexOf(']]', EFFECT_PREFIX.length);
  if (markerEnd < 0) return null;
  const candidate = body.slice(EFFECT_PREFIX.length, markerEnd);
  return VALID_EFFECTS.has(candidate as ChatBubbleEffect) ? candidate as ChatBubbleEffect : null;
}

export function getScreenEffectKind(body: string): ScreenEffectKind | null {
  const effect = getChatBubbleEffect(body);
  return effect?.startsWith('screen-') ? effect.slice(7) as ScreenEffectKind : null;
}

export function stripChatBubbleEffect(body: string): string {
  if (!body.startsWith(EFFECT_PREFIX)) return body;
  const markerEnd = body.indexOf(']]', EFFECT_PREFIX.length);
  if (markerEnd < 0 || !getChatBubbleEffect(body)) return body;
  return body.slice(markerEnd + 2);
}

export function withChatBubbleEffect(body: string, effect: ChatBubbleEffect | null): string {
  return effect ? `[[im-bubble-effect:${effect}]]${body}` : body;
}
