import type { ReactNode } from 'react';
import './ChatConversationItem.css';

export interface ChatConversationItemProps {
  title: string;
  avatar: ReactNode;
  preview: string;
  time: string;
  unreadCount?: number;
  isUnread?: boolean;
  onClick: () => void;
  onPointerDown?: () => void;
}

/**
 * Adapted from ChatCN's ChatConversationItem / ConversationItem pattern.
 * Keeps the upstream composition (avatar, title/time, preview/unread) while
 * using qznb's existing avatar, data and interaction handlers.
 */
export default function ChatConversationItem({
  title,
  avatar,
  preview,
  time,
  unreadCount = 0,
  isUnread = unreadCount > 0,
  onClick,
  onPointerDown,
}: ChatConversationItemProps) {
  return (
    <button
      type="button"
      className={'chatcn-conversation-item' + (isUnread ? ' is-unread' : '')}
      onPointerDown={onPointerDown}
      onClick={onClick}
      aria-label={title + (isUnread ? '，有未读消息' : '') + '，' + preview}
    >
      <span className="chatcn-conversation-avatar">{avatar}</span>
      <span className="chatcn-conversation-copy">
        <span className="chatcn-conversation-heading">
          <span className="chatcn-conversation-title">{title}</span>
          <time className="chatcn-conversation-time">{time}</time>
        </span>
        <span className="chatcn-conversation-preview-line">
          <span className="chatcn-conversation-preview">{preview}</span>
          {unreadCount > 0 && (
            <span className="chatcn-conversation-unread" aria-label={unreadCount + ' 条未读'}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
