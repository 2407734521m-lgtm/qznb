import { Component, ReactNode } from 'react';

// 出错时显示报错信息，而不是黑屏
export default class ErrorBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: any) {
    return { err: (e && (e.stack || e.message)) ? String(e.stack || e.message).slice(0, 800) : '未知错误' };
  }
  componentDidCatch(e: any) {
    try { console.error('[boundary]', e); } catch {}
  }
  render() {
    if (this.state.err) {
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
