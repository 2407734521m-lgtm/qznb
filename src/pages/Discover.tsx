import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Feed from './Feed';
import Album from './Album';

// 动态 + 相册合并为一页，内部切换
export default function Discover() {
  const location = useLocation();
  const routeState = location.state as { openTab?: string; searchQuery?: string } | null;
  const searchQuery = typeof routeState?.searchQuery === 'string' ? routeState.searchQuery : '';
  const [tab, setTab] = useState<'feed' | 'albums'>(() => routeState?.openTab === 'albums' && !searchQuery ? 'albums' : 'feed');
  useEffect(() => {
    if (searchQuery) setTab('feed');
    else if (routeState?.openTab === 'albums') setTab('albums');
  }, [location.state]);
  return (
    <div>
      <div className="seg" style={{ margin: '2px 0 2px' }}>
        <button type="button" className={tab === 'feed' ? 'on' : ''} onClick={() => setTab('feed')}>动态</button>
        <button type="button" className={tab === 'albums' ? 'on' : ''} onClick={() => setTab('albums')}>相册</button>
      </div>
      {tab === 'feed' ? <Feed searchQuery={searchQuery} /> : <Album />}
    </div>
  );
}
