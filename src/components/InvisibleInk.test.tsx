/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import InvisibleInk, { makeOpaqueCanvasColor } from './InvisibleInk';

describe('InvisibleInk 遮罩不透明度', () => {
  it('移除半透明气泡底色的 alpha，避免原文字透出', () => {
    expect(makeOpaqueCanvasColor('rgba(28, 54, 91, 0.62)', 'rgb(233, 233, 235)'))
      .toBe('rgb(28 54 91)');
  });

  it('完全透明的气泡底色使用对应方向的安全回退色', () => {
    expect(makeOpaqueCanvasColor('rgba(0, 0, 0, 0)', 'rgb(233, 233, 235)'))
      .toBe('rgb(233, 233, 235)');
  });

  it('支持现代 CSS 的斜线 alpha 写法', () => {
    expect(makeOpaqueCanvasColor('rgb(10 124 255 / 62%)', 'rgb(233, 233, 235)'))
      .toBe('rgb(10 124 255)');
  });
});


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

    expect(root.getAttribute('role')).toBe('button');
    expect(root.getAttribute('tabindex')).toBe('0');
    expect(root.getAttribute('aria-label')).toBe('隐形消息，滑动擦除或点按显示内容');
    expect(content.getAttribute('aria-hidden')).toBe('true');
    expect(link.getAttribute('tabindex')).toBe('-1');
    expect(root.querySelector('.im-ink-hint')?.textContent).toBe('滑动擦除 · 点按显示');

    tap(root);
    // 揭示后外层退回普通容器：role/tabIndex/aria-label 都去掉，链接恢复默认可聚焦。
    expect(root.getAttribute('role')).toBeNull();
    expect(root.getAttribute('tabindex')).toBeNull();
    expect(root.getAttribute('aria-label')).toBeNull();
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(link.getAttribute('tabindex')).toBeNull();
    expect(root.querySelector('.im-ink-hint')).toBeNull();
  });

  it('回车揭示后读屏能读到原文', () => {
    const { container } = render(<InvisibleInk>明天去看电影</InvisibleInk>);
    const root = container.querySelector('.im-ink') as HTMLElement;
    const content = container.querySelector('.im-ink-content') as HTMLElement;
    expect(content.getAttribute('aria-hidden')).toBe('true');

    fireEvent.keyDown(root, { key: 'Enter' });
    expect(content.getAttribute('aria-hidden')).toBe('false');
    // 揭示后外层不再是 button，读屏直接读原文、不再读“已显示”标签。
    expect(root.getAttribute('role')).toBeNull();
    expect(root.getAttribute('aria-label')).toBeNull();
  });
});

describe('InvisibleInk 全擦掉遮罩后点链接直接打开', () => {
  // 画布 2d 上下文的假实现：所有绘图调用都是空操作；getImageData 按
  // opaqueFraction 返回前若干行不透明（即遮罩被擦掉的部分）。
  const makeFakeCtx = (w: number, h: number, opaqueFraction: number) => {
    const data = new Uint8ClampedArray(w * h * 4);
    const opaquePixels = Math.floor(w * h * opaqueFraction);
    for (let i = 0; i < opaquePixels; i += 1) data[i * 4 + 3] = 255;
    return new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === 'getImageData') return () => ({ data, width: w, height: h });
          return () => {};
        },
        set: () => true,
      },
    );
  };

  const mockLayout = (fakeCtx: unknown) => {
    vi.mocked(window.HTMLCanvasElement.prototype.getContext).mockReturnValue(
      fakeCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 60,
      top: 0,
      left: 0,
      bottom: 60,
      right: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  };

  it('手动拖满整块擦掉遮罩后，点链接不用再揭示一次', () => {
    mockLayout(makeFakeCtx(200, 60, 1));
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

    // 从链接上横向拖满整块：不是点按，松手时遮罩已擦干净 → 直接揭示。
    fireEvent.pointerDown(link, { button: 0, clientX: 10, clientY: 30, pointerType: 'mouse', pointerId: 1 });
    fireEvent.pointerMove(link, { button: 0, clientX: 190, clientY: 30, pointerType: 'mouse', pointerId: 1 });
    fireEvent.pointerUp(link, { button: 0, clientX: 190, clientY: 30, pointerType: 'mouse', pointerId: 1 });
    expect(content.getAttribute('aria-hidden')).toBe('false');

    // 紧接着点链接：已经是揭示状态，这一下直接放行，不用再揭示一次。
    tap(link);
    expect(fireEvent.click(link, { clientX: 10, clientY: 30 })).toBe(true);
  });

  it('只擦掉一半遮罩时，点链接仍要先揭示', () => {
    mockLayout(makeFakeCtx(200, 60, 0.5));
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

    fireEvent.pointerDown(link, { button: 0, clientX: 10, clientY: 30, pointerType: 'mouse', pointerId: 1 });
    fireEvent.pointerMove(link, { button: 0, clientX: 190, clientY: 30, pointerType: 'mouse', pointerId: 1 });
    fireEvent.pointerUp(link, { button: 0, clientX: 190, clientY: 30, pointerType: 'mouse', pointerId: 1 });
    // 只擦掉一半 → 不算全擦掉，仍是盖着的。
    expect(content.getAttribute('aria-hidden')).toBe('true');

    tap(link);
    expect(fireEvent.click(link, { clientX: 10, clientY: 30 })).toBe(false);
    expect(content.getAttribute('aria-hidden')).toBe('false');
  });

  it('从链接上开始拖动时拦掉原生拖拽，擦除手势不被打断', () => {
    const { container } = render(
      <InvisibleInk>
        <a className="im-link" href="https://example.com" target="_blank" rel="noopener noreferrer">
          去首页
        </a>
      </InvisibleInk>,
    );
    const root = container.querySelector('.im-ink') as HTMLElement;
    // fireEvent 返回 false 说明 preventDefault 被调过、原生拖拽已取消。
    expect(fireEvent.dragStart(root)).toBe(false);
  });
});
