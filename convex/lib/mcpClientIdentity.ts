/**
 * Who is connecting, and how we know.
 *
 * Two registration paths reach this resource, and they earn different amounts
 * of trust:
 *
 *  - **Client ID Metadata Document (preferred).** The OAuth `client_id` *is* an
 *    HTTPS URL. We fetch it, require the document to name itself, and bind its
 *    digest to the grant. The client's identity is then something we verified
 *    at a domain the client controls, not something a registration endpoint
 *    minted on request.
 *  - **Dynamic Client Registration (compatibility fallback).** An opaque
 *    provider-issued id. It is accepted so conforming clients that cannot yet
 *    publish a metadata document still work, and it is labelled as such
 *    everywhere a person can see it.
 *
 * A DCR client is not a trusted named product, and neither is a CIMD one. The
 * registration method is a fact we record, never a claim we make.
 *
 * Fail-closed rule: a `client_id` that *looks* like a metadata document but
 * does not validate is refused. It never silently degrades to the fallback —
 * that would let a bad document buy the compatibility path.
 */

export const CLIENT_REGISTRATION_METHODS = [
  "clientIdMetadataDocument",
  "dynamicClientRegistration",
] as const;

export type ClientRegistrationMethod =
  (typeof CLIENT_REGISTRATION_METHODS)[number];

export const CLIENT_REGISTRATION_LABELS: Record<
  ClientRegistrationMethod,
  string
> = {
  clientIdMetadataDocument: "Metadata document",
  dynamicClientRegistration: "Dynamic registration",
};

export type ResolvedClientIdentity = {
  clientId: string;
  registrationMethod: ClientRegistrationMethod;
  /** The client's self-declared name. A label for the person, never authority. */
  clientName?: string;
  clientUri?: string;
  /** SHA-256 of the metadata document, bound to the grant so a swap is visible. */
  metadataDigest?: string;
  redirectUris?: string[];
};

export class ClientIdentityError extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "ClientIdentityError";
  }
}

const MAX_METADATA_BYTES = 32 * 1024;
const METADATA_CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 64;

type CacheEntry = { value: ResolvedClientIdentity; expiresAt: number };
const metadataCache = new Map<string, CacheEntry>();

/** Exposed so tests can prove caching without waiting five minutes. */
export function clearClientMetadataCache() {
  metadataCache.clear();
}

/**
 * Is this `client_id` claiming to be a metadata document?
 *
 * Only an absolute HTTPS URL qualifies. Anything else — including an
 * `http://` URL — is treated as an opaque registered id, so a plaintext
 * document can never become an identity.
 */
export function looksLikeClientIdMetadataDocument(clientId: string): boolean {
  if (!/^https:\/\//i.test(clientId)) return false;
  try {
    const url = new URL(clientId);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function normalizeClientIdUrl(clientId: string): URL {
  const url = new URL(clientId);
  if (url.protocol !== "https:") {
    throw new ClientIdentityError(
      "insecure_client_id",
      "A Client ID Metadata Document must be served over HTTPS.",
    );
  }
  if (url.username || url.password) {
    throw new ClientIdentityError(
      "credentials_in_client_id",
      "A Client ID Metadata Document URL must not carry credentials.",
    );
  }
  if (url.hash) {
    throw new ClientIdentityError(
      "fragment_in_client_id",
      "A Client ID Metadata Document URL must not carry a fragment.",
    );
  }
  return url;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.filter((entry): entry is string => typeof entry === "string");
  return rows.length ? rows.slice(0, 20) : undefined;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validate a fetched metadata document against the `client_id` that claimed it.
 *
 * The load-bearing check is `client_id === the URL we fetched`. Without it, any
 * document anywhere could be pointed at by any client id, and the URL would
 * stop meaning anything.
 */
export async function validateClientMetadataDocument(
  clientId: string,
  raw: string,
): Promise<ResolvedClientIdentity> {
  const url = normalizeClientIdUrl(clientId);
  if (raw.length > MAX_METADATA_BYTES) {
    throw new ClientIdentityError(
      "metadata_too_large",
      "That Client ID Metadata Document is too large to validate.",
    );
  }
  let document: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    document = parsed as Record<string, unknown>;
  } catch {
    throw new ClientIdentityError(
      "metadata_not_json",
      "That Client ID Metadata Document is not a JSON object.",
    );
  }

  const declaredId = document.client_id;
  if (typeof declaredId !== "string" || declaredId !== url.toString()) {
    throw new ClientIdentityError(
      "client_id_mismatch",
      "That Client ID Metadata Document does not name its own URL as client_id.",
    );
  }

  const redirectUris = asStringArray(document.redirect_uris);
  if (!redirectUris) {
    throw new ClientIdentityError(
      "missing_redirect_uris",
      "That Client ID Metadata Document declares no redirect_uris.",
    );
  }
  for (const redirect of redirectUris) {
    let candidate: URL;
    try {
      candidate = new URL(redirect);
    } catch {
      throw new ClientIdentityError(
        "invalid_redirect_uri",
        "That Client ID Metadata Document declares an unusable redirect URI.",
      );
    }
    const isLoopback =
      candidate.hostname === "localhost" ||
      candidate.hostname === "127.0.0.1" ||
      candidate.hostname === "[::1]";
    const isPrivateScheme = !["http:", "https:"].includes(candidate.protocol);
    // Loopback and a client's own private scheme are how desktop clients
    // legitimately receive a callback; anything else on the open web must be
    // HTTPS or the redirect is a downgrade waiting to happen.
    if (candidate.protocol === "http:" && !isLoopback) {
      throw new ClientIdentityError(
        "insecure_redirect_uri",
        "That Client ID Metadata Document declares a plaintext redirect URI.",
      );
    }
    if (isPrivateScheme && candidate.protocol.includes(" ")) {
      throw new ClientIdentityError(
        "invalid_redirect_uri",
        "That Client ID Metadata Document declares an unusable redirect URI.",
      );
    }
  }

  const clientName =
    typeof document.client_name === "string"
      ? document.client_name.slice(0, 160)
      : undefined;
  const clientUri =
    typeof document.client_uri === "string"
      ? document.client_uri.slice(0, 500)
      : undefined;

  return {
    clientId: url.toString(),
    registrationMethod: "clientIdMetadataDocument",
    clientName,
    clientUri,
    metadataDigest: await sha256Hex(raw),
    redirectUris,
  };
}

export type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

/**
 * Resolve the calling client's identity.
 *
 * Metadata-document first, dynamic registration as the labelled fallback. This
 * never throws for a DCR client — an opaque id is a legitimate compatibility
 * case. It throws only when a document was claimed and could not be trusted.
 */
export async function resolveClientIdentity(
  clientId: string,
  options: { fetchImpl?: FetchLike; now?: number; declaredClientName?: string } = {},
): Promise<ResolvedClientIdentity> {
  const declaredClientName = options.declaredClientName?.slice(0, 160);
  if (!looksLikeClientIdMetadataDocument(clientId)) {
    return {
      clientId,
      registrationMethod: "dynamicClientRegistration",
      clientName: declaredClientName,
    };
  }

  const now = options.now ?? Date.now();
  const cached = metadataCache.get(clientId);
  if (cached && cached.expiresAt > now) {
    return { ...cached.value, clientName: cached.value.clientName ?? declaredClientName };
  }

  const doFetch: FetchLike =
    options.fetchImpl ?? ((input, init) => fetch(input, init) as never);

  let raw: string;
  try {
    const response = await doFetch(clientId, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new ClientIdentityError(
        "metadata_unavailable",
        `That Client ID Metadata Document returned HTTP ${response.status}.`,
      );
    }
    raw = await response.text();
  } catch (error) {
    if (error instanceof ClientIdentityError) throw error;
    throw new ClientIdentityError(
      "metadata_unreachable",
      "That Client ID Metadata Document could not be retrieved.",
    );
  }

  const resolved = await validateClientMetadataDocument(clientId, raw);
  if (metadataCache.size >= MAX_CACHE_ENTRIES) metadataCache.clear();
  metadataCache.set(clientId, {
    value: resolved,
    expiresAt: now + METADATA_CACHE_TTL_MS,
  });
  return { ...resolved, clientName: resolved.clientName ?? declaredClientName };
}
