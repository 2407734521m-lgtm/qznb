import { supabase } from './supabase';

export type SitePresenceStatus = 'connecting' | 'connected' | 'error' | 'closed';

export type SitePresenceSnapshot = {
  status: SitePresenceStatus;
  online: number | null;
  updatedAt: string | null;
};

type Listener = (snapshot: SitePresenceSnapshot) => void;
type PresenceChannel = ReturnType<typeof supabase.channel>;

let channel: PresenceChannel | null = null;
let references = 0;
let snapshot: SitePresenceSnapshot = {
  status: 'closed',
  online: null,
  updatedAt: null,
};
const listeners = new Set<Listener>();

function publish(next: SitePresenceSnapshot) {
  snapshot = next;
  listeners.forEach(listener => listener(next));
}

function openChannel() {
  const current = supabase.channel('site-presence', {
    config: {
      private: true,
      // Do not set a shared Presence key. Supabase generates a unique
      // anonymous key per connection, as required by Presence semantics.
    },
  });
  channel = current;

  current.on('presence', { event: 'sync' }, () => {
    if (channel !== current) return;
    const online = Object.values(current.presenceState())
      .reduce((total, metas) => total + metas.length, 0);
    publish({
      status: 'connected',
      online,
      updatedAt: new Date().toISOString(),
    });
  });

  current.subscribe(status => {
    if (channel !== current) return;

    if (status === 'SUBSCRIBED') {
      publish({ ...snapshot, status: 'connected' });
      void (async () => {
        try {
          const result = await current.track({ online: true });
          if (String(result) !== 'ok' && channel === current) {
            publish({ ...snapshot, status: 'error' });
          }
        } catch {
          if (channel === current) publish({ ...snapshot, status: 'error' });
        }
      })();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      publish({ ...snapshot, status: 'error' });
    } else if (status === 'CLOSED') {
      publish({ ...snapshot, status: 'closed' });
    }
  });
}

/**
 * Acquire the single private site-wide Presence connection.
 *
 * The payload intentionally contains only an online marker. Admin listeners
 * receive ephemeral Presence state to calculate a count, never account IDs,
 * names, emails, or profile rows. Multiple consumers in the same app share
 * this channel, so the admin's own session is counted once.
 */
export function startSitePresence(listener?: Listener): () => void {
  references += 1;
  if (listener) listeners.add(listener);

  if (!channel) {
    publish({ status: 'connecting', online: null, updatedAt: null });
    openChannel();
  }
  if (listener) listener(snapshot);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (listener) listeners.delete(listener);
    references = Math.max(0, references - 1);

    if (references === 0 && channel) {
      const previous = channel;
      channel = null;
      publish({ status: 'closed', online: null, updatedAt: null });
      void supabase.removeChannel(previous);
    }
  };
}
