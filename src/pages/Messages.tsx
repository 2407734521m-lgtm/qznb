import { useState } from 'react';
import { useConversations } from '../hooks/useConversations';
import MessagesHeader from '../components/messages/MessagesHeader';
import SearchBar from '../components/messages/SearchBar';
import ConversationList from '../components/messages/ConversationList';

export default function Messages() {
  const { conversations, loading, error } = useConversations();
  const [search, setSearch] = useState('');

  const filtered = conversations.filter((c) => {
    const name =
      c.other_user?.display_name ||
      c.other_user?.username ||
      '班级同学';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="page">
      <div className="page-content" style={{ maxWidth: 680, margin: '0 auto' }}>
        <MessagesHeader />
        <SearchBar value={search} onChange={setSearch} />

        {error && (
          <div style={{
            padding: '12px 16px',
            margin: '12px 0',
            background: 'rgba(255, 69, 58, 0.15)',
            borderRadius: 12,
            color: '#ff453a',
            fontSize: 14
          }}>
            {error}
          </div>
        )}

        <ConversationList
          conversations={filtered}
          loading={loading}
        />
      </div>
    </div>
  );
}
