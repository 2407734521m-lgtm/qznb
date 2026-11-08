-- Private, topic-scoped authorization for the anonymous site-wide Presence channel.
-- This changes only RLS policies on realtime.messages; it does not alter Realtime-owned objects.

CREATE POLICY site_presence_authenticated_track
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT realtime.topic()) = 'site-presence'
  AND realtime.messages.extension = 'presence'
  AND realtime.messages.private IS TRUE
  AND (SELECT auth.uid()) IS NOT NULL
  AND COALESCE((SELECT auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
);

CREATE POLICY site_presence_admin_read
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (SELECT realtime.topic()) = 'site-presence'
  AND realtime.messages.extension = 'presence'
  AND realtime.messages.private IS TRUE
  AND (SELECT auth.uid()) IS NOT NULL
  AND COALESCE((SELECT auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  AND COALESCE((SELECT public.my_role()), '') IN ('admin', 'super_admin')
);
