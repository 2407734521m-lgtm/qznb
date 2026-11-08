import { isCrossSiteMusicApiRequest } from "./netease-security.mjs";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const text = value => value == null ? "" : String(value);

export function normalizeLicenseUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.hostname !== "creativecommons.org" && url.hostname !== "www.creativecommons.org") return "";
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.protocol = "https:";
    return url.toString();
  } catch {
    return "";
  }
}

export function isAllowedFreeMusicLicense(value) {
  const safeUrl = normalizeLicenseUrl(value);
  if (!safeUrl) return false;
  const path = new URL(safeUrl).pathname.toLowerCase();
  return /^\/licenses\/(by|by-sa|by-nc|by-nc-sa|by-nd|by-nc-nd)\/[0-9.]+\/?$/.test(path)
    || /^\/publicdomain\/(zero|mark)\/[0-9.]+\/?$/.test(path);
}

function licenseLabelOf(value) {
  const safeUrl = normalizeLicenseUrl(value);
  if (!safeUrl) return "Creative Commons";
  const path = new URL(safeUrl).pathname.toLowerCase();
  if (path.includes("/publicdomain/zero/")) return "CC0 · Public Domain";
  if (path.includes("/publicdomain/mark/")) return "Public Domain Mark";
  const match = path.match(/\/licenses\/([^/]+)\/([0-9.]+)/);
  return match ? "CC " + match[1].toUpperCase() + " " + match[2] : "Creative Commons";
}

function durationMsOf(value) {
  const raw = text(value).trim();
  if (!raw) return 0;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric * 1000);
  const parts = raw.split(":").map(Number);
  if (parts.length > 1 && parts.every(Number.isFinite)) {
    return Math.round(parts.reduce((total, part) => total * 60 + part, 0) * 1000);
  }
  return 0;
}

function isAudioFile(file) {
  if (!file || file.private === true || file.private === "true" || file.private === 1 || file.source === "metadata") return false;
  const name = text(file.name);
  if (!name || name.split("/").some(part => part === "..")) return false;
  return /\.(mp3|ogg|oga|flac|m4a|wav)$/i.test(name);
}

function archiveDownloadUrl(identifier, fileName) {
  const encodedPath = fileName.split("/").map(part => encodeURIComponent(part)).join("/");
  return "https://archive.org/download/" + encodeURIComponent(identifier) + "/" + encodedPath;
}

function creatorsOf(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).slice(0, 5);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return ["Internet Archive contributor"];
}

function archiveTrackOf(identifier, doc, metadataResponse, requestedFile = "") {
  const metadata = metadataResponse && metadataResponse.metadata || {};
  const rawLicense = text(metadata.licenseurl || metadata.license_url || doc && (doc.licenseurl || doc.license_url));
  const licenseUrl = normalizeLicenseUrl(rawLicense);
  if (!isAllowedFreeMusicLicense(licenseUrl)) return null;

  const files = Array.isArray(metadataResponse && metadataResponse.files) ? metadataResponse.files : [];
  const file = requestedFile
    ? files.find(item => text(item.name) === requestedFile && isAudioFile(item))
    : files.find(isAudioFile);
  if (!file) return null;

  const fileName = text(file.name);
  const baseName = fileName.split("/").pop().replace(/\.(mp3|ogg|oga|flac|m4a|wav)$/i, "");
  const audioFiles = files.filter(isAudioFile);
  const title = text(metadata.title || doc && doc.title || baseName);
  const name = audioFiles.length === 1 ? title : baseName.replace(/[_-]+/g, " ");
  const creators = creatorsOf(metadata.creator || doc && doc.creator);
  const albumName = text(metadata.album || title || "Internet Archive");

  return {
    id: "archive:" + identifier + ":" + encodeURIComponent(fileName),
    name: name || baseName || "Untitled audio",
    artists: creators,
    albumName,
    albumId: identifier,
    durationMs: durationMsOf(metadata.runtime || metadata.length || doc && doc.runtime),
    coverUrl: "https://archive.org/services/img/" + encodeURIComponent(identifier),
    audioUrl: archiveDownloadUrl(identifier, fileName),
    source: "archive",
    sourceLabel: "Internet Archive",
    licenseLabel: licenseLabelOf(licenseUrl),
    licenseUrl,
    sourceUrl: "https://archive.org/details/" + encodeURIComponent(identifier),
    archiveIdentifier: identifier,
    fileName,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" }, redirect: "follow" });
  if (!response.ok) throw new Error("Upstream returned HTTP " + response.status);
  return response.json();
}

async function mapLimit(items, concurrency, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { output[index] = await mapper(items[index], index); }
      catch { output[index] = null; }
    }
  });
  await Promise.all(workers);
  return output.filter(Boolean);
}

async function archiveMetadata(identifier) {
  return fetchJson("https://archive.org/metadata/" + encodeURIComponent(identifier));
}

async function searchArchive(query, limit, offset) {
  const quoted = '"' + query.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  const rows = Math.min(60, Math.max(12, limit * 3));
  const page = Math.floor(offset / rows) + 1;
  const params = new URLSearchParams({
    q: "mediatype:audio AND (title:" + quoted + " OR creator:" + quoted + ")",
    "fl[]": "identifier,title,creator,licenseurl,runtime",
    rows: String(rows),
    page: String(page),
    output: "json",
  });
  const result = await fetchJson("https://archive.org/advancedsearch.php?" + params.toString());
  const docs = Array.isArray(result && result.response && result.response.docs) ? result.response.docs : [];
  const mapped = await mapLimit(docs, 5, async doc => {
    const identifier = text(doc.identifier);
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(identifier)) return [];
    const metadata = await archiveMetadata(identifier);
    return (Array.isArray(metadata.files) ? metadata.files : [])
      .filter(isAudioFile)
      .slice(0, 2)
      .map(file => archiveTrackOf(identifier, doc, metadata, text(file.name)))
      .filter(Boolean);
  });
  return { items: mapped.flat().slice(0, limit), total: Number(result && result.response && result.response.numFound || 0) };
}

function trustedJamendoAudioUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && (url.hostname === "storage.jamendo.com" || url.hostname.endsWith(".storage.jamendo.com"))
      ? url.toString() : "";
  } catch { return ""; }
}

function jamendoTrackOf(raw) {
  const licenseUrl = normalizeLicenseUrl(raw && raw.license_ccurl);
  const audioUrl = trustedJamendoAudioUrl(raw && raw.audio);
  const id = text(raw && raw.id);
  if (!id || !audioUrl || !isAllowedFreeMusicLicense(licenseUrl)) return null;
  return {
    id: "jamendo:" + id,
    name: text(raw.name) || "Untitled track",
    artists: [text(raw.artist_name)].filter(Boolean),
    albumName: text(raw.album_name) || "Single",
    albumId: text(raw.album_id || id),
    durationMs: durationMsOf(raw.duration),
    coverUrl: text(raw.album_image || raw.image),
    audioUrl,
    source: "jamendo",
    sourceLabel: "Jamendo",
    licenseLabel: licenseLabelOf(licenseUrl),
    licenseUrl,
    sourceUrl: text(raw.shareurl) || "https://www.jamendo.com/track/" + id,
  };
}

async function jamendoRequest(params, clientId) {
  const url = new URL("https://api.jamendo.com/v3.0/tracks/");
  url.search = new URLSearchParams({
    client_id: clientId,
    format: "json",
    include: "licenses",
    audioformat: "mp32",
    type: "single albumtrack",
    ccnc: "true",
    order: "relevance",
    limit: String(params.limit || 20),
    offset: String(params.offset || 0),
    ...(params.query ? { namesearch: params.query } : {}),
    ...(params.id ? { id: params.id } : {}),
  }).toString();
  const response = await fetchJson(url.toString());
  if (response && response.headers && response.headers.status !== "success" && Number(response.headers.code) !== 0) {
    throw new Error("Jamendo did not return a successful response");
  }
  return response;
}

async function searchJamendo(query, limit, offset, clientId) {
  const response = await jamendoRequest({ query, limit: Math.min(limit * 2, 40), offset }, clientId);
  const results = Array.isArray(response && response.results) ? response.results : [];
  return { items: results.map(jamendoTrackOf).filter(Boolean).slice(0, limit), total: Number(response.headers && response.headers.results_count || results.length) };
}

async function getJamendoTrack(id, clientId) {
  const response = await jamendoRequest({ id, limit: 1, offset: 0 }, clientId);
  const raw = Array.isArray(response && response.results) ? response.results[0] : null;
  return raw ? jamendoTrackOf(raw) : null;
}

function interleave(first, second, limit) {
  const output = [];
  for (let index = 0; output.length < limit && (index < first.length || index < second.length); index += 1) {
    if (first[index]) output.push(first[index]);
    if (second[index] && output.length < limit) output.push(second[index]);
  }
  return output;
}

export async function handleFreeMusicApi(request, env = {}) {
  const url = new URL(request.url);
  if (isCrossSiteMusicApiRequest(request)) return json({ code: 403, message: "Cross-site request denied" }, 403);
  if (request.method !== "GET") return json({ code: 405, message: "Method not allowed" }, 405);

  if (url.pathname === "/api/free-music/search") {
    const query = text(url.searchParams.get("q")).trim().slice(0, 100);
    if (query.length < 2) return json({ code: 400, message: "Search text must contain at least two characters" }, 400);
    const limit = Math.max(1, Math.min(20, Number.parseInt(url.searchParams.get("limit") || "12", 10) || 12));
    const offset = Math.max(0, Math.min(1000, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0));
    const clientId = text(env.JAMENDO_CLIENT_ID).trim();
    const [archiveResult, jamendoResult] = await Promise.allSettled([
      searchArchive(query, limit, offset),
      clientId ? searchJamendo(query, limit, offset, clientId) : Promise.resolve({ items: [], total: 0 }),
    ]);
    const archive = archiveResult.status === "fulfilled" ? archiveResult.value : { items: [], total: 0 };
    const jamendo = jamendoResult.status === "fulfilled" ? jamendoResult.value : { items: [], total: 0 };
    const archiveError = archiveResult.status === "rejected" ? "Internet Archive search is temporarily unavailable" : null;
    const jamendoError = jamendoResult.status === "rejected" ? "Jamendo search is temporarily unavailable" : null;
    if (archiveError && (!clientId || jamendoError)) return json({ code: 502, message: "Free music sources are temporarily unavailable" }, 502);
    return json({
      code: 200,
      query,
      songs: interleave(archive.items, jamendo.items, limit),
      hasMore: archive.items.length >= limit || jamendo.items.length >= limit,
      sources: {
        archive: { available: !archiveError, error: archiveError },
        jamendo: { available: Boolean(clientId) && !jamendoError, configured: Boolean(clientId), error: jamendoError },
      },
    });
  }

  if (url.pathname === "/api/free-music/track") {
    const source = text(url.searchParams.get("source"));
    let track = null;
    try {
      if (source === "archive") {
        const identifier = text(url.searchParams.get("identifier"));
        const fileName = text(url.searchParams.get("file"));
        if (!/^[A-Za-z0-9._-]{1,120}$/.test(identifier) || !fileName || fileName.split("/").some(part => part === "..")) {
          return json({ code: 400, message: "Invalid Internet Archive track reference" }, 400);
        }
        track = archiveTrackOf(identifier, { identifier }, await archiveMetadata(identifier), fileName);
      } else if (source === "jamendo") {
        const id = text(url.searchParams.get("id"));
        if (!/^[0-9]{1,20}$/.test(id)) return json({ code: 400, message: "Invalid Jamendo track id" }, 400);
        const clientId = text(env.JAMENDO_CLIENT_ID).trim();
        if (!clientId) return json({ code: 503, message: "Jamendo is not configured" }, 503);
        track = await getJamendoTrack(id, clientId);
      } else {
        return json({ code: 400, message: "Unknown free music source" }, 400);
      }
    } catch {
      return json({ code: 502, message: "Free music track details are temporarily unavailable" }, 502);
    }
    return track ? json({ code: 200, track }) : json({ code: 404, message: "Track not found or its license is not eligible" }, 404);
  }
  return json({ code: 404, message: "Free music API route not found" }, 404);
}
