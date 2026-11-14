import { Component, ReactNode } from 'react';
import { isChunkLoadError, tryMarkChunkReload } from '../lib/lazyWithRetry';

// 出错时显示报错信息，而不是黑屏
export default class ErrorBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: any) {
    return { err: (e && (e.stack || e.message)) ? String(e.stack || e.message).slice(0, 800) : '未知错误' };
  }
  componentDidCatch(e: any) {
    try { console.error('[boundary]', e); } catch {}
    // 兜底：分块加载失败（旧部署的哈希分块已被删）走到这里时，导入处
    // 的重试已经用完还没恢复，整页硬刷新一次取新入口。60 秒内只自动
    // 刷新一次，刷新后仍失败就留下面的人工重试，不死循环。
    try {
      if (isChunkLoadError(e) && tryMarkChunkReload()) location.reload();
    } catch { /* 刷新失败就留人工重试 */ }
  }
  render() {
    if (this.state.err) {
      // 分块加载失败：自动恢复也没能打开时才到这里。别只甩一句报错，
      // 说清是旧版本/网络问题，点刷新重试一般一次就能打开。
      if (isChunkLoadError(this.state.err)) {
        return (
          <div className="page" style={{ paddingTop: 40 }}>
            <div className="card">
              <h3 style={{ margin: '0 0 8px' }}>页面加载失败</h3>
              <p className="mut" style={{ fontSize: 13, margin: '0 0 8px', lineHeight: 1.7 }}>
                网站刚更新了新版本，你现在打开的还是旧版本页面，自动刷新也没能恢复。
                可能是网络不稳定，也可能是浏览器还留着旧缓存。点下面的按钮刷新重试，
                一般刷新一次就能打开。
              </p>
              <button className="pri" style={{ marginTop: 10 }} onClick={() => location.reload()}>刷新重试</button>
            </div>
          </div>
        );
      }
      return (
        <div className="page" style={{ paddingTop: 40 }}>
          <div className="card">
            <h3 style={{ margin: '0 0 8px' }}>页面出错了</h3>
            <p className="mut" style={{ fontSize: 12.5, margin: '0 0 8px' }}>把下面这段发给开发者就能修：</p>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11.5,
              background: '#0008', padding: 10, borderRadius: 8, maxHeight: 300, overflow: 'auto' }}>
              {this.state.err}
            </pre>
            <button className="pri" style={{ marginTop: 10 }} onClick={() => location.reload()}>刷新重试</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
