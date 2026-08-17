#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function jsonResponse(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
}

async function startMockApi() {
  const calls = [];
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const body = await readJsonBody(request);
      calls.push({ method: request.method, path: url.pathname, body });

      if (request.method === "POST" && url.pathname === "/api/v1/moves/codex-test-move/boxes") {
        jsonResponse(response, 201, { data: { boxId: "codex-test-box-1" } });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/v1/photos/upload") {
        jsonResponse(response, 200, {
          data: {
            photoId: `codex-test-photo-${calls.length}`,
            derivativeStatus: "pending",
            media: { mimeType: "image/jpeg" },
          },
        });
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/v1/moves/codex-test-move/items/batch-upsert"
      ) {
        jsonResponse(response, 200, {
          data: {
            dryRun: false,
            total: 1,
            succeeded: 1,
            failed: 0,
            results: [
              {
                index: 0,
                ok: true,
                action: "create",
                itemId: "codex-test-item-1",
                name: "codex-test cookbooks",
              },
            ],
          },
        });
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/v1/boxes/codex-test-box-1/items"
      ) {
        jsonResponse(response, 200, { data: { ok: true } });
        return;
      }

      jsonResponse(response, 404, {
        error: {
          code: "unexpected_mock_request",
          message: `${request.method} ${url.pathname}`,
        },
      });
    } catch (error) {
      jsonResponse(response, 500, {
        error: {
          code: "mock_failed",
          message: error instanceof Error ? error.message : "Mock API failed.",
        },
      });
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");

  return {
    calls,
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function parseToolText(result) {
  const text = result.content?.find((part) => part.type === "text")?.text;
  assert(text, "Tool result did not include text content.");
  return JSON.parse(text);
}

async function main() {
  if (!process.argv.includes("--mock-api")) {
    throw new Error("This smoke test is write-path proof and must be run with --mock-api.");
  }

  const cwd = process.cwd();
  const mockApi = await startMockApi();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(cwd, "mcp-server", "assistwithmoving-mcp.mjs")],
    env: {
      ...process.env,
      ASSISTWITHMOVING_API_KEY: "mmk_codex_test_mock_key",
      ASSISTWITHMOVING_API_BASE_URL: mockApi.baseUrl,
    },
  });
  const client = new Client({
    name: "assistwithmoving-stdio-smoke",
    version: "0.1.0",
  });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert(
      tools.tools.some((tool) => tool.name === "save_box_intake"),
      "save_box_intake was not listed by the stdio MCP server."
    );

    const result = await client.callTool({
      name: "save_box_intake",
      arguments: {
        moveId: "codex-test-move",
        idempotencyKey: "codex-test-box-intake-smoke-001",
        box: {
          code: "codex-test-office-001",
          label: "Office box",
          dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
          actualWeightLb: 24,
        },
        photos: [
          {
            sourceUrl: "https://example.com/codex-test-box.jpg",
            caption: "Open codex test office box",
          },
        ],
        contents: [
          {
            name: "codex-test cookbooks",
            quantity: 3,
            images: [
              {
                sourceUrl: "https://example.com/codex-test-cookbooks.jpg",
                caption: "Cookbooks in the box",
              },
            ],
          },
        ],
        linkedItems: [{ itemId: "codex-test-existing-item", quantity: 1 }],
        continueOnImageError: false,
      },
    });
    const payload = parseToolText(result);
    assert.equal(payload.boxId, "codex-test-box-1");
    assert.equal(payload.summary.describedContentCount, 1);

    assert.deepEqual(
      mockApi.calls.map((call) => `${call.method} ${call.path}`),
      [
        "POST /api/v1/moves/codex-test-move/boxes",
        "POST /api/v1/photos/upload",
        "POST /api/v1/moves/codex-test-move/items/batch-upsert",
        "POST /api/v1/boxes/codex-test-box-1/items",
        "POST /api/v1/boxes/codex-test-box-1/items",
        "POST /api/v1/photos/upload",
      ]
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          tool: "save_box_intake",
          mockApi: true,
          calls: mockApi.calls.map((call) => `${call.method} ${call.path}`),
        },
        null,
        2
      )
    );
  } finally {
    await client.close();
    await mockApi.close();
  }
}

await main();
