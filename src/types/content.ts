import type { Database } from '../lib/database.types';

type PostRow = Database['public']['Tables']['posts']['Row'];
type CommentRow = Database['public']['Tables']['comments']['Row'];

export type FeedPost = Pick<
  PostRow,
  'id' | 'author_id' | 'content' | 'image_url' | 'created_at'
>;

export type AdminPost = Pick<
  PostRow,
  'id' | 'author_id' | 'content' | 'image_url' | 'created_at' | 'deleted_at'
>;

export type FeedComment = Pick<
  CommentRow,
  'id' | 'post_id' | 'author_id' | 'content' | 'created_at'
>;

export type AdminComment = Pick<
  CommentRow,
  'id' | 'post_id' | 'author_id' | 'content' | 'created_at' | 'deleted_at'
>;
