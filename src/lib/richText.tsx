import { Fragment, type ReactNode } from 'react';
import InvisibleInk from '../components/InvisibleInk';
import { getChatBubbleEffect, stripChatBubbleEffect } from './chatMessageEffect';

// 聊天富文本：Telegram 式纯文本标记，直接存在 messages.body 里，不改表、不改接口。
// **加粗** __斜体__ `等宽` ~~删除线~~ ++下划线++ ||剧透|| [文字](https://链接) @[文字](成员id)
// 行首 "> " 是引用。未配对的标记原样显示；链接只认 http/https。
// 剧透里面的内容会再解析一层格式（加粗/斜体/删除线/下划线/链接/@提及/等宽），
// 剧透里不再套剧透；等宽里面的内容仍是原文；
// 加粗/斜体/删除线/下划线里面可以再嵌套（比如 **明天 ||去看电影||**）。
// 渲染只产出我们自己建的元素 + 文本节点，不插原始 HTML；链接 href 只接受 http/https。

export type RichTextHandlers = {
  onMentionClick?: (profileId: string) => void;
};

// 匹配一整段格式：加粗 / 斜体 / 删除线 / 下划线 / 剧透 / 等宽 / 链接 / @提及。
// 注意：parseInline 会递归（加粗里可以再嵌套），所以每次调用都 new 一个正则，
// 不能共用一个带 g 的模块级正则——递归会把 lastIndex 搅乱。
// 新版输入框使用零宽字符作为剧透边界，不再把可见标记显示在内容前后。
// 旧消息中的 ||内容|| 仍然兼容读取。
export const INVISIBLE_SPOILER_OPEN = '\u2063';
export const INVISIBLE_SPOILER_CLOSE = '\u2064';
const SPOILER_PLACEHOLDER_PREFIX = '\uE000qznb-spoiler-';
const SPOILER_PLACEHOLDER_SUFFIX = '\uE001';
const INLINE_PATTERN_SOURCE =
  '(\\uE000qznb-spoiler-\\d+\\uE001|\\*\\*[^*]+?\\*\\*|__[^_]+?__|~~[^~]+?~~|\\+\\+[^+]+?\\+\\+|`[^`\\n]+?`|\\[[^\\]\\n]+\\]\\(https?:\\/\\/[^\\s)]+\\)|@\\[[^\\]\\n]+\\]\\([^)\\s]+\\))';

function parseInline(text: string, handlers: RichTextHandlers, keyPrefix: string, spoilers: string[], allowSpoiler = true): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let index = 0;
  for (const match of text.matchAll(new RegExp(INLINE_PATTERN_SOURCE, 'g'))) {
    const token = match[0];
    const at = match.index ?? 0;
    if (at > lastIndex) {
      nodes.push(text.slice(lastIndex, at));
    }
    const key = `${keyPrefix}${index++}`;
    if (token.startsWith(SPOILER_PLACEHOLDER_PREFIX)) {
      if (!allowSpoiler) {
        // 剧透里不再套剧透：占位符只当普通文本，避免无界递归。
        nodes.push(token);
      } else {
        const spoilerIndex = Number(token.slice(SPOILER_PLACEHOLDER_PREFIX.length, -SPOILER_PLACEHOLDER_SUFFIX.length));
        nodes.push(
          <InvisibleInk key={key}>
            {parseInline(spoilers[spoilerIndex] ?? '', handlers, `${key}-`, spoilers, false)}
          </InvisibleInk>,
        );
      }
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{parseInline(token.slice(2, -2), handlers, `${key}-`, spoilers)}</strong>);
    } else if (token.startsWith('__')) {
      nodes.push(<em key={key}>{parseInline(token.slice(2, -2), handlers, `${key}-`, spoilers)}</em>);
    } else if (token.startsWith('~~')) {
      nodes.push(<del key={key}>{parseInline(token.slice(2, -2), handlers, `${key}-`, spoilers)}</del>);
    } else if (token.startsWith('++')) {
      nodes.push(<u key={key}>{parseInline(token.slice(2, -2), handlers, `${key}-`, spoilers)}</u>);
    } else if (token.startsWith('`')) {
      nodes.push(<code key={key} className="im-code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('@[')) {
      const label = token.slice(2, token.indexOf(']'));
      const id = token.slice(token.indexOf(']') + 2, -1);
      nodes.push(
        <button
          key={key}
          type="button"
          className="im-mention"
          onClick={() => handlers.onMentionClick?.(id)}
          aria-label={`提到 ${label}`}
        >
          {label}
        </button>,
      );
    } else {
      // [文字](链接)：只认 http/https（正则已限定），点开走新窗口。
      const label = token.slice(1, token.indexOf(']'));
      const url = token.slice(token.indexOf(']') + 2, -1);
      nodes.push(
        <a key={key} className="im-link" href={url} target="_blank" rel="noopener noreferrer">
          {label}
        </a>,
      );
    }
    lastIndex = at + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

export function renderRichText(text: string, handlers: RichTextHandlers = {}): ReactNode {
  // 先把剧透片段替换成内部占位符，再按行解析其他格式。这样一段剧透可跨行，
  // 仍只渲染为一个 InvisibleInk；代码片段中的 || 标记则保持普通代码文本。
  const spoilers: string[] = [];
  const safeText = text.replace(/`[^`\\n]+?`|\u2063[\\s\\S]+?\u2064|\\|\\|[\\s\\S]+?\\|\\|/g, token => {
    if (token.startsWith('`')) return token;
    const markerLength = token.startsWith(INVISIBLE_SPOILER_OPEN) ? 1 : 2;
    const index = spoilers.push(token.slice(markerLength, -markerLength)) - 1;
    return `${SPOILER_PLACEHOLDER_PREFIX}${index}${SPOILER_PLACEHOLDER_SUFFIX}`;
  });
  // 气泡是 white-space:pre-wrap，\n 直接当文本节点就能换行，不用再插 <br/>。
  const lines = safeText.split('\n');
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 ? '\n' : null}
      {line.startsWith('> ') ? (
        <blockquote className="im-quote">{parseInline(line.slice(2), handlers, `q${i}-`, spoilers)}</blockquote>
      ) : (
        parseInline(line, handlers, `l${i}-`, spoilers)
      )}
    </Fragment>
  ));
}

// 收件箱预览 / 回复引用 / 复制：把标记都剥掉，只留干净文字；剧透不泄露原文，显示 •••。
export function stripRichText(text: string): string {
  if (getChatBubbleEffect(text) === 'invisible-ink') return '•••';
  return stripChatBubbleEffect(text)
    .replace(/\u2063[\\s\\S]+?\u2064/g, '•••')
    .replace(/\|\|[\s\S]+?\|\|/g, '•••')
    .replace(/@\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\[([^\]\n]+)\]\((?:https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/__([^_]+?)__/g, '$1')
    .replace(/~~([^~]+?)~~/g, '$1')
    .replace(/\+\+([^+]+?)\+\+/g, '$1')
    .replace(/`([^`\n]+?)`/g, '$1')
    .replace(/^> /gm, '');
}

// 「纯文本」：把选区里的标记全拆掉、字留下来（剧透的字也留下来，和 stripRichText 不一样）。
export function unwrapRichText(text: string): string {
  return stripChatBubbleEffect(text)
    .replace(/\u2063([\\s\\S]+?)\u2064/g, '$1')
    .replace(/\|\|([\s\S]+?)\|\|/g, '$1')
    .replace(/@\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\[([^\]\n]+)\]\((?:https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/__([^_]+?)__/g, '$1')
    .replace(/~~([^~]+?)~~/g, '$1')
    .replace(/\+\+([^+]+?)\+\+/g, '$1')
    .replace(/`([^`\n]+?)`/g, '$1')
    .replace(/^> /gm, '');
}

// 链接输入框：没写协议就补 https://；javascript:/data: 等一律不要。
export function normalizeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// 「日期」：在光标处插今天，中文写法（2026年11月17日）。
export function formatTodayZh(date = new Date()): string {
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}
