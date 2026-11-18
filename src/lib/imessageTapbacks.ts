export const IMESSAGE_TAPBACKS = [
  { reaction: '❤️', label: '爱心' },
  { reaction: '👍', label: '赞同' },
  { reaction: '👎', label: '反对' },
  { reaction: '😂', label: '大笑' },
  { reaction: '‼️', label: '强调' },
  { reaction: '❓', label: '疑问' },
] as const;

export type IMessageTapback = (typeof IMESSAGE_TAPBACKS)[number];
