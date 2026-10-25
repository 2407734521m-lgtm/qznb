import { Conversation } from '../../types/message';
import { useNavigate } from 'react-router-dom';
import { useSignedUrl } from '../../lib/media';

interface Props {
  conversation: Conversation;
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

// 站内消息正文里图片/语音以标记形式存放，列表预览要翻译成人话
function previewText(body: string) {
  if (body.startsWith('[[im-image:')) return '图片';
  if (body.startsWith('[[im-audio:')) return '语音';
  return body;
}

export default function ConversationItem({ conversation }: Props) {
  const navigate = useNavigate();
  const { other_user, last_message, unread_count = 0 } = conversation;

  const name = other_user?.display_name || other_user?.username || '班级同学';
  // avatars 桶是私有的，不能拼公开链接，必须走签名链接（跟成员墙同一路）
  const avatarUrl = useSignedUrl('avatars', other_user?.avatar_path);
  const preview = last_message ? previewText(last_message.body) : '暂无消息';
  const time = last_message?.created_at || conversation.created_at;

  return (
    <div
      onClick={() => navigate(`/chat/${conversation.id}`, { state: { name } })}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 4px',
        cursor: 'pointer',
        borderRadius: 12,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {/* 头像 */}
      <div style={{
        width: 52,
        height: 52,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        background: 'rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        color: 'rgba(255,255,255,0.5)',
      }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          name.slice(0, 1)
        )}
      </div>

      {/* 文字区域 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
          <span style={{
            fontSize: 16,
            fontWeight: 500,
            color: '#fff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '70%',
          }}>
            {name}
          </span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
            {formatTime(time)}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 15,
            color: 'rgba(255,255,255,0.45)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '85%',
          }}>
            {preview}
          </span>

          {unread_count > 0 && (
            <span style={{
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              background: '#0a84ff',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 6px',
            }}>
              {unread_count > 99 ? '99+' : unread_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
