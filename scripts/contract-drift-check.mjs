import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  contractEnumManifest,
  restRouteManifest,
} from "../convex/lib/routeManifest.mjs";

const openApiPath = "public/openapi.json";
const mcpApiPath = "mcp-server/movingmanifest-api.mjs";
const mcpServerPath = "mcp-server/movingmanifest-mcp.mjs";
const defaultArtifactPaths = [
  "public/agent-kit/CLAUDE.md",
  "public/agent-kit/movingmanifest-skill/SKILL.md",
  "public/agent-kit/chatgpt-instructions.md",
];

const httpMethods = new Set(["get", "post", "patch", "put", "delete"]);

export function contractDriftResults({
  openapi = JSON.parse(readFileSync(openApiPath, "utf8")),
  mcpApiSource = readFileSync(mcpApiPath, "utf8"),
  mcpServerSource = readFileSync(mcpServerPath, "utf8"),
  artifactSources = defaultArtifactPaths.map((path) => ({
    path,
    source: readFileSync(path, "utf8"),
  })),
  manifest = restRouteManifest,
  enumManifest = contractEnumManifest,
} = {}) {
  const results = [];
  const manifestRouteKeys = manifest.map(routeKey);
  const manifestKeys = new Set(manifestRouteKeys);
  const manifestPaths = new Set(manifest.map((route) => route.pathPattern));
  const openApiKeys = openApiRouteKeys(openapi);
  const mcpPaths = extractMcpPaths(mcpApiSource);

  pushMissing(
    results,
    "openapi_missing_manifest_route",
    manifestKeys,
    openApiKeys,
    "Manifest route is missing from public/openapi.json"
  );
  pushMissing(
    results,
    "openapi_unknown_route",
    openApiKeys,
    manifestKeys,
    "OpenAPI route is not represented in the REST route manifest"
  );

  for (const path of mcpPaths) {
    if (!manifestPaths.has(path)) {
      results.push({
        code: "mcp_unknown_path",
        message: `MCP client path ${path} is not represented in the REST route manifest.`,
      });
    }
  }

  for (const artifact of artifactSources) {
    for (const key of extractEndpointMentions(artifact.source)) {
      if (!manifestKeys.has(key)) {
        results.push({
          code: "artifact_unknown_route",
          message: `${artifact.path} mentions ${key}, which is not represented in the REST route manifest.`,
        });
      }
    }
  }

  const duplicateManifestKeys = duplicates(manifestRouteKeys);
  for (const key of duplicateManifestKeys) {
    results.push({
      code: "manifest_duplicate_route",
      message: `REST route manifest contains duplicate route ${key}.`,
    });
  }

  for (const route of manifest) {
    for (const scope of route.scopes) {
      if (!knownApiKeyScopes.has(scope)) {
        results.push({
          code: "manifest_unknown_scope",
          message: `REST route manifest route ${routeKey(route)} references unknown scope ${scope}.`,
        });
      }
    }
  }

  for (const [enumName, expected] of Object.entries(enumManifest)) {
    const openApiValues = openApiEnumValues(openapi, enumName);
    if (openApiValues && !sameArray(openApiValues, expected)) {
      results.push({
        code: "openapi_enum_drift",
        message: `OpenAPI enum ${enumName} differs. Expected ${expected.join(", ")}; found ${openApiValues.join(", ")}.`,
      });
    }
    const mcpValues = mcpEnumValues(mcpServerSource, enumName);
    if (mcpValues && !sameArray(mcpValues, expected)) {
      results.push({
        code: "mcp_enum_drift",
        message: `MCP enum ${enumName} differs. Expected ${expected.join(", ")}; found ${mcpValues.join(", ")}.`,
      });
    }
  }

  return results;
}

export function assertNoContractDrift() {
  const results = contractDriftResults();
  if (results.length) {
    throw new Error(formatContractDriftResults(results));
  }
}

export function formatContractDriftResults(results) {
  return [
    `Contract drift check failed with ${results.length} issue${results.length === 1 ? "" : "s"}:`,
    ...results.map((result) => `- ${result.code}: ${result.message}`),
  ].join("\n");
}

function openApiRouteKeys(openapi) {
  const keys = new Set();
  for (const [path, operations] of Object.entries(openapi.paths ?? {})) {
    for (const method of Object.keys(operations ?? {})) {
      if (httpMethods.has(method)) {
        keys.add(`${method.toUpperCase()} ${normalizePathPattern(path)}`);
      }
    }
  }
  return keys;
}

function extractMcpPaths(source) {
  const paths = new Set();
  const pathRegex = /path:\s*(?:`([^`]+)`|"([^"]+)"|'([^']+)')/g;
  let match;
  while ((match = pathRegex.exec(source))) {
    paths.add(normalizePathPattern(match[1] ?? match[2] ?? match[3]));
  }
  return paths;
}

function extractEndpointMentions(source) {
  const mentions = new Set();
  const endpointRegex = /\b(GET|POST|PATCH|PUT|DELETE)\s+(\/[A-Za-z0-9_{}./-]+)/g;
  let match;
  while ((match = endpointRegex.exec(source))) {
    mentions.add(`${match[1]} ${normalizePathPattern(match[2])}`);
  }
  return mentions;
}

function openApiEnumValues(openapi, enumName) {
  const schemaNames = {
    itemDisposition: ["ItemInput.properties.disposition", "IngestionProposedItem.properties.disposition"],
    itemFragility: ["ItemInput.properties.fragility", "IngestionProposedItem.properties.fragility"],
    confidence: ["Confidence"],
    ingestionQueueStatus: ["IngestionQueueEntry.properties.status"],
    photoDerivativeVariant: ["PhotoDerivativeVariant"],
  }[enumName] ?? [];

  for (const schemaPath of schemaNames) {
    const values = schemaAtPath(openapi.components?.schemas, schemaPath)?.enum;
    if (Array.isArray(values)) return values;
  }
  return null;
}

function schemaAtPath(schemas, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => value?.[key], schemas);
}

function mcpEnumValues(source, enumName) {
  const schemaNames = {
    itemDisposition: "itemDispositionSchema",
    itemFragility: "itemFragilitySchema",
    confidence: "estimateConfidenceSchema",
    ingestionQueueStatus: "ingestionQueueStatusSchema",
  };
  const schemaName = schemaNames[enumName];
  if (!schemaName) return null;
  const match = source.match(
    new RegExp(`const\\s+${schemaName}\\s*=\\s*z\\.enum\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)`)
  );
  if (!match) return null;
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function normalizePathPattern(path) {
  return (
    path
      .replace(/^https?:\/\/[^/]+\/api\/v1/, "")
      .replace(/^\/api\/v1/, "")
      .replace(/\$\{\s*input\.([A-Za-z0-9_]+)\s*\}/g, "{$1}")
      .replace(/\$\{\s*([A-Za-z0-9_]+)\s*\}/g, "{$1}")
      .replace(/\{documentationProfileId\}/g, "{documentationProfileId}")
      .replace(/\{exportJobId\}/g, "{exportJobId}")
      .replace(/\/+/g, "/")
      .replace(/\/$/g, "") || "/"
  );
}

function routeKey(route) {
  return `${route.method} ${normalizePathPattern(route.pathPattern)}`;
}

function pushMissing(results, code, expected, actual, label) {
  for (const key of [...expected].sort()) {
    if (!actual.has(key)) {
      results.push({ code, message: `${label}: ${key}.` });
    }
  }
}

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

function sameArray(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

const knownApiKeyScopes = new Set([
  "moves/read",
  "moves/write",
  "inventory/read",
  "inventory/write",
  "plans/read",
  "plans/write",
  "photos/write",
  "exports/read",
  "exports/create",
  "members/manage",
]);

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const results = contractDriftResults();
  if (results.length) {
    console.error(formatContractDriftResults(results));
    process.exitCode = 1;
  } else {
    console.log(
      `Contract drift check passed: ${restRouteManifest.length} REST routes, ${Object.keys(contractEnumManifest).length} enum groups.`
    );
  }
}
