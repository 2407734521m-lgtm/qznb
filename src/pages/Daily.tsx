import { useState } from 'react';
import PostList from '../components/PostList';
import PullToRefresh from '../components/PullToRefresh';

/** 日常板块：普通日常帖子，与动态共用 posts 表，以 section='daily' 区分；实现见共用组件 PostList。 */
export default function Daily({ searchQuery = '', embedded = false, focusPostId = null }: { searchQuery?: string; embedded?: boolean; focusPostId?: number | null }) {
  // 下拉刷新：与发现页一致，换 key 强制重挂载重拉；内嵌在表白墙帖子 tab 时不包刷新手势。
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = async () => {
    setRefreshKey(value => value + 1);
    await new Promise(resolve => setTimeout(resolve, 700));
  };
  const list = <PostList key={`daily-${refreshKey}`} section="daily" searchQuery={searchQuery} embedded={embedded} focusPostId={focusPostId} />;
  if (embedded) return list;
  return <PullToRefresh onRefresh={handleRefresh}>{list}</PullToRefresh>;
}
