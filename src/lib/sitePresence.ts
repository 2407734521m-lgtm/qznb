import { supabase } from './supabase';

/**
 * Join the private site-wide Presence channel with a shared anonymous key.
 * The payload contains no profile ID or personal data; administrators can
 * derive a connection count without receiving an account identifier list.
 */
export function startSitePresence(): () => void {
  let stopped = false;
  const channel = supabase.channel('site-presence', {
    config: {
      private: true,
      presence: { key: 'online' },
    },
  });
  channel.subscribe(status => {
    if (status === 'SUBSCRIBED' && !stopped) {
      void channel.track({ online: true }).catch(() => {
        // Presence is supplemental; the existing DB heartbeat remains fallback.
      });
    }
  });
  return () => {
    stopped = true;
    void supabase.removeChannel(channel);
  };
}
