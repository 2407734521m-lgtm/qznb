import { Conversation } from '../../types/message';
import ConversationItem from './ConversationItem';

interface Props {
  conversations: Conversation[];
  loading: boolean;
}

export default function ConversationList({ conversations, loading }: Props) {
  if (loading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 15 }}>
        加载中…
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 15 }}>
        暂无对话
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      {conversations.map((c) => (
        <ConversationItem key={c.id} conversation={c} />
      ))}
    </div>
  );
}
