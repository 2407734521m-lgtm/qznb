import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Feed from './Feed';
import Album from './Album';

// 动态 + 相册合并为一页，内部切换
export default function Discover() {
  const location = useLocation();
  const [tab, setTab] = useState<'feed' | 'albums'>(() => (location.state as any)?.openTab === 'albums' ? 'albums' : 'feed');
  return (
    <div>
      <div className="seg" style={{ margin: '2px 0 2px' }}>
        <button type="button" className={tab === 'feed' ? 'on' : ''} onClick={() => setTab('feed')}>动态</button>
        <button type="button" className={tab === 'albums' ? 'on' : ''} onClick={() => setTab('albums')}>相册</button>
      </div>
      {tab === 'feed' ? <Feed /> : <Album />}
    </div>
  );
}
