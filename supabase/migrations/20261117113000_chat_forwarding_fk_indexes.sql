-- Index the two forwarding attribution foreign keys for efficient joins and deletes.
begin;

create index if not exists messages_forwarded_from_message_id_idx
  on public.messages (forwarded_from_message_id);

create index if not exists messages_forwarded_from_sender_id_idx
  on public.messages (forwarded_from_sender_id);

commit;
