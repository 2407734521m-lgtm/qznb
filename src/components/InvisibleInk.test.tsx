/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import InvisibleInk from './InvisibleInk';

// InvisibleInk 的交互断言（jsdom 里没有布局，elementFromPoint 一律返回 null，
// 所以点按落点用 mock 补上；画布在 jsdom 里没有 2d 上下文，组件的状态翻转
// 本来就不依赖画布，照样能测）。
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    })),
  });
  vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // elementFromPoint 是直接赋值的 mock，不是 spyOn，单独清掉。
  delete (document as unknown as Record<string, unknown>).elementFromPoint;
});

// jsdom 没有布局，elementFromPoint 不存在：直接赋值一个按落点返回元素的 mock。
const mockHitTest = (el: Element | null) => {
  document.elementFromPoint = () => el;
};

const tap = (el: Element, x = 10, y = 10) => {
  fireEvent.pointerDown(el, { button: 0, clientX: x, clientY: y, pointerType: 'mouse', pointerId: 1 });
  fireEvent.pointerUp(el, { button: 0, clientX: x, clientY: y, pointerType: 'mouse', pointerId: 1 });
};

describe('InvisibleInk 点击拦截（盖着时点链接/@只揭示、不激活）', () => {
  it('盖着点链接：第一下只揭示、不导航；揭示后再点才放行', () => {
    const { container } = render(
      <InvisibleInk>
        <a className="im-link" href="https://example.com" target="_blank" rel="noopener noreferrer">
          去首页
        </a>
      </InvisibleInk>,
    );
    const link = container.querySelector('.im-link') as HTMLAnchorElement;
    const content = container.querySelector('.im-ink-content') as HTMLElement;
    mockHitTest(link);
    expect(content.getAttribute('aria-hidden')).toBe('true');

    tap(link);
    // 点按揭示后紧跟的 click 属于同一手势：被拦下，fireEvent 返回 false。
    expect(fireEvent.click(link, { clientX: 10, clientY: 10 })).toBe(false);
    expect(content.getAttribute('aria-hidden')).toBe('false');

    tap(link);
    // 已经揭示、又是一次干净点按：放行，fireEvent 返回 true。
    expect(fireEvent.click(link, { clientX: 10, clientY: 10 })).toBe(true);
  });

  it('盖着点 @提及：第一下只揭示、不触发对方主页', () => {
    const onMention = vi.fn();
    const { container } = render(
      <InvisibleInk>
        <button type="button" className="im-mention" onClick={onMention}>
          千
        </button>
      </InvisibleInk>,
    );
    const mention = container.querySelector('.im-mention') as HTMLButtonElement;
    mockHitTest(mention);

    tap(mention);
    expect(fireEvent.click(mention, { clientX: 10, clientY: 10 })).toBe(false);
    expect(onMention).not.toHaveBeenCalled();

    tap(mention);
    expect(fireEvent.click(mention, { clientX: 10, clientY: 10 })).toBe(true);
    expect(onMention).toHaveBeenCalledTimes(1);
  });

  it('已揭示时从链接上滑开再松手：不是点按，不打开链接', () => {
    const { container } = render(
      <InvisibleInk>
        <a className="im-link" href="https://example.com" target="_blank" rel="noopener noreferrer">
          去首页
        </a>
      </InvisibleInk>,
    );
    const root = container.querySelector('.im-ink') as HTMLElement;
    const link = container.querySelector('.im-link') as HTMLAnchorElement;
    mockHitTest(link);

    // 先在普通文字上点按揭示（不碰链接）。
    tap(root);
    expect(container.querySelector('.im-ink-content')?.getAttribute('aria-hidden')).toBe('false');

    // 再从链接上滑开：移动 20px，不是点按，松手后的 click 不能激活链接。
    fireEvent.pointerDown(link, { button: 0, clientX: 10, clientY: 10, pointerType: 'mouse', pointerId: 1 });
    fireEvent.pointerMove(link, { button: 0, clientX: 30, clientY: 10, pointerType: 'mouse', pointerId: 1 });
    fireEvent.pointerUp(link, { button: 0, clientX: 30, clientY: 10, pointerType: 'mouse', pointerId: 1 });
    expect(fireEvent.click(link, { clientX: 30, clientY: 10 })).toBe(false);
  });
});

describe('InvisibleInk 读屏保护（盖着时不读原文）', () => {
  it('盖着时内容 aria-hidden、链接拿出 Tab 顺序；揭示后恢复', () => {
    const { container } = render(
      <InvisibleInk>
        <a className="im-link" href="https://example.com" target="_blank" rel="noopener noreferrer">
          去首页
        </a>
        {' 明天去看电影'}
      </InvisibleInk>,
    );
    const root = container.querySelector('.im-ink') as HTMLElement;
    const content = container.querySelector('.im-ink-content') as HTMLElement;
    const link = container.querySelector('.im-link') as HTMLAnchorElement;

    expect(root.getAttribute('aria-label')).toBe('隐形消息，滑动擦除或点按显示内容');
    expect(content.getAttribute('aria-hidden')).toBe('true');
    expect(link.getAttribute('tabindex')).toBe('-1');

    tap(root);
    expect(root.getAttribute('aria-label')).toBe('隐形消息，已显示');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(link.getAttribute('tabindex')).toBeNull();
  });

  it('回车揭示后读屏能读到原文', () => {
    const { container } = render(<InvisibleInk>明天去看电影</InvisibleInk>);
    const root = container.querySelector('.im-ink') as HTMLElement;
    const content = container.querySelector('.im-ink-content') as HTMLElement;
    expect(content.getAttribute('aria-hidden')).toBe('true');

    fireEvent.keyDown(root, { key: 'Enter' });
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(root.getAttribute('aria-label')).toBe('隐形消息，已显示');
  });
});
