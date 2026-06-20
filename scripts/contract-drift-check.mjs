import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const openApiPath = "public/openapi.json";
const mcpApiPath = "mcp-server/movingmanifest-api.mjs";
const mcpServerPath = "mcp-server/movingmanifest-mcp.mjs";

const restRouteManifest = [
  route("GET", "/me"),
  route("GET", "/households/{householdId}/members"),
  route("POST", "/households/{householdId}/members"),
  route("GET", "/moves"),
  route("POST", "/moves"),
  route("POST", "/moves/setup"),
  route("GET", "/moves/{moveId}/agent-context"),
  route("GET", "/moves/{moveId}/items"),
  route("POST", "/moves/{moveId}/items"),
  route("POST", "/moves/{moveId}/items/batch-upsert"),
  route("GET", "/moves/{moveId}/spaces"),
  route("POST", "/moves/{moveId}/spaces"),
  route("POST", "/moves/{moveId}/sale-listings"),
  route("POST", "/images/upload"),
  route("POST", "/photos/upload"),
  route("POST", "/uploads/init"),
  route("POST", "/photos/finalize"),
  route("GET", "/moves/{moveId}/capacity-report"),
  route("GET", "/moves/{moveId}/move-day"),
  route("POST", "/moves/{moveId}/exports"),
];

const mcpRequiredRouteKeys = new Set([
  "GET /me",
  "GET /households/{householdId}/members",
  "POST /households/{householdId}/members",
  "GET /moves",
  "POST /moves",
  "POST /moves/setup",
  "GET /moves/{moveId}/agent-context",
  "GET /moves/{moveId}/items",
  "POST /moves/{moveId}/items",
  "POST /moves/{moveId}/items/batch-upsert",
  "GET /moves/{moveId}/spaces",
  "POST /moves/{moveId}/spaces",
  "GET /moves/{moveId}/move-day",
]);

const openApiEnumManifest = {
  confidence: ["none", "low", "medium", "high", "manual", "actual"],
  itemDisposition: [
    "keep",
    "sell",
    "donate",
    "free",
    "dump",
    "storage",
    "undecided",
  ],
  itemFragility: ["low", "medium", "high"],
  photoDerivativeVariant: ["thumb", "card", "detail", "full"],
};

const mcpEnumManifest = {
  confidence: ["none", "low", "medium", "high", "manual", "actual", "estimated"],
  itemDisposition: [
    "undecided",
    "take",
    "sell",
    "donate",
    "dump",
    "free",
    "storage",
    "mover",
    "personalTransport",
  ],
  itemFragility: ["low", "medium", "high"],
};

export function contractDriftResults({
  openapi = JSON.parse(readFileSync(openApiPath, "utf8")),
  mcpApiSource = readFileSync(mcpApiPath, "utf8"),
  mcpServerSource = readFileSync(mcpServerPath, "utf8"),
  manifest = restRouteManifest,
  openApiEnums = openApiEnumManifest,
  mcpEnums = mcpEnumManifest,
} = {}) {
  const results = [];
  const manifestKeys = new Set(manifest.map(routeKey));
  const openApiKeys = openApiRouteKeys(openapi);
  const mcpKeys = mcpRouteKeys(mcpApiSource);

  pushMissing(
    results,
    "openapi_missing_manifest_route",
    manifestKeys,
    openApiKeys,
    "REST manifest route is missing from public/openapi.json"
  );
  pushMissing(
    results,
    "openapi_unknown_route",
    openApiKeys,
    manifestKeys,
    "OpenAPI route is not represented in the REST manifest"
  );

  for (const key of mcpRequiredRouteKeys) {
    if (!mcpKeys.has(key)) {
      results.push({
        code: "mcp_missing_required_route",
        message: `MCP client no longer references required route ${key}.`,
      });
    }
    if (!manifestKeys.has(key)) {
      results.push({
        code: "manifest_missing_required_mcp_route",
        message: `Required MCP route ${key} is not represented in the REST manifest.`,
      });
    }
  }

  for (const [enumName, expected] of Object.entries(openApiEnums)) {
    const openApiValues = openApiEnumValues(openapi, enumName);
    if (openApiValues && !sameArray(openApiValues, expected)) {
      results.push({
        code: "openapi_enum_drift",
        message: `OpenAPI enum ${enumName} differs. Expected ${expected.join(", ")}; found ${openApiValues.join(", ")}.`,
      });
    }
  }

  for (const [enumName, expected] of Object.entries(mcpEnums)) {
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

export function route(method, pathPattern) {
  return { method, pathPattern };
}

export { mcpEnumManifest, openApiEnumManifest, restRouteManifest };

function openApiRouteKeys(openapi) {
  const keys = new Set();
  for (const [path, operations] of Object.entries(openapi.paths ?? {})) {
    for (const method of Object.keys(operations ?? {})) {
      if (["get", "post", "patch", "put", "delete"].includes(method)) {
        keys.add(`${method.toUpperCase()} ${normalizePathPattern(path)}`);
      }
    }
  }
  return keys;
}

function mcpRouteKeys(source) {
  const keys = new Set();
  const requestRegex =
    /movingManifest(?:Binary)?Request\(\s*config,\s*\{([\s\S]*?)\n\s*\}\s*\)/g;
  let match;

  while ((match = requestRegex.exec(source))) {
    const block = match[1];
    const path = stringProperty(block, "path");
    if (!path) continue;
    const method = stringProperty(block, "method") ?? "GET";
    keys.add(`${method.toUpperCase()} ${normalizePathPattern(path)}`);
  }

  return keys;
}

function stringProperty(source, propertyName) {
  const match = source.match(
    new RegExp(`${propertyName}:\\s*(?:\`([^\`]+)\`|"([^"]+)"|'([^']+)')`)
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function openApiEnumValues(openapi, enumName) {
  const schemaNames = {
    confidence: ["Confidence"],
    itemDisposition: ["ItemInput.properties.disposition"],
    itemFragility: ["ItemInput.properties.fragility"],
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
    confidence: "estimateConfidenceSchema",
    itemDisposition: "itemDispositionSchema",
    itemFragility: "itemFragilitySchema",
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
      .replace(/\{itemId\}/g, "{itemId}")
      .replace(/\{moveId\}/g, "{moveId}")
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

function sameArray(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const results = contractDriftResults();
  if (results.length) {
    console.error(formatContractDriftResults(results));
    process.exitCode = 1;
  } else {
    console.log(
      `Contract drift check passed: ${restRouteManifest.length} REST routes, ${Object.keys(openApiEnumManifest).length + Object.keys(mcpEnumManifest).length} enum baselines.`
    );
  }
}
