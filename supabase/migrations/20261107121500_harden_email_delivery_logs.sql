-- Harden the unified mail log: cover foreign-key lookups and explicitly scope RLS to service_role.

begin;

create index if not exists email_delivery_logs_actor_created_idx
  on public.email_delivery_logs(actor_id, created_at desc)
  where actor_id is not null;

create index if not exists email_delivery_logs_recipient_created_idx
  on public.email_delivery_logs(recipient_user_id, created_at desc)
  where recipient_user_id is not null;

create policy email_delivery_logs_service_role_all
  on public.email_delivery_logs
  for all
  to service_role
  using (true)
  with check (true);

commit;
