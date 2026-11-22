// 软件点击统计埋点：谁点了哪个单独软件、点了多少次。
// 只调 SECURITY DEFINER 的 log_app_click()，失败静默，绝不影响原功能。
// profile_id 由服务端取 auth.uid()，游客为空。
import { supabase } from './supabase';

export type AppClickApp = 'main' | 'admin' | 'musicdl' | 'radio' | 'realworld' | 'music' | 'signature';
export type AppClickEvent =
  | 'entry_click'
  | 'download_click'
  | 'update_prompt_shown'
  | 'update_click'
  | 'update_ignored'
  | 'copy_link'
  | 'qr_view';

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  return 'Desktop';
}

function clientPlatform(): string {
  const ua = navigator.userAgent;
  if (/QianzhiMusicDL\//.test(ua)) return 'musicdl';
  if (/QianzhiAdmin\//.test(ua)) return 'admin';
  if (/QianzhiApp\//.test(ua)) return 'app';
  return 'web';
}

export function logAppClick(
  app: AppClickApp,
  event: AppClickEvent,
  source: string,
  extra?: { appVersionName?: string; appVersionCode?: number },
): void {
  try {
    void (supabase as any).rpc('log_app_click', {
      p_app: app,
      p_event: event,
      p_source: source,
      p_app_version_name: extra?.appVersionName ?? null,
      p_app_version_code: extra?.appVersionCode ?? null,
      p_client_platform: clientPlatform(),
      p_device_label: deviceLabel(),
      p_user_agent: navigator.userAgent.slice(0, 500),
    }).then(({ error }: { error?: unknown }) => {
      if (error) console.debug('app click log failed', error);
    });
  } catch (error) {
    console.debug('app click log failed', error);
  }
}
