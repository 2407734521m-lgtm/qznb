import { supabase } from './supabase';

/**
 * Join the private site-wide Presence channel.
 * The account ID is the Presence key, so multiple tabs/devices collapse to
 * one entry in presenceState(). Only the admin role is allowed to read peers.
 */
export function startSitePresence(userId: string): () => void {
  let stopped = false;
  const channel = supabase.channel('site-presence', {
    config: {
      private: true,
      presence: { key: userId },
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
