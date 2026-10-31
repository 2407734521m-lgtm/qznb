import type { ProfileSummary } from './profile';
import type { Database } from '../lib/database.types';

export type Profile = ProfileSummary;

export type ChatMessage = Pick<
  Database['public']['Tables']['messages']['Row'],
  'id' | 'sender_id' | 'body' | 'created_at'
>;

export interface Message {
  id: number; // bigint
  conversation_id: number;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: Profile;
}

export interface Conversation {
  id: number; // bigint
  created_at: string;
  last_message: Message | null;
  other_user: Profile | null;
  // 暂时没有准确未读数，先预留
  unread_count?: number;
}
