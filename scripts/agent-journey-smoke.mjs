#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  addItemsToBox,
  batchUpsertItems,
  createBox,
  getApiContext,
  getMoveSummary,
  movingManifestRequest,
  setupMove,
  uploadEvidenceImage,
} from "../mcp-server/movingmanifest-api.mjs";

const defaultBaseUrl = "https://movingmanifest.com/api/v1";
const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/smoke-image.png.base64"
);
const productionWriteConfirmationEnv = "SMOKE_TEST_ALLOW_PRODUCTION_WRITES";
const requiredScopes = [
  "moves/read",
  "moves/write",
  "inventory/read",
  "inventory/write",
  "exports/read",
  "photos/write",
];

export function createSmokeApiConfig(env = process.env) {
  const apiKey = env.SMOKE_TEST_API_KEY ?? env.MOVINGMANIFEST_API_KEY;
  if (!apiKey) return null;

  return {
    baseUrl: (env.MOVINGMANIFEST_API_BASE_URL ?? defaultBaseUrl).replace(/\/+$/g, ""),
    apiKey,
  };
}

export function isProductionSmokeTarget(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return ["movingmanifest.com", "www.movingmanifest.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function productionSmokeWritesAllowed(env = process.env) {
  return ["1", "true", "yes"].includes(
    String(env[productionWriteConfirmationEnv] ?? "").toLowerCase()
  );
}

function unwrapData(response) {
  return response?.data ?? response;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function contextPayload(context) {
  return unwrapData(context) ?? {};
}

function apiKeyScopes(context) {
  const payload = contextPayload(context);
  return payload.apiKey?.scopes ?? payload.key?.scopes ?? [];
}

function apiKeyMoveRestriction(context) {
  const payload = contextPayload(context);
  return (
    Boolean(payload.apiKey?.moveRestricted) ||
    Boolean(payload.apiKey?.moveId) ||
    Boolean(payload.key?.moveRestricted) ||
    Boolean(payload.key?.moveId)
  );
}

function assertRequiredScopes(context) {
  const scopes = new Set(apiKeyScopes(context));
  const missing = requiredScopes.filter((scope) => !scopes.has(scope));
  assert(
    missing.length === 0,
    `Smoke API key is missing required scope(s): ${missing.join(", ")}`
  );
  assert(
    !apiKeyMoveRestriction(context),
    "Smoke API key is move-restricted; use a household-scoped smoke key so setup_move can create a throwaway move."
  );
}

function householdLabel(context) {
  const payload = contextPayload(context);
  return payload.household?.name ?? payload.household?.householdId ?? "household";
}

function smokeTitle(now = new Date()) {
  return `[SMOKE] agent-journey ${now.toISOString()}`;
}

function setupItems() {
  return [
    { name: "Smoke folding table", room: "Garage", disposition: "take" },
    { name: "Smoke blue lamp", room: "Living Room", disposition: "take" },
    { name: "Smoke framed print", room: "Living Room", disposition: "take" },
    { name: "Smoke tool tote", room: "Garage", disposition: "take" },
    { name: "Smoke kitchen bin", room: "Kitchen", disposition: "take" },
  ];
}

function batchItems(runId) {
  return Array.from({ length: 10 }, (_, index) => ({
    externalSource: "agent-journey-smoke",
    externalId: `${runId}-item-${String(index + 1).padStart(2, "0")}`,
    name: `Smoke batch item ${index + 1}`,
    room: index % 2 === 0 ? "Garage" : "Living Room",
    category: index % 3 === 0 ? "tools" : "household",
    disposition: "take",
    quantity: 1,
  }));
}

function assertBatchResult(result, expectedTotal, label) {
  const data = unwrapData(result);
  assert(data?.total === expectedTotal, `${label} expected ${expectedTotal} rows.`);
  assert(data?.failed === 0, `${label} had ${data?.failed ?? "unknown"} failed row(s).`);
  assert(data?.succeeded === expectedTotal, `${label} did not succeed all rows.`);
  return data;
}

function createdItemIds(batchResult) {
  return (batchResult.results ?? [])
    .filter((row) => row.ok && row.itemId)
    .map((row) => row.itemId);
}

async function archiveSmokeMove(api, config, moveId, log) {
  await api.movingManifestRequest(config, {
    method: "DELETE",
    path: `/moves/${moveId}`,
  });
  log(`ARCHIVED smoke move ${moveId}`);
}

async function pollPhotoReady({ api, config, moveId, photoId, timeoutMs, intervalMs, sleep, log }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const summary = await api.getMoveSummary(config, { moveId });
    const photo = (summary.photos ?? []).find((candidate) => candidate.photoId === photoId);
    const status = photo?.derivativeStatus;
    if (status === "ready") return "ready";
    if (status === "failed") throw new Error(`Photo derivatives failed for ${photoId}.`);
    await sleep(intervalMs);
  }
  log(`WARN photo ${photoId} derivatives still pending after ${Math.round(timeoutMs / 1000)}s.`);
  return "pending";
}

export async function runAgentJourneySmoke({
  env = process.env,
  now = new Date(),
  log = console.log,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  derivativeTimeoutMs = 60_000,
  derivativePollMs = 3_000,
  api = {
    addItemsToBox,
    batchUpsertItems,
    createBox,
    getApiContext,
    getMoveSummary,
    movingManifestRequest,
    setupMove,
    uploadEvidenceImage,
  },
} = {}) {
  const config = createSmokeApiConfig(env);
  if (!config) {
    log("SKIP agent journey smoke: set SMOKE_TEST_API_KEY or MOVINGMANIFEST_API_KEY to run.");
    return { status: "skipped", reason: "missing_api_key" };
  }

  if (isProductionSmokeTarget(config.baseUrl) && !productionSmokeWritesAllowed(env)) {
    log(
      `SKIP agent journey smoke: ${config.baseUrl} is production. Set ${productionWriteConfirmationEnv}=true only for an approved throwaway production write.`
    );
    return {
      status: "skipped",
      reason: "production_write_confirmation_required",
    };
  }

  const runId = now.toISOString().replace(/[^0-9A-Za-z]/g, "");
  let moveId;

  try {
    log("STEP 1 verify API key context");
    const context = await api.getApiContext(config);
    assertRequiredScopes(context);
    log(`PASS API key verified for ${householdLabel(context)}`);

    log("STEP 2 setup throwaway smoke move");
    const setup = await api.setupMove(config, {
      title: smokeTitle(now),
      updateExisting: false,
      status: "planning",
      originRooms: ["Garage", "Living Room"],
      destinationRooms: ["Staging"],
      transportResources: [{ type: "truck", name: "Smoke truck" }],
      items: setupItems(),
      idempotencyKey: `agent-journey-smoke-setup-${runId}`,
    });
    const setupData = unwrapData(setup);
    moveId = setupData?.move?.moveId;
    assert(moveId, "setup_move did not return a moveId.");
    assert((setupData.setupResults?.spaces ?? []).length >= 3, "setup_move did not create expected spaces.");
    assert((setupData.setupResults?.resources ?? []).length >= 1, "setup_move did not create a transport resource.");
    assert(
      setupData.setupResults?.items?.succeeded === 5,
      "setup_move did not create the 5 inline items."
    );
    log(`PASS setup_move created ${moveId}`);

    log("STEP 3 batch upsert 10 external-keyed items twice");
    const items = batchItems(runId);
    const firstBatch = assertBatchResult(
      await api.batchUpsertItems(config, { moveId, items }),
      10,
      "First batch_upsert_items"
    );
    const secondBatch = assertBatchResult(
      await api.batchUpsertItems(config, { moveId, items }),
      10,
      "Second batch_upsert_items"
    );
    assert(
      secondBatch.results.every((row) => row.action === "update"),
      "Second batch_upsert_items was not idempotent by external key."
    );
    const packItemIds = createdItemIds(firstBatch).slice(0, 5);
    assert(packItemIds.length === 5, "Batch result did not return 5 item IDs to pack.");
    log("PASS batch_upsert_items created then idempotently updated 10 rows");

    log("STEP 4 upload and attach evidence photo");
    const fixtureBase64 = (await readFile(fixturePath, "utf8")).trim();
    const photo = await api.uploadEvidenceImage(config, {
      moveId,
      itemId: packItemIds[0],
      fileBase64: fixtureBase64,
      fileName: "agent-journey-smoke.png",
      mimeType: "image/png",
      room: "Garage",
      caption: "Smoke-test evidence image",
      photoType: "item",
      privacyLevel: "normal",
      visibilityScope: "moveCollaborators",
      idempotencyKey: `agent-journey-smoke-photo-${runId}`,
    });
    assert(photo.photoId, "upload_photo did not return a photoId.");
    await pollPhotoReady({
      api,
      config,
      moveId,
      photoId: photo.photoId,
      timeoutMs: derivativeTimeoutMs,
      intervalMs: derivativePollMs,
      sleep,
      log,
    });
    log(`PASS uploaded evidence photo ${photo.photoId}`);

    log("STEP 5 create box and pack 5 items");
    const boxCode = `SMOKE-${runId.slice(-8)}`;
    const box = await api.createBox(config, {
      moveId,
      code: boxCode,
      label: "Smoke packed box",
      room: "Garage",
      destinationRoom: "Staging",
      idempotencyKey: `agent-journey-smoke-box-${runId}`,
    });
    const boxData = unwrapData(box);
    assert(boxData?.boxId, "create_box did not return a boxId.");
    const boxItems = await api.addItemsToBox(config, {
      moveId,
      boxId: boxData.boxId,
      idempotencyKey: `agent-journey-smoke-pack-${runId}`,
      items: packItemIds.map((itemId) => ({ itemId, quantity: 1 })),
    });
    const packedRows = unwrapData(boxItems);
    assert(Array.isArray(packedRows), "add_items_to_box did not return row results.");
    assert(packedRows.length === 5, "add_items_to_box did not pack 5 items.");
    log(`PASS packed 5 items into ${boxCode}`);

    log("STEP 6 read summary");
    const summary = await api.getMoveSummary(config, { moveId });
    assert((summary.counts?.items ?? 0) >= 15, "Move summary item count did not include smoke items.");
    assert((summary.counts?.boxes ?? 0) >= 1, "Move summary box count did not include smoke box.");
    assert((summary.counts?.photos ?? 0) >= 1, "Move summary photo count did not include smoke photo.");
    log("PASS summary reflected smoke move contents");

    return { status: "passed", moveId };
  } finally {
    if (moveId) {
      try {
        await archiveSmokeMove(api, config, moveId, log);
      } catch (error) {
        log(`CLEANUP FAILED for smoke move ${moveId}: ${error.message}`);
      }
    }
  }
}

async function main() {
  const result = await runAgentJourneySmoke();
  if (result.status === "passed") {
    console.log(`PASS agent journey smoke completed for ${result.moveId}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
