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
let opening = false;
let references = 0;
let snapshot: SitePresenceSnapshot = {
  status: 'closed',
  online: null,
  updatedAt: null,
};
const listeners = new Set<Listener>();

// 订阅失败后自动重建频道：以前失败一次就永久停在 error（总览显示
// 「实时不可用 · 活动统计回退」），页面刚加载时令牌还没同步、或代理
// 短暂中断都会触发。现在按 2s→30s 退避重试，直到连上为止。
let retryTimer: number | null = null;
let retryDelay = 2000;
let generation = 0;

function publish(next: SitePresenceSnapshot) {
  snapshot = next;
  listeners.forEach(listener => listener(next));
}

function clearRetry() {
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleRetry() {
  if (retryTimer !== null || references === 0) return;
  const delay = retryDelay;
  retryDelay = Math.min(retryDelay * 2, 30000);
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    if (references === 0 || channel || opening) return;
    publish({ status: 'connecting', online: null, updatedAt: null });
    openChannel();
  }, delay);
}

function failChannel(current: PresenceChannel) {
  if (channel !== current) return;
  channel = null;
  generation += 1;
  publish({ ...snapshot, status: 'error' });
  void supabase.removeChannel(current);
  scheduleRetry();
}

function openChannel() {
  if (opening) return;
  opening = true;
  const gen = generation;
  void (async () => {
    // 私有频道靠登录令牌过 RLS：订阅前先把当前会话令牌同步给
    // Realtime，避免页面刚打开时用匿名身份订阅被拒。
    try {
      const { data } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
    } catch {
      // 同步失败也继续尝试订阅，失败后有退避重试兜底。
    }
    if (gen !== generation || references === 0 || channel) {
      opening = false;
      return;
    }
    const current = supabase.channel('site-presence', {
      config: {
        private: true,
        // Do not set a shared Presence key. Supabase generates a unique
        // anonymous key per connection, as required by Presence semantics.
      },
    });
    channel = current;
    opening = false;

    current.on('presence', { event: 'sync' }, () => {
      if (channel !== current) return;
      const online = Object.values(current.presenceState())
        .reduce((total, metas) => total + metas.length, 0);
      retryDelay = 2000;
      publish({
        status: 'connected',
        online,
        updatedAt: new Date().toISOString(),
      });
    });

    current.subscribe(status => {
      if (channel !== current) return;

      if (status === 'SUBSCRIBED') {
        retryDelay = 2000;
        publish({ ...snapshot, status: 'connected' });
        void (async () => {
          try {
            const result = await current.track({ online: true });
            if (String(result) !== 'ok') failChannel(current);
          } catch {
            failChannel(current);
          }
        })();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        failChannel(current);
      }
    });
  })();
}

// 网络恢复或页面回到前台时，若连接已断开就立刻重建，不等退避计时。
if (typeof window !== 'undefined') {
  const wake = () => {
    if (references === 0 || channel || opening) return;
    if (snapshot.status === 'connected') return;
    clearRetry();
    retryDelay = 2000;
    publish({ status: 'connecting', online: null, updatedAt: null });
    openChannel();
  };
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake();
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

  if (!channel && !opening) {
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

    if (references === 0) {
      clearRetry();
      retryDelay = 2000;
      generation += 1;
      opening = false;
      if (channel) {
        const previous = channel;
        channel = null;
        void supabase.removeChannel(previous);
      }
      publish({ status: 'closed', online: null, updatedAt: null });
    }
  };
}
