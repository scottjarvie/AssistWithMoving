#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolveCname } from "node:dns/promises";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const defaultEndpoint =
  process.env.MOVINGMANIFEST_MCP_ENDPOINT ?? "https://movingmanifest.com/api/mcp";
const defaultIssuer =
  process.env.MOVINGMANIFEST_EXPECTED_CLERK_ISSUER ??
  "https://clerk.movingmanifest.com";

const options = parseArgs(process.argv.slice(2));
const strict = Boolean(options.strict);
const endpoint = new URL(options.endpoint ?? defaultEndpoint);
const expectedIssuer = normalizeOrigin(options.issuer ?? defaultIssuer);
const authorizedSmokeProofPath =
  options.authorizedSmokeProof ??
  process.env.MOVINGMANIFEST_AUTHORIZED_OAUTH_SMOKE_PROOF ??
  "test-results/mcp-oauth-smoke-proof.json";
const authorizedSmokeProofMaxAgeMs = Number.parseInt(
  process.env.MOVINGMANIFEST_AUTHORIZED_OAUTH_SMOKE_PROOF_MAX_AGE_MS ??
    String(24 * 60 * 60 * 1000),
  10
);
const cliTimeoutMs = Number.parseInt(
  process.env.OAUTH_CUTOVER_CLI_TIMEOUT_MS ?? "60000",
  10
);
const results = [];

const clerkDnsRecords = {
  "clerk.movingmanifest.com": "frontend-api.clerk.services",
  "accounts.movingmanifest.com": "accounts.clerk.services",
  "clkmail.movingmanifest.com": "mail.ubgc5ns6j8q2.clerk.services",
  "clk._domainkey.movingmanifest.com": "dkim1.ubgc5ns6j8q2.clerk.services",
  "clk2._domainkey.movingmanifest.com": "dkim2.ubgc5ns6j8q2.clerk.services",
};

const vercelClerkKeys = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_JWT_ISSUER_DOMAIN",
  "CLERK_FRONTEND_API_URL",
];

const convexClerkKeys = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_JWT_ISSUER_DOMAIN",
  "CLERK_WEBHOOK_SIGNING_SECRET",
];
const oauthToolsetEnvKey = "MOVINGMANIFEST_MCP_OAUTH_TOOLSET";

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--strict") {
      parsed.strict = true;
      continue;
    }
    if (arg === "--skip-remote-env") {
      parsed.skipRemoteEnv = true;
      continue;
    }
    if (arg === "--skip-authorized-smoke-proof") {
      parsed.skipAuthorizedSmokeProof = true;
      continue;
    }
    if (arg === "--authorized-smoke-proof") {
      parsed.authorizedSmokeProof = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--authorized-smoke-proof=")) {
      parsed.authorizedSmokeProof = arg.slice("--authorized-smoke-proof=".length);
      continue;
    }
    if (arg === "--endpoint") {
      parsed.endpoint = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--endpoint=")) {
      parsed.endpoint = arg.slice("--endpoint=".length);
      continue;
    }
    if (arg === "--issuer") {
      parsed.issuer = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--issuer=")) {
      parsed.issuer = arg.slice("--issuer=".length);
      continue;
    }
    if (arg === "--vercel-scope") {
      parsed.vercelScope = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--vercel-scope=")) {
      parsed.vercelScope = arg.slice("--vercel-scope=".length);
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
  node scripts/oauth-cutover-readiness.mjs
  node scripts/oauth-cutover-readiness.mjs --strict

Options:
  --endpoint <url>        MCP endpoint to inspect. Defaults to ${defaultEndpoint}.
  --issuer <url>          Expected production Clerk issuer. Defaults to ${defaultIssuer}.
  --skip-remote-env       Skip Vercel/Convex secret-value classification.
  --authorized-smoke-proof <path>
                          Read an authorized browser OAuth smoke proof JSON file.
                          Defaults to ${authorizedSmokeProofPath}.
  --skip-authorized-smoke-proof
                          Inspect discovery/env only; do not require browser OAuth proof.
  --vercel-scope <scope>  Optional Vercel team/user scope for env pull.

This doctor classifies Clerk key modes without printing secret values.`);
}

function record(status, label, detail) {
  results.push({ status, label, detail });
}

function normalizeOrigin(value) {
  return value.trim().replace(/\/+$/, "");
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function intendedConnectionEmailCheckLabel(proof) {
  const expected = normalizeEmail(proof?.expectedConnectionEmail);
  const actual = normalizeEmail(proof?.connectionEmail);
  if (expected && actual && actual !== expected) {
    return `intended connection email (expected ${expected}, got ${actual})`;
  }
  if (expected && !actual) {
    return `intended connection email (expected ${expected}, actual missing)`;
  }
  if (actual) {
    return `intended connection email (got ${actual}, not verified against --expected-email)`;
  }
  return "intended connection email";
}

function normalizeCname(value) {
  return value.trim().replace(/\.$/, "").toLowerCase();
}

function sanitizeCliError(value) {
  return value
    .replace(/[A-Z][A-Z0-9_]+=([^\s]+)/g, (match) =>
      match.replace(/=.*/, "={redacted}")
    )
    .replace(/(sk|pk|whsec|svix|key|secret)_[A-Za-z0-9_./+-]+/gi, "{redacted-secret}")
    .trim();
}

export function runCommand(
  command,
  args,
  { timeoutMs = Number.isFinite(cliTimeoutMs) ? cliTimeoutMs : 60000 } = {}
) {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, {
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle({
        code: 1,
        stdout,
        stderr: `command timed out after ${timeoutMs}ms`,
        timedOut: true,
      });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      settle({ code, stdout, stderr, timedOut: false });
    });
    child.on("error", (error) => {
      settle({ code: 1, stdout, stderr: error.message, timedOut: false });
    });
  });
}

export function parseEnvAssignments(output) {
  const assignments = new Map();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z][A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    assignments.set(match[1], unquoteEnvValue(match[2]));
  }
  return assignments;
}

export function vercelSensitiveKeysFromJson(output) {
  const parsed = JSON.parse(output);
  const envs = Array.isArray(parsed)
    ? parsed
    : parsed.envs ?? parsed.environmentVariables ?? [];
  return new Set(
    envs
      .filter(
        (entry) =>
          ["encrypted", "secret", "sensitive"].includes(entry.type) ||
          entry.sensitive === true ||
          entry.encrypted === true
      )
      .map((entry) => entry.key ?? entry.name)
      .filter(Boolean)
  );
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function classifyClerkValue(key, value, issuer = expectedIssuer) {
  if (value == null) return "missing";
  const trimmed = value.trim();
  if (!trimmed) return "blank";
  if (trimmed.startsWith("pk_live_") || trimmed.startsWith("sk_live_")) {
    return "live";
  }
  if (trimmed.startsWith("pk_test_") || trimmed.startsWith("sk_test_")) {
    return "test";
  }
  if (trimmed.startsWith("whsec_") || trimmed.startsWith("svix_")) {
    return "present";
  }
  if (trimmed.includes(".clerk.accounts.dev")) return "dev-origin";
  if (normalizeOrigin(trimmed) === normalizeOrigin(issuer)) {
    return "production-origin";
  }
  if (key.includes("CLERK") && trimmed.includes("movingmanifest.com")) {
    return "movingmanifest-domain";
  }
  return "present";
}

export function clerkEnvModeResults({
  source,
  assignments,
  keys,
  issuer = expectedIssuer,
  unreadableKeys = new Set(),
}) {
  const nextResults = [];
  for (const key of keys) {
    const mode = classifyClerkValue(key, assignments.get(key), issuer);
    if (
      unreadableKeys.has(key) &&
      ["missing", "blank"].includes(mode)
    ) {
      nextResults.push({
        status: "warn",
        label: `${source} ${key}`,
        detail:
          "mode=sensitive-unreadable; Vercel CLI cannot reveal this value, verify through live OAuth discovery; tracked by MOVE-63",
      });
      continue;
    }
    if (["live", "production-origin", "present"].includes(mode)) {
      nextResults.push({
        status: "pass",
        label: `${source} ${key}`,
        detail: `mode=${mode}`,
      });
      continue;
    }
    nextResults.push({
      status: "blocked",
      label: `${source} ${key}`,
      detail: `mode=${mode}; set production Clerk value; tracked by MOVE-63`,
    });
  }
  return nextResults;
}

export function oauthToolsetResults({ source, value, strictMode }) {
  const mode = value?.trim() ?? "";
  if (mode === "trusted-helper") {
    return [
      {
        status: "pass",
        label: `${source} ${oauthToolsetEnvKey}`,
        detail: "trusted-helper OAuth toolset enabled",
      },
    ];
  }

  const detail = mode
    ? `mode=${mode}; set trusted-helper before hosted OAuth publish; tracked by MOVE-240`
    : "not set; set trusted-helper before hosted OAuth publish; tracked by MOVE-240";
  return [
    {
      status: strictMode ? "blocked" : "warn",
      label: `${source} ${oauthToolsetEnvKey}`,
      detail,
    },
  ];
}

export function oauthMetadataResults({
  endpointUrl,
  expectedIssuerUrl,
  resourceMetadata,
  authMetadata,
}) {
  const nextResults = [];
  const resource = resourceMetadata?.resource;
  if (resource === endpointUrl) {
    nextResults.push({
      status: "pass",
      label: "MCP protected resource",
      detail: endpointUrl,
    });
  } else {
    nextResults.push({
      status: "blocked",
      label: "MCP protected resource",
      detail: `expected ${endpointUrl}, got ${resource ?? "missing"}`,
    });
  }

  const issuer = resourceMetadata?.authorization_servers?.[0];
  if (!issuer) {
    nextResults.push({
      status: "blocked",
      label: "MCP authorization server",
      detail: "missing authorization server; tracked by MOVE-63",
    });
  } else if (issuer.includes(".clerk.accounts.dev")) {
    nextResults.push({
      status: "blocked",
      label: "MCP authorization server",
      detail: "live endpoint still advertises Clerk development issuer; tracked by MOVE-63",
    });
  } else if (normalizeOrigin(issuer) !== normalizeOrigin(expectedIssuerUrl)) {
    nextResults.push({
      status: "blocked",
      label: "MCP authorization server",
      detail: `expected ${expectedIssuerUrl}, got ${issuer}; tracked by MOVE-63`,
    });
  } else {
    nextResults.push({
      status: "pass",
      label: "MCP authorization server",
      detail: issuer,
    });
  }

  if (authMetadata?.registration_endpoint) {
    nextResults.push({
      status: "pass",
      label: "Dynamic client registration",
      detail: "registration_endpoint advertised",
    });
  } else {
    nextResults.push({
      status: "blocked",
      label: "Dynamic client registration",
      detail: "registration_endpoint missing; enable DCR in Clerk production",
    });
  }

  if (authMetadata?.authorization_endpoint) {
    nextResults.push({
      status: "pass",
      label: "Authorization endpoint",
      detail: "authorization_endpoint advertised",
    });
  } else {
    nextResults.push({
      status: "blocked",
      label: "Authorization endpoint",
      detail: "authorization_endpoint missing from Clerk metadata",
    });
  }

  if (authMetadata?.token_endpoint) {
    nextResults.push({
      status: "pass",
      label: "Token endpoint",
      detail: "token_endpoint advertised",
    });
  } else {
    nextResults.push({
      status: "blocked",
      label: "Token endpoint",
      detail: "token_endpoint missing from Clerk metadata",
    });
  }

  if (authMetadata?.code_challenge_methods_supported?.includes("S256")) {
    nextResults.push({
      status: "pass",
      label: "PKCE",
      detail: "S256 supported",
    });
  } else {
    nextResults.push({
      status: "blocked",
      label: "PKCE",
      detail: "S256 not advertised by authorization server",
    });
  }

  const tokenEndpointAuthMethods =
    authMetadata?.token_endpoint_auth_methods_supported ?? [];
  if (tokenEndpointAuthMethods.includes("none")) {
    nextResults.push({
      status: "pass",
      label: "Token endpoint auth",
      detail: "none supported for public PKCE clients",
    });
  } else if (tokenEndpointAuthMethods.length) {
    nextResults.push({
      status: "warn",
      label: "Token endpoint auth",
      detail: `none not advertised; got ${tokenEndpointAuthMethods.join(", ")}`,
    });
  } else {
    nextResults.push({
      status: "warn",
      label: "Token endpoint auth",
      detail:
        "token_endpoint_auth_methods_supported missing; verify with OAuth smoke",
    });
  }

  const bearerMethods = resourceMetadata?.bearer_methods_supported ?? [];
  if (bearerMethods.includes("header")) {
    nextResults.push({
      status: "pass",
      label: "Bearer token transport",
      detail: "header supported",
    });
  } else {
    nextResults.push({
      status: "blocked",
      label: "Bearer token transport",
      detail: "bearer_methods_supported must include header",
    });
  }

  const signingAlgorithms =
    resourceMetadata?.resource_signing_alg_values_supported ?? [];
  if (signingAlgorithms.includes("RS256")) {
    nextResults.push({
      status: "pass",
      label: "Resource signing algorithm",
      detail: "RS256 supported",
    });
  } else {
    nextResults.push({
      status: "blocked",
      label: "Resource signing algorithm",
      detail: "resource_signing_alg_values_supported must include RS256",
    });
  }

  nextResults.push({
    status: "warn",
    label: "OAuth access token JWT mode",
    detail:
      "metadata cannot prove token shape; verify JWT access tokens with the authorized OAuth smoke after production cutover",
  });

  const scopes = resourceMetadata?.scopes_supported ?? [];
  const missingScopes = ["openid", "profile", "email"].filter(
    (scope) => !scopes.includes(scope)
  );
  if (missingScopes.length) {
    nextResults.push({
      status: "blocked",
      label: "OAuth scopes",
      detail: `missing ${missingScopes.join(", ")}`,
    });
  } else {
    nextResults.push({
      status: "pass",
      label: "OAuth scopes",
      detail: scopes.join(" "),
    });
  }

  return nextResults;
}

export function restApiRuntimeResults({ status, bodyText = "" }) {
  if (status === 401 || status === 403) {
    if (
      /Use a Bearer API key\./i.test(bodyText) &&
      !/OAuth access token/i.test(bodyText)
    ) {
      return [
        {
          status: "blocked",
          label: "REST API runtime",
          detail:
            "GET /api/v1/me is still returning the old API-key-only auth message; deploy the current Convex REST OAuth backend before asking users to reconnect Claude again.",
        },
      ];
    }

    if (/OAuth access token/i.test(bodyText)) {
      return [
        {
          status: "pass",
          label: "REST API runtime",
          detail: `protected endpoint rejected unauthenticated request with HTTP ${status} and advertises OAuth access-token support`,
        },
      ];
    }

    return [
      {
        status: "pass",
        label: "REST API runtime",
        detail: `protected endpoint rejected unauthenticated request with HTTP ${status}`,
      },
    ];
  }

  if (status >= 500) {
    return [
      {
        status: "blocked",
        label: "REST API runtime",
        detail: `GET /api/v1/me returned HTTP ${status}; production Convex may be disabled; tracked by MOVE-217`,
      },
    ];
  }

  return [
    {
      status: "warn",
      label: "REST API runtime",
      detail: `expected protected endpoint to return 401/403 before OAuth smoke, got HTTP ${status}`,
    },
  ];
}

export function authorizedOAuthSmokeProofResults({
  strictMode,
  skipped,
  proof,
}) {
  if (skipped) {
    return [
      {
        status: "warn",
        label: "Authorized OAuth browser smoke",
        detail:
          "skipped by --skip-authorized-smoke-proof; metadata can pass while production sign-in is still broken",
      },
    ];
  }

  if (proof?.status) {
    return [
      {
        status: proof.status === "pass" ? "pass" : strictMode ? "blocked" : "warn",
        label: "Authorized OAuth browser smoke",
        detail: proof.detail,
      },
    ];
  }

  return [
    {
        status: strictMode ? "blocked" : "warn",
        label: "Authorized OAuth browser smoke",
        detail:
        "not yet proven; run scripts/mcp-oauth-smoke.mjs --authorize --open-browser --box-intake-smoke --write-smoke --expect-trusted-helper-toolset --expected-email scott@thejarvie.com --endpoint https://movingmanifest.com/api/mcp, keep the terminal open, then sign in as scott@thejarvie.com; tracked by MOVE-238 under MOVE-215, with setup history in MOVE-63",
    },
  ];
}

export function validateAuthorizedOAuthSmokeProof({
  proof,
  endpointUrl,
  now = Date.now(),
  maxAgeMs = 24 * 60 * 60 * 1000,
}) {
  if (proof?.schema !== "movingmanifest.mcp-oauth-smoke-proof.v1") {
    return {
      status: "missing",
      detail:
        "proof file missing or not a MovingManifest authorized OAuth smoke proof",
    };
  }
  if (proof.authorized !== true) {
    return {
      status: "invalid",
      detail: "proof was not produced by an authorized OAuth smoke",
    };
  }
  if (proof.endpoint !== endpointUrl) {
    return {
      status: "invalid",
      detail: `proof endpoint ${proof.endpoint ?? "missing"} does not match ${endpointUrl}`,
    };
  }
  const createdAtMs = Date.parse(proof.createdAt ?? "");
  if (!Number.isFinite(createdAtMs)) {
    return {
      status: "invalid",
      detail: "proof createdAt is missing or invalid",
    };
  }
  const checks = proof.checks ?? {};
  const missingChecks = [
    ["tokenExchange", "token exchange"],
    ["mcpConnected", "MCP connection"],
    ["toolsListed", "tools/list"],
    ["contextChecked", "get_api_context"],
    ["connectionEmailVerified", intendedConnectionEmailCheckLabel(proof)],
    ["trustedHelperToolsetVerified", "trusted-helper OAuth toolset"],
    ["writeSmoke", "MCP write smoke"],
  ]
    .filter(([key]) => checks[key] !== true)
    .map(([, label]) => label);
  if (now - createdAtMs > maxAgeMs) {
    const missingDetail = missingChecks.length
      ? ` and missing required check(s): ${missingChecks.join(", ")}`
      : "";
    return {
      status: "stale",
      detail: `proof is older than ${Math.round(
        maxAgeMs / 60000
      )} minutes${missingDetail}`,
    };
  }
  if (missingChecks.length) {
    return {
      status: "invalid",
      detail: `proof missing required check(s): ${missingChecks.join(", ")}`,
    };
  }
  return {
    status: "pass",
    detail: `proof ${proof.createdAt} for ${endpointUrl}`,
  };
}

async function readAuthorizedOAuthSmokeProof() {
  try {
    const text = await readFile(authorizedSmokeProofPath, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  return await response.json();
}

function bearerChallengeParams(header) {
  if (!header?.toLowerCase().startsWith("bearer ")) return {};
  const params = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_-]*)=(?:"([^"]*)"|([^,\s]+))/g;
  let match;
  while ((match = pattern.exec(header))) {
    params[match[1]] = match[2] ?? match[3] ?? "";
  }
  return params;
}

async function checkDnsRecords() {
  for (const [host, expected] of Object.entries(clerkDnsRecords)) {
    try {
      const records = (await resolveCname(host)).map(normalizeCname);
      if (records.includes(expected)) {
        record("pass", `DNS ${host}`, `CNAME ${expected}`);
      } else {
        record(
          "blocked",
          `DNS ${host}`,
          `expected CNAME ${expected}; got ${records.join(", ") || "none"}`
        );
      }
    } catch (error) {
      record(
        "blocked",
        `DNS ${host}`,
        `${error instanceof Error ? error.message : String(error)}; tracked by MOVE-63`
      );
    }
  }
}

async function checkExpectedIssuerMetadata() {
  try {
    const metadata = await fetchJson(
      new URL("/.well-known/openid-configuration", expectedIssuer).href,
      "expected Clerk issuer metadata"
    );
    const issuer = normalizeOrigin(metadata.issuer ?? "");
    if (issuer && issuer !== expectedIssuer) {
      record(
        "blocked",
        "Clerk production issuer metadata",
        `expected issuer ${expectedIssuer}, got ${metadata.issuer}; tracked by MOVE-63`
      );
      return;
    }
    record("pass", "Clerk production issuer metadata", expectedIssuer);
  } catch (error) {
    record(
      "blocked",
      "Clerk production issuer metadata",
      `${error instanceof Error ? error.message : String(error)}; verify/activate Clerk production domain; tracked by MOVE-63`
    );
  }
}

async function checkRestApiRuntime() {
  const restApiContextUrl = new URL("/api/v1/me", endpoint).href;
  try {
    const response = await fetch(restApiContextUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const bodyText = await response.text();
    results.push(
      ...restApiRuntimeResults({ status: response.status, bodyText })
    );
  } catch (error) {
    record(
      "fail",
      "REST API runtime",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function checkMcpDiscovery() {
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 401) {
      record(
        "blocked",
        "MCP OAuth challenge",
        `expected HTTP 401 challenge, got HTTP ${response.status}`
      );
      return;
    }
    record("pass", "MCP OAuth challenge", "unauthenticated request returns 401");

    const challenge = bearerChallengeParams(response.headers.get("www-authenticate"));
    if (!challenge.resource_metadata) {
      record(
        "blocked",
        "MCP OAuth challenge metadata",
        "WWW-Authenticate missing resource_metadata"
      );
      return;
    }
    record("pass", "MCP OAuth challenge metadata", challenge.resource_metadata);

    const resourceMetadata = await fetchJson(
      challenge.resource_metadata,
      "MCP protected resource metadata"
    );
    const issuer = resourceMetadata.authorization_servers?.[0];
    let authMetadata = {};
    if (issuer) {
      try {
        authMetadata = await fetchJson(
          new URL("/.well-known/oauth-authorization-server", issuer).href,
          "OAuth authorization metadata"
        );
      } catch {
        authMetadata = await fetchJson(
          new URL("/.well-known/openid-configuration", issuer).href,
          "OpenID metadata"
        );
      }
    }
    results.push(
      ...oauthMetadataResults({
        endpointUrl: endpoint.href,
        expectedIssuerUrl: expectedIssuer,
        resourceMetadata,
        authMetadata,
      })
    );
  } catch (error) {
    record(
      "fail",
      "MCP OAuth discovery",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function readVercelProductionEnv() {
  const tempDir = await mkdtemp(join(tmpdir(), "mm-oauth-cutover-"));
  const envPath = join(tempDir, ".env.production");
  try {
    const listArgs = ["vercel", "env", "ls", "production", "--format", "json"];
    if (options.vercelScope) {
      listArgs.push("--scope", options.vercelScope);
    }
    const listResponse = await runCommand("npx", listArgs);
    let sensitiveKeys = new Set();
    if (listResponse.code === 0) {
      try {
        sensitiveKeys = vercelSensitiveKeysFromJson(listResponse.stdout);
      } catch (error) {
        record(
          "warn",
          "Vercel env sensitivity metadata",
          `could not parse sensitivity metadata: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else {
      record(
        "warn",
        "Vercel env sensitivity metadata",
        sanitizeCliError(listResponse.stderr || listResponse.stdout) ||
          `vercel env ls exited ${listResponse.code}`
      );
    }

    const args = [
      "vercel",
      "env",
      "pull",
      envPath,
      "--yes",
      "--environment=production",
    ];
    if (options.vercelScope) {
      args.push("--scope", options.vercelScope);
    }
    const response = await runCommand("npx", args);
    if (response.code !== 0) {
      record(
        "blocked",
        "Vercel production env values",
        sanitizeCliError(response.stderr || response.stdout) ||
          `vercel env pull exited ${response.code}`
      );
      return;
    }
    const assignments = parseEnvAssignments(await readFile(envPath, "utf8"));
    results.push(
      ...clerkEnvModeResults({
        source: "Vercel production",
        assignments,
        keys: vercelClerkKeys,
        issuer: expectedIssuer,
        unreadableKeys: sensitiveKeys,
      })
    );
    results.push(
      ...oauthToolsetResults({
        source: "Vercel production",
        value: assignments.get(oauthToolsetEnvKey),
        strictMode: strict,
      })
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function readConvexProductionEnv() {
  const assignments = new Map();
  for (const key of convexClerkKeys) {
    const response = await runCommand("npx", [
      "convex",
      "env",
      "get",
      key,
      "--prod",
    ]);
    if (response.code === 0) {
      assignments.set(key, response.stdout.trim());
      continue;
    }
    assignments.set(key, "");
  }
  results.push(
    ...clerkEnvModeResults({
      source: "Convex production",
      assignments,
      keys: convexClerkKeys,
      issuer: expectedIssuer,
    })
  );
}

async function main() {
  if (options.help) {
    usage();
    return;
  }

  await checkDnsRecords();
  await checkExpectedIssuerMetadata();
  await checkRestApiRuntime();
  await checkMcpDiscovery();
  const authorizedSmokeProof = options.skipAuthorizedSmokeProof
    ? null
    : validateAuthorizedOAuthSmokeProof({
        proof: await readAuthorizedOAuthSmokeProof(),
        endpointUrl: endpoint.href,
        maxAgeMs: Number.isFinite(authorizedSmokeProofMaxAgeMs)
          ? authorizedSmokeProofMaxAgeMs
          : 24 * 60 * 60 * 1000,
      });
  results.push(
    ...authorizedOAuthSmokeProofResults({
      strictMode: strict,
      skipped: Boolean(options.skipAuthorizedSmokeProof),
      proof: authorizedSmokeProof,
    })
  );

  if (options.skipRemoteEnv) {
    record(
      "warn",
      "remote Clerk env values",
      "skipped by --skip-remote-env"
    );
    record(
      strict ? "blocked" : "warn",
      `Vercel production ${oauthToolsetEnvKey}`,
      "skipped by --skip-remote-env; strict publish gating must verify trusted-helper before hosted OAuth launch"
    );
  } else {
    await readVercelProductionEnv();
    await readConvexProductionEnv();
  }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  await main();

  const counts = results.reduce(
    (acc, result) => {
      acc[result.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, blocked: 0, fail: 0 }
  );

  for (const result of results) {
    const label =
      result.status === "pass"
        ? "PASS"
        : result.status === "warn"
          ? "WARN"
          : result.status === "blocked"
            ? "BLOCKED"
            : "FAIL";
    console.log(`${label} ${result.label}: ${result.detail}`);
  }

  console.log(
    `OAuth cutover readiness summary: ${counts.pass} pass, ${counts.warn} warn, ${counts.blocked} blocked, ${counts.fail} fail`
  );
  console.log(
    strict
      ? "Strict mode: failures and blockers exit nonzero."
      : "Default mode: only script/network failures exit nonzero. Use --strict for launch gating."
  );

  if (counts.fail > 0 || (strict && counts.blocked > 0)) {
    process.exitCode = 1;
  }
}
