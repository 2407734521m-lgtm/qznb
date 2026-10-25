import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Conversation, Profile, Message } from '../types/message';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setConversations([]);
        return;
      }

      // 1. 当前用户参与的会话
      const { data: memberRows, error: memberError } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('profile_id', user.id);

      if (memberError) throw memberError;
      if (!memberRows?.length) {
        setConversations([]);
        return;
      }

      const conversationIds = memberRows.map((r) => r.conversation_id);

      // 2. 会话基本信息
      const { data: convs, error: convError } = await supabase
        .from('conversations')
        .select('id, created_at')
        .in('id', conversationIds);

      if (convError) throw convError;

      // 3. 逐个会话处理
      const result: Conversation[] = await Promise.all(
        (convs || []).map(async (conv) => {
          // 3.1 找到对方的 profile_id
          const { data: otherMembers } = await supabase
            .from('conversation_members')
            .select('profile_id')
            .eq('conversation_id', conv.id)
            .neq('profile_id', user.id)
            .limit(1);

          const otherProfileId = otherMembers?.[0]?.profile_id as string | undefined;

          // 3.2 用 rpc 安全获取对方资料（直查 profiles 会被 p_sel 拦下）
          let other_user: Profile | null = null;

          if (otherProfileId) {
            const { data: detail } = await supabase.rpc('member_detail', {
              uid: otherProfileId,
            });

            // member_detail 返回一行或空（rpc 表返回为数组）
            if (detail && (Array.isArray(detail) ? detail[0] : detail)) {
              const row = Array.isArray(detail) ? detail[0] : detail;
              other_user = {
                id: otherProfileId,
                display_name: row.display_name ?? null,
                username: row.username ?? null,
                avatar_path: row.avatar_path ?? null,
              };
            }
          }

          // 3.3 兜底（对方未 joined 或 rpc 返回空）
          if (!other_user) {
            other_user = {
              id: otherProfileId || 'unknown',
              display_name: '班级同学',
              username: null,
              avatar_path: null,
            };
          }

          // 3.4 最后一条消息
          const { data: lastMessages } = await supabase
            .from('messages')
            .select('id, conversation_id, sender_id, body, created_at')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1);

          const last_message = (lastMessages?.[0] as Message) || null;

          return {
            id: conv.id,
            created_at: conv.created_at,
            other_user,
            last_message,
            unread_count: 0,
          };
        })
      );

      // 按最后消息时间倒序
      result.sort((a, b) => {
        const timeA = a.last_message?.created_at || a.created_at;
        const timeB = b.last_message?.created_at || b.created_at;
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });

      setConversations(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || '加载会话失败');
    } finally {
      setLoading(false);
    }
  }

  return { conversations, loading, error, refetch: fetchConversations };
}
