import assert from "node:assert/strict";
import { isCrossSiteMusicApiRequest, normalizeMusicApiCookie } from "../worker/netease-security.mjs";

assert.equal(
  normalizeMusicApiCookie("MUSIC_U=abc; Path=/; SameSite=None; Secure; HttpOnly"),
  "MUSIC_U=abc; Path=/; HttpOnly; SameSite=Lax; Secure",
);
assert.equal(
  normalizeMusicApiCookie("NMTID=abc; Path=/;"),
  "NMTID=abc; Path=/; SameSite=Lax; Secure",
);

const sameOrigin = new Request("https://music.qianzhi.pw/api/netease/song/detail", {
  headers: { Origin: "https://music.qianzhi.pw", "Sec-Fetch-Site": "same-origin" },
});
assert.equal(isCrossSiteMusicApiRequest(sameOrigin), false);

const foreignOrigin = new Request("https://music.qianzhi.pw/api/netease/song/detail", {
  headers: { Origin: "https://example.net", "Sec-Fetch-Site": "cross-site" },
});
assert.equal(isCrossSiteMusicApiRequest(foreignOrigin), true);

// Same-site sibling subdomains are still cross-origin and must not share this API's cookies.
const siblingOrigin = new Request("https://music.qianzhi.pw/api/netease/song/detail", {
  headers: { Origin: "https://qianzhi.pw", "Sec-Fetch-Site": "same-site" },
});
assert.equal(isCrossSiteMusicApiRequest(siblingOrigin), true);

const crossSiteMetadataOnly = new Request("https://music.qianzhi.pw/api/netease/song/detail", {
  headers: { "Sec-Fetch-Site": "cross-site" },
});
assert.equal(isCrossSiteMusicApiRequest(crossSiteMetadataOnly), true);

// Non-browser API clients without Origin / Fetch Metadata remain usable.
const serverToServer = new Request("https://music.qianzhi.pw/api/netease/healthz");
assert.equal(isCrossSiteMusicApiRequest(serverToServer), false);

console.log("NetEase Worker security helper tests passed.");
