import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import './SwipeToDelete.css';

/**
 * 共用左滑删除（微交互线 D）。
 *
 * 用法：把列表项包起来，滑过一半宽度松手即触发 onSwipeDelete。
 * 组件本身只负责手势与滑出动画；“删不删库”由调用方决定——
 * 我的发布 / 我的收藏走延迟提交：先从界面拿掉，5 秒内可撤销，
 * 只有撤销窗口过去才真正执行删除（见 showUndoToast）。
 *
 * 纵向滚动：表面设了 touch-action: pan-y，纵向滑动仍归页面滚动；
 * 只有横向意图明确（横向位移先过阈值且大于纵向位移）时才接管手势。
 */

/** 横向意图判定阈值（px）：先过它、且横向位移大于纵向位移，才算横滑。 */
export const SWIPE_INTENT_THRESHOLD_PX = 10;
/** 松手后滑出动画时长（ms），与 SwipeToDelete.css 的 transition 一致。 */
export const SWIPE_EXIT_MS = 180;
/** 撤销窗口（ms）：与验收文案“5 秒”一致。 */
export const UNDO_WINDOW_MS = 5000;

/** 手势意图：横滑接管、纵滑放行、位移太小则未定。 */
export function resolveSwipeIntent(deltaX: number, deltaY: number): 'horizontal' | 'vertical' | 'undecided' {
  const ax = Math.abs(deltaX);
  const ay = Math.abs(deltaY);
  if (Math.max(ax, ay) < SWIPE_INTENT_THRESHOLD_PX) return 'undecided';
  return ax > ay ? 'horizontal' : 'vertical';
}

/** 只认向左滑，且滑过条目一半宽度才触发删除。 */
export function shouldTriggerSwipeDelete(deltaX: number, width: number): boolean {
  if (width <= 0) return false;
  return deltaX < 0 && Math.abs(deltaX) > width / 2;
}

export interface UndoToastOptions {
  /** 已在界面上拿掉后给用户的提示，例如“动态已删除”。 */
  message: string;
  undoLabel?: string;
  /** 默认 UNDO_WINDOW_MS（5000）。 */
  durationMs?: number;
  /** 5 秒内点“撤销”：把条目恢复显示，不动数据库。 */
  onUndo: () => void;
  /** 撤销窗口过去（自动关闭或手动划掉）：真正执行删除。 */
  onCommit: () => void;
}

/**
 * 延迟提交 + 撤销提示条：Sonner toast，底部弹出（position bottom-center，
 * 不动 main.tsx 里全站 top-center 的 Toaster），带“撤销” action。
 * 点撤销与超时/手动关闭只会走其中一条路（settled 守门），不会重复提交。
 * toast 挂在应用根部，页面切走后回调仍在，提交不会丢。
 */
export function showUndoToast(options: UndoToastOptions): void {
  const duration = options.durationMs ?? UNDO_WINDOW_MS;
  let settled = false;
  const commitOnce = () => {
    if (settled) return;
    settled = true;
    options.onCommit();
  };
  const undoOnce = () => {
    if (settled) return;
    settled = true;
    options.onUndo();
  };
  toast.success(options.message, {
    position: 'bottom-center',
    duration,
    action: {
      label: options.undoLabel ?? '撤销',
      onClick: () => {
        undoOnce();
      },
    },
    onAutoClose: () => {
      commitOnce();
    },
    onDismiss: () => {
      commitOnce();
    },
  });
}

export interface SwipeToDeleteProps {
  children: ReactNode;
  /** 滑过一半宽度松手后调用；调用方负责从列表里拿掉条目。 */
  onSwipeDelete: () => void;
  /** 露出的删除底色上的文字，默认“删除”。 */
  deleteLabel?: string;
  disabled?: boolean;
}

export default function SwipeToDelete({ children, onSwipeDelete, deleteLabel = '删除', disabled = false }: SwipeToDeleteProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const exitTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const gestureRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    width: 0,
    decided: false,
    active: false,
    maxDx: 0,
    dx: 0,
  });
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [reduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(
    () => () => {
      if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
    },
    [],
  );

  if (disabled) return <>{children}</>;

  function resetGesture() {
    gestureRef.current.decided = false;
    gestureRef.current.active = false;
    gestureRef.current.pointerId = -1;
    setDragging(false);
  }

  function finishSwipe() {
    const width = gestureRef.current.width;
    if (reduceMotion) {
      onSwipeDelete();
      return;
    }
    setExiting(true);
    setDx(-width);
    exitTimerRef.current = window.setTimeout(() => {
      onSwipeDelete();
    }, SWIPE_EXIT_MS);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (exiting) return;
    suppressClickRef.current = false;
    gestureRef.current.pointerId = event.pointerId;
    gestureRef.current.startX = event.clientX;
    gestureRef.current.startY = event.clientY;
    gestureRef.current.width = rootRef.current?.offsetWidth ?? 0;
    gestureRef.current.decided = false;
    gestureRef.current.active = false;
    gestureRef.current.maxDx = 0;
    gestureRef.current.dx = 0;
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (gesture.pointerId !== event.pointerId || exiting) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.decided) {
      const intent = resolveSwipeIntent(deltaX, deltaY);
      if (intent === 'undecided') return;
      gesture.decided = true;
      // 纵向意图：不接管，让页面正常滚动；横向意图：接管指针跟手。
      if (intent === 'vertical') return;
      gesture.active = true;
      setDragging(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // 指针已释放时 setPointerCapture 会抛错，忽略即可。
      }
    }
    if (!gesture.active) return;
    const nextDx = Math.max(-gesture.width, Math.min(0, deltaX));
    gesture.maxDx = Math.max(gesture.maxDx, Math.abs(nextDx));
    gesture.dx = nextDx;
    setDx(nextDx);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (gesture.pointerId !== event.pointerId || exiting) return;
    if (gesture.maxDx > SWIPE_INTENT_THRESHOLD_PX) suppressClickRef.current = true;
    if (!gesture.active) {
      resetGesture();
      return;
    }
    const width = gesture.width;
    // 松手那一下 state 未必已刷新，用 ref 里记的最新位移判定。
    const swipedDx = gesture.dx;
    resetGesture();
    if (shouldTriggerSwipeDelete(swipedDx, width)) {
      finishSwipe();
    } else {
      setDx(0);
    }
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (gestureRef.current.pointerId !== event.pointerId) return;
    resetGesture();
    setDx(0);
  }

  function handleClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    // 拖过阈值后手指抬起会紧跟一个 click，拦住它，别误触卡片里的按钮。
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  const underlayVisible = Math.abs(dx) > 24 || exiting;
  const surfaceClassName =
    'swipe-delete-surface' + (dragging ? ' is-dragging' : '') + (exiting ? ' is-exiting' : '');

  return (
    <div ref={rootRef} className="swipe-delete">
      <div className={'swipe-delete-underlay' + (underlayVisible ? ' is-visible' : '')} aria-hidden="true">
        <span>{deleteLabel}</span>
      </div>
      <div
        className={surfaceClassName}
        style={dx !== 0 ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClickCapture={handleClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
