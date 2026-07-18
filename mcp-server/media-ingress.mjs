import { lookup } from "node:dns/promises";
import { lstat, readFile, realpath } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import path from "node:path";

export const DEFAULT_REMOTE_MEDIA_BYTES = 25 * 1024 * 1024;
export const DEFAULT_REMOTE_MEDIA_TIMEOUT_MS = 10_000;
export const DEFAULT_REMOTE_MEDIA_REDIRECTS = 3;

/** @param {string | undefined} rawValue @param {string} [cwd] @returns {string[]} */
export function parseAllowedFileRoots(rawValue, cwd = process.cwd()) {
  if (!rawValue?.trim()) return [];
  return rawValue.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean).map((entry) => path.resolve(cwd, entry));
}

/** @param {{filePath:string, transport?:"stdio"|"hosted", allowedFileRoots?:string[], maxBytes?:number}} options */
export async function readAllowedLocalMedia({ filePath, transport, allowedFileRoots = [], maxBytes = DEFAULT_REMOTE_MEDIA_BYTES }) {
  if (transport === "hosted") throw new Error("filePath is disabled for hosted MCP. Use sourceUrl, dataUrl, or fileBase64 instead.");
  if (allowedFileRoots.length === 0) throw new Error("Local filePath access is disabled. Configure MOVINGMANIFEST_MCP_ALLOWED_FILE_ROOTS with one or more trusted directories before using filePath.");
  const candidatePath = path.resolve(filePath);
  const candidateLstat = await lstat(candidatePath).catch(() => null);
  if (!candidateLstat?.isFile()) throw new Error("filePath must identify a regular file inside an allowed root; symlinks, devices, directories, and pipes are refused.");
  if (candidateLstat.size <= 0) throw new Error("filePath was empty.");
  if (candidateLstat.size > maxBytes) throw new Error(`filePath exceeds the ${maxBytes}-byte media limit.`);
  const canonicalPath = await realpath(candidatePath);
  const canonicalRoots = await Promise.all(allowedFileRoots.map(async (root) => await realpath(path.resolve(root))));
  const insideAllowedRoot = canonicalRoots.some((root) => {
    const relative = path.relative(root, canonicalPath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
  if (!insideAllowedRoot) throw new Error("filePath resolves outside MOVINGMANIFEST_MCP_ALLOWED_FILE_ROOTS.");
  const bytes = await readFile(canonicalPath);
  if (bytes.byteLength > maxBytes) throw new Error(`filePath exceeds the ${maxBytes}-byte media limit.`);
  return { bytes, canonicalPath };
}

/** @param {string} sourceUrl */
export function parsePublicHttpsUrl(sourceUrl) {
  let url;
  try { url = new URL(sourceUrl); } catch { throw new Error("sourceUrl must be a valid public HTTPS URL."); }
  if (url.protocol !== "https:") throw new Error("sourceUrl must be a public HTTPS URL; HTTP and file URLs are refused.");
  if (url.username || url.password) throw new Error("sourceUrl must not include embedded credentials.");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("sourceUrl must resolve to a public Internet address.");
  if (isIP(hostname) && !isPublicIpAddress(hostname)) throw new Error("sourceUrl must resolve to a public Internet address.");
  return url;
}

/** @param {URL} url @param {(hostname:string, options:{all:true,verbatim:true})=>Promise<Array<{address:string,family:number}>>} [lookupFn] */
export async function resolvePublicAddresses(url, lookupFn = /** @type {any} */ (lookup)) {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (!isPublicIpAddress(hostname)) throw new Error("sourceUrl must resolve to a public Internet address.");
    return [{ address: hostname, family: isIP(hostname) }];
  }
  let addresses;
  try { addresses = await lookupFn(hostname, { all: true, verbatim: true }); } catch { throw new Error("sourceUrl hostname could not be resolved."); }
  if (!Array.isArray(addresses) || addresses.length === 0) throw new Error("sourceUrl hostname did not resolve to an address.");
  if (addresses.some(({ address }) => !isPublicIpAddress(address))) throw new Error("sourceUrl must resolve only to public Internet addresses.");
  return addresses;
}

/**
 * @param {string} sourceUrl
 * @param {{maxBytes?:number, timeoutMs?:number, maxRedirects?:number, lookupFn?:(hostname:string, options:{all:true,verbatim:true})=>Promise<Array<{address:string,family:number}>>, requestFn?:(options:{url:URL,address:string,family:number,timeoutMs:number})=>Promise<{status:number,headers:Headers|Record<string,string|string[]|undefined>,body:AsyncIterable<Uint8Array>|Iterable<Uint8Array>,destroy?:()=>void}>}} [options]
 */
export async function downloadPublicHttpsMedia(sourceUrl, { maxBytes = DEFAULT_REMOTE_MEDIA_BYTES, timeoutMs = DEFAULT_REMOTE_MEDIA_TIMEOUT_MS, maxRedirects = DEFAULT_REMOTE_MEDIA_REDIRECTS, lookupFn = /** @type {any} */ (lookup), requestFn = requestPinnedHttps } = {}) {
  const deadline = Date.now() + timeoutMs;
  const timeoutError = () => new Error(`sourceUrl timed out after ${timeoutMs}ms.`);
  let activeResponse;
  let timedOut = false;
  const assertWithinDeadline = () => {
    if (timedOut || Date.now() >= deadline) throw timeoutError();
  };

  const operation = async () => {
    let url = parsePublicHttpsUrl(sourceUrl);
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const addresses = await resolvePublicAddresses(url, lookupFn);
      assertWithinDeadline();
      const response = await requestFn({ url, address: addresses[0].address, family: addresses[0].family, timeoutMs: Math.max(1, deadline - Date.now()) });
      activeResponse = response;
      assertWithinDeadline();
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirectCount === maxRedirects) { response.destroy?.(); throw new Error(`sourceUrl exceeded the ${maxRedirects}-redirect limit.`); }
        const location = headerValue(response.headers, "location");
        response.destroy?.();
        activeResponse = undefined;
        if (!location) throw new Error("sourceUrl redirect did not include a location.");
        url = parsePublicHttpsUrl(new URL(location, url).href);
        continue;
      }
      if (response.status < 200 || response.status >= 300) { response.destroy?.(); throw new Error(`Could not download sourceUrl: HTTP ${response.status}.`); }
      const declaredLength = Number(headerValue(response.headers, "content-length") ?? "0");
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) { response.destroy?.(); throw new Error(`sourceUrl exceeds the ${maxBytes}-byte media limit.`); }
      const chunks = [];
      let receivedBytes = 0;
      try {
        for await (const chunk of response.body) {
          assertWithinDeadline();
          const bytes = Buffer.from(chunk);
          receivedBytes += bytes.byteLength;
          if (receivedBytes > maxBytes) { response.destroy?.(); throw new Error(`sourceUrl exceeds the ${maxBytes}-byte media limit.`); }
          chunks.push(bytes);
        }
      } catch (error) { response.destroy?.(); throw error; }
      activeResponse = undefined;
      assertWithinDeadline();
      if (receivedBytes === 0) throw new Error("sourceUrl returned an empty response.");
      return { bytes: Buffer.concat(chunks, receivedBytes), contentType: headerValue(response.headers, "content-type"), finalUrl: url };
    }
    throw new Error("sourceUrl could not be downloaded safely.");
  };

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      activeResponse?.destroy?.();
      reject(timeoutError());
    }, timeoutMs);
    operation().then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function requestPinnedHttps({ url, address, family, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, { method: "GET", headers: { accept: "image/*,audio/*,video/*" }, lookup: (_hostname, _options, callback) => callback(null, address, family) }, (response) => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: response, destroy: () => response.destroy() }));
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`sourceUrl timed out after ${timeoutMs}ms.`)));
    request.once("error", reject);
    request.end();
  });
}

function headerValue(headers, name) {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/** @param {string} address */
export function isPublicIpAddress(address) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  const c = parts[2];
  return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2) || (a === 192 && b === 88 && c === 99) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224);
}

function isPublicIpv6(address) {
  const normalized = address.toLowerCase();
  const groups = expandIpv6(normalized);
  if (!groups) return false;
  const first = groups[0];
  const second = groups[1];
  const isIpv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  return !(groups.every((group) => group === 0) || (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) || isIpv4Mapped || (first === 0x0064 && second === 0xff9b) || (first === 0x0100 && second === 0) || (first === 0x2001 && second <= 0x01ff) || (first === 0x2001 && second === 0x0db8) || first === 0x2002 || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00);
}

function expandIpv6(address) {
  const [leftRaw, rightRaw, extra] = address.split("::");
  if (extra !== undefined) return null;
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if (!address.includes("::") && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (address.includes("::") && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right].map((group) => Number.parseInt(group || "0", 16));
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
}
