# ChatCN integration

This directory contains a qznb-adapted extraction of the conversation-list item pattern from:

- Project: https://github.com/leonickson1/chatcn
- Upstream source: `src/components/ui/chat/layouts.tsx` (`ChatConversationItem` / `ConversationItem`)
- License: MIT; see [LICENSE](./LICENSE)

The extracted UI was adapted to qznb's existing React + Vite + Supabase setup. It accepts qznb-rendered avatar content and existing event handlers, and does not import the upstream Next.js, Tailwind, shadcn/ui, Base UI, date-fns, or lucide dependencies. Conversation data, authorization, unread counts, navigation, and persistence remain owned by qznb.
