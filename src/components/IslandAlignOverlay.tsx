import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import './IslandAlignOverlay.css';

type Props = {
  offsetX: number;
  offsetY: number;
  onSave: (offsetX: number, offsetY: number) => void;
  onClose: () => void;
};

// Same limits as the saved preference (see normalizeUserPreferences).
const clampX = (value: number) => Math.round(Math.min(90, Math.max(-90, value)));
const clampY = (value: number) => Math.round(Math.min(90, Math.max(-30, value)));
const signed = (value: number) => (value > 0 ? '+' : '') + value;

function applyOffset(x: number, y: number) {
  const root = document.documentElement;
  root.style.setProperty('--qz-island-config-x', x + 'px');
  // Same -10px raise the provider applies, so the preview sits exactly where the saved spot will.
  root.style.setProperty('--qz-island-config-y', (y - 10) + 'px');
}

/**
 * Drag anywhere on the dimmed page to move the island under your finger; Save keeps the spot.
 * The island follows through the same CSS variables the saved offsets use, so nothing re-renders
 * or syncs until Save.
 */
export default function IslandAlignOverlay({ offsetX, offsetY, onSave, onClose }: Props) {
  const initial = useRef({ x: offsetX, y: offsetY });
  const [pos, setPos] = useState(initial.current);
  const posRef = useRef(pos);
  const drag = useRef<{ id: number; px: number; py: number; x: number; y: number } | null>(null);
  const saved = useRef(false);

  const move = (x: number, y: number) => {
    const next = { x: clampX(x), y: clampY(y) };
    posRef.current = next;
    setPos(next);
    applyOffset(next.x, next.y);
  };

  useEffect(() => {
    // A docked island would be off-screen; bring it back so there is something to line up.
    window.dispatchEvent(new Event('qznb-island-restore'));
    return () => {
      if (!saved.current) applyOffset(initial.current.x, initial.current.y);
    };
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, px: event.clientX, py: event.clientY, x: posRef.current.x, y: posRef.current.y };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    move(start.x + event.clientX - start.px, start.y + event.clientY - start.py);
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };

  return createPortal(
    <>
      <div
        className="qz-island-align-backdrop"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      />
      <div className="qz-island-align-panel" role="dialog" aria-label="拖动对准灵动岛">
        <strong>拖动屏幕，让灵动岛对准摄像头</strong>
        <span>水平 {signed(pos.x)} px · 垂直 {signed(pos.y)} px</span>
        <div className="qz-island-align-actions">
          <button type="button" onClick={() => move(0, 0)}>归位</button>
          <button type="button" onClick={onClose}>取消</button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              saved.current = true;
              onSave(posRef.current.x, posRef.current.y);
              onClose();
            }}
          >
            保存
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
