-- Realtime site-wide anonymous connection count.
-- Authenticated users may publish an ephemeral online marker to one shared key.
-- Only administrators may read Presence state; no account IDs or profile data are sent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'site_presence_authenticated_track'
  ) THEN
    CREATE POLICY site_presence_authenticated_track
      ON realtime.messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        (SELECT realtime.topic()) = 'site-presence'
        AND realtime.messages.extension = 'presence'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'site_presence_admin_read'
  ) THEN
    CREATE POLICY site_presence_admin_read
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        (SELECT realtime.topic()) = 'site-presence'
        AND realtime.messages.extension = 'presence'
        AND COALESCE((SELECT public.my_role()), '') IN ('admin', 'super_admin')
      );
  END IF;
END
$$;
