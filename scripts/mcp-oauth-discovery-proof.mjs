#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const requiredScopes = ["openid", "profile", "email"];
const defaultEndpoint =
  process.env.MOVINGMANIFEST_MCP_ENDPOINT ??
  "https://movingmanifest.com/api/mcp";

function record(results, status, label, detail) {
  results.push({ status, label, detail });
}

function normalizeUrl(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

export function bearerChallengeParams(header) {
  if (!header?.toLowerCase().startsWith("bearer ")) return {};
  const params = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_-]*)=(?:"([^"]*)"|([^,\s]+))/g;
  let match;
  while ((match = pattern.exec(header))) {
    params[match[1]] = match[2] ?? match[3] ?? "";
  }
  return params;
}

export function oauthDiscoveryProofResults({
  endpointUrl,
  endpointStatus,
  challenge,
  resourceMetadata,
  authMetadata,
}) {
  const results = [];

  record(
    results,
    endpointStatus === 401 ? "pass" : "blocked",
    "MCP challenge",
    endpointStatus === 401
      ? "unauthenticated request returned 401"
      : `expected 401, got ${endpointStatus ?? "missing"}`
  );

  if (!challenge?.resource_metadata) {
    record(
      results,
      "blocked",
      "MCP challenge metadata URL",
      "WWW-Authenticate missing resource_metadata"
    );
    return results;
  }
  record(
    results,
    "pass",
    "MCP challenge metadata URL",
    challenge.resource_metadata
  );

  if (normalizeUrl(resourceMetadata?.resource) === normalizeUrl(endpointUrl)) {
    record(results, "pass", "Protected resource", endpointUrl);
  } else {
    record(
      results,
      "blocked",
      "Protected resource",
      `expected ${endpointUrl}, got ${resourceMetadata?.resource ?? "missing"}`
    );
  }

  const issuer = resourceMetadata?.authorization_servers?.[0];
  if (issuer) {
    record(results, "pass", "Authorization server", issuer);
  } else {
    record(results, "blocked", "Authorization server", "missing");
  }

  if (authMetadata?.registration_endpoint) {
    record(
      results,
      "pass",
      "Dynamic client registration",
      authMetadata.registration_endpoint
    );
  } else {
    record(
      results,
      "blocked",
      "Dynamic client registration",
      "registration_endpoint missing"
    );
  }

  if (authMetadata?.authorization_endpoint) {
    record(
      results,
      "pass",
      "Authorization endpoint",
      authMetadata.authorization_endpoint
    );
  } else {
    record(results, "blocked", "Authorization endpoint", "missing");
  }

  if (authMetadata?.token_endpoint) {
    record(results, "pass", "Token endpoint", authMetadata.token_endpoint);
  } else {
    record(results, "blocked", "Token endpoint", "missing");
  }

  const pkceMethods = authMetadata?.code_challenge_methods_supported ?? [];
  if (pkceMethods.includes("S256")) {
    record(results, "pass", "PKCE", "S256 supported");
  } else {
    record(results, "blocked", "PKCE", "S256 not advertised");
  }

  const tokenAuthMethods =
    authMetadata?.token_endpoint_auth_methods_supported ?? [];
  if (tokenAuthMethods.includes("none")) {
    record(results, "pass", "Token endpoint auth", "none supported");
  } else {
    record(
      results,
      "blocked",
      "Token endpoint auth",
      tokenAuthMethods.length
        ? `none missing; got ${tokenAuthMethods.join(", ")}`
        : "token_endpoint_auth_methods_supported missing"
    );
  }

  const scopes = resourceMetadata?.scopes_supported ?? [];
  const missingScopes = requiredScopes.filter((scope) => !scopes.includes(scope));
  if (missingScopes.length === 0) {
    record(results, "pass", "OAuth scopes", requiredScopes.join(" "));
  } else {
    record(
      results,
      "blocked",
      "OAuth scopes",
      `missing ${missingScopes.join(", ")}`
    );
  }

  return results;
}

async function fetchJson(fetchFn, url, label) {
  const response = await fetchFn(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  return await response.json();
}

async function fetchAuthorizationServerMetadata(fetchFn, issuer) {
  try {
    return await fetchJson(
      fetchFn,
      new URL("/.well-known/oauth-authorization-server", issuer).href,
      "OAuth authorization metadata"
    );
  } catch {
    return await fetchJson(
      fetchFn,
      new URL("/.well-known/openid-configuration", issuer).href,
      "OpenID metadata"
    );
  }
}

export async function runOauthDiscoveryProbe({
  endpointUrl = defaultEndpoint,
  fetchFn = fetch,
} = {}) {
  const response = await fetchFn(endpointUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const challenge = bearerChallengeParams(response.headers.get("www-authenticate"));
  let resourceMetadata = null;
  let authMetadata = null;

  if (challenge.resource_metadata) {
    resourceMetadata = await fetchJson(
      fetchFn,
      challenge.resource_metadata,
      "MCP protected resource metadata"
    );
    const issuer = resourceMetadata.authorization_servers?.[0];
    if (issuer) {
      authMetadata = await fetchAuthorizationServerMetadata(fetchFn, issuer);
    }
  }

  return {
    endpointUrl,
    endpointStatus: response.status,
    challenge,
    resourceMetadata,
    authMetadata,
    probe: {
      calledMethods: ["GET"],
      noMutation:
        "No OAuth registration, authorization, token exchange, MCP tool call, or move-data access was performed.",
    },
  };
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--endpoint") {
      parsed.endpoint = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--endpoint=")) {
      parsed.endpoint = arg.slice("--endpoint=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function usage() {
  console.log(`Usage:
  node scripts/mcp-oauth-discovery-proof.mjs
  node scripts/mcp-oauth-discovery-proof.mjs --endpoint https://movingmanifest.com/api/mcp

This proof is read-only. It uses HTTP GET discovery only and never performs OAuth
dynamic client registration, authorization, token exchange, authenticated MCP
tool calls, or move-data access.`);
}

function formatResult(result) {
  const label =
    result.status === "pass"
      ? "PASS"
      : result.status === "warn"
        ? "WARN"
        : result.status === "blocked"
          ? "BLOCKED"
          : "FAIL";
  return `${label} ${result.label}: ${result.detail}`;
}

export async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const proof = await runOauthDiscoveryProbe({
    endpointUrl: args.endpoint ?? defaultEndpoint,
  });
  const results = oauthDiscoveryProofResults(proof);
  const counts = results.reduce(
    (acc, result) => {
      acc[result.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, blocked: 0, fail: 0 }
  );

  for (const result of results) {
    console.log(formatResult(result));
  }

  console.log(
    `MCP OAuth discovery proof summary: ${counts.pass} pass, ${counts.warn} warn, ${counts.blocked} blocked, ${counts.fail} fail`
  );
  console.log(`No-mutation guarantee: ${proof.probe.noMutation}`);

  if (counts.blocked > 0 || counts.fail > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await runCli();
}
