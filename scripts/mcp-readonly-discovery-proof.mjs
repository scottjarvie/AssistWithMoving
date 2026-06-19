import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const requiredToolContracts = [
  {
    name: "get_api_capabilities",
    expectation: "local capability discovery",
    readOnly: true,
  },
  {
    name: "get_api_context",
    expectation: "read current API-key context",
    readOnly: true,
  },
  {
    name: "list_moves",
    expectation: "read accessible moves",
    readOnly: true,
  },
  {
    name: "get_move_summary",
    expectation: "read compact move summary",
    readOnly: true,
  },
  {
    name: "get_agent_context",
    expectation: "read compact agent context",
    readOnly: true,
  },
  {
    name: "setup_move",
    expectation: "setup flow advertises dryRun before live writes",
    readOnly: false,
    requiresDryRun: true,
  },
];

const requiredCapabilityIds = [
  "apiContext",
  "moveSetup",
  "inventory",
  "photoEvidence",
  "documentationProfiles",
];

function record(results, status, label, detail) {
  results.push({ status, label, detail });
}

function toolMap(tools) {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

function hasDryRunInput(tool) {
  return Boolean(tool?.inputSchema?.properties?.dryRun);
}

function readOnlyHint(tool) {
  return tool?.annotations?.readOnlyHint === true;
}

export function mcpReadonlyDiscoveryProofResults({ tools, capabilitiesPayload }) {
  const results = [];
  const toolsByName = toolMap(tools);

  record(
    results,
    tools.length > 0 ? "pass" : "fail",
    "MCP tools/list",
    `${tools.length} tools advertised`
  );

  for (const contract of requiredToolContracts) {
    const tool = toolsByName.get(contract.name);
    if (!tool) {
      record(
        results,
        "fail",
        `tool ${contract.name}`,
        `missing ${contract.expectation} tool`
      );
      continue;
    }

    record(results, "pass", `tool ${contract.name}`, contract.expectation);

    if (contract.readOnly) {
      record(
        results,
        readOnlyHint(tool) ? "pass" : "fail",
        `tool ${contract.name} read-only hint`,
        readOnlyHint(tool)
          ? "annotations.readOnlyHint is true"
          : "annotations.readOnlyHint is not true"
      );
    }

    if (contract.requiresDryRun) {
      record(
        results,
        hasDryRunInput(tool) ? "pass" : "fail",
        `tool ${contract.name} dryRun input`,
        hasDryRunInput(tool)
          ? "input schema advertises dryRun"
          : "input schema does not advertise dryRun"
      );
    }
  }

  const capabilityIds = new Set(
    capabilitiesPayload?.capabilities?.map((capability) => capability.id) ?? []
  );
  const capabilityCount = capabilitiesPayload?.summary?.capabilityCount ?? 0;
  record(
    results,
    capabilityCount > 0 ? "pass" : "fail",
    "capability payload",
    `${capabilityCount} capabilities reported`
  );

  for (const capabilityId of requiredCapabilityIds) {
    record(
      results,
      capabilityIds.has(capabilityId) ? "pass" : "fail",
      `capability ${capabilityId}`,
      capabilityIds.has(capabilityId)
        ? "present in get_api_capabilities payload"
        : "missing from get_api_capabilities payload"
    );
  }

  const moveSetup = capabilitiesPayload?.capabilities?.find(
    (capability) => capability.id === "moveSetup"
  );
  record(
    results,
    moveSetup?.mcpTools?.includes("setup_move") ? "pass" : "fail",
    "move setup MCP mapping",
    moveSetup?.mcpTools?.includes("setup_move")
      ? "moveSetup advertises setup_move"
      : "moveSetup does not advertise setup_move"
  );

  return results;
}

function parseCapabilityToolResult(result) {
  const textPart = result.content?.find((part) => part.type === "text");
  if (!textPart?.text) {
    throw new Error("get_api_capabilities returned no text content.");
  }
  return JSON.parse(textPart.text);
}

export async function runReadonlyMcpDiscoveryProbe({
  cwd = process.cwd(),
  serverPath = path.join(cwd, "mcp-server", "movingmanifest-mcp.mjs"),
} = {}) {
  if (!existsSync(serverPath)) {
    throw new Error(`MCP server not found at ${serverPath}`);
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      ...process.env,
      MOVINGMANIFEST_API_KEY: "mmk_readonly_discovery_proof_not_a_real_key",
      MOVINGMANIFEST_API_BASE_URL: "https://example.invalid/api/v1",
    },
  });
  const client = new Client({
    name: "movingmanifest-readonly-discovery-proof",
    version: "0.1.0",
  });

  try {
    await client.connect(transport);
    const toolsResult = await client.listTools();
    const capabilitiesResult = await client.callTool({
      name: "get_api_capabilities",
      arguments: {},
    });

    return {
      tools: toolsResult.tools,
      capabilitiesPayload: parseCapabilityToolResult(capabilitiesResult),
      probe: {
        serverPath,
        calledTools: ["tools/list", "get_api_capabilities"],
        apiKey: "dummy",
        apiBaseUrl: "https://example.invalid/api/v1",
      },
    };
  } finally {
    await client.close();
  }
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
  const proof = await runReadonlyMcpDiscoveryProbe();
  const results = mcpReadonlyDiscoveryProofResults(proof);
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
    `MCP read-only discovery proof summary: ${counts.pass} pass, ${counts.warn} warn, ${counts.blocked} blocked, ${counts.fail} fail`
  );
  console.log(
    `No-mutation guarantee: only ${proof.probe.calledTools.join(
      " and "
    )} were called against a local stdio server with a dummy API key and ${proof.probe.apiBaseUrl}.`
  );

  if (counts.fail > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await runCli();
}
