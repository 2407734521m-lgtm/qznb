import type { ChatBubbleEffect } from '../lib/chatMessageEffect';

type MessageEffectsPickerProps = {
  open: boolean;
  previewText: string;
  selected: ChatBubbleEffect | null;
  onSelect: (effect: ChatBubbleEffect) => void;
  onSend: () => void;
  onClose: () => void;
};

const EFFECT_OPTIONS: Array<{
  value: ChatBubbleEffect;
  title: string;
  description: string;
  symbol: string;
}> = [
  { value: 'slam', title: '撞击', description: '气泡快速落下并轻微回弹', symbol: '↓' },
  { value: 'loud', title: '放大', description: '气泡放大后平稳收回', symbol: '↗' },
  { value: 'gentle', title: '轻柔', description: '气泡轻轻展开', symbol: '·' },
  { value: 'invisible-ink', title: '隐形墨水', description: '用漂浮墨点遮住消息，轻扫后显现', symbol: '✳' },
];

export default function MessageEffectsPicker({
  open,
  previewText,
  selected,
  onSelect,
  onSend,
  onClose,
}: MessageEffectsPickerProps) {
  if (!open) return null;

  const preview = previewText.trim() || '预览消息效果';
  return (
    <div className="im-effects-backdrop" role="presentation" onClick={onClose}>
      <section
        className="im-effects-panel"
        role="dialog"
        aria-modal="true"
        aria-label="发送特效"
        onClick={event => event.stopPropagation()}
      >
        <header className="im-effects-header">
          <div>
            <div className="im-effects-eyebrow">MESSAGE EFFECTS</div>
            <h2>发送特效</h2>
          </div>
          <button type="button" className="im-effects-close" onClick={onClose} aria-label="关闭特效选择">×</button>
        </header>

        <div className="im-effects-preview-area">
          <span className="im-effects-preview-label">预览</span>
          <div
            className={'im-effects-preview-bubble' + (selected ? ' effect-' + selected : '') + (selected === 'invisible-ink' ? ' is-ink' : '')}
            aria-live="polite"
          >
            {selected === 'invisible-ink'
              ? <span className="im-effects-ink-sample" aria-label="隐形墨水预览">••••••••••••••••••</span>
              : preview.slice(0, 72)}
          </div>
          {selected === 'invisible-ink' && <span className="im-effects-preview-hint">发送后，轻扫墨点即可阅读</span>}
        </div>

        <div className="im-effects-options" role="group" aria-label="选择气泡特效">
          {EFFECT_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              className={'im-effects-option' + (selected === option.value ? ' selected' : '')}
              aria-pressed={selected === option.value}
              onClick={() => onSelect(option.value)}
            >
              <span className={'im-effects-symbol effect-' + option.value} aria-hidden="true">{option.symbol}</span>
              <span className="im-effects-option-copy">
                <strong>{option.title}</strong>
                <small>{option.description}</small>
              </span>
              <span className="im-effects-check" aria-hidden="true">{selected === option.value ? '✓' : ''}</span>
            </button>
          ))}
        </div>

        <footer className="im-effects-footer">
          <button type="button" className="im-effects-cancel" onClick={onClose}>取消</button>
          <button type="button" className="im-effects-send" disabled={!selected || !previewText.trim()} onClick={onSend}>发送</button>
        </footer>
      </section>
    </div>
  );
}
