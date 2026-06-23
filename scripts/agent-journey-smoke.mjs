import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  addBoxItemFromPhoto,
  addItemsToBox,
  appendItemNote,
  approveAiTextSuggestions,
  applyAssignments,
  batchAddBoxContents,
  batchUpsertItems,
  batchUpsertMovableUnits,
  claimIngestionQueue,
  createBox,
  createIngestionQueueEntry,
  getApiContext,
  getIngestionQueueEvidenceMedia,
  getMoveSummary,
  getPhotoDisplayUrl,
  movingManifestRequest,
  setupMove,
  submitIngestionQueueResults,
  updateItem,
  uploadEvidenceImage,
  uploadEvidenceImages,
} from "../mcp-server/movingmanifest-api.mjs";

const defaultBaseUrl = "https://movingmanifest.com/api/v1";
const fixturePath = path.resolve(process.cwd(), "tests/fixtures/smoke-image.png.base64");
const requiredScopes = [
  "moves/read",
  "moves/write",
  "inventory/read",
  "inventory/write",
  "photos/write",
];
const productionWriteConfirmationEnv = "SMOKE_TEST_ALLOW_PRODUCTION_WRITES";

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
    payload.apiKey?.moveRestricted ??
    payload.apiKey?.moveId ??
    payload.key?.moveRestricted ??
    payload.key?.moveId ??
    false
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
  return Array.from({ length: 10 }, (_, index) => {
    const item = {
      externalSource: "agent-journey-smoke",
      externalId: `${runId}-item-${String(index + 1).padStart(2, "0")}`,
      name: `Smoke batch item ${index + 1}`,
      room: index % 2 === 0 ? "Garage" : "Living Room",
      category: index % 3 === 0 ? "tools" : "household",
      disposition: "take",
      quantity: 1,
    };
    if (index === 5) {
      return {
        ...item,
        name: "Smoke loose sofa",
        room: "Living Room",
        category: "furniture",
        estimatedWeightLb: 80,
        weightConfidence: "low",
        dimensionsIn: { lengthIn: 84, widthIn: 36, heightIn: 32 },
        volumeConfidence: "low",
      };
    }
    if (index !== 0) return item;
    return {
      ...item,
      researchSummary: "Smoke batch row keeps append-safe research provenance.",
      researchSources: [
        {
          title: "Smoke batch source",
          url: "https://example.com/movingmanifest-agent-journey-batch",
          status: "checked",
          summary: "Exercises batch_upsert_items research source preservation.",
        },
      ],
      researchConfidence: "low",
      researchSourceMode: "append",
    };
  });
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

function setupSpaceId(setupData, name, kind) {
  const spaces = setupData?.setupResults?.spaces ?? [];
  return spaces.find((space) => space?.name === name && space?.kind === kind)?.spaceId;
}

async function archiveSmokeMove(api, config, moveId, log) {
  await api.movingManifestRequest(config, {
    method: "PATCH",
    path: `/moves/${moveId}`,
    body: { status: "archived" },
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

async function verifyPhotoDisplayUrl({ api, config, moveId, photoId, fetchUrl }) {
  const response = await api.getPhotoDisplayUrl(config, {
    moveId,
    photoId,
    variant: "detail",
  });
  const data = unwrapData(response);
  assert(data?.url, "get_photo_display_url did not return a URL.");
  assert(data.expiresAt > Date.now(), "get_photo_display_url returned an expired URL.");
  const fetchResponse = await fetchUrl(data.url, {
    method: "GET",
    headers: { Range: "bytes=0-0" },
  });
  assert(
    fetchResponse.ok || fetchResponse.status === 206,
    `Photo display URL was not fetchable: HTTP ${fetchResponse.status}.`
  );
  return data;
}

export async function runAgentJourneySmoke({
  env = process.env,
  now = new Date(),
  log = console.log,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  fetchUrl = fetch,
  derivativeTimeoutMs = 60_000,
  derivativePollMs = 3_000,
  api = {
    addBoxItemFromPhoto,
    addItemsToBox,
    appendItemNote,
    applyAssignments,
    approveAiTextSuggestions,
    batchAddBoxContents,
    batchUpsertItems,
    batchUpsertMovableUnits,
    claimIngestionQueue,
    createBox,
    createIngestionQueueEntry,
    getApiContext,
    getIngestionQueueEvidenceMedia,
    getMoveSummary,
    getPhotoDisplayUrl,
    movingManifestRequest,
    setupMove,
    submitIngestionQueueResults,
    updateItem,
    uploadEvidenceImage,
    uploadEvidenceImages,
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
  let fixtureBase64;
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
    const transportResourceId = setupData.setupResults?.resources?.[0]?.resourceId;
    assert(moveId, "setup_move did not return a moveId.");
    assert((setupData.setupResults?.spaces ?? []).length >= 3, "setup_move did not create expected spaces.");
    assert((setupData.setupResults?.resources ?? []).length >= 1, "setup_move did not create a transport resource.");
    assert(transportResourceId, "setup_move did not return a transport resourceId.");
    assert(
      setupData.setupResults?.items?.succeeded === 5,
      "setup_move did not create the 5 inline items."
    );
    const garageSpaceId = setupSpaceId(setupData, "Garage", "originRoom");
    const stagingSpaceId = setupSpaceId(setupData, "Staging", "destinationRoom");
    assert(garageSpaceId, "setup_move did not return the Garage origin spaceId.");
    assert(stagingSpaceId, "setup_move did not return the Staging destination spaceId.");
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
    const createdIds = createdItemIds(firstBatch);
    const packItemIds = createdIds.slice(0, 5);
    const looseFurnitureItemId = createdIds[5];
    assert(packItemIds.length === 5, "Batch result did not return 5 item IDs to pack.");
    assert(
      looseFurnitureItemId,
      "Batch result did not return a loose furniture item ID for direct load assignment."
    );
    log("PASS batch_upsert_items created then idempotently updated 10 rows");

    log("STEP 4 update item details, append a note, and add follow-up photos");
    fixtureBase64 = (await readFile(fixturePath, "utf8")).trim();
    await api.updateItem(config, {
      moveId,
      itemId: packItemIds[0],
      currentSpaceId: garageSpaceId,
      destinationSpaceId: stagingSpaceId,
      estimatedWeightLb: 12,
      weightConfidence: "low",
      estimatedVolumeCuFt: 3,
      volumeConfidence: "low",
      requiresPersonalTransport: true,
      researchSummary:
        "Smoke-test update proving agents can enrich existing item records.",
      researchSources: [
        {
          title: "Smoke source check",
          url: "https://example.com/movingmanifest-agent-journey-smoke",
          summary:
            "Synthetic source row proving agent research sources survive item follow-up updates.",
          status: "checked",
          checkedAt: now.getTime(),
        },
      ],
      researchNotes:
        "Smoke-test researched follow-up uses MCP update_item source append/merge semantics.",
      researchConfidence: "low",
      idempotencyKey: `agent-journey-smoke-research-${runId}`,
    });
    await api.appendItemNote(config, {
      moveId,
      itemId: packItemIds[0],
      note: "Smoke-test appended note after initial item creation.",
      label: "agent-journey-smoke",
      idempotencyKey: `agent-journey-smoke-note-${runId}`,
    });
    const extraPhotos = await api.uploadEvidenceImages(config, {
      moveId,
      itemId: packItemIds[0],
      room: "Garage",
      photoType: "item",
      privacyLevel: "normal",
      visibilityScope: "moveCollaborators",
      idempotencyKey: `agent-journey-smoke-extra-photos-${runId}`,
      images: [
        {
          fileBase64: fixtureBase64,
          fileName: "agent-journey-smoke-extra.png",
          mimeType: "image/png",
          caption: "Smoke-test follow-up item photo",
        },
      ],
    });
    assert(
      extraPhotos.uploadedCount === 1,
      "upload_photos did not attach the follow-up item photo."
    );
    log("PASS updated item details, appended a note, and uploaded a follow-up photo");

    log("STEP 5 upsert rough movable units and open one rough box");
    const countedBoxDryRun = unwrapData(
      await api.batchUpsertMovableUnits(config, {
        moveId,
        dryRun: true,
        units: [
          {
            kind: "box",
            count: 2,
            label: "Smoke counted garage boxes",
            room: "Garage",
            destinationSpaceId: stagingSpaceId,
            estimatedWeightLb: 24,
            dimensionsIn: { lengthIn: 18, widthIn: 16, heightIn: 12 },
          },
        ],
      })
    );
    assert(
      countedBoxDryRun?.dryRun === true,
      "batch_upsert_movable_units counted-box dry run did not report dryRun true."
    );
    assert(
      countedBoxDryRun?.summary?.boxes === 2,
      "batch_upsert_movable_units counted-box dry run did not expand two boxes."
    );
    assert(
      countedBoxDryRun?.requests?.[0]?.unitCountIndex === 0 &&
        countedBoxDryRun?.requests?.[1]?.unitCountIndex === 1 &&
        countedBoxDryRun?.requests?.[0]?.unitCount === 2 &&
        countedBoxDryRun?.requests?.[1]?.unitCount === 2,
      "batch_upsert_movable_units counted-box dry run did not preserve count row mapping."
    );

    const countedBoxes = unwrapData(
      await api.batchUpsertMovableUnits(config, {
        moveId,
        idempotencyKey: `agent-journey-smoke-counted-boxes-${runId}`,
        units: [
          {
            kind: "box",
            count: 2,
            label: "Smoke counted garage boxes",
            room: "Garage",
            destinationSpaceId: stagingSpaceId,
            estimatedWeightLb: 24,
            dimensionsIn: { lengthIn: 18, widthIn: 16, heightIn: 12 },
          },
        ],
      })
    );
    assert(
      countedBoxes?.summary?.boxes === 2,
      "batch_upsert_movable_units counted-box live write did not create two boxes."
    );
    assert(
      (countedBoxes?.boxes ?? []).length === 2 &&
        countedBoxes.boxes.every((row) => row.boxId),
      "batch_upsert_movable_units counted-box live write did not return two box IDs."
    );
    assert(
      countedBoxes.boxes[0]?.unitCountIndex === 0 &&
        countedBoxes.boxes[1]?.unitCountIndex === 1 &&
        countedBoxes.boxes[0]?.unitCount === 2 &&
        countedBoxes.boxes[1]?.unitCount === 2,
      "batch_upsert_movable_units counted-box live write did not preserve count row mapping."
    );

    const roughBoxCode = `ROUGH-${runId.slice(-8)}`;
    const roughMovableUnits = unwrapData(
      await api.batchUpsertMovableUnits(config, {
        moveId,
        idempotencyKey: `agent-journey-smoke-movable-units-${runId}`,
        units: [
          {
            kind: "box",
            code: roughBoxCode,
            label: "Smoke rough garage box",
            room: "Garage",
            destinationSpaceId: stagingSpaceId,
            status: "packing",
            estimatedWeightLb: 22,
            dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
            assignedResourceId: transportResourceId,
            assignmentOverrideReason: "Smoke test reviewed rough box load assignment.",
          },
          {
            kind: "looseItem",
            externalSource: "agent-journey-smoke",
            externalId: `${runId}-rough-treadmill`,
            name: "Smoke rough treadmill",
            room: "Garage",
            category: "fitness equipment",
            destinationSpaceId: stagingSpaceId,
            estimatedWeightLb: 180,
            dimensionsIn: { lengthIn: 72, widthIn: 34, heightIn: 58 },
            assignedResourceId: transportResourceId,
            assignmentOverrideReason:
              "Smoke test reviewed rough loose-item load assignment.",
          },
        ],
      })
    );
    assert(
      roughMovableUnits?.summary?.totalUnits === 2,
      "batch_upsert_movable_units did not report two rough movable units."
    );
    assert(
      roughMovableUnits?.summary?.boxes === 1,
      "batch_upsert_movable_units did not report one rough box."
    );
    assert(
      roughMovableUnits?.summary?.looseItems === 1,
      "batch_upsert_movable_units did not report one rough loose item."
    );
    const roughBoxId = roughMovableUnits?.boxes?.[0]?.boxId;
    const roughLooseItemId = roughMovableUnits?.looseItems?.[0]?.itemId;
    assert(roughBoxId, "batch_upsert_movable_units did not return the rough boxId.");
    assert(
      roughLooseItemId,
      "batch_upsert_movable_units did not return the rough loose itemId."
    );

    const roughContents = await api.batchAddBoxContents(config, {
      moveId,
      boxId: roughBoxId,
      boxCode: roughBoxCode,
      idempotencyKey: `agent-journey-smoke-open-box-contents-${runId}`,
      items: [
        {
          externalSource: "agent-journey-smoke-open-box",
          externalId: `${runId}-rough-box-hand-tools`,
          name: "Smoke rough box hand tools",
          room: "Garage",
          category: "tools",
          quantity: 4,
          boxQuantity: 4,
          boxItemNotes: "Smoke-test bulk contents added while opening a rough box.",
        },
        {
          externalSource: "agent-journey-smoke-open-box",
          externalId: `${runId}-rough-box-extension-cords`,
          name: "Smoke rough box extension cords",
          room: "Garage",
          category: "electrical",
          quantity: 2,
          boxQuantity: 2,
        },
      ],
    });
    assert(
      roughContents?.packedCount === 2,
      "batch_add_box_contents did not pack two rough box contents."
    );
    assert(
      (roughContents?.skipped ?? []).length === 0,
      "batch_add_box_contents skipped at least one rough box content row."
    );

    const photoBoxItem = await api.addBoxItemFromPhoto(config, {
      moveId,
      boxId: roughBoxId,
      boxCode: roughBoxCode,
      name: "Smoke photo-backed box item",
      room: "Garage",
      category: "box contents",
      quantity: 1,
      fileBase64: fixtureBase64,
      fileName: "agent-journey-smoke-box-item.png",
      mimeType: "image/png",
      caption: "Smoke-test box content photo",
      photoType: "item",
      privacyLevel: "normal",
      visibilityScope: "moveCollaborators",
      boxItemNotes: "Smoke-test photo item added while opening a rough box.",
      idempotencyKey: `agent-journey-smoke-open-box-photo-${runId}`,
    });
    assert(photoBoxItem?.itemId, "add_box_item_from_photo did not return an itemId.");
    log(
      `PASS rough box ${roughBoxCode} accepted bulk contents and a photo-backed item`
    );

    log("STEP 6 upload queue evidence photo");
    const photo = await api.uploadEvidenceImage(config, {
      moveId,
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
    const derivativeStatus = await pollPhotoReady({
      api,
      config,
      moveId,
      photoId: photo.photoId,
      timeoutMs: derivativeTimeoutMs,
      intervalMs: derivativePollMs,
      sleep,
      log,
    });
    if (derivativeStatus === "ready") {
      const displayUrl = await verifyPhotoDisplayUrl({
        api,
        config,
        moveId,
        photoId: photo.photoId,
        fetchUrl,
      });
      log(`PASS display URL served ${displayUrl.servedVariant ?? "detail"} derivative`);
    }

    log("STEP 7 create, claim, inspect, and commit an ingestion queue entry");
    const queueEntry = await api.createIngestionQueueEntry(config, {
      moveId,
      instructions:
        "Create one inventory item from this smoke-test photo and preserve evidence.",
      roomHint: "Garage",
      scopeHint: "inventory",
      mediaPhotoIds: [photo.photoId],
      idempotencyKey: `agent-journey-smoke-queue-${runId}`,
    });
    const entryId = unwrapData(queueEntry)?.entryId;
    assert(entryId, "ingestion_queue create did not return an entryId.");

    const claimed = unwrapData(
      await api.claimIngestionQueue(config, {
        moveId,
        batchSize: 1,
        agentLabel: "agent-journey-smoke",
        scopeHint: "inventory",
        idempotencyKey: `agent-journey-smoke-claim-${runId}`,
      })
    );
    assert(
      Array.isArray(claimed) && claimed.some((entry) => entry.entryId === entryId),
      "ingestion_queue claim did not return the created entry."
    );

    const evidenceMedia = await api.getIngestionQueueEvidenceMedia(config, {
      moveId,
      entryId,
      photoIds: [photo.photoId],
      variant: "detail",
    });
    assert(
      Array.isArray(evidenceMedia.content) &&
        evidenceMedia.content.some((block) => block.type === "image"),
      "ingestion_queue action=media did not return an image content block."
    );

    const queueResult = unwrapData(
      await api.submitIngestionQueueResults(config, {
        moveId,
        entryId,
        idempotencyKey: `agent-journey-smoke-queue-results-${runId}`,
        agentSummary:
          "Created one smoke inventory item, packed it, and assigned the box from queue evidence after fetching MCP media.",
        committedItems: [
          {
            externalSource: "agent-journey-smoke",
            externalId: `${runId}-queue-photo-item`,
            name: "Smoke queue photo item",
            room: "Garage",
            currentSpaceId: garageSpaceId,
            destinationSpaceId: stagingSpaceId,
            disposition: "take",
            quantity: 1,
            estimatedWeightLb: 5,
            weightConfidence: "low",
            researchSummary:
              "Smoke-test item created from queue image evidence fetched through MCP media blocks.",
            researchConfidence: "low",
            attachMediaPhotoIds: [photo.photoId],
            appendNote:
              "Original queue capture note preserved on the committed item during submitResults.",
            appendNoteLabel: "Agent journey smoke",
          },
        ],
        committedBoxes: [
          {
            code: `QUEUE-${runId.slice(-8)}`,
            label: "Smoke queue packed box",
            room: "Garage",
            destinationSpaceId: stagingSpaceId,
            dimensionsIn: { lengthIn: 18, widthIn: 12, heightIn: 12 },
            estimatedWeightLb: 5,
          },
        ],
        boxAssignments: [
          {
            boxCode: `QUEUE-${runId.slice(-8)}`,
            externalSource: "agent-journey-smoke",
            externalId: `${runId}-queue-photo-item`,
            quantity: 1,
            notes: "Smoke-test queue item packed in the same submitResults call.",
          },
        ],
        loadAssignments: [
          {
            boxCode: `QUEUE-${runId.slice(-8)}`,
            assignedResourceId: transportResourceId,
            overrideReason: "Smoke test reviewed deterministic queue assignment.",
          },
        ],
      })
    );
    assert(
      (queueResult?.committedItemIds ?? []).length === 1,
      "ingestion_queue submitResults did not create one committed item."
    );
    assert(
      (queueResult?.committedBoxIds ?? []).length === 1,
      "ingestion_queue submitResults did not create one committed box."
    );
    assert(
      (queueResult?.boxAssignmentIds ?? []).length === 1,
      "ingestion_queue submitResults did not pack the committed item into the committed box."
    );
    assert(
      (queueResult?.loadAssignmentBoxIds ?? []).length === 1,
      "ingestion_queue submitResults did not assign the committed box to transport."
    );
    log(
      `PASS queue entry ${entryId} fetched media and committed item, box, packing, and transport`
    );

    log("STEP 8 submit and approve a review-first queue proposal");
    const reviewPhoto = await api.uploadEvidenceImage(config, {
      moveId,
      fileBase64: fixtureBase64,
      fileName: "agent-journey-smoke-review.png",
      mimeType: "image/png",
      room: "Garage",
      caption: "Smoke-test review-first queue evidence image",
      photoType: "item",
      privacyLevel: "normal",
      visibilityScope: "moveCollaborators",
      idempotencyKey: `agent-journey-smoke-review-photo-${runId}`,
    });
    assert(reviewPhoto.photoId, "review-first upload_photo did not return a photoId.");
    await pollPhotoReady({
      api,
      config,
      moveId,
      photoId: reviewPhoto.photoId,
      timeoutMs: derivativeTimeoutMs,
      intervalMs: derivativePollMs,
      sleep,
      log,
    });
    const reviewQueueEntry = await api.createIngestionQueueEntry(config, {
      moveId,
      instructions:
        "Propose one inventory item from this smoke-test photo for human review.",
      roomHint: "Garage",
      scopeHint: "inventory",
      mediaPhotoIds: [reviewPhoto.photoId],
      idempotencyKey: `agent-journey-smoke-review-queue-${runId}`,
    });
    const reviewEntryId = unwrapData(reviewQueueEntry)?.entryId;
    assert(reviewEntryId, "review-first ingestion_queue create did not return an entryId.");
    await api.claimIngestionQueue(config, {
      moveId,
      batchSize: 1,
      agentLabel: "agent-journey-smoke",
      scopeHint: "inventory",
      idempotencyKey: `agent-journey-smoke-review-claim-${runId}`,
    });
    await api.getIngestionQueueEvidenceMedia(config, {
      moveId,
      entryId: reviewEntryId,
      photoIds: [reviewPhoto.photoId],
      variant: "detail",
    });
    const reviewResult = unwrapData(
      await api.submitIngestionQueueResults(config, {
        moveId,
        entryId: reviewEntryId,
        idempotencyKey: `agent-journey-smoke-review-results-${runId}`,
        agentSummary:
          "Submitted one researched queue item as a review-first proposal.",
        proposedItems: [
          {
            name: "Smoke review queue item",
            room: "Garage",
            currentSpaceId: garageSpaceId,
            destinationSpaceId: stagingSpaceId,
            disposition: "take",
            quantity: 1,
            estimatedWeightLb: 6,
            weightConfidence: "low",
            researchSummary:
              "Smoke-test review proposal preserving research and queue media through approval.",
            researchConfidence: "low",
            attachMediaPhotoIds: [reviewPhoto.photoId],
          },
        ],
      })
    );
    const reviewSuggestionId = reviewResult?.suggestionIds?.[0];
    assert(reviewSuggestionId, "review-first queue submitResults did not return a suggestionId.");
    const approval = unwrapData(
      await api.approveAiTextSuggestions(config, {
        moveId,
        approvals: [{ suggestionId: reviewSuggestionId }],
      })
    );
    const approvedReviewItemId = approval?.createdItemIds?.[0];
    assert(
      approvedReviewItemId,
      "approve_ai_suggestions did not create an item from the review-first queue proposal."
    );
    log(
      `PASS review-first queue proposal ${reviewSuggestionId} approved into ${approvedReviewItemId}`
    );

    log("STEP 9 create a box, pack 5 items, and assign transport");
    const boxResponse = await api.createBox(config, {
      moveId,
      code: `SMOKE-${runId.slice(-8)}`,
      label: "Smoke packed box",
      room: "Garage",
      destinationSpaceId: stagingSpaceId,
      status: "packing",
    });
    const boxId = unwrapData(boxResponse)?.boxId;
    assert(boxId, "create_box did not return a boxId.");
    const assignments = await api.addItemsToBox(config, {
      moveId,
      boxId,
      items: packItemIds.map((itemId) => ({ itemId, quantity: 1 })),
    });
    const assignmentRows = unwrapData(assignments);
    assert(Array.isArray(assignmentRows), "add_items_to_box did not return assignment rows.");
    assert(assignmentRows.length === 5, "add_items_to_box did not assign 5 items.");
    if (transportResourceId) {
      const loadAssignments = unwrapData(
        await api.applyAssignments(config, {
          moveId,
          idempotencyKey: `agent-journey-smoke-load-${runId}`,
          assignments: [
            {
              boxId,
              assignedResourceId: transportResourceId,
              overrideReason: "Smoke test reviewed deterministic assignment.",
            },
          ],
        })
      );
      assert(
        (loadAssignments?.failed ?? 0) === 0,
        "apply_assignments failed the smoke box transport assignment."
      );
    }
    log(`PASS packed ${assignmentRows.length} items into ${boxId} and assigned transport`);

    log("STEP 10 assign loose furniture transport directly");
    const looseLoadAssignments = unwrapData(
      await api.applyAssignments(config, {
        moveId,
        idempotencyKey: `agent-journey-smoke-loose-load-${runId}`,
        assignments: [
          {
            itemId: looseFurnitureItemId,
            assignedResourceId: transportResourceId,
            overrideReason: "Smoke test reviewed direct loose-item assignment.",
          },
        ],
      })
    );
    assert(
      (looseLoadAssignments?.failed ?? 0) === 0,
      "apply_assignments failed the loose furniture item transport assignment."
    );
    log(`PASS assigned loose furniture item ${looseFurnitureItemId} directly`);

    log("STEP 11 read summary and verify created counts");
    const summary = await api.getMoveSummary(config, { moveId });
    assert((summary.counts?.items ?? summary.items?.length ?? 0) >= 21, "summary does not include expected item count.");
    assert((summary.counts?.boxes ?? summary.boxes?.length ?? 0) >= 5, "summary does not include expected box count.");
    assert((summary.counts?.photos ?? summary.photos?.length ?? 0) >= 4, "summary does not include expected photo count.");
    const movableSummary = summary.movableUnitSummary;
    assert(
      movableSummary?.total >= 7,
      "summary does not include expected rough movable-unit count."
    );
    assert(
      movableSummary?.boxes >= 5,
      "summary does not include expected movable-unit boxes."
    );
    assert(
      movableSummary?.looseItems >= 2,
      "summary does not include expected loose movable units."
    );
    assert(
      movableSummary?.assigned >= 5,
      "summary does not include expected assigned movable units."
    );
    assert(
      movableSummary?.unassigned >= 1,
      "summary does not include expected unassigned movable units for follow-up planning."
    );
    assert(
      Array.isArray(movableSummary?.measurementRoute),
      "summary does not expose movableUnitSummary.measurementRoute."
    );
    assert(
      (movableSummary.measurementRoute ?? []).some(
        (group) => group.roomLabel === "Garage" && group.unassigned >= 1
      ),
      "summary measurementRoute does not point the agent at the remaining garage rough-unit follow-up."
    );
    const approvedReviewPhoto = (summary.photos ?? []).find(
      (candidate) => candidate.photoId === reviewPhoto.photoId
    );
    if (approvedReviewPhoto) {
      assert(
        approvedReviewPhoto.itemId === approvedReviewItemId,
        "review-first approved queue photo was not attached to the approved item."
      );
    }
    log(
      "PASS summary verified smoke-created items, boxes, queue photos, and rough movable units"
    );

    return { status: "passed", moveId };
  } finally {
    if (moveId) {
      try {
        await archiveSmokeMove(api, config, moveId, log);
      } catch (error) {
        log(`FAIL cleanup could not archive smoke move ${moveId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

async function runCli() {
  const result = await runAgentJourneySmoke();
  if (result.status === "skipped") return;
  if (result.status !== "passed") process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await runCli();
}
