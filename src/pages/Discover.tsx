import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Feed from './Feed';
import Album from './Album';
import PullToRefresh from '../components/PullToRefresh';
import { invalidateFeedFirstPageCache } from '../components/PostList';

// 动态 + 相册合并为一页，内部切换
export default function Discover() {
  const location = useLocation();
  const routeState = location.state as { openTab?: string; searchQuery?: string; focusPostId?: number } | null;
  const searchQuery = typeof routeState?.searchQuery === 'string' ? routeState.searchQuery : '';
  const focusPostId = typeof routeState?.focusPostId === 'number' && Number.isInteger(routeState.focusPostId)
    ? routeState.focusPostId : null;
  const [tab, setTab] = useState<'feed' | 'albums'>(() => routeState?.openTab === 'albums' && !searchQuery ? 'albums' : 'feed');
  // 下拉刷新：PostList / Album 的拉取只在挂载时跑，文件范围不改它们，
  // 这里用 key 换掉当前子页强制重挂载重拉。PostList 内部没有共享的
  // loading 状态可等，指示条至少停留 700ms 再回弹。
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = async () => {
    // 下拉刷新要拉最新：先清掉第一页缓存，再重挂载重拉。
    invalidateFeedFirstPageCache('feed');
    setRefreshKey(value => value + 1);
    await new Promise(resolve => setTimeout(resolve, 700));
  };
  useEffect(() => {
    if (searchQuery) setTab('feed');
    else if (routeState?.openTab === 'albums') setTab('albums');
  }, [location.state]);
  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div>
      <div className="seg" style={{ margin: '2px 0 2px' }}>
        <button type="button" className={tab === 'feed' ? 'on' : ''} onClick={() => setTab('feed')}>动态</button>
        <button type="button" className={tab === 'albums' ? 'on' : ''} onClick={() => setTab('albums')}>相册</button>
      </div>
      {tab === 'feed' ? <Feed key={`feed-${refreshKey}`} searchQuery={searchQuery} focusPostId={focusPostId} /> : <Album key={`album-${refreshKey}`} />}
    </div>
    </PullToRefresh>
  );
}
