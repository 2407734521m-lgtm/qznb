/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import DotDigits from './DotDigits';

describe('DotDigits 5x7 点阵数字', () => {
  it('读屏读出完整数值，点阵本身 aria-hidden', () => {
    const { container } = render(<DotDigits value={40} size="lg" />);
    const root = container.querySelector('.dot-digits');
    expect(root?.getAttribute('role')).toBe('img');
    expect(root?.getAttribute('aria-label')).toBe('40');
    expect(container.querySelectorAll('.dot-digits-glyph').length).toBe(2);
  });

  it('字形亮点数与 5x7 点阵一致（8 为 17 点，1 为 10 点）', () => {
    const { container: eight } = render(<DotDigits value="8" />);
    expect(eight.querySelectorAll('.dot-digits-row i.is-on').length).toBe(17);
    const { container: one } = render(<DotDigits value="1" />);
    expect(one.querySelectorAll('.dot-digits-row i.is-on').length).toBe(10);
  });

  it('百分号与未知字符都能渲染（未知字符为空白字形）', () => {
    const { container } = render(<DotDigits value="88%" size="sm" />);
    expect(container.querySelectorAll('.dot-digits-glyph').length).toBe(3);
    const { container: unknown } = render(<DotDigits value="~" />);
    expect(unknown.querySelectorAll('.dot-digits-glyph').length).toBe(1);
    expect(unknown.querySelectorAll('.dot-digits-row i.is-on').length).toBe(0);
  });
});
