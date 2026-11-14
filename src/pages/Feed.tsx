import PostList from '../components/PostList';

/** 动态页（section='feed'）：实现见共用组件 PostList。 */
export default function Feed({ searchQuery = '', focusPostId = null }: { searchQuery?: string; focusPostId?: number | null }) {
  return <PostList section="feed" searchQuery={searchQuery} focusPostId={focusPostId} />;
}
