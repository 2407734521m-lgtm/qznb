import './fx.css';

/**
 * FxLoader（Uiverse 风格的 CSS 加载器）：渐变圆环 + 下方文字，
 * 替代原来闪烁的 ✦ 和纯文字「加载中…」。纯 CSS，无 JS 动画开销。
 */
export default function FxLoader({ text }: { text?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div className="fx-loader" aria-hidden />
      {text && <div style={{ fontSize: 13.5, color: '#7a8494', letterSpacing: 1 }}>{text}</div>}
    </div>
  );
}
