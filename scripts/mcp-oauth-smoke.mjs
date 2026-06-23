#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS } from "../mcp-server/movingmanifest-mcp.mjs";

const defaultEndpoint =
  process.env.MOVINGMANIFEST_MCP_ENDPOINT ??
  `${(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3827").replace(
    /\/+$/,
    ""
  )}/api/mcp`;

const options = parseArgs(process.argv.slice(2));
const endpoint = new URL(options.endpoint ?? defaultEndpoint);
const mode = options.mode ?? "discover";
const callbackPort = Number(options.callbackPort ?? "8091");
const callbackUrl = `http://localhost:${callbackPort}/callback`;
const proofPath =
  options.proofPath ??
  process.env.MOVINGMANIFEST_AUTHORIZED_OAUTH_SMOKE_PROOF ??
  "test-results/mcp-oauth-smoke-proof.json";
const expectedConnectionEmail =
  options.expectedEmail ??
  process.env.MOVINGMANIFEST_EXPECTED_CONNECTION_EMAIL ??
  "";
const authorizeTimeoutMs = parsePositiveInteger(
  options.authorizeTimeoutMs ??
    process.env.MCP_OAUTH_SMOKE_AUTHORIZE_TIMEOUT_MS ??
    "300000",
  300000
);
const httpTimeoutMs = Number.parseInt(
  process.env.MCP_OAUTH_SMOKE_HTTP_TIMEOUT_MS ?? "15000",
  10
);

function log(line) {
  console.log(line);
}

function pass(label, detail) {
  log(`PASS ${label}${detail ? `: ${detail}` : ""}`);
}

function warn(label, detail) {
  log(`WARN ${label}${detail ? `: ${detail}` : ""}`);
}

function fail(label, detail) {
  log(`FAIL ${label}${detail ? `: ${detail}` : ""}`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--authorize") {
      parsed.mode = "authorize";
      continue;
    }
    if (arg === "--discover") {
      parsed.mode = "discover";
      continue;
    }
    if (arg.startsWith("--mode=")) {
      parsed.mode = arg.slice("--mode=".length);
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
    if (arg === "--callback-port") {
      parsed.callbackPort = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--callback-port=")) {
      parsed.callbackPort = arg.slice("--callback-port=".length);
      continue;
    }
    if (arg === "--proof-path") {
      parsed.proofPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--proof-path=")) {
      parsed.proofPath = arg.slice("--proof-path=".length);
      continue;
    }
    if (arg === "--expected-email") {
      parsed.expectedEmail = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--expected-email=")) {
      parsed.expectedEmail = arg.slice("--expected-email=".length);
      continue;
    }
    if (arg === "--authorize-timeout-ms") {
      parsed.authorizeTimeoutMs = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--authorize-timeout-ms=")) {
      parsed.authorizeTimeoutMs = arg.slice("--authorize-timeout-ms=".length);
      continue;
    }
    if (arg === "--no-context") {
      parsed.noContext = true;
      continue;
    }
    if (arg === "--box-intake-smoke") {
      parsed.boxIntakeSmoke = true;
      continue;
    }
    if (arg === "--write-smoke") {
      parsed.writeSmoke = true;
      continue;
    }
    if (arg === "--expect-trusted-helper-toolset") {
      parsed.expectTrustedHelperToolset = true;
      continue;
    }
    if (arg === "--revoke-smoke") {
      parsed.revokeSmoke = true;
      continue;
    }
    if (arg === "--auto-sign-in") {
      parsed.autoSignIn = true;
      continue;
    }
    if (arg === "--open-browser") {
      parsed.openBrowser = true;
      continue;
    }
    if (arg === "--headed") {
      parsed.headed = true;
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
  log(`Usage:
  node --env-file=.env.local scripts/mcp-oauth-smoke.mjs --discover
  node --env-file=.env.local scripts/mcp-oauth-smoke.mjs --authorize
  node --env-file=.env.local scripts/mcp-oauth-smoke.mjs --authorize --open-browser --box-intake-smoke --write-smoke --expect-trusted-helper-toolset --expected-email scott@thejarvie.com --endpoint https://movingmanifest.com/api/mcp
  node --env-file=.env.local scripts/mcp-oauth-smoke.mjs --authorize --revoke-smoke

Options:
  --endpoint <url>        MCP endpoint. Defaults to MOVINGMANIFEST_MCP_ENDPOINT or NEXT_PUBLIC_APP_URL/api/mcp.
  --callback-port <port>  Local OAuth redirect callback port. Defaults to 8091.
  --proof-path <path>     Authorized-smoke proof JSON path. Defaults to ${proofPath}.
  --expected-email <email>
                          Verify get_api_context returns this connection user email.
  --authorize-timeout-ms <ms>
                          Maximum time to wait for browser sign-in callback. Defaults to ${authorizeTimeoutMs}.
  --auto-sign-in          Use @clerk/testing and E2E_CLERK_USER_EMAIL to complete the browser flow.
  --open-browser          Open the authorization URL in the default browser for manual sign-in.
  --headed                Show the Playwright browser when --auto-sign-in is used.
  --no-context            In authorize mode, stop after listing tools and skip get_api_context.
  --box-intake-smoke      Dry-run save_box_intake against the first accessible move.
  --write-smoke           Create and archive one temporary inventory item through MCP.
  --expect-trusted-helper-toolset
                          Require the OAuth tools/list response to include the trusted-helper tools
                          and exclude higher-risk/admin tools before passing.
  --revoke-smoke          Revoke the OAuth MCP connection and verify the existing OAuth token stops working.

Discover mode has no external side effects beyond HTTP GET requests.
Authorize mode dynamically registers an OAuth client and waits for a browser sign-in callback.
Keep this terminal running while the browser signs in; the local callback listener writes
the proof JSON after the browser returns to ${callbackUrl}.`);
}

export function browserOpenCommand(url, platform = process.platform) {
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }
  return { command: "xdg-open", args: [url] };
}

export function openBrowserUrl(url, { spawnFn = spawn, platform = process.platform } = {}) {
  const { command, args } = browserOpenCommand(url, platform);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(command, args, {
        detached: true,
        stdio: "ignore",
      });
    } catch (error) {
      resolve({
        ok: false,
        detail: `${command} failed: ${errorMessage(error)}`,
      });
      return;
    }
    child.on("error", (error) => {
      resolve({
        ok: false,
        detail: `${command} failed: ${errorMessage(error)}`,
      });
    });
    child.on("spawn", () => {
      child.unref?.();
      resolve({
        ok: true,
        detail: `${command} ${args.slice(0, -1).join(" ")}`.trim(),
      });
    });
  });
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

function resolvedHttpTimeoutMs() {
  return Number.isFinite(httpTimeoutMs) && httpTimeoutMs > 0 ? httpTimeoutMs : 15000;
}

export function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(/\r?\n/, 1)[0] || message;
}

export async function fetchForSmoke(url, init, label) {
  try {
    return await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(resolvedHttpTimeoutMs()),
    });
  } catch (error) {
    throw new Error(`${label} fetch failed: ${errorMessage(error)}`);
  }
}

export const trustedHelperRequiredTools =
  MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS;

export const trustedHelperForbiddenTools = [
  "add_household_member",
  "list_household_members",
  "delete_item",
  "remove_item_from_box",
  "create_box",
  "add_items_to_box",
  "batch_add_box_contents",
  "add_box_item_from_photo",
  "attach_photo",
  "manage_exports",
  "manage_share_link",
];

export function trustedHelperToolsetResults(toolNames) {
  const toolSet = new Set(toolNames);
  const missingRequired = trustedHelperRequiredTools.filter(
    (name) => !toolSet.has(name)
  );
  const exposedForbidden = trustedHelperForbiddenTools.filter((name) =>
    toolSet.has(name)
  );

  return {
    ok: missingRequired.length === 0 && exposedForbidden.length === 0,
    missingRequired,
    exposedForbidden,
  };
}

async function fetchJson(url, label) {
  const response = await fetchForSmoke(
    url,
    {
      headers: { Accept: "application/json" },
    },
    label
  );
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  return await response.json();
}

export function invalidBearerBoundaryResult({ status, authenticate, text }) {
  const combined = `${authenticate ?? ""}\n${text ?? ""}`;
  if (status !== 401) {
    return {
      ok: false,
      detail: `expected HTTP 401 for a non-mmk bearer token, got HTTP ${status}`,
    };
  }
  if (/invalid api key format/i.test(combined)) {
    return {
      ok: false,
      detail:
        "non-mmk bearer token reached API-key validation and returned Invalid API key format; production is likely missing the OAuth-aware Convex REST deploy",
    };
  }
  if (
    !/invalid_token|OAuth access token is invalid|token-invalid/i.test(combined)
  ) {
    return {
      ok: false,
      detail: "HTTP 401 did not identify the failure as an OAuth token problem",
    };
  }
  return { ok: true };
}

async function runInvalidBearerBoundarySmoke() {
  const response = await fetchForSmoke(
    endpoint,
    {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Authorization: "Bearer not_mmk_fake_token",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "invalid-bearer-probe",
        method: "tools/call",
        params: {
          name: "get_api_context",
          arguments: {},
        },
      }),
    },
    "invalid bearer boundary"
  );
  const text = await response.text();
  const result = invalidBearerBoundaryResult({
    status: response.status,
    authenticate: response.headers.get("www-authenticate"),
    text,
  });
  if (result.ok) {
    pass(
      "Invalid bearer boundary",
      "non-mmk bearer is rejected as OAuth invalid_token before API-key validation"
    );
  } else {
    fail("Invalid bearer boundary", result.detail);
  }
}

export function firstSupported(value, required) {
  if (!Array.isArray(value)) return null;
  return required.find((entry) => value.includes(entry)) ?? null;
}

export function oauthSmokeProofPayload({
  endpointUrl,
  toolCount,
  contextChecked,
  connectionEmail,
  expectedConnectionEmail,
  connectionEmailVerified,
  trustedHelperToolsetVerified,
  boxIntakeSmoke,
  writeSmoke,
  revokeSmoke,
  createdAt = new Date(),
}) {
  const payload = {
    schema: "movingmanifest.mcp-oauth-smoke-proof.v1",
    createdAt: createdAt.toISOString(),
    endpoint: endpointUrl,
    authorized: true,
    checks: {
      tokenExchange: true,
      mcpConnected: true,
      toolsListed: Number.isFinite(toolCount) && toolCount > 0,
      contextChecked: Boolean(contextChecked),
      connectionEmailVerified: Boolean(connectionEmailVerified),
      trustedHelperToolsetVerified: Boolean(trustedHelperToolsetVerified),
      boxIntakeSmoke: Boolean(boxIntakeSmoke),
      writeSmoke: Boolean(writeSmoke),
      revokeSmoke: Boolean(revokeSmoke),
    },
  };
  const normalizedConnectionEmail = normalizeEmail(connectionEmail);
  if (normalizedConnectionEmail) {
    payload.connectionEmail = normalizedConnectionEmail;
  }
  const normalizedExpectedConnectionEmail = normalizeEmail(expectedConnectionEmail);
  if (normalizedExpectedConnectionEmail) {
    payload.expectedConnectionEmail = normalizedExpectedConnectionEmail;
  }
  return payload;
}

async function writeOAuthSmokeProof(payload) {
  await mkdir(dirname(proofPath), { recursive: true });
  await writeFile(`${proofPath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(`${proofPath}.tmp`, proofPath);
  pass("Authorized OAuth proof", proofPath);
}

async function runDiscovery() {
  log(`MCP OAuth discovery smoke for ${endpoint.href}`);
  const response = await fetchForSmoke(
    endpoint,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
    "MCP endpoint"
  );

  if (response.status !== 401) {
    fail(
      "MCP challenge",
      `expected unauthenticated GET to return 401, got HTTP ${response.status}`
    );
    return null;
  }
  pass("MCP challenge", "unauthenticated request returned 401");

  await runInvalidBearerBoundarySmoke();

  const authenticate = response.headers.get("www-authenticate");
  const challenge = bearerChallengeParams(authenticate);
  const resourceMetadataUrl = challenge.resource_metadata;
  if (!resourceMetadataUrl) {
    fail("MCP challenge", "WWW-Authenticate is missing resource_metadata");
    return null;
  }
  pass("MCP challenge metadata URL", resourceMetadataUrl);

  const resourceMetadata = await fetchJson(
    resourceMetadataUrl,
    "protected resource metadata"
  );
  if (resourceMetadata.resource !== endpoint.href) {
    fail(
      "Protected resource",
      `metadata resource ${JSON.stringify(
        resourceMetadata.resource
      )} does not match endpoint ${JSON.stringify(endpoint.href)}`
    );
  } else {
    pass("Protected resource", resourceMetadata.resource);
  }

  const issuer = resourceMetadata.authorization_servers?.[0];
  if (!issuer) {
    fail("Authorization server", "protected resource metadata has no issuer");
    return null;
  }
  pass("Authorization server", issuer);

  const oauthMetadataUrl = new URL("/.well-known/oauth-authorization-server", issuer);
  let authMetadata;
  try {
    authMetadata = await fetchJson(oauthMetadataUrl, "OAuth authorization metadata");
  } catch {
    const oidcMetadataUrl = new URL("/.well-known/openid-configuration", issuer);
    authMetadata = await fetchJson(oidcMetadataUrl, "OpenID metadata");
  }

  if (!authMetadata.authorization_endpoint) {
    fail("Authorization metadata", "missing authorization_endpoint");
  } else {
    pass("Authorization endpoint", authMetadata.authorization_endpoint);
  }
  if (!authMetadata.token_endpoint) {
    fail("Authorization metadata", "missing token_endpoint");
  } else {
    pass("Token endpoint", authMetadata.token_endpoint);
  }
  if (!authMetadata.registration_endpoint) {
    fail("Dynamic client registration", "missing registration_endpoint");
  } else {
    pass("Dynamic client registration", authMetadata.registration_endpoint);
  }

  const pkce = firstSupported(authMetadata.code_challenge_methods_supported, [
    "S256",
  ]);
  if (!pkce) {
    fail("PKCE", "S256 is not advertised");
  } else {
    pass("PKCE", "S256 supported");
  }

  const authMethod = firstSupported(
    authMetadata.token_endpoint_auth_methods_supported,
    ["none", "client_secret_basic", "client_secret_post"]
  );
  if (!authMethod) {
    warn(
      "Token endpoint auth",
      "metadata does not advertise public-client auth; SDK may fall back depending on DCR response"
    );
  } else {
    pass("Token endpoint auth", `${authMethod} supported`);
  }

  const scopes = resourceMetadata.scopes_supported ?? [];
  const missingScopes = ["openid", "profile", "email"].filter(
    (scope) => !scopes.includes(scope)
  );
  if (missingScopes.length) {
    fail("OAuth scopes", `missing ${missingScopes.join(", ")}`);
  } else {
    pass("OAuth scopes", scopes.join(" "));
  }

  return { resourceMetadata, authMetadata };
}

class SmokeOAuthProvider {
  constructor({ redirectUrl, onRedirect }) {
    this._redirectUrl = redirectUrl;
    this._onRedirect = onRedirect;
    this._clientMetadata = {
      client_name: "MovingManifest MCP OAuth smoke",
      redirect_uris: [redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "openid profile email",
    };
  }

  get redirectUrl() {
    return this._redirectUrl;
  }

  get clientMetadata() {
    return this._clientMetadata;
  }

  clientInformation() {
    return this._clientInformation;
  }

  saveClientInformation(clientInformation) {
    this._clientInformation = clientInformation;
  }

  tokens() {
    return this._tokens;
  }

  saveTokens(tokens) {
    this._tokens = tokens;
    describeAccessToken(tokens.access_token);
  }

  redirectToAuthorization(authorizationUrl) {
    this._authorizationUrl = authorizationUrl;
    return this._onRedirect(authorizationUrl);
  }

  saveCodeVerifier(codeVerifier) {
    this._codeVerifier = codeVerifier;
  }

  codeVerifier() {
    if (!this._codeVerifier) {
      throw new Error("No OAuth code verifier was saved.");
    }
    return this._codeVerifier;
  }
}

function describeAccessToken(accessToken) {
  const parts = accessToken?.split(".") ?? [];
  if (parts.length !== 3) {
    warn(
      "OAuth access token",
      `token is not JWT-shaped; length=${accessToken?.length ?? 0}`
    );
    return;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    pass(
      "OAuth access token",
      `iss=${payload.iss ?? "missing"} aud=${claimValue(
        payload.aud
      )} sub=${payload.sub ?? "missing"} client=${claimValue(
        payload.azp ?? payload.client_id ?? payload.cid
      )} sid=${payload.sid ?? "missing"} jti=${payload.jti ?? "missing"} scope=${
        payload.scope ?? "missing"
      }`
    );
  } catch (error) {
    warn(
      "OAuth access token",
      error instanceof Error ? error.message : "could not decode JWT payload"
    );
  }
}

function claimValue(value) {
  if (Array.isArray(value)) return value.join(" ");
  return value ?? "missing";
}

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function manualOAuthHandoffLines({
  authorizationUrl,
  expectedEmail,
  callbackUrl: redirectCallbackUrl = callbackUrl,
  timeoutMs = authorizeTimeoutMs,
}) {
  const normalizedExpectedEmail = normalizeEmail(expectedEmail);
  return [
    "Manual OAuth handoff:",
    `  1. Keep this terminal running; it is listening at ${redirectCallbackUrl}.`,
    normalizedExpectedEmail
      ? `  2. In the browser, sign in as ${normalizedExpectedEmail}.`
      : "  2. In the browser, sign in as the intended MovingManifest owner/admin account.",
    "  3. Approve/continue the MovingManifest consent screen if Google or Clerk shows one.",
    "  4. Wait until the browser says MovingManifest OAuth connected, then return here.",
    `  5. This attempt times out after ${formatDuration(timeoutMs)}; rerun it if the browser gets stuck.`,
    `  Authorization URL: ${authorizationUrl.href}`,
  ];
}

export function formatDuration(ms) {
  const seconds = Math.ceil(parsePositiveInteger(ms, 0) / 1000);
  if (seconds >= 60 && seconds % 60 === 0) {
    return `${seconds / 60} minute${seconds / 60 === 1 ? "" : "s"}`;
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

export function oauthCallbackTimeoutMessage(timeoutMs, port = callbackPort) {
  return `OAuth callback timed out after ${formatDuration(
    timeoutMs
  )}. Dismiss any browser extension popover, sign in as the expected account, then rerun this smoke. The local callback listener was http://localhost:${port}/callback.`;
}

export function connectionEmailFromContext(payload) {
  return (
    payload?.data?.connection?.user?.email ??
    payload?.data?.apiKey?.user?.email ??
    payload?.connection?.user?.email ??
    payload?.apiKey?.user?.email ??
    null
  );
}

export function verifyExpectedConnectionEmail({ contextPayload, expectedEmail }) {
  const expected = normalizeEmail(expectedEmail);
  if (!expected) return { ok: true, skipped: true };

  const actual = normalizeEmail(connectionEmailFromContext(contextPayload));
  if (!actual) {
    return {
      ok: false,
      detail: `expected ${expected}, but get_api_context did not return connection.user.email`,
    };
  }
  if (actual !== expected) {
    return {
      ok: false,
      detail: `expected ${expected}, got ${actual}`,
    };
  }
  return { ok: true, actualEmail: actual };
}

export function connectionNeedsHousehold(payload) {
  return (
    payload?.data?.connection?.status === "needs_household" ||
    payload?.data?.onboarding?.status === "needs_household"
  );
}

function toolResultText(result) {
  return (
    result.content
      ?.map((entry) => (entry.type === "text" ? entry.text : ""))
      .join("\n")
      .trim() ?? ""
  );
}

function parseToolJson(label, result) {
  const text = toolResultText(result);
  if (result.isError) {
    throw new Error(`${label} returned an MCP error: ${text.slice(0, 500)}`);
  }
  if (!text) {
    throw new Error(`${label} returned no text content.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `${label} returned non-JSON text: ${text.slice(0, 240)}`
    );
  }
}

async function callToolJson(client, name, args, label = name) {
  const result = await client.request(
    {
      method: "tools/call",
      params: { name, arguments: args },
    },
    CallToolResultSchema
  );
  return parseToolJson(label, result);
}

function startCallbackServer(port, { timeoutMs = authorizeTimeoutMs } = {}) {
  let settled = false;
  let server;
  let timeout;
  const callbackPromise = new Promise((resolve, reject) => {
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      fn(value);
    };

    server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://localhost:${port}`);
      if (url.pathname === "/favicon.ico") {
        response.writeHead(404);
        response.end();
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (code) {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(
          "<h1>MovingManifest OAuth connected</h1><p>You can close this tab and return to Codex.</p>"
        );
        settle(resolve, code);
        return;
      }
      response.writeHead(400, { "Content-Type": "text/html" });
      response.end(
        `<h1>MovingManifest OAuth failed</h1><p>${escapeHtml(
          error ?? "Missing authorization code."
        )}</p>`
      );
      settle(
        reject,
        new Error(error ?? "OAuth callback did not include a code.")
      );
    });
    server.on("error", reject);
    server.listen(port);
    timeout = setTimeout(() => {
      settle(reject, new Error(oauthCallbackTimeoutMessage(timeoutMs, port)));
      server?.close();
    }, timeoutMs);
  });

  return {
    callbackPromise,
    close() {
      if (timeout) clearTimeout(timeout);
      if (server?.listening || !settled) server?.close();
    },
  };
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function completeOAuthWithClerkTesting(authorizationUrl) {
  const emailAddress = process.env.E2E_CLERK_USER_EMAIL;
  if (!emailAddress) {
    throw new Error(
      "--auto-sign-in requires E2E_CLERK_USER_EMAIL in the environment."
    );
  }

  const [{ chromium }, { clerk, clerkSetup, setupClerkTestingToken }] =
    await Promise.all([
      import("@playwright/test"),
      import("@clerk/testing/playwright"),
    ]);

  await clerkSetup({ dotenv: false });
  const browser = await chromium.launch({ headless: !options.headed });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await setupClerkTestingToken({ context });
    await page.goto(authorizationUrl.href, { waitUntil: "domcontentloaded" });
    pass("OAuth browser", `landed on ${page.url()}`);
    if (page.url().includes("/sign-in")) {
      await page.waitForFunction(() => Boolean(window.Clerk?.loaded), null, {
        timeout: 30_000,
      });
      await clerk.signIn({ page, emailAddress });
      await page.waitForFunction(() => window.Clerk?.user !== null, null, {
        timeout: 30_000,
      });
      pass("Clerk E2E sign-in", `signed in as ${emailAddress}`);
    }
    await completeConsentIfNeeded(page);
    pass("OAuth browser", `after consent step ${page.url()}`);
    await page.waitForURL(new RegExp(`^${escapeRegExp(callbackUrl)}`), {
      timeout: 45_000,
    });
    pass("OAuth callback", "browser reached local callback");
  } finally {
    await browser.close();
  }
}

async function completeConsentIfNeeded(page) {
  const deadline = Date.now() + 45_000;
  const consentButtonPattern =
    /^(allow|approve|authorize|continue|connect|accept|grant access|yes)/i;

  while (Date.now() < deadline) {
    if (page.url().startsWith(callbackUrl)) return;
    const button = page
      .getByRole("button", { name: consentButtonPattern })
      .first();
    if (await button.isVisible().catch(() => false)) {
      await button.click();
    }
    await page.waitForTimeout(500);
  }
}

async function connectWithOAuth(provider) {
  const client = new Client(
    { name: "movingmanifest-mcp-oauth-smoke", version: "0.1.0" },
    { capabilities: {} }
  );

  async function tryConnect() {
    const transport = new StreamableHTTPClientTransport(endpoint, {
      authProvider: provider,
    });
    try {
      await client.connect(transport);
      return { client, transport };
    } catch (error) {
      if (!(error instanceof UnauthorizedError)) throw error;
      const code = await callback.callbackPromise;
      await transport.finishAuth(code);
      return await tryConnect();
    }
  }

  const callback = startCallbackServer(callbackPort, {
    timeoutMs: authorizeTimeoutMs,
  });
  try {
    return await tryConnect();
  } finally {
    callback.close();
  }
}

async function runWriteSmoke(client) {
  const movesPayload = await callToolJson(
    client,
    "list_moves",
    { limit: 10 },
    "list_moves"
  );
  const moves = Array.isArray(movesPayload.data) ? movesPayload.data : [];
  const move = moves.find((entry) => entry?.moveId);
  if (!move) {
    throw new Error("write smoke needs at least one accessible move.");
  }

  const marker = new Date().toISOString().replace(/[:.]/g, "-");
  const createPayload = await callToolJson(
    client,
    "create_item",
    {
      moveId: move.moveId,
      name: `MCP OAuth smoke item ${marker}`,
      description:
        "Temporary item created and archived by scripts/mcp-oauth-smoke.mjs.",
      room: "OAuth smoke",
      agentLabel: "mcp-oauth-smoke",
    },
    "create_item"
  );
  const itemId = createPayload.data?.itemId ?? createPayload.itemId;
  if (!itemId) {
    throw new Error(
      `create_item did not return an itemId: ${JSON.stringify(createPayload).slice(
        0,
        500
      )}`
    );
  }

  await callToolJson(
    client,
    "update_item",
    {
      moveId: move.moveId,
      itemId,
      status: "archived",
      aiTags: ["mcp-oauth-smoke"],
    },
    "update_item archive cleanup"
  );
  pass(
    "MCP write smoke",
    `created and archived temporary item ${itemId} on ${move.title ?? move.moveId}`
  );
}

async function runBoxIntakeSmoke(client) {
  const movesPayload = await callToolJson(
    client,
    "list_moves",
    { limit: 10 },
    "list_moves for box intake"
  );
  const moves = Array.isArray(movesPayload.data) ? movesPayload.data : [];
  const move = moves.find((entry) => entry?.moveId);
  if (!move) {
    throw new Error("box intake smoke needs at least one accessible move.");
  }

  const payload = await callToolJson(
    client,
    "save_box_intake",
    {
      moveId: move.moveId,
      dryRun: true,
      idempotencyKey: "mcp-oauth-box-intake-smoke",
      box: {
        code: "OAUTH-BOX-SMOKE",
        description: "MCP OAuth smoke dry-run box intake verification.",
        room: "OAuth smoke",
        destinationRoom: "Destination smoke",
        dimensionsIn: {
          lengthIn: 18,
          widthIn: 12,
          heightIn: 12,
        },
        estimatedWeightLb: 8,
        agentLabel: "mcp-oauth-smoke",
        aiConfidenceScore: 0.99,
      },
      contents: [
        {
          name: "OAuth smoke folded towels",
          description:
            "Temporary dry-run content for save_box_intake OAuth verification.",
          category: "household goods",
          quantity: 2,
          estimatedWeightLb: 4,
          estimatedVolumeCuFt: 0.8,
          room: "OAuth smoke",
          destinationRoom: "Destination smoke",
          agentLabel: "mcp-oauth-smoke",
          aiConfidenceScore: 0.99,
        },
      ],
    },
    "save_box_intake dry-run"
  );

  if (!payload?.dryRun || payload?.summary?.packedContentCount < 1) {
    throw new Error(
      `save_box_intake dry-run did not pack content: ${JSON.stringify(
        payload
      ).slice(0, 500)}`
    );
  }
  pass(
    "MCP box intake smoke",
    `save_box_intake dry-run packed ${payload.summary.packedContentCount} content row on ${move.title ?? move.moveId}`
  );
}

async function revokeOAuthConnectionWithClerkTesting({ householdId, apiKeyId }) {
  const emailAddress = process.env.E2E_CLERK_USER_EMAIL;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!options.autoSignIn || !emailAddress) {
    throw new Error("--revoke-smoke requires --auto-sign-in and E2E_CLERK_USER_EMAIL.");
  }
  if (!convexUrl) {
    throw new Error("--revoke-smoke requires NEXT_PUBLIC_CONVEX_URL.");
  }

  const [
    { chromium },
    { clerk, clerkSetup, setupClerkTestingToken },
    { ConvexHttpClient },
    { api },
  ] = await Promise.all([
    import("@playwright/test"),
    import("@clerk/testing/playwright"),
    import("convex/browser"),
    import("../convex/_generated/api.js"),
  ]);

  await clerkSetup({ dotenv: false });
  const browser = await chromium.launch({ headless: !options.headed });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await setupClerkTestingToken({ context });
    await page.goto(endpoint.origin, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.Clerk?.loaded), null, {
      timeout: 30_000,
    });
    if (await page.evaluate(() => window.Clerk?.user === null).catch(() => true)) {
      await clerk.signIn({ page, emailAddress });
      await page.waitForFunction(() => window.Clerk?.user !== null, null, {
        timeout: 30_000,
      });
    }

    const token = await page.evaluate(async () => {
      const session = window.Clerk?.session;
      if (!session) return null;
      const defaultToken = await session.getToken().catch(() => null);
      if (defaultToken) return defaultToken;
      return (await session.getToken({ template: "convex" }).catch(() => null)) ?? null;
    });
    if (!token) {
      throw new Error("Could not get a Convex auth token from Clerk.");
    }

    const convexClient = new ConvexHttpClient(convexUrl);
    convexClient.setAuth(token);
    await convexClient.mutation(api.apiKeys.revoke, { householdId, apiKeyId });
    pass("Convex revoke", `revoked OAuth MCP connection ${apiKeyId}`);
  } finally {
    await browser.close();
  }
}

async function runRevokeSmoke(client, contextPayload) {
  const householdId = contextPayload?.data?.household?.householdId;
  const apiKeyId = contextPayload?.data?.apiKey?.apiKeyId;
  if (!householdId || !apiKeyId) {
    throw new Error(
      `get_api_context did not include household/api key IDs: ${JSON.stringify(
        contextPayload
      ).slice(0, 500)}`
    );
  }

  await revokeOAuthConnectionWithClerkTesting({ householdId, apiKeyId });
  const revokedResult = await client.request(
    {
      method: "tools/call",
      params: { name: "get_api_context", arguments: {} },
    },
    CallToolResultSchema
  );
  const text = toolResultText(revokedResult);
  if (!revokedResult.isError || !/revoked|unauthorized|401/i.test(text)) {
    throw new Error(
      `revoked OAuth token was not blocked. isError=${Boolean(
        revokedResult.isError
      )} text=${text.slice(0, 500)}`
    );
  }
  pass("MCP revoke smoke", "existing OAuth token is blocked after revoke");
}

async function runAuthorize() {
  await runDiscovery();
  if (process.exitCode) return;
  if (options.revokeSmoke && options.noContext) {
    throw new Error("--revoke-smoke needs get_api_context; remove --no-context.");
  }
  if (expectedConnectionEmail && options.noContext) {
    throw new Error("--expected-email needs get_api_context; remove --no-context.");
  }

  const provider = new SmokeOAuthProvider({
    redirectUrl: callbackUrl,
    async onRedirect(authorizationUrl) {
      pass("OAuth authorization URL", authorizationUrl.href);
      if (options.autoSignIn) {
        await completeOAuthWithClerkTesting(authorizationUrl);
        return;
      }
      if (options.openBrowser) {
        const opened = await openBrowserUrl(authorizationUrl.href);
        if (opened.ok) {
          pass("OAuth browser open", opened.detail);
        } else {
          warn("OAuth browser open", opened.detail);
        }
      }
      for (const line of manualOAuthHandoffLines({
        authorizationUrl,
        expectedEmail: expectedConnectionEmail,
      })) {
        log(line);
      }
    },
  });

  const { client, transport } = await connectWithOAuth(provider);
  pass("MCP OAuth connection", "client connected with OAuth access token");

  const toolList = await client.request(
    { method: "tools/list", params: {} },
    ListToolsResultSchema
  );
  const toolCount = toolList.tools?.length ?? 0;
  pass("MCP tools/list", `${toolCount} tools`);
  let trustedHelperToolsetVerified = false;
  if (options.expectTrustedHelperToolset) {
    const trustedToolset = trustedHelperToolsetResults(
      (toolList.tools ?? []).map((tool) => tool.name).filter(Boolean)
    );
    if (!trustedToolset.ok) {
      fail(
        "Trusted-helper OAuth toolset",
        [
          trustedToolset.missingRequired.length
            ? `missing required: ${trustedToolset.missingRequired.join(", ")}`
            : "",
          trustedToolset.exposedForbidden.length
            ? `exposed forbidden: ${trustedToolset.exposedForbidden.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("; ")
      );
    } else {
      trustedHelperToolsetVerified = true;
      pass(
        "Trusted-helper OAuth toolset",
        "required trusted-helper tools present and higher-risk tools absent"
      );
    }
  }

  let contextPayload = null;
  let actualConnectionEmail = null;
  let verifiedConnectionEmail = null;
  let boxIntakeSmokeVerified = false;
  if (!options.noContext) {
    const context = await client.request(
      {
        method: "tools/call",
        params: { name: "get_api_context", arguments: {} },
      },
      CallToolResultSchema
    );
    const text = toolResultText(context);
    if (
      context.isError ||
      /"error"\s*:|MovingManifest API request failed|unauthorized|invalid|forbidden|OAuth access token/i.test(
        text
      )
    ) {
      fail("get_api_context", text.slice(0, 500) || "tool returned an error");
    } else {
      contextPayload = parseToolJson("get_api_context", context);
      actualConnectionEmail = normalizeEmail(connectionEmailFromContext(contextPayload));
      pass("get_api_context", text.slice(0, 240).replace(/\s+/g, " "));
    }
  }
  if (process.exitCode) {
    await writeOAuthSmokeProof(
      oauthSmokeProofPayload({
        endpointUrl: endpoint.href,
        toolCount,
        contextChecked: !options.noContext && Boolean(contextPayload),
        connectionEmail: actualConnectionEmail,
        expectedConnectionEmail,
        connectionEmailVerified: false,
        trustedHelperToolsetVerified,
        boxIntakeSmoke: boxIntakeSmokeVerified,
        writeSmoke: false,
        revokeSmoke: false,
      })
    );
    await transport.close();
    return;
  }

  const emailCheck = verifyExpectedConnectionEmail({
    contextPayload,
    expectedEmail: expectedConnectionEmail,
  });
  if (!emailCheck.ok) {
    fail("Connection email", emailCheck.detail);
    await writeOAuthSmokeProof(
      oauthSmokeProofPayload({
        endpointUrl: endpoint.href,
        toolCount,
        contextChecked: !options.noContext && Boolean(contextPayload),
        connectionEmail: actualConnectionEmail,
        expectedConnectionEmail,
        connectionEmailVerified: false,
        trustedHelperToolsetVerified,
        boxIntakeSmoke: boxIntakeSmokeVerified,
        writeSmoke: false,
        revokeSmoke: false,
      })
    );
    await transport.close();
    return;
  }
  if (!emailCheck.skipped) {
    verifiedConnectionEmail = emailCheck.actualEmail;
    pass("Connection email", verifiedConnectionEmail);
  }

  if (connectionNeedsHousehold(contextPayload)) {
    fail(
      "OAuth household",
      `authenticated as ${
        verifiedConnectionEmail ?? "the expected account"
      }, but that account is not an active member of a MovingManifest household. Open https://movingmanifest.com/app/dashboard#household-setup with this account or invite it from an existing household, then rerun this smoke.`
    );
    await transport.close();
    return;
  }

  if (options.boxIntakeSmoke) {
    await runBoxIntakeSmoke(client);
    boxIntakeSmokeVerified = true;
  }

  if (options.writeSmoke) {
    await runWriteSmoke(client);
  }

  if (options.revokeSmoke) {
    await runRevokeSmoke(client, contextPayload);
  }

  await writeOAuthSmokeProof(
    oauthSmokeProofPayload({
      endpointUrl: endpoint.href,
      toolCount,
      contextChecked: !options.noContext && Boolean(contextPayload),
      connectionEmail: actualConnectionEmail ?? verifiedConnectionEmail,
      expectedConnectionEmail,
      connectionEmailVerified: Boolean(verifiedConnectionEmail),
      trustedHelperToolsetVerified,
      boxIntakeSmoke: boxIntakeSmokeVerified,
      writeSmoke: Boolean(options.writeSmoke),
      revokeSmoke: Boolean(options.revokeSmoke),
    })
  );

  await transport.close();
}

async function main() {
  if (options.help) {
    usage();
    return;
  }
  if (!["discover", "authorize"].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }
  if (mode === "discover") {
    await runDiscovery();
    return;
  }
  await runAuthorize();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await main();
  } catch (error) {
    fail("MCP OAuth smoke", error instanceof Error ? error.message : String(error));
  }
}
