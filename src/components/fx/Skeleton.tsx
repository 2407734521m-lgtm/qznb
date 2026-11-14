import './fx.css';

/**
 * 扫光骨架屏（动效图鉴 01）：先按真实内容的样子摆灰色占位块，
 * 再让一道光从左往右匀速扫过、1500ms 循环；只动 transform，交给显卡。
 * 替代原来「正在加载…」纯文字和中间转圈。
 */

function Skel({ style }: { style?: React.CSSProperties }) {
  return <div className="fx-skel" style={style} aria-hidden />;
}

function AvatarSkel() {
  return <div className="fx-skel" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} aria-hidden />;
}

/** 一张动态卡片的样子：头像 + 两行字 + 一张图（动态 / 日常 / 表白墙列表用） */
export function FeedSkeleton({ count = 3 }: { count?: number }) {
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
            <Skel style={{ width: '100%', height: 150 }} />
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

/** 相册封面的样子：两列大图块（相册列表用） */
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
