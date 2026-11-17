import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  formatTodayZh,
  normalizeLinkUrl,
  renderRichText,
  stripRichText,
  unwrapRichText,
} from './richText';

const html = (text: string) => renderToStaticMarkup(<>{renderRichText(text)}</>);

describe('stripRichText（收件箱预览 / 回复引用 / 复制）', () => {
  it('各种标记都剥掉、只留字', () => {
    expect(stripRichText('**粗**和__斜__和`码`和~~删~~和++下划++')).toBe('粗和斜和码和删和下划');
    expect(stripRichText('[点这里](https://qianzhi.pw)')).toBe('点这里');
    expect(stripRichText('@[千](abc-123)你好')).toBe('千你好');
    expect(stripRichText('> 引用的一行\n第二行')).toBe('引用的一行\n第二行');
  });

  it('剧透不泄露原文', () => {
    expect(stripRichText('明天||去看电影||吧')).toBe('明天•••吧');
  });

  it('未配对的标记原样留着', () => {
    expect(stripRichText('这条没配对 || 哦')).toBe('这条没配对 || 哦');
    expect(stripRichText('**没闭合')).toBe('**没闭合');
  });
});

describe('unwrapRichText（纯文本：拆掉标记、字留下来）', () => {
  it('剧透的字也留下来', () => {
    expect(unwrapRichText('明天||去看电影||吧')).toBe('明天去看电影吧');
    expect(unwrapRichText('**粗**和[点这里](https://qianzhi.pw)')).toBe('粗和点这里');
  });
});

describe('normalizeLinkUrl', () => {
  it('没写协议补 https，http 原样留', () => {
    expect(normalizeLinkUrl('qianzhi.pw')).toBe('https://qianzhi.pw/');
    expect(normalizeLinkUrl('http://example.com/a')).toBe('http://example.com/a');
  });

  it('javascript:/data: 与空串一律不要', () => {
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkUrl('data:text/html,<b>x</b>')).toBeNull();
    expect(normalizeLinkUrl('   ')).toBeNull();
  });
});

describe('formatTodayZh', () => {
  it('中文年月日', () => {
    expect(formatTodayZh(new Date(2026, 10, 17))).toBe('2026年11月17日');
  });
});

describe('renderRichText', () => {
  it('加粗/斜体/等宽/删除线/下划线', () => {
    const out = html('**粗**__斜__`码`~~删~~++下划++');
    expect(out).toContain('<strong>粗</strong>');
    expect(out).toContain('<em>斜</em>');
    expect(out).toContain('<code class="im-code">码</code>');
    expect(out).toContain('<del>删</del>');
    expect(out).toContain('<u>下划</u>');
  });

  it('剧透包成隐形墨水、链接与 @提及可点', () => {
    const out = html('明天||去看电影||吧 [官网](https://qianzhi.pw) @[千](abc-123)');
    expect(out).toContain('im-ink');
    expect(out).toContain('<a class="im-link" href="https://qianzhi.pw" target="_blank" rel="noopener noreferrer">官网</a>');
    expect(out).toContain('class="im-mention"');
    expect(out).toContain('千');
  });

  it('跨多行选中的剧透仍作为同一个隐形墨水区域渲染', () => {
    const out = html('前||第一行\n第二行||后');
    expect((out.match(/class="im-ink"/g) ?? [])).toHaveLength(1);
    expect(out).toContain('第一行');
    expect(out).toContain('第二行');
    expect(out).not.toContain('||');
  });

  it('代码片段里的 || 不应被当成剧透', () => {
    const out = html('`||代码里的标记||`');
    expect(out).toContain('<code class="im-code">||代码里的标记||</code>');
    expect(out).not.toContain('im-ink');
  });

  it('行首 > 是引用块，普通文字原样', () => {
    const out = html('> 引用的一行\n第二行');
    expect(out).toContain('<blockquote class="im-quote">引用的一行</blockquote>');
    expect(out).toContain('第二行');
  });

  it('加粗里可以再嵌套剧透', () => {
    const out = html('**明天 ||去看电影||**');
    expect(out).toContain('<strong>明天 ');
    expect(out).toContain('im-ink');
  });

  it('未配对的标记原样显示，javascript 链接不生成 a 标签、只当普通文字', () => {
    const out = html('**没闭合 [点](javascript:alert(1))');
    expect(out).toContain('**没闭合');
    expect(out).not.toContain('<a ');
    expect(out).toContain('[点](javascript:alert(1))');
  });
});
