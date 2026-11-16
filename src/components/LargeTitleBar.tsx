import type { RefObject } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import './LargeTitleBar.css';

/**
 * 大标题随滚动收起 + 毛玻璃吸顶细导航（首页 / 发现页共用）。
 * 做法沿用相册详情页 AlbumHero 的既有模式：大标题跟随滚动距离缩放上移、
 * 副标题淡出；滚到阈值时吸顶条背景与小标题淡入（毛玻璃）。
 * 只做视觉层：不改路由、不改数据、不碰 #621 的路由骨架与预热。
 * 吸顶条是 h1 的纯视觉复本（无交互），故整条 aria-hidden。
 *
 * scrollContainerRef（可选）：页面在内层容器里滚动时传它（如私聊页 .im-inbox），
 * 跟容器的 scrollTop；不传则跟窗口滚动（首页 / 发现页）。framer-motion 的
 * useScroll 会等 ref 就位再挂监听，父容器 ref 晚于子组件 effect 就位也不影响。
 */

const COLLAPSE = 110;
const clamp01 = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));

export default function LargeTitleBar({ title, subtitle, eyebrow, eyebrowClassName, headerClassName, scrollContainerRef }: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  eyebrowClassName?: string;
  headerClassName: string;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll(scrollContainerRef ? { container: scrollContainerRef } : undefined);
  const bigTitleY = useTransform(scrollY, (v: number) => (reduce ? 0 : -10 * clamp01(v, 0, COLLAPSE)));
  const bigTitleScale = useTransform(scrollY, (v: number) => (reduce ? 1 : 1 - 0.24 * clamp01(v, 0, COLLAPSE)));
  const subtitleOpacity = useTransform(scrollY, (v: number) => (reduce ? 1 : 1 - clamp01(v, 0, COLLAPSE * 0.6)));
  const barBgOpacity = useTransform(scrollY, (v: number) => (reduce ? (v > 24 ? 1 : 0) : clamp01(v, COLLAPSE - 52, COLLAPSE)));
  const barTitleOpacity = useTransform(scrollY, (v: number) => (reduce ? (v > 24 ? 1 : 0) : clamp01(v, COLLAPSE - 34, COLLAPSE + 8)));
  const barTitleX = useTransform(scrollY, (v: number) => (reduce ? 0 : -10 + 10 * clamp01(v, COLLAPSE - 34, COLLAPSE + 8)));

  return (
    <>
      <div className="ltb-sticky" aria-hidden="true">
        <motion.div className="ltb-sticky-bg" style={{ opacity: barBgOpacity }} />
        <motion.span className="ltb-sticky-title" style={{ opacity: barTitleOpacity, x: barTitleX }}>{title}</motion.span>
      </div>
      <header className={headerClassName}>
        <motion.div className="ltb-large" style={{ y: bigTitleY, scale: bigTitleScale }}>
          {eyebrow ? <span className={eyebrowClassName ?? 'ltb-eyebrow'}>{eyebrow}</span> : null}
          <h1>{title}</h1>
          {subtitle ? <motion.p style={{ opacity: subtitleOpacity }}>{subtitle}</motion.p> : null}
        </motion.div>
      </header>
    </>
  );
}
