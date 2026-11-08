import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://qianzhi.pw",
  "https://www.qianzhi.pw",
  "https://admin.qianzhi.pw",
  "http://localhost:5173",
]);

function cors(origin: string | null): Record<string, string> {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://qianzhi.pw";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), ...extra, "Content-Type": "application/json; charset=utf-8" },
  });
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

async function cacheKey(secret: string, latitude: number, longitude: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(latitude.toFixed(1) + "," + longitude.toFixed(1)),
  );
  return hex(new Uint8Array(signature));
}

function keyFromMap(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preferred = parsed.default;
    if (typeof preferred === "string") return preferred;
    const first = Object.values(parsed).find(value => typeof value === "string");
    return typeof first === "string" ? first : "";
  } catch {
    return "";
  }
}

function uniqueParts(values: Array<string | undefined>): string[] {
  return [...new Set(values.map(value => (value || "").trim()).filter(Boolean))];
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) {
    return json({ error: "请求来源不受支持。" }, 403, origin);
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (request.method !== "POST") return json({ error: "仅支持 POST 请求。" }, 405, origin);

  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return json({ error: "请先登录后再分享所在地区。" }, 401, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
    || keyFromMap(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || keyFromMap(Deno.env.get("SUPABASE_SECRET_KEYS"));
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "位置服务暂不可用，请手动填写城市或地区。" }, 503, origin);
  }

  const token = authorization.slice("Bearer ".length);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) {
    return json({ error: "登录状态已失效，请重新登录。" }, 401, origin);
  }

  let payload: { latitude?: unknown; longitude?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "定位数据无效，请手动填写城市或地区。" }, 400, origin);
  }

  const rawLatitude = Number(payload.latitude);
  const rawLongitude = Number(payload.longitude);
  if (!Number.isFinite(rawLatitude) || !Number.isFinite(rawLongitude)
    || rawLatitude < -90 || rawLatitude > 90 || rawLongitude < -180 || rawLongitude > 180) {
    return json({ error: "定位数据无效，请手动填写城市或地区。" }, 400, origin);
  }

  // Enforce coarse resolution again on the server. Exact GPS coordinates are never logged or stored.
  const latitude = Math.round(rawLatitude * 10) / 10;
  const longitude = Math.round(rawLongitude * 10) / 10;
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const key = await cacheKey(serviceRoleKey, latitude, longitude);
    const { data: cached } = await serviceClient
      .from("location_geocode_cache")
      .select("location_label")
      .eq("location_key", key)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (cached?.location_label) {
      return json({ location: cached.location_label, precision: "city_region" }, 200, origin);
    }

    const { data: slotGranted, error: slotError } = await serviceClient.rpc("claim_location_geocode_slot");
    if (slotError) {
      return json({ error: "位置服务暂不可用，请手动填写城市或地区。" }, 503, origin);
    }
    if (slotGranted !== true) {
      return json({ error: "位置查询繁忙，请稍后重试，或手动填写城市/地区。" }, 429, origin, { "Retry-After": "1" });
    }

    // This environment setting allows the geocoding provider to be switched without a client release.
    const endpoint = (Deno.env.get("LOCATION_GEOCODER_ENDPOINT") || "https://nominatim.openstreetmap.org/reverse").trim();
    const endpointUrl = new URL(endpoint);
    if (endpointUrl.protocol !== "https:") {
      return json({ error: "位置服务配置无效，请手动填写城市或地区。" }, 503, origin);
    }
    endpointUrl.searchParams.set("format", "jsonv2");
    endpointUrl.searchParams.set("lat", latitude.toFixed(1));
    endpointUrl.searchParams.set("lon", longitude.toFixed(1));
    endpointUrl.searchParams.set("zoom", "10");
    endpointUrl.searchParams.set("addressdetails", "1");
    endpointUrl.searchParams.set("accept-language", "zh-CN");

    const response = await fetch(endpointUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "QianzhiLocation/1.0 (+https://qianzhi.pw)",
        "Referer": "https://qianzhi.pw/",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return json({ error: "地区识别暂时不可用，请稍后重试，或手动填写城市/地区。" }, 503, origin);
    }

    const result = await response.json();
    const address = result?.address && typeof result.address === "object" ? result.address : {};
    const city = address.city || address.town || address.village || address.municipality
      || address.city_district || address.county || address.district;
    const region = address.state || address.province || address.region || address.state_district;
    const country = address.country;
    const parts = uniqueParts([city, region, country]);
    if (!parts.length) {
      return json({ error: "没有识别到城市或地区，请手动填写。" }, 422, origin);
    }
    const location = parts.join(" · ").slice(0, 80);
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    await serviceClient.from("location_geocode_cache").upsert({
      location_key: key,
      location_label: location,
      expires_at: expiresAt,
    }, { onConflict: "location_key" });

    return json({ location, precision: "city_region" }, 200, origin);
  } catch {
    // Do not log request coordinates or upstream location payloads.
    return json({ error: "地区识别暂时不可用，请手动填写城市或地区。" }, 503, origin);
  }
});
