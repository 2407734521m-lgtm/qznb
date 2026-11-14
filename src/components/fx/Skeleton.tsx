import { useEffect, useState } from 'react';
import './fx.css';

/**
 * 扫光骨架屏（动效图鉴 01）：先按真实内容的样子摆灰色占位块，
 * 再让一道光从左往右匀速扫过、1500ms 循环；只动 transform，交给显卡。
 * 替代原来「正在加载…」纯文字和中间转圈。
 *
 * 防闪规则（2026-11-14：骨架不是所有地方都要闪）：
 * - 骨架只在「首次加载、数据还未知、且加载超过 300ms」时出现，
 *   快加载（300ms 内回来）直接出内容，不闪一下骨架。
 * - 列表已知是空时直接显示空状态，绝不先闪几张假卡再变空；
 *   筛选 / 切 Tab 是本地过滤，不重新拉数据，更不闪骨架。
 * - 骨架形状按列表真实形态：文字帖只用文字行骨架，
 *   只有大多数卡片真的带图时才用 withImage 画图占位。
 */

/** 骨架出现前的等待时间：加载比这快，就不闪骨架，直接出内容。 */
export const SKELETON_DELAY_MS = 300;

/**
 * 延迟加载态：loading 持续超过 delayMs 才返回 true；
 * loading 中途变 false 就清掉计时，永远不闪。
 */
export function useDelayedLoading(loading: boolean, delayMs: number = SKELETON_DELAY_MS): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!loading) {
      setShow(false);
      return;
    }
    const timer = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [loading, delayMs]);
  return show;
}

function Skel({ style }: { style?: React.CSSProperties }) {
  return <div className="fx-skel" style={style} aria-hidden />;
}

function AvatarSkel() {
  return <div className="fx-skel" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} aria-hidden />;
}

/**
 * 一张文字帖的样子：头像 + 三行字。默认不带图占位——大多数帖子根本没图，
 * 画 150px 大图占位形状就是错的；只有大多数卡片真的带图时才传 withImage。
 */
export function FeedSkeleton({ count = 2, withImage = false }: { count?: number; withImage?: boolean }) {
  return (
    <div role="status" aria-label="内容加载中">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card" style={{ marginBottom: 12 }}>
          <div className="fx-skel-wrap">
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <AvatarSkel />
              <div style={{ flex: 1 }}>
                <Skel style={{ width: '42%', height: 11, marginBottom: 8 }} />
                <Skel style={{ width: '88%', height: 11, marginBottom: 8 }} />
                <Skel style={{ width: '64%', height: 11 }} />
              </div>
            </div>
            {withImage && <Skel style={{ width: '100%', height: 150 }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 成员 / 消息列表的样子：一行行头像 + 两行字（成员墙、私聊列表用） */
export function RowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div role="status" aria-label="列表加载中">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card" style={{ marginBottom: 10 }}>
          <div className="fx-skel-wrap">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <AvatarSkel />
              <div style={{ flex: 1 }}>
                <Skel style={{ width: '34%', height: 11, marginBottom: 8 }} />
                <Skel style={{ width: '72%', height: 11 }} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 相册封面的样子：两列大图块（相册列表用——封面本来就是图，形状是对的） */
export function GridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="相册加载中" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="fx-skel-wrap">
          <Skel style={{ width: '100%', height: 150 }} />
          <div style={{ paddingTop: 10 }}>
            <Skel style={{ width: '60%', height: 12, marginBottom: 8 }} />
            <Skel style={{ width: '40%', height: 11 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 整页的样子：大标题 + 一段字 + 两张动态卡（启动页、访客加载、相册详情用） */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="页面加载中" style={{ padding: '18px 14px' }}>
      <div className="fx-skel-wrap" style={{ marginBottom: 16 }}>
        <Skel style={{ width: '46%', height: 26, marginBottom: 12 }} />
        <Skel style={{ width: '82%', height: 13, marginBottom: 8 }} />
        <Skel style={{ width: '64%', height: 13 }} />
      </div>
      <FeedSkeleton count={2} />
    </div>
  );
}

/** 延迟整页骨架：只在启动 / 鉴权未定、且超过 300ms 还没好时出现，快启动不闪。 */
export function DelayedPageSkeleton() {
  const show = useDelayedLoading(true);
  if (!show) return null;
  return <PageSkeleton />;
}

/** 小加载提示：不画任何假内容形状，只有一行小字（帖子墙、路由切换时用）。 */
export function InlineLoading({ label = '正在加载…' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="fx-inline-loading">
      {label}
    </div>
  );
}

/** 路由切换加载态：页内导航不闪整页骨架，只显示一行小提示。 */
export function RouteLoading({ label = '正在打开…' }: { label?: string }) {
  return <InlineLoading label={label} />;
}
