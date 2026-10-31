import type { Database } from '../lib/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

/** Shared, minimal projection used by member avatars and conversation summaries. */
export type ProfileSummary = Pick<
  ProfileRow,
  'id' | 'username' | 'display_name' | 'avatar_path'
>;

export type ProfileAdminIdentity = Pick<
  ProfileRow,
  'id' | 'username' | 'display_name' | 'real_name'
>;

export type ProfileLabel = Pick<
  ProfileRow,
  'id' | 'username' | 'display_name'
>;
