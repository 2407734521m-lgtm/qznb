import type { CSSProperties } from 'react';

/* 5x7 点阵数字（Grove 总览改版）：关键数字用点阵渲染，代替滚动数字。
   每个字形是 7 行 × 5 列的点阵，'1' 为亮点、'0' 为暗点（仍渲染，
   保留点阵显示的网格感）。只做展示：数值、单位与数据来源一律不动；
   读屏用 role="img" + aria-label 读出完整数值，点本身 aria-hidden。
   换值时字形重新挂载并播一次 180ms 淡入（见 Grove 层 dot-digits-in，
   prefers-reduced-motion 下不播）。 */
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
const BLANK = ['00000', '00000', '00000', '00000', '00000', '00000', '00000'];

export default function DotDigits({
  value,
  size = 'lg',
  color,
  label,
  className,
}: {
  value: string | number;
  size?: 'lg' | 'md' | 'sm';
  color?: string;
  label?: string;
  className?: string;
}) {
  const text = String(value);
  const style = color
    ? ({ '--dot-color': color } as CSSProperties)
    : undefined;
  return (
    <span
      className={['dot-digits', `dot-digits-${size}`, className].filter(Boolean).join(' ')}
      style={style}
      role="img"
      aria-label={label ?? text}
    >
      {[...text].map((ch, i) => {
        const glyph = GLYPHS[ch] ?? BLANK;
        return (
          <span className="dot-digits-glyph" key={`${i}-${ch}`} aria-hidden="true">
            {glyph.map((row, r) => (
              <span className="dot-digits-row" key={r}>
                {[...row].map((bit, c) => (
                  <i key={c} className={bit === '1' ? 'is-on' : ''} />
                ))}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}
