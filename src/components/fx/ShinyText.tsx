import './fx.css';

/**
 * ShinyText（改编自 React Bits 的 ShinyText 思路）：一道光泽周期性扫过文字表面。
 * 官方新版为 JS 驱动的重实现，这里用纯 CSS 渐变动画复刻，零运行时开销。
 */
export default function ShinyText({ text, color = '#9aa3b2', shine = '#eef1f6', speed = 3.2, style }: {
  text: string;
  color?: string;
  shine?: string;
  speed?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="fx-shiny"
      style={{
        ['--fx-shine-base' as any]: color,
        ['--fx-shine-hi' as any]: shine,
        animationDuration: `${speed}s`,
        ...style,
      }}
    >
      {text}
    </span>
  );
}
