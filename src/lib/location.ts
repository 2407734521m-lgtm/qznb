import { supabase } from './supabase';

const LOCATION_MAX_LENGTH = 80;

export function normalizeSharedRegion(value: string): string {
  const cleaned = value.replace(/[\\r\\n\\t]+/g, ' ').replace(/\\s+/g, ' ').trim();
  if (cleaned.length < 2 || cleaned.length > LOCATION_MAX_LENGTH) {
    throw new Error('请填写 2～80 个字符的城市或地区名称。');
  }
  // Avoid accidentally storing a street-level address in this city/region field.
  if (/(\\d{1,5}\\s*(号|栋|幢|单元|室)|街道|小区|巷|弄|楼\\d*)/.test(cleaned)) {
    throw new Error('这里只保存城市或地区，请不要填写街道、门牌号或楼栋信息。');
  }
  return cleaned;
}

function getDeviceCoordinates(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('当前浏览器不支持定位，请改为手动填写城市或地区。'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      error => reject(new Error(
        error.code === error.PERMISSION_DENIED
          ? '你没有允许浏览器定位。可以重新授权，或手动填写城市/地区。'
          : error.code === error.TIMEOUT
            ? '获取位置超时，请稍后重试，或手动填写城市/地区。'
            : '暂时无法获取位置，请检查浏览器权限，或手动填写城市/地区。'
      )),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 }
    );
  });
}

/**
 * Requests a one-time device location only after the user explicitly chooses to share.
 * Coordinates are rounded to roughly 10 km before leaving the browser; only the
 * returned city/region label is used by the caller and persisted to member_presence.
 */
export async function resolveApproximateRegion(): Promise<string> {
  const coordinates = await getDeviceCoordinates();
  const latitude = Math.round(coordinates.latitude * 10) / 10;
  const longitude = Math.round(coordinates.longitude * 10) / 10;
  const { data, error } = await supabase.functions.invoke('location-reverse-geocode', {
    body: { latitude, longitude },
  });
  if (error) {
    const message = typeof (data as any)?.error === 'string' ? (data as any).error : '';
    throw new Error(message || '暂时无法识别所在地区，请手动填写城市或地区。');
  }
  const location = typeof data?.location === 'string' ? data.location : '';
  if (!location) throw new Error('没有识别到城市或地区，请手动填写。');
  return normalizeSharedRegion(location);
}

export async function saveSharedRegion(profileId: string, value: string): Promise<string> {
  const location = normalizeSharedRegion(value);
  const { error } = await supabase.from('member_presence').upsert({
    profile_id: profileId,
    location,
    location_share_enabled: true,
    location_consented_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'profile_id' });
  if (error) throw new Error(error.message);
  return location;
}

export async function revokeSharedRegion(profileId: string): Promise<void> {
  const { error } = await supabase.from('member_presence')
    .update({
      location: null,
      location_share_enabled: false,
      location_consented_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('profile_id', profileId);
  if (error) throw new Error(error.message);
}
