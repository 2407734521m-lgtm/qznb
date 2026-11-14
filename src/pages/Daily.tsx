import PostList from '../components/PostList';

/** 日常板块：普通日常帖子，与动态共用 posts 表，以 section='daily' 区分；实现见共用组件 PostList。 */
export default function Daily({ searchQuery = '', embedded = false, focusPostId = null }: { searchQuery?: string; embedded?: boolean; focusPostId?: number | null }) {
  return <PostList section="daily" searchQuery={searchQuery} embedded={embedded} focusPostId={focusPostId} />;
}
