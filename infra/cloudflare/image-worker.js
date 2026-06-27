// Cloudflare Worker — secure image proxy for images.movingmanifest.com (MOVE-324).
//
// The PRIVATE Backblaze B2 bucket is never publicly reachable. This Worker is the
// only path to image bytes: it validates an HMAC-signed token minted by our
// backend (signImageUrl, MOVE-325), then fetches the object from B2 with the
// account's auth token and serves it, cached at Cloudflare's edge.
//
// Security model = the same capability-URL model we already use (signed +
// expiring, issued only to an authorized caller), now on our own domain with
// Backblaze hidden. A leaked link exposes one object for the token's short
// window; it can't be forged (HMAC) or repointed at another object.
//
// Secrets (set in the Cloudflare dashboard / `wrangler secret put`):
//   IMAGE_SIGNING_SECRET  — shared with the Convex backend (same value)
//   B2_KEY_ID             — Backblaze application keyId
//   B2_APPLICATION_KEY    — Backblaze applicationKey
//   B2_BUCKET             — bucket name

const B2_AUTHORIZE_URL =
  "https://api.backblazeb2.com/b2api/v3/b2_authorize_account";

// Per-isolate cache of the B2 account authorization (valid ~24h). Avoids a
// b2_authorize round-trip on every cache miss.
let b2AuthCache = null; // { token, downloadUrl, expiresAt }

async function getB2Auth(env) {
  const now = Date.now();
  if (b2AuthCache && b2AuthCache.expiresAt > now) return b2AuthCache;
  const basic = btoa(`${env.B2_KEY_ID}:${env.B2_APPLICATION_KEY}`);
  const res = await fetch(B2_AUTHORIZE_URL, {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) {
    throw new Error(`b2_authorize_account failed (${res.status})`);
  }
  const data = await res.json();
  b2AuthCache = {
    token: data.authorizationToken,
    downloadUrl: data.apiInfo.storageApi.downloadUrl,
    expiresAt: now + 23 * 60 * 60 * 1000,
  };
  return b2AuthCache;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    const url = new URL(request.url);
    const storageKey = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const exp = url.searchParams.get("e");
    const sig = url.searchParams.get("s");
    if (!storageKey || !exp || !sig) {
      return new Response("Bad request", { status: 400 });
    }

    // 1. Authorize: HMAC over "<storageKey>:<exp>", then expiry. The signature is
    //    bound to this exact object + expiry, so a token can't be repointed.
    if (!Number.isFinite(Number(exp)) || Number(exp) * 1000 < Date.now()) {
      return new Response("Link expired", { status: 403 });
    }
    const expected = await hmacHex(
      env.IMAGE_SIGNING_SECRET,
      `${storageKey}:${exp}`,
    );
    if (!timingSafeEqual(expected, sig)) {
      return new Response("Forbidden", { status: 403 });
    }

    // 2. Edge cache keyed on the object key ALONE (drop the token query), so
    //    every signed URL for the same object shares one cached copy.
    const cache = caches.default;
    const cacheKey = new Request(
      `https://images.movingmanifest.com/${encodeURIComponent(storageKey)}`,
      { method: "GET" },
    );
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    // 3. Fetch from the PRIVATE bucket using the account auth token.
    const auth = await getB2Auth(env);
    const downloadUrl = `${auth.downloadUrl}/file/${env.B2_BUCKET}/${storageKey}`;
    const b2res = await fetch(downloadUrl, {
      headers: { Authorization: auth.token },
    });
    if (!b2res.ok) {
      return new Response("Not found", {
        status: b2res.status === 404 ? 404 : 502,
      });
    }

    const response = new Response(b2res.body, {
      status: 200,
      headers: {
        "content-type":
          b2res.headers.get("content-type") || "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
