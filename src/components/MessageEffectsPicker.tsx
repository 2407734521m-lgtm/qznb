import { useState } from 'react';
import type { ChatBubbleEffect, BubbleEffectKind, ScreenEffectKind } from '../lib/chatMessageEffect';

type MessageEffectsPickerProps = {
  open: boolean;
  previewText: string;
  selected: ChatBubbleEffect | null;
  onSelect: (effect: ChatBubbleEffect) => void;
  onSend: () => void;
  onClose: () => void;
  actionLabel?: string;
  mediaOnly?: boolean;
};

const BUBBLE_OPTIONS: Array<{
  value: BubbleEffectKind;
  title: string;
  description: string;
  symbol: string;
}> = [
  { value: 'slam', title: '撞击', description: '气泡快速落下并轻微回弹', symbol: '↓' },
  { value: 'loud', title: '放大', description: '气泡放大后平稳收回', symbol: '↗' },
  { value: 'gentle', title: '轻柔', description: '气泡轻轻展开', symbol: '·' },
  { value: 'invisible-ink', title: '隐形墨水', description: '用漂浮墨点遮住消息，轻扫后显现', symbol: '✳' },
];

const SCREEN_OPTIONS: Array<{
  value: `screen-${ScreenEffectKind}`;
  title: string;
  description: string;
  symbol: string;
}> = [
  { value: 'screen-echo', title: '回声', description: '消息向外扩散并留下回响', symbol: '◎' },
  { value: 'screen-spotlight', title: '聚光灯', description: '聚焦消息，其余画面短暂变暗', symbol: '✦' },
  { value: 'screen-balloons', title: '气球', description: '彩色气球从屏幕底部升起', symbol: '◉' },
  { value: 'screen-confetti', title: '彩纸', description: '彩色纸片从上方飘落', symbol: '✳' },
  { value: 'screen-love', title: '爱心', description: '心形光迹从消息位置扩散', symbol: '♥' },
  { value: 'screen-lasers', title: '激光', description: '彩色光束扫过屏幕', symbol: '⌁' },
  { value: 'screen-fireworks', title: '烟花', description: '烟花在屏幕上绽放', symbol: '✺' },
  { value: 'screen-celebration', title: '庆祝', description: '金色星光与纸屑铺满屏幕', symbol: '✹' },
];

export default function MessageEffectsPicker({
  open,
  previewText,
  selected,
  onSelect,
  onSend,
  onClose,
  actionLabel = '发送',
  mediaOnly = false,
}: MessageEffectsPickerProps) {
  const [tab, setTab] = useState<'bubble' | 'screen'>('bubble');
  if (!open) return null;

  const preview = previewText.trim() || '预览消息效果';
  const bubbleOptions = mediaOnly ? BUBBLE_OPTIONS.filter(option => option.value !== 'invisible-ink') : BUBBLE_OPTIONS;
  const options = tab === 'bubble' ? bubbleOptions : SCREEN_OPTIONS;
  const selectedForTab = selected !== null && (tab === 'screen'
    ? selected.startsWith('screen-')
    : !selected.startsWith('screen-'));
  const activeOption = selectedForTab
    ? options.find(option => option.value === selected)
    : null;

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

        <div className="im-effects-tabs" role="tablist" aria-label="特效类型">
          <button type="button" role="tab" aria-selected={tab === 'bubble'}
            className={tab === 'bubble' ? 'active' : ''} onClick={() => setTab('bubble')}>气泡</button>
          <button type="button" role="tab" aria-selected={tab === 'screen'}
            className={tab === 'screen' ? 'active' : ''} onClick={() => setTab('screen')}>全屏</button>
        </div>

        {tab === 'bubble' ? (
          <div className="im-effects-preview-area">
            <span className="im-effects-preview-label">气泡预览</span>
            <div
              className={'im-effects-preview-bubble' + (selectedForTab ? ' effect-' + selected : '') + (selected === 'invisible-ink' ? ' is-ink' : '')}
              aria-live="polite"
            >
              {selected === 'invisible-ink'
                ? <span className="im-effects-ink-sample" aria-label="隐形墨水预览">••••••••••••••••••</span>
                : preview.slice(0, 72)}
            </div>
            {selected === 'invisible-ink' && selectedForTab && <span className="im-effects-preview-hint">发送后，轻扫墨点即可阅读</span>}
            {mediaOnly && <span className="im-effects-preview-hint">此特效将应用于下一张图片、GIF、视频、语音或文件</span>}
          </div>
        ) : (
          <div className={'im-effects-screen-preview' + (selectedForTab ? ' selected' : '')}>
            <div className="im-effects-screen-stars" aria-hidden="true">✦　·　✧　　✦</div>
            <span className="im-effects-preview-label">全屏预览</span>
            <div className="im-effects-screen-symbol" aria-hidden="true">{activeOption?.symbol ?? '✦'}</div>
            <strong>{activeOption?.title ?? '选择一种全屏特效'}</strong>
            <small>{activeOption?.description ?? '选择后，特效将在双方聊天界面播放'}</small>
            <div className="im-effects-screen-message">{preview.slice(0, 38)}</div>
          </div>
        )}

        <div className="im-effects-options" role="group" aria-label={tab === 'bubble' ? '选择气泡特效' : '选择全屏特效'}>
          {options.map(option => (
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
          <button type="button" className="im-effects-send" disabled={!selectedForTab || !previewText.trim()} onClick={onSend}>{actionLabel}</button>
        </footer>
      </section>
    </div>
  );
}
