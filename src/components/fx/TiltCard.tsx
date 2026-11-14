import './TiltCard.css';
import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  type MotionStyle,
  type MotionValue,
} from 'framer-motion';

/**
 * Aceternity UI 3D 倾斜卡：只借效果思路（透视 + 跟随指针的轻微倾斜 + 弱光晕），
 * 上游代码一行没抄，全部用站内已有的 framer-motion + 自研 CSS 自写；无 Tailwind、
 * 无 Aceternity 依赖。许可说明见 THIRD_PARTY_NOTICES.md。
 *
 * 与原版不同的三处改造（本站冷白纸面 + 手机优先）：
 * - 倾斜幅度只取 ±4°（原版幅度大、深色大光晕，不适合本站）；
 * - 光晕是白色弱光晕（径向渐变最高 0.16 透明度），不改卡片底色；
 * - 只在细指针 + 可悬停设备上启用（`(hover: hover) and (pointer: fine)`），
 *   且只响应鼠标指针：触摸设备完全不倾斜、不注册任何触摸处理，
 *   不挡点击、不挡滚动、不产生额外重排（只改 transform / background，
 *   且 MotionValue 更新不触发 React 重渲染）。
 * - 减弱动效：`prefers-reduced-motion` 时倾斜与光晕全关（`enabled` 为 false，
 *   调用方不渲染光晕层；CSS 里另有兜底规则）。
 *
 * 试点范围：只在发现页第一张卡（`src/pages/Explore.tsx` 的「指尖生花」）上挂
 * 这个 hook；其余卡片、Dock、点击/跳转行为一律不动。
 */

/** 单轴最大倾斜角（度），刻意取小值。 */
export const TILT_MAX_DEG = 4;
/** 透视距离（px），framer-motion 的 transformPerspective。 */
export const TILT_PERSPECTIVE = 900;

export interface TiltCardBinding {
  /** 本设备是否启用倾斜（细指针 + 未要求减弱动效）。 */
  enabled: boolean;
  /** 挂到试点卡片 motion 元素上的 style（含 rotateX / rotateY / transformPerspective）。 */
  tiltStyle: MotionStyle;
  /** 弱光晕背景（MotionValue，挂到 motion.span 的 background 上）。 */
  glare: MotionValue<string>;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
}

export function useTiltCard(): TiltCardBinding {
  const reduce = useReducedMotion();
  const [finePointer] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  );
  const enabled = !reduce && finePointer;

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const tiltX = useSpring(rotateX, { stiffness: 240, damping: 22, mass: 0.55 });
  const tiltY = useSpring(rotateY, { stiffness: 240, damping: 22, mass: 0.55 });
  const glare = useMotionTemplate`radial-gradient(260px circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 70%)`;

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || e.pointerType !== 'mouse') return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 2 * TILT_MAX_DEG);
    rotateX.set(-py * 2 * TILT_MAX_DEG);
    glareX.set((px + 0.5) * 100);
    glareY.set((py + 0.5) * 100);
  };

  const onPointerLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    glareX.set(50);
    glareY.set(50);
  };

  return {
    enabled,
    tiltStyle: { rotateX: tiltX, rotateY: tiltY, transformPerspective: TILT_PERSPECTIVE },
    glare,
    onPointerMove,
    onPointerLeave,
  };
}
