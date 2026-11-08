-- Keep Presence read authorization limited to the site-presence topic,
-- authenticated non-anonymous sessions, and super administrators.
-- Supabase's Presence policy model uses the topic and extension fields;
-- the private-channel mode is enforced by the client/channel configuration.
begin;

drop policy if exists site_presence_admin_read on realtime.messages;

create policy site_presence_admin_read
on realtime.messages
for select
to authenticated
using (
  (select realtime.topic()) = 'site-presence'
  and realtime.messages.extension = 'presence'
  and (select auth.uid()) is not null
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  and coalesce((select public.my_role()), '') in ('admin', 'super_admin')
);

commit;
