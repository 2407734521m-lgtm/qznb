-- 20261121113000_narrow_public_policies_to_authenticated.sql
-- These policies already require a non-null user identity or an authenticated
-- member/admin role. Limit their target role to authenticated as defense in depth;
-- signed-in guest accounts still use the authenticated Postgres role.

begin;

alter policy bm_del on public.board_messages to authenticated;
alter policy bm_sel on public.board_messages to authenticated;

alter policy bt_del on public.broadcast_templates to authenticated;
alter policy bt_ins on public.broadcast_templates to authenticated;
alter policy bt_sel on public.broadcast_templates to authenticated;
alter policy bt_upd on public.broadcast_templates to authenticated;

alter policy videos_del on storage.objects to authenticated;
alter policy videos_ins on storage.objects to authenticated;

commit;
