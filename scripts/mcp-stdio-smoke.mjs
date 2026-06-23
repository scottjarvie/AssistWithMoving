#!/usr/bin/env node
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const defaultRequiredTools = [
  "agent_workbench",
  "get_api_capabilities",
  "get_api_context",
  "ingestion_queue",
  "create_item",
  "update_item",
  "append_item_note",
  "upload_evidence_file",
  "upload_photo",
  "upload_photos",
  "add_item_from_photo",
  "save_box_intake",
  "add_items_to_box",
  "batch_upsert_movable_units",
  "apply_assignments",
];

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

const tinyWavBytes = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
  0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x40, 0x1f, 0x00, 0x00, 0x80, 0x3e, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00,
  0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
]);

const defaultSmokeTimeoutMs = Number.parseInt(
  process.env.MCP_STDIO_SMOKE_TIMEOUT_MS ?? "15000",
  10
);

function log(line) {
  console.log(line);
}

function pass(label, detail) {
  log(`PASS ${label}${detail ? `: ${detail}` : ""}`);
}

function fail(label, detail) {
  log(`FAIL ${label}${detail ? `: ${detail}` : ""}`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--server") {
      parsed.server = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--server=")) {
      parsed.server = arg.slice("--server=".length);
      continue;
    }
    if (arg === "--timeout-ms") {
      parsed.timeoutMs = Number.parseInt(args[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg.startsWith("--timeout-ms=")) {
      parsed.timeoutMs = Number.parseInt(arg.slice("--timeout-ms=".length), 10);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--mock-api") {
      parsed.mockApi = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function usage() {
  log(`Usage:
  node scripts/mcp-stdio-smoke.mjs
  node scripts/mcp-stdio-smoke.mjs --server ./mcp-server/movingmanifest-mcp.mjs
  node scripts/mcp-stdio-smoke.mjs --mock-api

This smoke boots the local MCP stdio server with a dummy API key and calls only
local metadata tools by default. With --mock-api, it also calls goal-critical
write tools through the MCP transport against an in-process mock REST API. It
does not read or write MovingManifest production data.`);
}

export function textContent(result) {
  return (
    result.content
      ?.map((entry) => (entry.type === "text" ? entry.text : ""))
      .join("\n")
      .trim() ?? ""
  );
}

export function parseToolJson(label, result) {
  const text = textContent(result);
  if (result.isError) {
    throw new Error(`${label} returned an MCP error: ${text.slice(0, 500)}`);
  }
  if (!text) {
    throw new Error(`${label} returned no text content.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON text: ${text.slice(0, 240)}`);
  }
}

export function missingRequiredTools(tools, requiredTools = defaultRequiredTools) {
  const names = new Set((tools ?? []).map((tool) => tool.name));
  return requiredTools.filter((toolName) => !names.has(toolName));
}

export function assertCapabilitiesPayload(payload) {
  const tools = new Set(
    payload?.capabilities?.flatMap((capability) => capability.mcpTools ?? []) ?? []
  );
  for (const toolName of [
    "agent_workbench",
    "ingestion_queue",
    "create_item",
    "update_item",
    "append_item_note",
    "upload_evidence_file",
    "upload_photo",
    "upload_photos",
    "add_item_from_photo",
    "save_box_intake",
    "add_items_to_box",
    "batch_upsert_movable_units",
    "apply_assignments",
  ]) {
    if (!tools.has(toolName)) {
      throw new Error(`get_api_capabilities did not advertise ${toolName}.`);
    }
  }
  const blockerIssues = new Set(
    (payload.knownLaunchBlockers ?? []).map((blocker) => blocker.issue)
  );
  if (!blockerIssues.has("MOVE-238")) {
    throw new Error("get_api_capabilities did not advertise MOVE-238.");
  }
}

export function assertWorkbenchPayload(payload) {
  const text = JSON.stringify(payload);
  for (const requiredText of [
    "ingestion_queue action=list",
    "ingestion_queue action=claim",
    "ingestion_queue action=media",
    "submitResults",
    "researchSummary",
    "researchSources",
    "apply_assignments",
  ]) {
    if (!text.includes(requiredText)) {
      throw new Error(`agent_workbench guide is missing ${requiredText}.`);
    }
  }
}

function assertQueueMediaToolResult(result) {
  if (result.isError) {
    throw new Error(
      `ingestion_queue action=media returned an MCP error: ${textContent(result).slice(0, 500)}`
    );
  }
  const textBlock = result.content?.find((block) => block.type === "text");
  const imageBlock = result.content?.find((block) => block.type === "image");
  if (!textBlock?.text) {
    throw new Error("ingestion_queue action=media did not return metadata text.");
  }
  let metadata;
  try {
    metadata = JSON.parse(textBlock.text);
  } catch {
    throw new Error("ingestion_queue action=media metadata was not valid JSON.");
  }
  if (!metadata.fetched?.some((entry) => entry.photoId === "photo1")) {
    throw new Error("ingestion_queue action=media did not mark photo1 as fetched.");
  }
  if (!imageBlock?.data || imageBlock.mimeType !== "image/png") {
    throw new Error("ingestion_queue action=media did not return a PNG image block.");
  }
  return metadata;
}

function assertQueueAudioFallbackResult(result) {
  if (result.isError) {
    throw new Error(
      `ingestion_queue audio fallback probe returned an MCP error: ${textContent(result).slice(0, 500)}`
    );
  }
  const textBlock = result.content?.find((block) => block.type === "text");
  const imageBlock = result.content?.find((block) => block.type === "image");
  if (!textBlock?.text) {
    throw new Error("ingestion_queue audio fallback probe did not return metadata text.");
  }
  let metadata;
  try {
    metadata = JSON.parse(textBlock.text);
  } catch {
    throw new Error("ingestion_queue audio fallback metadata was not valid JSON.");
  }
  const failedAudio = metadata.failed?.find(
    (entry) => entry.photoId === "audio-photo1"
  );
  if (
    failedAudio?.reason !== "unsupported_media_kind" ||
    failedAudio?.mimeType !== "audio/wav" ||
    failedAudio?.mediaKind !== "audio" ||
    !String(failedAudio?.evidenceUrl ?? "").includes("/mock-media/audio-note.wav")
  ) {
    throw new Error(
      "ingestion_queue action=media did not report audio as an unsupported media fallback."
    );
  }
  if (imageBlock) {
    throw new Error("ingestion_queue audio fallback probe returned an image block.");
  }
  return metadata;
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  if (!bytes.byteLength) return null;
  const contentType = request.headers["content-type"] ?? "";
  if (!String(contentType).includes("application/json")) {
    return {
      _binary: true,
      sizeBytes: bytes.byteLength,
      contentType,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
  const body = bytes.toString("utf8");
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

export function createMockMovingManifestApiHandler(records = []) {
  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const body = await readJsonBody(request);
    records.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: request.headers,
      body,
    });

    if (request.method === "GET" && url.pathname === "/mock-media/photo1-detail.png") {
      const bytes = Buffer.from(tinyPngBase64, "base64");
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": String(bytes.byteLength),
      });
      response.end(bytes);
      return;
    }

    if (request.method === "GET" && url.pathname === "/mock-media/audio-note.wav") {
      response.writeHead(200, {
        "content-type": "audio/wav",
        "content-length": String(tinyWavBytes.byteLength),
      });
      response.end(tinyWavBytes);
      return;
    }

    if (request.method === "PUT" && url.pathname === "/mock-storage/audio-note.wav") {
      response.writeHead(200, {
        "content-type": "text/plain",
      });
      response.end("ok");
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/me") {
      writeJson(response, 200, {
        data: {
          household: { householdId: "household1", name: "Mock Household" },
          connection: {
            type: "apiKey",
            scopes: [
              "moves/read",
              "moves/write",
              "inventory/read",
              "inventory/write",
              "photos/write",
            ],
            moveRestricted: false,
            user: { email: "stdio-smoke@example.test" },
          },
          apiKey: {
            scopes: [
              "moves/read",
              "moves/write",
              "inventory/read",
              "inventory/write",
              "photos/write",
            ],
            moveRestricted: false,
          },
        },
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/moves/move1/ingestion-queue"
    ) {
      writeJson(response, 200, {
        data: [
          {
            entryId: "entry1",
            status: "ready",
            scopeHint: "inventory",
            roomHint: "Garage",
            mediaPhotoIds: ["photo1", "audio-photo1"],
            hasAudio: true,
            hasImage: true,
          },
        ],
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/moves/move1/ingestion-queue/claim"
    ) {
      writeJson(response, 200, {
        data: [
          {
            entryId: "entry1",
            status: "claimed",
            scopeHint: body?.scopeHint ?? "inventory",
            claimedBy: body?.agentLabel,
            mediaPhotoIds: ["photo1", "audio-photo1"],
            hasAudio: true,
            hasImage: true,
          },
        ],
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/moves/move1/ingestion-queue/entry1/evidence/photo1/url"
    ) {
      const host = request.headers.host ?? "127.0.0.1";
      const variant = url.searchParams.get("variant") ?? "detail";
      writeJson(response, 200, {
        data: {
          url: `http://${host}/mock-media/photo1-detail.png`,
          moveId: "move1",
          entryId: "entry1",
          photoId: "photo1",
          mimeType: "image/png",
          mediaKind: "image",
          servedVariant: variant,
          derivativeStatus: "ready",
          deliveryProvider: "mock",
          expiresAt: Date.now() + 60_000,
        },
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname ===
        "/api/v1/moves/move1/ingestion-queue/entry1/evidence/audio-photo1/url"
    ) {
      const host = request.headers.host ?? "127.0.0.1";
      const variant = url.searchParams.get("variant") ?? "original";
      writeJson(response, 200, {
        data: {
          url: `http://${host}/mock-media/audio-note.wav`,
          moveId: "move1",
          entryId: "entry1",
          photoId: "audio-photo1",
          mimeType: "audio/wav",
          mediaKind: "audio",
          servedVariant: variant,
          deliveryProvider: "mock",
          expiresAt: Date.now() + 60_000,
        },
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/uploads/init") {
      const host = request.headers.host ?? "127.0.0.1";
      writeJson(response, 200, {
        data: {
          uploadSessionId: "audio-upload-session1",
          uploadUrl: `http://${host}/mock-storage/audio-note.wav`,
          headers: {
            "Content-Type": body?.mimeType ?? "audio/wav",
          },
        },
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/photos/finalize") {
      writeJson(response, 200, {
        data: {
          photoId: "audio-photo1",
          uploadSessionId: body?.uploadSessionId,
          media: {
            source: body?.source ?? "mcp",
            fileName: "audio-note.wav",
            mimeType: "audio/wav",
            sizeBytes: tinyWavBytes.byteLength,
          },
        },
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/moves/move1/items") {
      const itemId =
        body?.name === "Mock photo-created item" ? "photo-item1" : "item1";
      writeJson(response, 200, {
        data: {
          itemId,
          ...body,
        },
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/moves/move1/items/batch-upsert"
    ) {
      writeJson(response, 200, {
        data: {
          results: (body?.items ?? []).map((item, index) => ({
            index,
            ok: true,
            action: item.itemId ? "updated" : "created",
            itemId: item.itemId ?? `rough-item-${index + 1}`,
            name: item.name,
            externalSource: item.externalSource,
            externalId: item.externalId,
          })),
        },
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/moves/move1/items/item1"
    ) {
      writeJson(response, 200, {
        data: {
          itemId: "item1",
          name: "Mock transport contract item",
          researchSources: [
            {
              title: "Existing mock source",
              url: "https://example.test/existing-source",
              status: "checked",
            },
          ],
        },
      });
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname === "/api/v1/moves/move1/items/item1"
    ) {
      writeJson(response, 200, {
        data: {
          itemId: "item1",
          ...body,
        },
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/moves/move1/items/item1/notes"
    ) {
      writeJson(response, 200, {
        data: {
          itemId: "item1",
          noteId: "note1",
          ...body,
        },
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/photos/upload"
    ) {
      writeJson(response, 200, {
        data: {
          photoId: "photo-upload1",
          derivativeStatus: "pending",
          media: {
            source: "mcp",
            fileName:
              request.headers["x-movingmanifest-file-name"] ?? "mock-item.png",
            mimeType: request.headers["content-type"] ?? "image/png",
            sizeBytes: body?.sizeBytes ?? 0,
          },
          aiReview: {
            status: "queued",
            suggestionIds: ["suggestion1"],
          },
        },
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/moves/move1/ingestion-queue/entry1/results"
    ) {
      writeJson(response, 200, {
        data: {
          entryId: "entry1",
          committedItemIds: ["queue-item1"],
          committedBoxIds: ["box1"],
          boxAssignmentIds: ["box-assignment1"],
          loadAssignmentBoxIds: ["box1"],
        },
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/v1/moves/move1/boxes"
    ) {
      writeJson(response, 200, {
        data: [],
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/moves/move1/boxes"
    ) {
      writeJson(response, 200, {
        data: {
          boxId: "box-rough-1",
          code: body?.code,
          ...body,
        },
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/moves/move1/box-items"
    ) {
      writeJson(response, 200, {
        data: [
          {
            boxId: body?.boxId ?? "box1",
            itemId: body?.items?.[0]?.itemId ?? "item1",
            assignmentId: "box-item1",
          },
        ],
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/moves/move1/assignments/apply"
    ) {
      writeJson(response, 200, {
        data: {
          succeeded: body?.assignments?.length ?? 0,
          failed: 0,
          assignmentIds: ["load-assignment1"],
        },
      });
      return;
    }

    writeJson(response, 404, {
      error: {
        code: "not_found",
        message: `${request.method} ${url.pathname} was not mocked.`,
      },
    });
  };
}

export async function startMockMovingManifestApi() {
  const records = [];
  const server = createServer(createMockMovingManifestApiHandler(records));
  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Mock API server did not bind to a TCP port.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
    records,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function findRecord(records, method, path) {
  return records.find((record) => record.method === method && record.path === path);
}

function findRecords(records, method, path) {
  return records.filter((record) => record.method === method && record.path === path);
}

function findRecordIndex(records, method, path) {
  return records.findIndex(
    (record) => record.method === method && record.path === path
  );
}

function assertRecord(records, method, path) {
  const record = findRecord(records, method, path);
  if (!record) {
    throw new Error(`Mock API did not receive ${method} ${path}.`);
  }
  return record;
}

export function assertMockGoalRequests(records) {
  const createItem = assertRecord(records, "POST", "/api/v1/moves/move1/items");
  if (
    createItem.body?.name !== "Mock transport contract item" ||
    createItem.body?.currentSpaceId !== "space-origin" ||
    createItem.body?.destinationSpaceId !== "space-destination" ||
    createItem.body?.estimatedWeightLb !== 12 ||
    createItem.body?.researchSources?.[0]?.status !== "used"
  ) {
    throw new Error("create_item request did not preserve goal-critical fields.");
  }

  const photoItem = findRecords(records, "POST", "/api/v1/moves/move1/items").find(
    (record) => record.body?.name === "Mock photo-created item"
  );
  if (
    !photoItem ||
    photoItem.body?.quantity !== 1 ||
    photoItem.body?.currentSpaceId !== "space-origin" ||
    photoItem.body?.destinationSpaceId !== "space-destination" ||
    photoItem.body?.estimatedWeightLb !== 4 ||
    photoItem.body?.researchSources?.[0]?.status !== "checked" ||
    photoItem.headers?.["idempotency-key"] !== "mock-add-item-from-photo-item"
  ) {
    throw new Error("add_item_from_photo did not create the item with expected fields.");
  }

  const getItemIndex = findRecordIndex(
    records,
    "GET",
    "/api/v1/moves/move1/items/item1"
  );
  const updateItemIndex = findRecordIndex(
    records,
    "PATCH",
    "/api/v1/moves/move1/items/item1"
  );
  if (getItemIndex < 0) {
    throw new Error("update_item did not fetch the existing item before merging sources.");
  }
  if (updateItemIndex < 0 || getItemIndex > updateItemIndex) {
    throw new Error("update_item did not fetch the existing item before PATCHing.");
  }

  const updateItem = assertRecord(
    records,
    "PATCH",
    "/api/v1/moves/move1/items/item1"
  );
  if (
    updateItem.body?.actualWeightLb !== 14 ||
    updateItem.body?.destinationSpaceName !== "New office" ||
    updateItem.body?.researchNotes !== "Mock correction from follow-up inspection." ||
    updateItem.headers?.["idempotency-key"] !== "mock-update-item-research" ||
    updateItem.body?.researchSources?.[0]?.url !==
      "https://example.test/existing-source" ||
    updateItem.body?.researchSources?.[1]?.url !==
      "https://example.test/mock-update-source" ||
    updateItem.body?.researchSources?.[1]?.status !== "used"
  ) {
    throw new Error("update_item request did not preserve correction fields.");
  }

  const note = assertRecord(
    records,
    "POST",
    "/api/v1/moves/move1/items/item1/notes"
  );
  if (!String(note.body?.note ?? "").includes("Mock note")) {
    throw new Error("append_item_note request did not include the note body.");
  }

  const photoUpload = assertRecord(records, "POST", "/api/v1/photos/upload");
  if (
    photoUpload.query?.moveId !== "move1" ||
    photoUpload.query?.itemId !== "item1" ||
    photoUpload.query?.generateAiSuggestions !== "true" ||
    photoUpload.headers?.["x-movingmanifest-file-name"] !== "mock-item.png" ||
    photoUpload.body?.contentType !== "image/png" ||
    !photoUpload.body?.sizeBytes
  ) {
    throw new Error("upload_photo request did not send image bytes and metadata.");
  }

  const followUpUploads = findRecords(records, "POST", "/api/v1/photos/upload")
    .filter((record) =>
      String(record.headers?.["x-movingmanifest-file-name"] ?? "").startsWith(
        "mock-follow-up-"
      )
    )
    .sort((left, right) =>
      String(left.headers?.["x-movingmanifest-file-name"]).localeCompare(
        String(right.headers?.["x-movingmanifest-file-name"])
      )
    );
  if (followUpUploads.length !== 2) {
    throw new Error("upload_photos did not send two follow-up image uploads.");
  }
  for (const [index, record] of followUpUploads.entries()) {
    const imageNumber = index + 1;
    if (
      record.query?.moveId !== "move1" ||
      record.query?.itemId !== "item1" ||
      record.query?.room !== "Garage" ||
      record.query?.photoType !== "item" ||
      record.query?.privacyLevel !== "normal" ||
      record.query?.visibilityScope !== "moveCollaborators" ||
      record.query?.caption !== `Mock follow-up angle ${imageNumber}.` ||
      record.headers?.["x-movingmanifest-file-name"] !==
        `mock-follow-up-${imageNumber}.png` ||
      record.headers?.["idempotency-key"] !==
        `mock-follow-up-photos-${imageNumber}` ||
      record.body?.contentType !== "image/png" ||
      !record.body?.sizeBytes
    ) {
      throw new Error(
        `upload_photos follow-up image ${imageNumber} did not preserve expected metadata.`
      );
    }
  }

  const photoItemUpload = findRecords(records, "POST", "/api/v1/photos/upload").find(
    (record) => record.query?.itemId === "photo-item1"
  );
  if (
    !photoItemUpload ||
    photoItemUpload.query?.moveId !== "move1" ||
    photoItemUpload.query?.room !== "Garage" ||
    photoItemUpload.query?.caption !== "Mock photo-created item" ||
    photoItemUpload.headers?.["x-movingmanifest-file-name"] !==
      "mock-photo-item.png" ||
    photoItemUpload.headers?.["idempotency-key"] !==
      "mock-add-item-from-photo-image-1" ||
    photoItemUpload.body?.contentType !== "image/png" ||
    !photoItemUpload.body?.sizeBytes
  ) {
    throw new Error("add_item_from_photo did not upload and attach the source image.");
  }

  const audioSourceFetchIndex = findRecordIndex(
    records,
    "GET",
    "/mock-media/audio-note.wav"
  );
  const audioUploadInitIndex = findRecordIndex(
    records,
    "POST",
    "/api/v1/uploads/init"
  );
  const audioStoragePutIndex = findRecordIndex(
    records,
    "PUT",
    "/mock-storage/audio-note.wav"
  );
  const audioFinalizeIndex = findRecordIndex(
    records,
    "POST",
    "/api/v1/photos/finalize"
  );
  if (
    audioSourceFetchIndex < 0 ||
    audioUploadInitIndex < 0 ||
    audioStoragePutIndex < 0 ||
    audioFinalizeIndex < 0 ||
    !(audioSourceFetchIndex < audioUploadInitIndex &&
      audioUploadInitIndex < audioStoragePutIndex &&
      audioStoragePutIndex < audioFinalizeIndex)
  ) {
    throw new Error(
      "upload_evidence_file did not fetch source media, start upload, PUT bytes, then finalize."
    );
  }
  const audioUploadInit = records[audioUploadInitIndex];
  if (
    audioUploadInit.body?.moveId !== "move1" ||
    audioUploadInit.body?.room !== "Garage" ||
    audioUploadInit.body?.agentLabel !== "mcp-stdio-smoke" ||
    audioUploadInit.body?.mimeType !== "audio/wav" ||
    audioUploadInit.body?.sizeBytes !== tinyWavBytes.byteLength
  ) {
    throw new Error("upload_evidence_file did not preserve audio upload init metadata.");
  }
  const audioStoragePut = records[audioStoragePutIndex];
  if (
    audioStoragePut.body?.contentType !== "audio/wav" ||
    audioStoragePut.body?.sizeBytes !== tinyWavBytes.byteLength ||
    audioStoragePut.body?.sha256 !==
      createHash("sha256").update(tinyWavBytes).digest("hex")
  ) {
    throw new Error("upload_evidence_file did not PUT the expected audio bytes.");
  }
  const audioFinalize = records[audioFinalizeIndex];
  if (
    audioFinalize.body?.moveId !== "move1" ||
    audioFinalize.body?.uploadSessionId !== "audio-upload-session1" ||
    audioFinalize.body?.caption !== "Mock audio note about fragile items." ||
    audioFinalize.body?.photoType !== "note" ||
    audioFinalize.body?.privacyLevel !== "normal" ||
    audioFinalize.body?.visibilityScope !== "moveCollaborators" ||
    audioFinalize.body?.source !== "mcp" ||
    audioFinalize.body?.exifHandlingStatus !== "pending" ||
    !audioFinalize.body?.originalHash
  ) {
    throw new Error("upload_evidence_file did not preserve audio finalize metadata.");
  }

  const queueListIndex = findRecordIndex(
    records,
    "GET",
    "/api/v1/moves/move1/ingestion-queue"
  );
  const queueClaimIndex = findRecordIndex(
    records,
    "POST",
    "/api/v1/moves/move1/ingestion-queue/claim"
  );
  const queueEvidenceUrlIndex = findRecordIndex(
    records,
    "GET",
    "/api/v1/moves/move1/ingestion-queue/entry1/evidence/photo1/url"
  );
  const queueMediaFetchIndex = findRecordIndex(
    records,
    "GET",
    "/mock-media/photo1-detail.png"
  );
  const queueAudioEvidenceUrlIndex = records.findIndex(
    (record, index) =>
      index > queueMediaFetchIndex &&
      record.method === "GET" &&
      record.path ===
        "/api/v1/moves/move1/ingestion-queue/entry1/evidence/audio-photo1/url"
  );
  const queueAudioFetchIndex = records.findIndex(
    (record, index) =>
      index > queueAudioEvidenceUrlIndex &&
      record.method === "GET" &&
      record.path === "/mock-media/audio-note.wav"
  );
  const queueAudioFallbackUrlIndex = records.findIndex(
    (record, index) =>
      index > queueAudioFetchIndex &&
      record.method === "GET" &&
      record.path ===
        "/api/v1/moves/move1/ingestion-queue/entry1/evidence/audio-photo1/url"
  );
  const queueSubmitIndex = findRecordIndex(
    records,
    "POST",
    "/api/v1/moves/move1/ingestion-queue/entry1/results"
  );
  if (
    queueListIndex < 0 ||
    queueClaimIndex < 0 ||
    queueEvidenceUrlIndex < 0 ||
    queueMediaFetchIndex < 0 ||
    queueAudioEvidenceUrlIndex < 0 ||
    queueAudioFetchIndex < 0 ||
    queueAudioFallbackUrlIndex < 0 ||
    queueSubmitIndex < 0 ||
    !(queueListIndex < queueClaimIndex &&
      queueClaimIndex < queueEvidenceUrlIndex &&
      queueEvidenceUrlIndex < queueMediaFetchIndex &&
      queueMediaFetchIndex < queueAudioEvidenceUrlIndex &&
      queueAudioEvidenceUrlIndex < queueAudioFetchIndex &&
      queueAudioFetchIndex < queueAudioFallbackUrlIndex &&
      queueAudioFallbackUrlIndex < queueSubmitIndex)
  ) {
    throw new Error(
      "ingestion_queue smoke did not list, claim, fetch image media, prove audio fallback, then submit results in order."
    );
  }
  const queueList = records[queueListIndex];
  if (
    queueList.query?.scopeHint !== "inventory" ||
    queueList.query?.includeMedia !== "true" ||
    queueList.query?.limit !== "5"
  ) {
    throw new Error("ingestion_queue action=list did not preserve list filters.");
  }
  const queueClaim = records[queueClaimIndex];
  if (
    queueClaim.body?.batchSize !== 1 ||
    queueClaim.body?.agentLabel !== "mcp-stdio-smoke" ||
    queueClaim.body?.scopeHint !== "inventory" ||
    queueClaim.headers?.["idempotency-key"] !== "mock-queue-claim-1"
  ) {
    throw new Error("ingestion_queue action=claim did not preserve claim fields.");
  }
  const queueEvidenceUrl = records[queueEvidenceUrlIndex];
  if (queueEvidenceUrl.query?.variant !== "detail") {
    throw new Error("ingestion_queue action=media did not request the detail evidence URL.");
  }
  const queueAudioEvidenceUrl = records[queueAudioEvidenceUrlIndex];
  if (queueAudioEvidenceUrl.query?.variant !== "original") {
    throw new Error(
      "ingestion_queue audio media probe did not request the original evidence URL."
    );
  }
  const queueAudioFallbackUrl = records[queueAudioFallbackUrlIndex];
  if (queueAudioFallbackUrl.query?.variant !== "original") {
    throw new Error("ingestion_queue action=evidenceUrl did not request original audio.");
  }

  const queue = records[queueSubmitIndex];
  if (
      queue.body?.committedItems?.[0]?.attachMediaPhotoIds?.[0] !== "photo1" ||
      queue.body?.committedItems?.[0]?.researchSources?.[0]?.status !== "checked" ||
      queue.body?.committedItems?.[0]?.appendNote !==
        "Queue capture note preserved with the committed item." ||
      queue.body?.committedItems?.[0]?.appendNoteLabel !== "MCP stdio smoke" ||
      queue.body?.committedItems?.[0]?.researchSourceMode !== "append" ||
      queue.body?.committedBoxes?.[0]?.code !== "BOX-1" ||
      queue.body?.boxAssignments?.[0]?.boxCode !== "BOX-1" ||
      queue.body?.loadAssignments?.[0]?.assignedResourceId !== "truck1"
  ) {
    throw new Error("ingestion_queue submitResults did not preserve queue result fields.");
  }

  const roughBoxLookupIndex = findRecordIndex(
    records,
    "GET",
    "/api/v1/moves/move1/boxes"
  );
  const roughBoxCreateIndex = findRecordIndex(
    records,
    "POST",
    "/api/v1/moves/move1/boxes"
  );
  const roughItemBatchIndex = findRecordIndex(
    records,
    "POST",
    "/api/v1/moves/move1/items/batch-upsert"
  );
  if (
    roughBoxLookupIndex < 0 ||
    roughBoxCreateIndex < 0 ||
    roughItemBatchIndex < 0 ||
    !(roughBoxLookupIndex < roughBoxCreateIndex &&
      roughBoxCreateIndex < roughItemBatchIndex)
  ) {
    throw new Error(
      "batch_upsert_movable_units smoke did not look up the coded box, create it, then batch-upsert loose movable units."
    );
  }
  const roughBoxLookup = records[roughBoxLookupIndex];
  if (
    roughBoxLookup.query?.query !== "B-012" ||
    roughBoxLookup.query?.limit !== "25"
  ) {
    throw new Error("batch_upsert_movable_units did not search by normalized box code.");
  }
  const roughBoxCreate = records[roughBoxCreateIndex];
  if (
    roughBoxCreate.body?.code !== "B-012" ||
    roughBoxCreate.body?.label !== "Mock rough garage hand tools" ||
    roughBoxCreate.body?.room !== "Garage" ||
    roughBoxCreate.body?.estimatedWeightLb !== 35 ||
    roughBoxCreate.body?.estimatedVolumeCuFt !== 4 ||
    roughBoxCreate.body?.assignedResourceId !== "truck1" ||
    roughBoxCreate.body?.assignedZoneId !== "truck-front" ||
    roughBoxCreate.headers?.["idempotency-key"] !==
      "mock-rough-units-1:box:B-012"
  ) {
    throw new Error("batch_upsert_movable_units did not preserve rough box fields.");
  }
  const roughItemBatch = records[roughItemBatchIndex];
  const roughLooseItem = roughItemBatch.body?.items?.[0];
  if (
    roughItemBatch.headers?.["idempotency-key"] !==
      "mock-rough-units-1:items:batch" ||
    roughLooseItem?.externalSource !== "mcp-stdio-smoke" ||
    roughLooseItem?.externalId !== "garage-treadmill" ||
    roughLooseItem?.name !== "Mock treadmill" ||
    roughLooseItem?.status !== "active" ||
    roughLooseItem?.createdVia !== "bulkImport" ||
    roughLooseItem?.disposition !== "mover" ||
    roughLooseItem?.estimatedWeightLb !== 220 ||
    roughLooseItem?.estimatedVolumeCuFt !== 82.17 ||
    roughLooseItem?.assignedResourceId !== "truck1" ||
    roughLooseItem?.reviewFlags?.[0] !== "movableUnitReview" ||
    !roughLooseItem?.aiTags?.includes("movable-unit") ||
    !roughLooseItem?.aiTags?.includes("loose-item")
  ) {
    throw new Error("batch_upsert_movable_units did not preserve rough loose item fields.");
  }

  const boxItems = assertRecord(records, "POST", "/api/v1/moves/move1/box-items");
  if (boxItems.body?.boxCode !== "BOX-1" || boxItems.body?.items?.[0]?.itemId !== "item1") {
    throw new Error("add_items_to_box request did not preserve packing fields.");
  }

  const workflowBoxLookup = findRecords(records, "GET", "/api/v1/moves/move1/boxes").find(
    (record) => record.query?.query === "B-900"
  );
  const workflowBoxCreate = findRecords(records, "POST", "/api/v1/moves/move1/boxes").find(
    (record) => record.body?.code === "B-900"
  );
  if (!workflowBoxLookup || !workflowBoxCreate) {
    throw new Error("save_box_intake did not look up and create/update the target box.");
  }
  if (
    workflowBoxCreate.body?.label !== "Mock kitchen essentials" ||
    workflowBoxCreate.body?.destinationSpaceId !== "space-destination" ||
    workflowBoxCreate.body?.description !== "Cookbooks and setup items for first week." ||
    workflowBoxCreate.body?.dimensionsIn?.lengthIn !== 18 ||
    workflowBoxCreate.body?.estimatedWeightLb !== 35 ||
    workflowBoxCreate.headers?.["idempotency-key"] !== "mock-box-intake-1-box"
  ) {
    throw new Error("save_box_intake did not preserve box dimensions, weight, or idempotency.");
  }
  const workflowContentBatch = findRecords(
    records,
    "POST",
    "/api/v1/moves/move1/items/batch-upsert"
  ).find((record) =>
    record.body?.items?.some((item) => item.name === "Mock cookbooks")
  );
  if (
    !workflowContentBatch ||
    workflowContentBatch.headers?.["idempotency-key"] !==
      "mock-box-intake-1-contents-items" ||
    workflowContentBatch.body?.items?.[0]?.status !== "packed" ||
    workflowContentBatch.body?.items?.[0]?.estimatedWeightLb !== 24
  ) {
    throw new Error("save_box_intake did not create reviewable packed contents.");
  }
  const workflowBoxAssignments = findRecords(
    records,
    "POST",
    "/api/v1/moves/move1/box-items"
  ).filter((record) => record.body?.boxId === "box-rough-1");
  if (
    workflowBoxAssignments.length < 2 ||
    !workflowBoxAssignments.some((record) =>
      record.body?.items?.some((item) => item.itemId === "rough-item-1")
    ) ||
    !workflowBoxAssignments.some((record) =>
      record.body?.items?.some((item) => item.itemId === "item1")
    )
  ) {
    throw new Error("save_box_intake did not pack new contents and linked existing items.");
  }
  const workflowPhotos = findRecords(records, "POST", "/api/v1/photos/upload").filter(
    (record) => record.query?.boxId === "box-rough-1"
  );
  if (
    workflowPhotos.length < 2 ||
    !workflowPhotos.some((record) => record.query?.photoType === "box") ||
    !workflowPhotos.some(
      (record) =>
        record.query?.photoType === "item" && record.query?.itemId === "rough-item-1"
    )
  ) {
    throw new Error("save_box_intake did not attach box and content photos.");
  }

  const load = assertRecord(
    records,
    "POST",
    "/api/v1/moves/move1/assignments/apply"
  );
  if (load.body?.assignments?.[0]?.assignedResourceId !== "truck1") {
    throw new Error("apply_assignments request did not preserve transport fields.");
  }
  if (load.body?.assignments?.[1]?.itemId !== "item2") {
    throw new Error("apply_assignments request did not preserve loose item assignment fields.");
  }
}

async function callToolJson(client, name, args) {
  const result = await client.callTool({
    name,
    arguments: args,
  });
  return parseToolJson(name, result);
}

async function runMockApiToolCalls(client, timeoutMs, mockBaseUrl) {
  await withTimeout(callToolJson(client, "get_api_context", {}), timeoutMs);
  await withTimeout(
    callToolJson(client, "create_item", {
      moveId: "move1",
      name: "Mock transport contract item",
      currentSpaceId: "space-origin",
      destinationSpaceId: "space-destination",
      disposition: "take",
      dimensionsIn: { lengthIn: 24, widthIn: 16, heightIn: 12 },
      estimatedWeightLb: 12,
      weightConfidence: "medium",
      requiresPersonalTransport: true,
      researchSummary: "Mock research summary from a manufacturer page.",
      researchSources: [
        {
          title: "Mock manufacturer page",
          url: "https://example.test/mock-item",
          status: "used",
        },
      ],
      researchConfidence: "medium",
    }),
    timeoutMs
  );
  await withTimeout(
    callToolJson(client, "update_item", {
      moveId: "move1",
      itemId: "item1",
      actualWeightLb: 14,
      destinationSpaceName: "New office",
      researchNotes: "Mock correction from follow-up inspection.",
      researchSources: [
        {
          title: "Mock update source",
          url: "https://example.test/mock-update-source",
          status: "used",
          summary: "Mock source added during follow-up item correction.",
        },
      ],
      idempotencyKey: "mock-update-item-research",
    }),
    timeoutMs
  );
  await withTimeout(
    callToolJson(client, "append_item_note", {
      moveId: "move1",
      itemId: "item1",
      note: "Mock note appended after queue review.",
      label: "mcp-stdio-smoke",
      idempotencyKey: "mock-note-1",
    }),
    timeoutMs
  );
  const photoUpload = await withTimeout(
    callToolJson(client, "upload_photo", {
      moveId: "move1",
      fileBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      fileName: "mock-item.png",
      mimeType: "image/png",
      itemId: "item1",
      caption: "Mock item evidence.",
      photoType: "item",
      generateAiSuggestions: true,
    }),
    timeoutMs
  );
  if (photoUpload.photoId !== "photo-upload1") {
    throw new Error("upload_photo did not return the mock uploaded photoId.");
  }
  const multiUpload = await withTimeout(
    callToolJson(client, "upload_photos", {
      moveId: "move1",
      itemId: "item1",
      room: "Garage",
      photoType: "item",
      privacyLevel: "normal",
      visibilityScope: "moveCollaborators",
      idempotencyKey: "mock-follow-up-photos",
      images: [
        {
          fileBase64:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
          fileName: "mock-follow-up-1.png",
          mimeType: "image/png",
          caption: "Mock follow-up angle 1.",
        },
        {
          fileBase64:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
          fileName: "mock-follow-up-2.png",
          mimeType: "image/png",
          caption: "Mock follow-up angle 2.",
        },
      ],
    }),
    timeoutMs
  );
  if (multiUpload.imageCount !== 2 || multiUpload.uploadedCount !== 2) {
    throw new Error("upload_photos did not report two successful follow-up images.");
  }
  const photoCreatedItem = await withTimeout(
    callToolJson(client, "add_item_from_photo", {
      moveId: "move1",
      name: "Mock photo-created item",
      room: "Garage",
      currentSpaceId: "space-origin",
      destinationSpaceId: "space-destination",
      disposition: "take",
      estimatedWeightLb: 4,
      weightConfidence: "low",
      researchSummary: "Mock identification from one user photo.",
      researchSources: [
        {
          title: "Mock visual identification",
          url: "https://example.test/photo-created-item",
          status: "checked",
        },
      ],
      researchConfidence: "low",
      fileBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      fileName: "mock-photo-item.png",
      mimeType: "image/png",
      idempotencyKey: "mock-add-item-from-photo",
    }),
    timeoutMs
  );
  if (
    photoCreatedItem.itemId !== "photo-item1" ||
    photoCreatedItem.uploadedCount !== 1 ||
    photoCreatedItem.photoIds?.[0] !== "photo-upload1"
  ) {
    throw new Error("add_item_from_photo did not return the created item and photo.");
  }
  const audioSourceUrl = new URL("/mock-media/audio-note.wav", mockBaseUrl).href;
  const audioUpload = await withTimeout(
    callToolJson(client, "upload_evidence_file", {
      moveId: "move1",
      sourceUrl: audioSourceUrl,
      fileName: "audio-note.wav",
      mimeType: "audio/wav",
      room: "Garage",
      caption: "Mock audio note about fragile items.",
      photoType: "note",
      privacyLevel: "normal",
      visibilityScope: "moveCollaborators",
      agentLabel: "mcp-stdio-smoke",
    }),
    timeoutMs
  );
  if (
    audioUpload.photoId !== "audio-photo1" ||
    audioUpload.uploadSessionId !== "audio-upload-session1" ||
    audioUpload.media?.mimeType !== "audio/wav"
  ) {
    throw new Error("upload_evidence_file did not return the mock audio upload result.");
  }
  const queueList = await withTimeout(
    callToolJson(client, "ingestion_queue", {
      action: "list",
      moveId: "move1",
      scopeHint: "inventory",
      includeMedia: true,
      limit: 5,
    }),
    timeoutMs
  );
  const listedEntries = queueList.data ?? queueList;
  if (!Array.isArray(listedEntries) || !listedEntries.some((entry) => entry.entryId === "entry1")) {
    throw new Error("ingestion_queue action=list did not return the mock queue entry.");
  }
  const queueClaim = await withTimeout(
    callToolJson(client, "ingestion_queue", {
      action: "claim",
      moveId: "move1",
      batchSize: 1,
      agentLabel: "mcp-stdio-smoke",
      scopeHint: "inventory",
      idempotencyKey: "mock-queue-claim-1",
    }),
    timeoutMs
  );
  const claimedEntries = queueClaim.data ?? queueClaim;
  if (!Array.isArray(claimedEntries) || !claimedEntries.some((entry) => entry.entryId === "entry1")) {
    throw new Error("ingestion_queue action=claim did not claim the mock queue entry.");
  }
  const queueMediaResult = await withTimeout(
    client.callTool({
      name: "ingestion_queue",
      arguments: {
        action: "media",
        moveId: "move1",
        entryId: "entry1",
        photoIds: ["photo1"],
        variant: "detail",
      },
    }),
    timeoutMs
  );
  assertQueueMediaToolResult(queueMediaResult);
  const queueAudioMediaResult = await withTimeout(
    client.callTool({
      name: "ingestion_queue",
      arguments: {
        action: "media",
        moveId: "move1",
        entryId: "entry1",
        photoIds: ["audio-photo1"],
        variant: "original",
      },
    }),
    timeoutMs
  );
  assertQueueAudioFallbackResult(queueAudioMediaResult);
  const audioEvidenceUrl = await withTimeout(
    callToolJson(client, "ingestion_queue", {
      action: "evidenceUrl",
      moveId: "move1",
      entryId: "entry1",
      photoId: "audio-photo1",
      variant: "original",
    }),
    timeoutMs
  );
  const audioEvidenceData = audioEvidenceUrl.data ?? audioEvidenceUrl;
  if (
    audioEvidenceData.photoId !== "audio-photo1" ||
    audioEvidenceData.mimeType !== "audio/wav" ||
    audioEvidenceData.mediaKind !== "audio" ||
    !String(audioEvidenceData.url ?? "").includes("/mock-media/audio-note.wav")
  ) {
    throw new Error("ingestion_queue action=evidenceUrl did not return audio fallback metadata.");
  }
  await withTimeout(
    callToolJson(client, "ingestion_queue", {
      action: "submitResults",
      moveId: "move1",
      entryId: "entry1",
      agentSummary: "Mock queue result created researched item, box, and load.",
      idempotencyKey: "mock-queue-result-1",
      committedItems: [
        {
          externalSource: "mcp-stdio-smoke",
          externalId: "queue-item-1",
          name: "Mock queued item",
          currentSpaceId: "space-origin",
          destinationSpaceId: "space-destination",
          disposition: "take",
          quantity: 1,
          estimatedWeightLb: 8,
          researchSummary: "Mock queued item research.",
          researchSources: [
            {
              title: "Mock checked source",
              url: "https://example.test/queue-item",
              status: "checked",
            },
          ],
          researchConfidence: "low",
          attachMediaPhotoIds: ["photo1"],
          appendNote: "Queue capture note preserved with the committed item.",
          appendNoteLabel: "MCP stdio smoke",
          researchSourceMode: "append",
        },
      ],
      committedBoxes: [
        {
          code: "BOX-1",
          label: "Mock queue box",
          destinationSpaceId: "space-destination",
          dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
          estimatedWeightLb: 8,
        },
      ],
      boxAssignments: [
        {
          boxCode: "BOX-1",
          externalSource: "mcp-stdio-smoke",
          externalId: "queue-item-1",
          quantity: 1,
        },
      ],
      loadAssignments: [
        {
          boxCode: "BOX-1",
          assignedResourceId: "truck1",
          overrideReason: "Mock user-approved transport.",
        },
      ],
    }),
    timeoutMs
  );
  const roughUnits = await withTimeout(
    callToolJson(client, "batch_upsert_movable_units", {
      moveId: "move1",
      idempotencyKey: "mock-rough-units-1",
      units: [
        {
          kind: "box",
          code: "b 012",
          label: "Mock rough garage hand tools",
          room: "Garage",
          estimatedWeightLb: 35,
          estimatedVolumeCuFt: 4,
          assignedResourceId: "truck1",
          assignedZoneId: "truck-front",
          assignmentOverrideReason: "Mock rough-list load hint.",
        },
        {
          kind: "looseItem",
          externalSource: "mcp-stdio-smoke",
          externalId: "garage-treadmill",
          name: "Mock treadmill",
          room: "Garage",
          estimatedWeightLb: 220,
          dimensionsIn: { lengthIn: 72, widthIn: 34, heightIn: 58 },
          assignedResourceId: "truck1",
        },
      ],
    }),
    timeoutMs
  );
  if (
    roughUnits.data?.summary?.totalUnits !== 2 ||
    roughUnits.data?.boxes?.[0]?.boxId !== "box-rough-1" ||
    roughUnits.data?.looseItems?.[0]?.itemId !== "rough-item-1"
  ) {
    throw new Error("batch_upsert_movable_units did not return rough unit results.");
  }
  await withTimeout(
    callToolJson(client, "add_items_to_box", {
      moveId: "move1",
      boxCode: "BOX-1",
      items: [{ itemId: "item1", quantity: 1 }],
      idempotencyKey: "mock-pack-1",
    }),
    timeoutMs
  );
  await withTimeout(
    callToolJson(client, "save_box_intake", {
      moveId: "move1",
      idempotencyKey: "mock-box-intake-1",
      box: {
        boxCode: "b 900",
        label: "Mock kitchen essentials",
        room: "Kitchen",
        destinationSpaceId: "space-destination",
        description: "Cookbooks and setup items for first week.",
        dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
        estimatedWeightLb: 35,
      },
      photos: [
        {
          fileBase64: tinyPngBase64,
          fileName: "mock-box.png",
          mimeType: "image/png",
          caption: "Mock box overview.",
        },
      ],
      contents: [
        {
          name: "Mock cookbooks",
          quantity: 12,
          description: "Cookbooks found in the kitchen essentials box.",
          estimatedWeightLb: 24,
          photos: [
            {
              fileBase64: tinyPngBase64,
              fileName: "mock-cookbooks.png",
              mimeType: "image/png",
              caption: "Mock cookbooks inside the box.",
            },
          ],
        },
      ],
      linkedItems: [
        {
          itemId: "item1",
          quantity: 1,
          notes: "Mock existing item packed with kitchen essentials.",
        },
      ],
    }),
    timeoutMs
  );
  await withTimeout(
    callToolJson(client, "apply_assignments", {
      moveId: "move1",
      assignments: [
        {
          boxId: "box1",
          assignedResourceId: "truck1",
          overrideReason: "Mock final load correction.",
        },
        {
          itemId: "item2",
          assignedResourceId: "truck1",
          overrideReason: "Mock loose item load correction.",
        },
      ],
      idempotencyKey: "mock-load-1",
    }),
    timeoutMs
  );
}

function resolvedTimeoutMs(timeoutMs) {
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : defaultSmokeTimeoutMs;
}

function withTimeout(promise, timeoutMs) {
  const timeout = resolvedTimeoutMs(timeoutMs);
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`MCP stdio smoke timed out after ${timeout}ms.`)
          ),
        timeout
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

export function createSmokeServerEnv(env = process.env) {
  return {
    PATH: env.PATH ?? "",
    NODE_ENV: "test",
    MOVINGMANIFEST_API_BASE_URL:
      env.MOVINGMANIFEST_API_BASE_URL ?? "https://movingmanifest.invalid/api/v1",
    MOVINGMANIFEST_API_KEY: "mmk_stdio_smoke_do_not_use",
  };
}

export function createSmokeTransport({
  server = "./mcp-server/movingmanifest-mcp.mjs",
  nodeCommand = process.execPath,
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  return new StdioClientTransport({
    command: nodeCommand,
    args: [server],
    cwd,
    stderr: "pipe",
    env: createSmokeServerEnv(env),
  });
}

export async function runMcpStdioSmoke({
  server = "./mcp-server/movingmanifest-mcp.mjs",
  timeoutMs = defaultSmokeTimeoutMs,
  nodeCommand = process.execPath,
  cwd = process.cwd(),
  env = process.env,
  requiredTools = defaultRequiredTools,
  mockApi = false,
} = {}) {
  const client = new Client(
    { name: "movingmanifest-mcp-stdio-smoke", version: "0.1.0" },
    { capabilities: {} }
  );
  const mock = mockApi ? await startMockMovingManifestApi() : null;
  const transport = createSmokeTransport({
    server,
    nodeCommand,
    cwd,
    env: mock
      ? {
          ...env,
          MOVINGMANIFEST_API_BASE_URL: mock.baseUrl,
        }
      : env,
  });

  try {
    await withTimeout(client.connect(transport), timeoutMs);
    const instructions = client.getInstructions() ?? "";
    if (!instructions.includes("agent_workbench")) {
      throw new Error("Server instructions do not tell agents to call agent_workbench.");
    }
    pass("MCP stdio connect", "server initialized with canonical instructions");

    const toolList = await withTimeout(client.listTools(), timeoutMs);
    const missing = missingRequiredTools(toolList.tools, requiredTools);
    if (missing.length) {
      throw new Error(`MCP tools/list missing required tool(s): ${missing.join(", ")}`);
    }
    pass("MCP tools/list", `${toolList.tools.length} tools`);

    const capabilitiesResult = await withTimeout(
      client.callTool({ name: "get_api_capabilities", arguments: {} }),
      timeoutMs
    );
    assertCapabilitiesPayload(
      parseToolJson("get_api_capabilities", capabilitiesResult)
    );
    pass("get_api_capabilities", "goal-critical tools and MOVE-238 advertised");

    const workbenchResult = await withTimeout(
      client.callTool({
        name: "agent_workbench",
        arguments: { mode: "intakeQueue" },
      }),
      timeoutMs
    );
    assertWorkbenchPayload(parseToolJson("agent_workbench", workbenchResult));
    pass(
      "agent_workbench",
      "queue, media, research, submitResults, and transport guidance present"
    );

    if (mock) {
      await runMockApiToolCalls(client, timeoutMs, mock.baseUrl);
      assertMockGoalRequests(mock.records);
      pass(
        "MCP goal tool calls",
        "item, note, photo-to-item, single and multi-photo upload, audio evidence upload/fallback, queue list/claim/media/submitResults, rough movable-unit batch, save_box_intake, packing, and transport hit mock REST API"
      );
    }

    return { status: "passed", toolCount: toolList.tools.length };
  } finally {
    await transport.close();
    await mock?.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  await runMcpStdioSmoke(options);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await main();
  } catch (error) {
    fail("MCP stdio smoke", error instanceof Error ? error.message : String(error));
  }
}
