// 全站动效设计 tokens：所有新动画统一用这一套时长与缓动，禁止各组件自造。
// 只用 transform / opacity，不触发布局重排；减动效由调用方的 useReducedMotion 处理。
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const DUR = {
  instant: 0.15, // 微反馈（按压、开关）
  fast: 0.22,    // Dock 收起/展开、菜单进出
  base: 0.28,    // 页面转场
  slow: 0.45,    // 卡片、区块揭示
  hero: 0.62,    // 共享元素飞行、首屏开场
} as const;
