import { supabase } from './supabase';
import { isInApp } from './installedApp';

const LOCATION_MAX_LENGTH = 80;

export function normalizeSharedRegion(value: string): string {
  const cleaned = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2 || cleaned.length > LOCATION_MAX_LENGTH) {
    throw new Error('请填写 2～80 个字符的城市或地区名称。');
  }
  // Avoid accidentally storing a street-level address in this city/region field.
  if (/(?:\d{1,5}\s*(?:号|栋|幢|单元|室)|街道|小区|巷|弄|楼\d*)/.test(cleaned)) {
    throw new Error('这里只保存城市或地区，请不要填写街道、门牌号或楼栋信息。');
  }
  return cleaned;
}

function getDeviceCoordinates(): Promise<{ latitude: number; longitude: number }> {
  // 应用里就说应用、浏览器里就说浏览器：应用壳不是浏览器，
  // 「去浏览器授权」这类话在应用里只会让人摸不着头脑。
  const inApp = isInApp();
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error(inApp
        ? '当前应用不支持定位，请改为手动填写城市或地区。'
        : '当前浏览器不支持定位，请改为手动填写城市或地区。'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      error => reject(new Error(
        error.code === error.PERMISSION_DENIED
          ? inApp
            ? '你没有允许应用定位。可以到系统设置里给「青春档案」打开定位权限，或手动填写城市/地区。'
            : '你没有允许浏览器定位。可以重新授权，或手动填写城市/地区。'
          : error.code === error.TIMEOUT
            ? '获取位置超时，请稍后重试，或手动填写城市/地区。'
            : inApp
              ? '暂时无法获取位置，请检查应用的定位权限，或手动填写城市/地区。'
              : '暂时无法获取位置，请检查浏览器权限，或手动填写城市/地区。'
      )),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 }
    );
  });
}

async function invokeErrorMessage(error: unknown): Promise<string> {
  // 函数以非 2xx 返回时，supabase-js 把响应体放在 error.context 里而不是 data 里，
  // 不挖出来用户就只会看到一句没头没脑的「暂时无法识别」。
  try {
    const ctx = (error as { context?: unknown })?.context;
    if (ctx instanceof Response) {
      const body = await ctx.clone().json().catch(() => null);
      if (body && typeof body.error === 'string') return body.error;
    }
  } catch { /* 挖不到就算了，用兜底文案 */ }
  return '';
}

async function reverseGeocodeDirect(latitude: number, longitude: number): Promise<string> {
  // 备用通道：与服务端完全相同的参数与解析，直连 OpenStreetMap 识别。
  // 坐标在调用前已经粗略到约 10 公里，隐私口径与服务端通道一致。
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', latitude.toFixed(1));
  url.searchParams.set('lon', longitude.toFixed(1));
  url.searchParams.set('zoom', '10');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'zh-CN');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  let result: any;
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    if (!response.ok) throw new Error('direct geocode http error');
    result = await response.json();
  } finally {
    clearTimeout(timer);
  }
  const address = result?.address && typeof result.address === 'object' ? result.address : {};
  const city = address.city || address.town || address.village || address.municipality
    || address.city_district || address.county || address.district;
  const region = address.state || address.province || address.region || address.state_district;
  const parts = [...new Set([city, region, address.country]
    .map(value => (typeof value === 'string' ? value.trim() : '')).filter(Boolean))];
  if (!parts.length) throw new Error('direct geocode empty');
  return normalizeSharedRegion(parts.join(' · ').slice(0, 80));
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
  const { data, error } = await supabase.functions.invoke<{ location?: string; error?: string }>('location-reverse-geocode', {
    body: { latitude, longitude },
  });
  if (!error) {
    const location = typeof data?.location === 'string' ? data.location : '';
    if (location) return normalizeSharedRegion(location);
  }
  // 服务端识别没成（实测出现过：请求已过登录校验、已占查询名额，倒在上游识别那步），
  // 自动走备用通道再试一次；两边都失败时，把服务端的真实原因告诉用户。
  try {
    return await reverseGeocodeDirect(latitude, longitude);
  } catch { /* 直连也失败，用服务端原因 */ }
  const message = error ? await invokeErrorMessage(error) : '';
  throw new Error(message || '暂时无法识别所在地区，请手动填写城市或地区。');
}

export async function saveSharedRegion(value: string): Promise<string> {
  const location = normalizeSharedRegion(value);
  const { data, error } = await supabase.rpc('set_my_shared_region', { p_location: location });
  if (error) throw new Error(error.message);
  return typeof data === 'string' ? data : location;
}

export async function revokeSharedRegion(): Promise<void> {
  const { error } = await supabase.rpc('revoke_my_shared_region');
  if (error) throw new Error(error.message);
}
