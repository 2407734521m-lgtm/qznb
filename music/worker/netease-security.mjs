// Small, runtime-independent security helpers shared by the NetEase Worker and its tests.

export function normalizeMusicApiCookie(cookie) {
  const attributes = String(cookie || "")
    .split(";")
    .map(part => part.trim())
    .filter(part => part && !/^SameSite=/i.test(part) && !/^Secure$/i.test(part));
  return `${attributes.join("; ")}; SameSite=Lax; Secure`;
}

export function isCrossSiteMusicApiRequest(request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return Boolean((origin && origin !== url.origin) || fetchSite === "cross-site");
}
