import type { Database } from '../lib/database.types';

type SongPostRow = Database['public']['Tables']['song_posts']['Row'];

export type SongWallPost = Pick<
  SongPostRow,
  'id' | 'author_id' | 'title' | 'description' | 'audio_path' | 'duration_seconds' | 'status' | 'created_at'
>;

export type AdminSongPost = SongPostRow;
