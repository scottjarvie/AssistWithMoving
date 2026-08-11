import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import {
  downloadPublicHttpsMedia,
  parseAllowedFileRoots,
  readAllowedLocalMedia,
} from "./media-ingress.mjs";

export { getApiCapabilities } from "./capabilities.mjs";

export const movingManifestImageDerivativeVariants = [
  {
    variant: "thumb",
    mimeType: "image/webp",
    width: 200,
    height: 200,
    fit: "cover",
  },
  {
    variant: "card",
    mimeType: "image/webp",
    width: 600,
    height: 600,
    fit: "inside",
  },
  {
    variant: "detail",
    mimeType: "image/webp",
    width: 1200,
    height: 1200,
    fit: "inside",
  },
  {
    variant: "full",
    mimeType: "image/webp",
    width: 2400,
    height: 2400,
    fit: "inside",
  },
];

export function createApiConfig(env = process.env) {
  const baseUrl =
    env.MOVINGMANIFEST_API_BASE_URL ?? "https://movingmanifest.com/api/v1";
  const apiKey = env.MOVINGMANIFEST_API_KEY;
  if (!apiKey) {
    throw new Error("MOVINGMANIFEST_API_KEY is required.");
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/g, ""),
    apiKey,
    mediaIngress: {
      transport: "stdio",
      allowedFileRoots: parseAllowedFileRoots(
        env.MOVINGMANIFEST_MCP_ALLOWED_FILE_ROOTS,
      ),
    },
  };
}

export async function movingManifestRequest(
  config,
  { method = "GET", path, query, body, idempotencyKey }
) {
  const url = new URL(`${config.baseUrl}/${path.replace(/^\/+/g, "")}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = {
    authorization: `Bearer ${config.apiKey}`,
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(removeUndefined(body));
  }
  if (method !== "GET") {
    headers["idempotency-key"] = idempotencyKey ?? randomUUID();
  }

  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload?.error?.message
        ? payload.error.message
        : `MovingManifest API request failed with ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function movingManifestBinaryRequest(
  config,
  { method = "POST", path, query, bytes, mimeType, fileName, idempotencyKey }
) {
  const url = new URL(`${config.baseUrl}/${path.replace(/^\/+/g, "")}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = {
    authorization: `Bearer ${config.apiKey}`,
    "content-type": mimeType,
    "content-length": String(bytes.byteLength),
  };
  if (fileName) {
    headers["x-movingmanifest-file-name"] = fileName;
  }
  if (method !== "GET") {
    headers["idempotency-key"] = idempotencyKey ?? randomUUID();
  }

  const response = await fetch(url, {
    method,
    headers,
    body: bytes,
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload?.error?.message
        ? payload.error.message
        : `MovingManifest API request failed with ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

// ---- inline image reading --------------------------------------------------
// Sign a short-lived display URL for one photo (MOVE-317 REST endpoint).
export async function getPhotoDisplayUrl(config, { moveId, photoId, variant }) {
  return movingManifestRequest(config, {
    method: "GET",
    path: `moves/${moveId}/photos/${photoId}/display-url`,
    query: { variant },
  });
}

// Fetch image bytes server-side and return them base64-encoded. The MCP SERVER
// reaches the image host (B2/Cloudflare) here, so the model never has to — the
// bytes ride the MCP transport as a native image, sidestepping any client-side
// egress allowlist.
export async function fetchImageAsBase64(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image fetch failed (${response.status}).`);
  }
  const mimeType =
    response.headers.get("content-type")?.split(";")[0]?.trim() || "image/webp";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { base64: buffer.toString("base64"), mimeType, bytes: buffer.byteLength };
}

function describePhotoAttachment(photo) {
  if (!photo) return null;
  if (photo.itemId) return { kind: "item", id: photo.itemId };
  if (photo.boxId) return { kind: "box", id: photo.boxId };
  if (photo.spaceId) return { kind: "space", id: photo.spaceId };
  if (photo.transportResourceId)
    return { kind: "transport", id: photo.transportResourceId };
  if (photo.transportZoneId)
    return { kind: "transportZone", id: photo.transportZoneId };
  if (photo.room) return { kind: "room", id: photo.room };
  return null;
}

const inlineImageVariants = ["thumb", "card", "detail", "full"];

// Resolve a photo set (by filter or explicit photoIds), then fetch each as
// base64. Returns pure data; the tool layer turns it into MCP image blocks.
export async function getInlineImages(config, input) {
  const moveId = input?.moveId;
  if (!moveId) throw new Error("moveId is required.");
  const variant = inlineImageVariants.includes(input?.variant)
    ? input.variant
    : "detail";
  const limit = Math.min(Math.max(Number(input?.limit) || 4, 1), 8);

  let selected = [];
  if (Array.isArray(input?.photoIds) && input.photoIds.length > 0) {
    selected = input.photoIds.slice(0, limit).map((photoId) => ({ photoId }));
  } else {
    const listing = await movingManifestRequest(config, {
      method: "GET",
      path: `moves/${moveId}/photos`,
      query: { limit: "250" },
    });
    const all = Array.isArray(listing?.data) ? listing.data : [];
    const match = (photo) => {
      if (input?.itemId) return photo.itemId === input.itemId;
      if (input?.boxId) return photo.boxId === input.boxId;
      if (input?.spaceId) return photo.spaceId === input.spaceId;
      if (input?.transportResourceId)
        return photo.transportResourceId === input.transportResourceId;
      if (input?.transportZoneId)
        return photo.transportZoneId === input.transportZoneId;
      if (input?.room) return photo.room === input.room;
      return true; // all
    };
    selected = all.filter(match).slice(0, limit);
  }

  const images = [];
  for (const photo of selected) {
    try {
      const urlResponse = await getPhotoDisplayUrl(config, {
        moveId,
        photoId: photo.photoId,
        variant,
      });
      const info = urlResponse?.data ?? urlResponse ?? {};
      if (!info.url) throw new Error("No display URL returned.");
      const fetched = await fetchImageAsBase64(info.url);
      images.push({
        photoId: photo.photoId,
        caption: photo.caption ?? null,
        attachedTo: describePhotoAttachment(photo),
        mimeType: fetched.mimeType || info.mimeType || "image/webp",
        servedVariant: info.servedVariant ?? variant,
        width: info.width ?? null,
        height: info.height ?? null,
        bytes: fetched.bytes,
        base64: fetched.base64,
      });
    } catch (error) {
      images.push({
        photoId: photo.photoId,
        error: error instanceof Error ? error.message : "Failed to load image.",
      });
    }
  }
  return { moveId, variant, requested: selected.length, images };
}

export function textResult(data) {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function toolErrorResult(error) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: error instanceof Error ? error.message : "Tool failed.",
            status: error?.status,
            details: error?.payload,
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function getApiContext(config) {
  return await movingManifestRequest(config, {
    path: "/me",
  });
}

export async function listHouseholdMembers(config, input) {
  const response = await movingManifestRequest(config, {
    path: `/households/${input.householdId}/members`,
  });
  return response.data;
}

export async function addHouseholdMember(config, input) {
  const body = {
    email: input.email,
    role: input.role,
  };
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/households/${input.householdId}/members`,
        body,
      },
      note: "If the target email does not have an account yet, MovingManifest creates a pending invitation that activates when they sign in with that email.",
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/households/${input.householdId}/members`,
    body,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function listMoves(config, input = {}) {
  return await movingManifestRequest(config, {
    path: "/moves",
    query: { limit: input.limit },
  });
}

export async function createMove(config, input) {
  if (input.dryRun) {
    return { dryRun: true, request: { method: "POST", path: "/moves", body: input } };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: "/moves",
    body: input,
  });
}

export async function setupMove(config, input) {
  const { idempotencyKey, ...body } = input;
  if (input.dryRun) {
    return {
      dryRun: true,
      request: { method: "POST", path: "/moves/setup", body },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: "/moves/setup",
    body,
    idempotencyKey,
  });
}

// Update an existing move's basics — name, status, route, dates, driving
// distance + travel time (MOVE-308). Mirrors the OAuth-gateway update_move tool
// over the REST PATCH /moves/{moveId} endpoint.
export async function updateMove(config, input) {
  const { moveId, idempotencyKey, dryRun, ...body } = input;
  if (!moveId) {
    throw new Error("moveId is required to update a move.");
  }
  if (dryRun) {
    return {
      dryRun: true,
      request: { method: "PATCH", path: `/moves/${moveId}`, body },
    };
  }
  return await movingManifestRequest(config, {
    method: "PATCH",
    path: `/moves/${moveId}`,
    body,
    idempotencyKey,
  });
}

export async function getMoveSummary(config, input) {
  const response = await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/summary`,
  });
  return response.data;
}

export async function getAgentContext(config, input) {
  const response = await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/agent-context`,
  });
  return response.data;
}

export async function getMoveQuestions(config, input) {
  const response = await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/questions`,
  });
  return response.data;
}

export async function getMoveDayChecklist(config, input) {
  const response = await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/move-day`,
    query: {
      filter: input.filter,
      query: input.query,
      limit: input.limit,
      cursor: input.cursor,
    },
  });
  return response.data;
}

export async function plansList(config, input = {}) {
  return await movingManifestRequest(config, {
    path: "/plans",
    query: {
      moveId: input.moveId,
      limit: input.limit,
      cursor: input.cursor,
    },
  });
}

export async function planGet(config, input) {
  const response = await movingManifestRequest(config, {
    path: `/plans/${input.planId}`,
    query: { moveId: input.moveId },
  });
  return response.data;
}

export async function planSummary(config, input) {
  const response = await movingManifestRequest(config, {
    path: `/plans/${input.planId}/summary`,
    query: { moveId: input.moveId },
  });
  return response.data;
}

export async function planApplyOps(config, input) {
  const body = {
    batchId: input.batchId,
    ops: input.ops,
    agentLabel: input.agentLabel,
  };
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/plans/${input.planId}/ops`,
        query: { moveId: input.moveId },
        body,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/plans/${input.planId}/ops`,
    query: { moveId: input.moveId },
    body,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function planProposeOps(config, input) {
  const body = {
    batchId: input.batchId,
    ops: input.ops,
    agentLabel: input.agentLabel,
    reasoning: input.reasoning,
  };
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/plans/${input.planId}/proposals`,
        query: { moveId: input.moveId },
        body,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/plans/${input.planId}/proposals`,
    query: { moveId: input.moveId },
    body,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function planSnapshot(config, input) {
  return await movingManifestRequest(config, {
    path: `/plans/${input.planId}/snapshot.svg`,
    query: {
      moveId: input.moveId,
      level: input.levelId,
    },
  });
}

export async function searchInventory(config, input) {
  const response = await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/items`,
    query: {
      limit: input.limit ?? 50,
      status: input.status,
      disposition: input.disposition,
    },
  });
  const query = input.query?.trim().toLowerCase();
  if (!query) return response;
  return {
    ...response,
    data: response.data.filter((item) =>
      [
        item.name,
        item.description,
        item.room,
        item.destinationRoom,
        item.category,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    ),
  };
}

export async function createItem(config, input) {
  const { idempotencyKey, ...body } = input;
  if (input.dryRun) {
    return {
      dryRun: true,
      request: { method: "POST", path: `/moves/${input.moveId}/items`, body },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/items`,
    body,
    idempotencyKey,
  });
}

export async function createItemWithImages(config, input) {
  const {
    images,
    idempotencyKey,
    dryRun,
    photoDefaults,
    continueOnImageError,
    ...itemInput
  } = input;
  const imageEntries = Array.isArray(images) ? images : [];
  if (imageEntries.length === 0) {
    throw new Error("Provide at least one image.");
  }

  const itemRequest = {
    ...itemInput,
    quantity: itemInput.quantity ?? 1,
    dryRun,
    idempotencyKey: idempotencyKey ? `${idempotencyKey}-item` : undefined,
  };
  const sharedPhotoDefaults = removeUndefined({
    ...photoDefaults,
    moveId: input.moveId,
    itemId: dryRun ? "ITEM_ID_CREATED_BY_THIS_TOOL" : undefined,
    room: photoDefaults?.room ?? itemInput.room,
    photoType: photoDefaults?.photoType ?? "item",
    source: photoDefaults?.source ?? "mcp",
    exifHandlingStatus: photoDefaults?.exifHandlingStatus ?? "pending",
    dryRun,
    continueOnError: continueOnImageError ?? true,
    idempotencyKey: idempotencyKey ? `${idempotencyKey}-image` : undefined,
  });
  const sanitizedImages = imageEntries.map((image) => {
    const imageInput = { ...image };
    delete imageInput.itemId;
    return imageInput;
  });

  if (dryRun) {
    const [itemDryRun, imageDryRun] = await Promise.all([
      createItem(config, itemRequest),
      uploadEvidenceImages(config, {
        ...sharedPhotoDefaults,
        images: sanitizedImages,
      }),
    ]);
    return {
      dryRun: true,
      item: itemDryRun,
      images: imageDryRun,
      note:
        "Dry run only. On a live run, MovingManifest creates the item first, then uploads each original image attached to that item and creates web-ready derivatives server-side.",
    };
  }

  const itemResponse = await createItem(config, itemRequest);
  const itemData = itemResponse.data ?? itemResponse;
  const itemId = itemData.itemId;
  if (!itemId) {
    throw new Error("Item was created but the API response did not include itemId.");
  }

  const imageResult = await uploadEvidenceImages(config, {
    ...sharedPhotoDefaults,
    itemId,
    images: sanitizedImages,
  });

  return {
    itemId,
    item: itemData,
    imageCount: imageResult.imageCount,
    uploadedCount: imageResult.uploadedCount,
    failedCount: imageResult.failedCount,
    photoIds: imageResult.results
      .filter((result) => result.ok && result.photoId)
      .map((result) => result.photoId),
    images: imageResult,
    note:
      "Created the item, uploaded original image evidence attached to it, and let MovingManifest create web-ready derivatives server-side.",
    agentReview: createItemWithImagesAgentReview({
      input,
      itemId,
      item: itemData,
      imageResult,
    }),
  };
}

export async function addItemFromPhoto(config, input) {
  const {
    filePath,
    sourceUrl,
    dataUrl,
    fileBase64,
    fileName,
    mimeType,
    originalHash,
    caption,
    photoType,
    privacyLevel,
    visibilityScope,
    source,
    exifHandlingStatus,
    confidence,
    notes,
    verificationStatus,
    capturedAt,
    generateAiSuggestions,
    idempotencyKey,
    dryRun,
    continueOnImageError,
    ...itemInput
  } = input;

  return await createItemWithImages(config, {
    ...itemInput,
    idempotencyKey,
    dryRun,
    continueOnImageError,
    images: [
      removeUndefined({
        filePath,
        sourceUrl,
        dataUrl,
        fileBase64,
        fileName,
        mimeType,
        originalHash,
        caption: caption ?? itemInput.name,
        photoType,
        privacyLevel,
        visibilityScope,
        source,
        exifHandlingStatus,
        confidence,
        notes,
        verificationStatus,
        capturedAt,
        generateAiSuggestions,
      }),
    ],
  });
}

export async function batchUpsertItems(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/items/batch-upsert`,
    body: {
      dryRun: input.dryRun,
      items: input.items,
    },
    idempotencyKey: input.idempotencyKey,
  });
}

export async function updateItem(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "PATCH",
        path: `/moves/${input.moveId}/items/${input.itemId}`,
        body: input,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "PATCH",
    path: `/moves/${input.moveId}/items/${input.itemId}`,
    body: input,
  });
}

export async function deleteItem(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "DELETE",
        path: `/items/${input.itemId}`,
        query: { moveId: input.moveId },
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "DELETE",
    path: `/items/${input.itemId}`,
    query: { moveId: input.moveId },
  });
}

export async function archiveItem(config, input) {
  return await deleteItem(config, input);
}

export async function convertItemToBox(config, input) {
  const body = { containerType: input.containerType };
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/items/${input.itemId}/convert-to-box`,
        query: { moveId: input.moveId },
        body,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/items/${input.itemId}/convert-to-box`,
    query: { moveId: input.moveId },
    body,
  });
}

export async function listMoveSpaces(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/spaces`,
    query: {
      limit: input.limit ?? 100,
      cursor: input.cursor,
    },
  });
}

export async function createMoveSpace(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/moves/${input.moveId}/spaces`,
        body: input,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/spaces`,
    body: input,
  });
}

export async function upsertSaleListing(config, input) {
  const { idempotencyKey, dryRun, ...body } = input;
  const path = input.listingId
    ? `/moves/${input.moveId}/sale-listings/${input.listingId}`
    : `/moves/${input.moveId}/sale-listings`;
  const method = input.listingId ? "PATCH" : "POST";
  if (dryRun) {
    return { dryRun: true, request: { method, path, body } };
  }
  return await movingManifestRequest(config, {
    method,
    path,
    body,
    idempotencyKey,
  });
}

export async function listPlannedItems(config, input) {
  const response = await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/planned-items`,
    query: {
      limit: input.limit ?? 50,
      cursor: input.cursor,
      includeArchived: input.includeArchived,
    },
  });
  const query = input.query?.trim().toLowerCase();
  if (!query) return response;
  return {
    ...response,
    data: response.data.filter((item) =>
      [item.name, item.description, item.category, item.subcategory, item.url]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    ),
  };
}

export async function createPlannedItem(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/moves/${input.moveId}/planned-items`,
        body: input,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/planned-items`,
    body: input,
  });
}

export async function updatePlannedItem(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "PATCH",
        path: `/moves/${input.moveId}/planned-items/${input.plannedItemId}`,
        body: input,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "PATCH",
    path: `/moves/${input.moveId}/planned-items/${input.plannedItemId}`,
    body: input,
  });
}

export async function convertPlannedItem(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/moves/${input.moveId}/planned-items/${input.plannedItemId}/convert`,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/planned-items/${input.plannedItemId}/convert`,
  });
}

export async function archivePlannedItem(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "DELETE",
        path: `/moves/${input.moveId}/planned-items/${input.plannedItemId}`,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "DELETE",
    path: `/moves/${input.moveId}/planned-items/${input.plannedItemId}`,
  });
}

export async function createBox(config, input) {
  const body = { ...input };
  delete body.idempotencyKey;
  delete body.dryRun;
  if (input.dryRun) {
    return {
      dryRun: true,
      request: { method: "POST", path: `/moves/${input.moveId}/boxes`, body },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/boxes`,
    body,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function updateBox(config, input) {
  const boxId = input.boxId;
  const body = { ...input };
  delete body.boxId;
  delete body.idempotencyKey;
  delete body.dryRun;
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "PATCH",
        path: `/moves/${input.moveId}/boxes/${boxId}`,
        body,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "PATCH",
    path: `/moves/${input.moveId}/boxes/${boxId}`,
    body,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function addItemsToBox(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      requests: input.items.map((item) => ({
        method: "POST",
        path: `/boxes/${input.boxId}/items`,
        body: {
          moveId: input.moveId,
          itemId: item.itemId,
          quantity: item.quantity,
          notes: item.notes,
        },
      })),
    };
  }
  const results = [];
  for (const item of input.items) {
    results.push(
      await movingManifestRequest(config, {
        method: "POST",
        path: `/boxes/${input.boxId}/items`,
        body: {
          moveId: input.moveId,
          itemId: item.itemId,
          quantity: item.quantity,
          notes: item.notes,
        },
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}-${results.length + 1}`
          : undefined,
      })
    );
  }
  return { data: results };
}

export async function saveBoxIntake(config, input) {
  validateBoxIntake(input);

  const contents = Array.isArray(input.contents) ? input.contents : [];
  const linkedItems = Array.isArray(input.linkedItems) ? input.linkedItems : [];
  const boxPhotos = Array.isArray(input.photos) ? input.photos : [];
  const dryRun = Boolean(input.dryRun);
  const idempotencyKey = input.idempotencyKey;
  const boxInput = input.box ?? {};
  const boxWriteInput = removeUndefined({
    moveId: input.moveId,
    ...boxInput,
    idempotencyKey: idempotencyKey ? `${idempotencyKey}-box` : undefined,
    dryRun,
  });

  const boxResult = boxInput.boxId
    ? await updateBox(config, boxWriteInput)
    : await createBox(config, boxWriteInput);
  const boxData = boxResult.data ?? boxResult;
  const boxId = boxInput.boxId ?? boxData.boxId ?? "BOX_ID_CREATED_BY_THIS_TOOL";

  const boxPhotoResult = boxPhotos.length
    ? await uploadEvidenceImages(config, {
        ...input.photoDefaults,
        moveId: input.moveId,
        boxId,
        room: input.photoDefaults?.room ?? boxInput.room,
        photoType: input.photoDefaults?.photoType ?? "boxContents",
        source: input.photoDefaults?.source ?? "mcp",
        exifHandlingStatus: input.photoDefaults?.exifHandlingStatus ?? "pending",
        images: boxPhotos,
        continueOnError: input.continueOnImageError ?? true,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}-box-photos` : undefined,
        dryRun,
      })
    : undefined;

  const contentRows = contents.map((content) => {
    const row = { ...content };
    delete row.images;
    return removeUndefined(row);
  });
  const contentResult = contentRows.length
    ? await batchUpsertItems(config, {
        moveId: input.moveId,
        items: contentRows,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}-contents` : undefined,
        dryRun,
      })
    : undefined;
  const contentData = contentResult?.data ?? contentResult;
  const contentItemIds = contentData?.results
    ?.filter((result) => result.ok && result.itemId)
    .map((result) => result.itemId) ?? [];
  const failedContentCount =
    contentData?.failed ??
    contentData?.results?.filter((result) => !result.ok).length ??
    0;
  if (!dryRun && failedContentCount > 0) {
    throw new Error("One or more contents failed validation; box intake stopped before linking.");
  }

  const linkRows = [
    ...contentItemIds.map((itemId) => ({ itemId })),
    ...linkedItems.map((item) => removeUndefined(item)),
  ];
  const linkResult = linkRows.length
    ? await addItemsToBox(config, {
        moveId: input.moveId,
        boxId,
        items: linkRows,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}-links` : undefined,
        dryRun,
      })
    : undefined;

  const contentPhotoResults = [];
  if (!dryRun) {
    for (const [index, content] of contents.entries()) {
      const images = Array.isArray(content.images) ? content.images : [];
      const itemId = content.itemId ?? contentItemIds[index];
      if (!images.length || !itemId) continue;
      contentPhotoResults.push(
        await uploadEvidenceImages(config, {
          ...input.photoDefaults,
          moveId: input.moveId,
          itemId,
          boxId,
          room: input.photoDefaults?.room ?? content.room ?? boxInput.room,
          photoType: input.photoDefaults?.photoType ?? "item",
          source: input.photoDefaults?.source ?? "mcp",
          exifHandlingStatus: input.photoDefaults?.exifHandlingStatus ?? "pending",
          images,
          continueOnError: input.continueOnImageError ?? true,
          idempotencyKey: idempotencyKey
            ? `${idempotencyKey}-content-${index + 1}-photos`
            : undefined,
        })
      );
    }
  }

  return {
    dryRun,
    boxId,
    box: boxResult,
    boxPhotos: boxPhotoResult,
    contents: contentResult,
    linkedItems: linkResult,
    contentPhotos: contentPhotoResults,
    summary: {
      boxAction: boxInput.boxId ? "update" : "create",
      describedContentCount: contents.length,
      linkedExistingItemCount: linkedItems.length,
      boxPhotoCount: boxPhotos.length,
      uploadedBoxPhotoCount: boxPhotoResult?.uploadedCount ?? 0,
      contentPhotoBatchCount: contentPhotoResults.length,
      note: dryRun
        ? "Dry run only. Live runs create/update the box first, then attach box photos, upsert described contents, link items, and upload content photos."
        : "Saved the box intake workflow in one agent-facing call.",
    },
  };
}

export async function removeItemFromBox(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "DELETE",
        path: `/boxes/${input.boxId}/items/${input.itemId}`,
        query: { moveId: input.moveId },
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "DELETE",
    path: `/boxes/${input.boxId}/items/${input.itemId}`,
    query: { moveId: input.moveId },
  });
}

export async function suggestAssignments(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/assignments/suggest`,
    body: { limit: input.limit },
  });
}

export async function applyAssignments(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/assignments/apply`,
    body: {
      dryRun: input.dryRun,
      assignments: input.assignments,
    },
  });
}

export async function listPlanningSuggestions(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/planning-suggestions`,
    query: {
      limit: input.limit,
      status: input.status,
    },
  });
}

export async function listAiJobs(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/ai-jobs`,
    query: {
      limit: input.limit,
      status: input.status,
    },
  });
}

export async function listQueueItems(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/queue`,
    query: {
      state: input.state,
      ownerUserId: input.ownerUserId,
      limit: input.limit,
      before: input.before,
    },
  });
}

export async function getQueueItem(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/queue/${input.queueItemId}`,
  });
}

async function queueCommand(config, input, action, body) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/queue/${input.queueItemId}/${action}`,
    idempotencyKey: input.idempotencyKey,
    body: { expectedVersion: input.expectedVersion, ...body },
  });
}

export async function claimQueueItem(config, input) {
  return await queueCommand(config, input, "claim", { nextStep: input.nextStep });
}

export async function releaseQueueItem(config, input) {
  return await queueCommand(config, input, "release", { reason: input.reason });
}

export async function requestQueueInput(config, input) {
  return await queueCommand(config, input, "needs-you", {
    requiredAction: input.requiredAction,
  });
}

export async function completeQueueItem(config, input) {
  return await queueCommand(config, input, "complete", {
    resultSummary: input.resultSummary,
    resultRefs: input.resultRefs,
  });
}

export async function reportQueueFailure(config, input) {
  return await queueCommand(config, input, "failure", {
    code: input.code,
    message: input.message,
    retryable: input.retryable,
    retryAfterMs: input.retryAfterMs,
  });
}

export async function getAiProviderStatus(config, input) {
  const response = await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/ai-jobs/provider-status`,
  });
  return response.data;
}

export async function listAiTextSuggestions(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/ai-text-suggestions`,
    query: {
      limit: input.limit,
      status: input.status,
    },
  });
}

export async function listAiPhotoSuggestions(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/ai-photo-suggestions`,
    query: {
      limit: input.limit,
      status: input.status,
    },
  });
}

export async function generateAiTextSuggestions(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/ai-text-suggestions/generate`,
    body: {
      sourceText: input.sourceText,
    },
  });
}

export async function generateAiPhotoSuggestions(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/ai-photo-suggestions/generate`,
    body: input.photoId
      ? { photoId: input.photoId }
      : {
          photoIds: input.photoIds,
        },
  });
}

export async function approveAiTextSuggestions(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/ai-text-suggestions/approve`,
    body: {
      dryRun: input.dryRun,
      approvals: input.approvals,
    },
  });
}

export async function rejectAiTextSuggestions(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/ai-text-suggestions/reject`,
    body: {
      suggestionIds: input.suggestionIds,
    },
  });
}

export async function approveAiPhotoSuggestions(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/ai-photo-suggestions/approve`,
    body: {
      dryRun: input.dryRun,
      approvals: input.approvals,
    },
  });
}

export async function rejectAiPhotoSuggestions(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/ai-photo-suggestions/reject`,
    body: {
      suggestionIds: input.suggestionIds,
    },
  });
}

export async function generatePlanningSuggestions(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/moves/${input.moveId}/planning-suggestions/generate`,
        body: {},
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/planning-suggestions/generate`,
    body: {},
  });
}

export async function approvePlanningSuggestions(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/moves/${input.moveId}/planning-suggestions/approve`,
        body: {
          approvals: input.approvals,
        },
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/planning-suggestions/approve`,
    body: {
      approvals: input.approvals,
    },
  });
}

export async function rejectPlanningSuggestions(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/moves/${input.moveId}/planning-suggestions/reject`,
        body: {
          suggestionIds: input.suggestionIds,
        },
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/planning-suggestions/reject`,
    body: {
      suggestionIds: input.suggestionIds,
    },
  });
}

export async function startPhotoUpload(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: "/uploads/init",
    body: input,
  });
}

export async function uploadEvidenceFile(config, input) {
  const media = await loadEvidenceMedia(config, input);
  const requestedMimeType = normalizeMimeType(input.mimeType ?? media.mimeType);
  const detectedMimeType = sniffMimeType(media.bytes);
  if (!detectedMimeType) {
    throw new Error(
      "Could not verify the media type from its file signature. Use a supported JPEG, PNG, WebP, MP3, MP4/MOV, AAC, WAV, WebM, or Ogg file.",
    );
  }
  if (requestedMimeType && !mediaMimeTypesCompatible(requestedMimeType, detectedMimeType)) {
    throw new Error(
      `Media MIME type mismatch: content is ${detectedMimeType}, not ${requestedMimeType}.`,
    );
  }
  const mimeType = requestedMimeType ?? detectedMimeType;

  const dimensions = imageDimensionsFromBuffer(media.bytes, mimeType);
  const width = input.width ?? dimensions?.width;
  const height = input.height ?? dimensions?.height;
  if (mimeType.startsWith("image/") && (!width || !height)) {
    throw new Error(
      "Image uploads require width and height. Pass width and height if they cannot be read from the file."
    );
  }

  const originalHash =
    input.originalHash ?? createHash("sha256").update(media.bytes).digest("hex");
  const sessionBody = {
    moveId: input.moveId,
    itemId: input.itemId,
    boxId: input.boxId,
    spaceId: input.spaceId,
    transportResourceId: input.transportResourceId,
    transportZoneId: input.transportZoneId,
    room: input.room,
    mimeType,
    sizeBytes: media.bytes.byteLength,
  };
  const finalizeBody = {
    moveId: input.moveId,
    width,
    height,
    originalHash,
    caption: input.caption,
    photoType: input.photoType,
    privacyLevel: input.privacyLevel,
    visibilityScope: input.visibilityScope,
    source: input.source ?? "mcp",
    exifHandlingStatus: input.exifHandlingStatus ?? "pending",
    confidence: input.confidence,
    notes: input.notes,
    verificationStatus: input.verificationStatus,
    capturedAt: input.capturedAt,
  };

  if (input.dryRun) {
    return {
      dryRun: true,
      media: {
        source: media.source,
        fileName: media.fileName,
        mimeType,
        sizeBytes: media.bytes.byteLength,
        width,
        height,
        originalHash,
      },
      request: {
        start: { method: "POST", path: "/uploads/init", body: sessionBody },
        upload: {
          method: "PUT",
          note: "Dry run does not request a presigned URL or upload bytes.",
        },
        finalize: { method: "POST", path: "/photos/finalize", body: finalizeBody },
      },
      derivativeNote:
        "This helper uploads the original evidence file only. MovingManifest creates web-ready image derivatives during finalization when the client does not supply them.",
      derivativeVariants: derivativeVariantsForStatus("pending", mimeType),
    };
  }

  const session = await startPhotoUpload(config, sessionBody);
  const data = session.data ?? session;
  await putEvidenceBytes({
    uploadUrl: data.uploadUrl,
    contentType: data.headers?.["Content-Type"] ?? mimeType,
    bytes: media.bytes,
  });

  const finalizeResponse = await finalizePhotoUpload(config, {
    ...finalizeBody,
    uploadSessionId: data.uploadSessionId,
  });
  const finalizedData = finalizeResponse.data ?? finalizeResponse;
  const derivativeStatus =
    finalizedData.derivativeStatus ??
    (mimeType.startsWith("image/")
      ? data.derivativeUploads && data.derivativeUploads.length > 0
        ? "ready"
        : "pending"
      : undefined);
  const derivativeVariants = normalizedDerivativeVariants({
    data: finalizedData,
    status: derivativeStatus,
    mimeType,
  });

  return {
    photoId: finalizedData.photoId,
    uploadSessionId: data.uploadSessionId,
    media: {
      source: media.source,
      fileName: media.fileName,
      mimeType,
      sizeBytes: media.bytes.byteLength,
      width,
      height,
      originalHash,
    },
    derivativeStatus,
    derivativeError: finalizedData.derivativeError,
    derivativeNote: derivativeNoteForStatus(derivativeStatus),
    derivativeVariants,
  };
}

export async function uploadEvidenceImage(config, input) {
  const sourceCount = [
    input.filePath,
    input.sourceUrl,
    input.dataUrl,
    input.fileBase64,
  ].filter(Boolean).length;
  if (sourceCount !== 1) {
    throw new Error("Provide exactly one of filePath, sourceUrl, dataUrl, or fileBase64.");
  }

  const directImage = input.filePath
    ? await loadLocalImageForDirectUpload(config, input)
    : input.dataUrl
      ? loadDataUrlImageForDirectUpload(input)
      : input.fileBase64
        ? loadBase64ImageForDirectUpload(input)
        : undefined;
  const metadata = {
    moveId: input.moveId,
    fileName: input.fileName ?? directImage?.fileName,
    mimeType: input.mimeType ?? directImage?.mimeType,
    itemId: input.itemId,
    boxId: input.boxId,
    spaceId: input.spaceId,
    transportResourceId: input.transportResourceId,
    transportZoneId: input.transportZoneId,
    room: input.room,
    originalHash: input.originalHash,
    caption: input.caption,
    photoType: input.photoType,
    privacyLevel: input.privacyLevel,
    visibilityScope: input.visibilityScope,
    source: input.source ?? "mcp",
    exifHandlingStatus: input.exifHandlingStatus ?? "pending",
    confidence: input.confidence,
    notes: input.notes,
    verificationStatus: input.verificationStatus,
    capturedAt: input.capturedAt,
    generateAiSuggestions: input.generateAiSuggestions,
  };
  const body = {
    ...metadata,
    sourceUrl: input.sourceUrl,
  };

  if (input.dryRun) {
    const derivativeVariants = derivativeVariantsForStatus("pending");
    return {
      dryRun: true,
      media: directImage
        ? {
            source: directImage.source,
            fileName: directImage.fileName,
            mimeType: directImage.mimeType,
            sizeBytes: directImage.bytes.byteLength,
          }
        : undefined,
      request: directImage
        ? {
            method: "POST",
            path: "/photos/upload",
            query: removeUndefined(metadata),
            headers: removeUndefined({
              "Content-Type": directImage.mimeType,
              "X-MovingManifest-File-Name": directImage.fileName,
            }),
            note: "Dry run does not upload image bytes or include them in the transcript.",
          }
        : { method: "POST", path: "/photos/upload", body },
      derivativeNote:
        "MovingManifest stores the original image and creates web-ready derivatives server-side.",
      derivativeVariants,
      agentReview: imageUploadAgentReview({
        input,
        data: { derivativeVariants },
        media: directImage,
        derivativeNote:
          "MovingManifest stores the original image and creates web-ready derivatives server-side.",
        dryRun: true,
      }),
    };
  }

  const response = directImage
    ? await movingManifestBinaryRequest(config, {
        method: "POST",
        path: "/photos/upload",
        query: removeUndefined(metadata),
        bytes: directImage.bytes,
        mimeType: directImage.mimeType,
        fileName: directImage.fileName,
        idempotencyKey: input.idempotencyKey,
      })
    : await movingManifestRequest(config, {
        method: "POST",
        path: "/photos/upload",
        body,
        idempotencyKey: input.idempotencyKey,
      });
  const data = response.data ?? response;
  const derivativeNote = derivativeNoteForStatus(data.derivativeStatus);
  const derivativeVariants = normalizedDerivativeVariants({
    data,
    status: data.derivativeStatus,
    mimeType: data.media?.mimeType ?? input.mimeType ?? directImage?.mimeType,
  });
  return {
    ...data,
    derivativeNote,
    derivativeVariants,
    agentReview: imageUploadAgentReview({
      input,
      data: {
        ...data,
        derivativeVariants,
      },
      media: data.media ?? directImage,
      derivativeNote,
    }),
  };
}

export async function uploadEvidenceImages(config, input) {
  const images = Array.isArray(input.images) ? input.images : [];
  if (images.length === 0) {
    throw new Error("Provide at least one image.");
  }

  const defaults = { ...input };
  delete defaults.images;
  delete defaults.continueOnError;
  delete defaults.idempotencyKey;
  delete defaults.originalHash;
  const { continueOnError, idempotencyKey } = input;
  const results = [];

  for (const [index, image] of images.entries()) {
    const imageInput = removeUndefined({
      ...defaults,
      ...image,
      moveId: input.moveId,
      idempotencyKey:
        image.idempotencyKey ??
        (idempotencyKey ? `${idempotencyKey}-${index + 1}` : undefined),
    });

    try {
      const result = await uploadEvidenceImage(config, imageInput);
      results.push({
        index,
        ok: true,
        photoId: result.photoId,
        uploadSessionId: result.uploadSessionId,
        derivativeStatus: result.derivativeStatus,
        derivativeError: result.derivativeError,
        derivativeVariants: result.derivativeVariants,
        media: result.media,
        agentReview: result.agentReview,
        result,
      });
    } catch (error) {
      const failure = {
        index,
        ok: false,
        error: error instanceof Error ? error.message : "Image upload failed.",
      };
      results.push(failure);
      if (!continueOnError) {
        const batchError = new Error(
          `Image upload ${index + 1} of ${images.length} failed: ${failure.error}`
        );
        batchError.partialResults = results;
        throw batchError;
      }
    }
  }

  return {
    imageCount: images.length,
    uploadedCount: results.filter((result) => result.ok).length,
    failedCount: results.filter((result) => !result.ok).length,
    results,
    derivativeNote:
      "Each image was sent as one original upload. MovingManifest creates web-ready derivatives server-side for uploaded images.",
    derivativeVariants: derivativeVariantsForStatus("pending"),
    agentReview: imageBatchAgentReview({ input, results }),
  };
}

async function loadLocalImageForDirectUpload(config, input) {
  const { bytes } = await readAllowedLocalMedia({
    filePath: input.filePath,
    transport: config.mediaIngress?.transport,
    allowedFileRoots: config.mediaIngress?.allowedFileRoots,
    maxBytes: 25 * 1024 * 1024,
  });
  const fileName = input.fileName ?? path.basename(input.filePath);
  const requestedMimeType = normalizeMimeType(
    input.mimeType ?? mimeTypeForFilename(fileName),
  );
  const detectedMimeType = sniffMimeType(bytes);
  if (!detectedMimeType || !detectedMimeType.startsWith("image/")) {
    throw new Error("filePath content is not a supported JPEG, PNG, or WebP image.");
  }
  if (requestedMimeType && requestedMimeType !== detectedMimeType) {
    throw new Error(
      `Image MIME type mismatch: content is ${detectedMimeType}, not ${requestedMimeType}.`,
    );
  }
  return finalizeImageForDirectUpload({
    bytes,
    source: "filePath",
    fileName,
    mimeType: detectedMimeType,
  });
}

function loadDataUrlImageForDirectUpload(input) {
  const match = input.dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/i);
  if (!match || match[2]?.toLowerCase() !== ";base64") {
    throw new Error("dataUrl must be a base64 image data URL.");
  }
  const bytes = Buffer.from(decodeURIComponent(match[3]).replace(/\s/g, ""), "base64");
  return finalizeImageForDirectUpload({
    bytes,
    source: "dataUrl",
    fileName: input.fileName,
    mimeType:
      normalizeMimeType(input.mimeType ?? match[1]) ??
      sniffMimeType(bytes) ??
      mimeTypeForFilename(input.fileName ?? ""),
  });
}

function loadBase64ImageForDirectUpload(input) {
  const bytes = Buffer.from(input.fileBase64.replace(/\s/g, ""), "base64");
  return finalizeImageForDirectUpload({
    bytes,
    source: "fileBase64",
    fileName: input.fileName,
    mimeType:
      normalizeMimeType(input.mimeType ?? "") ??
      sniffMimeType(bytes) ??
      mimeTypeForFilename(input.fileName ?? ""),
  });
}

function finalizeImageForDirectUpload({ bytes, source, fileName, mimeType }) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType ?? "")) {
    throw new Error(
      "upload_evidence_image accepts JPEG, PNG, or WebP files. Use upload_evidence_file for audio, video, or unsupported media."
    );
  }
  if (!bytes.byteLength) {
    throw new Error("Image upload data was empty.");
  }

  return {
    bytes,
    source,
    fileName,
    mimeType,
  };
}

export async function finalizePhotoUpload(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: { method: "POST", path: "/photos/finalize", body: input },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: "/photos/finalize",
    body: input,
  });
}

export async function attachPhoto(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: { method: "POST", path: `/photos/${input.photoId}/attach`, body: input },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/photos/${input.photoId}/attach`,
    body: input,
  });
}

function derivativeNoteForStatus(status) {
  switch (status) {
    case "ready":
      return "Original evidence was uploaded and MovingManifest created web-ready image derivatives for display and AI review.";
    case "failed":
      return "Original evidence was uploaded, but server-side derivative processing failed. The photo record remains available for review and retry.";
    case "pending":
      return "Original evidence was uploaded. Web-ready image derivatives are queued or pending.";
    default:
      return "Original media evidence was uploaded. Audio and video uploads do not use image derivatives.";
  }
}

function derivativeVariantsForStatus(status, mimeType = "image/jpeg") {
  if (!status || !String(mimeType).startsWith("image/")) return undefined;
  return movingManifestImageDerivativeVariants.map((variant) => ({
    ...variant,
    status,
  }));
}

function normalizedDerivativeVariants({ data = {}, status, mimeType }) {
  if (Array.isArray(data.derivativeVariants)) {
    return data.derivativeVariants;
  }
  return derivativeVariantsForStatus(status, mimeType);
}

function imageUploadAgentReview({
  input,
  data = {},
  media,
  derivativeNote,
  dryRun = false,
}) {
  const target = evidenceTargetFromInput(input);
  const photoType = input.photoType ?? defaultPhotoTypeForTarget(target);
  const decisions = removeUndefined({
    attachmentTarget: target,
    room: input.room,
    caption: input.caption,
    photoType,
    privacyLevel: input.privacyLevel ?? "normal",
    visibilityScope: input.visibilityScope ?? "moveCollaborators",
    source: input.source ?? "mcp",
    confidence: input.confidence,
    notes: input.notes,
    verificationStatus: input.verificationStatus ?? "unreviewed",
    capturedAt: input.capturedAt,
    generateAiSuggestions: input.generateAiSuggestions,
  });
  const mediaSummary = removeUndefined({
    source: media?.source ?? data.media?.source,
    fileName: media?.fileName ?? data.media?.fileName,
    mimeType: media?.mimeType ?? data.media?.mimeType,
    sizeBytes:
      media?.sizeBytes ?? media?.bytes?.byteLength ?? data.media?.sizeBytes,
    width: data.media?.width,
    height: data.media?.height,
  });
  const aiReviewStatus = data.aiReview?.status;
  const summary = [
    dryRun ? "Prepared image upload" : "Uploaded image evidence",
    `for ${target.label}`,
    input.caption ? `with caption "${input.caption}"` : "without a caption",
    `as ${decisions.photoType} evidence`,
    `with ${decisions.privacyLevel} privacy`,
    dryRun
      ? "without sending bytes"
      : `and derivative status ${data.derivativeStatus ?? "unknown"}`,
    aiReviewStatus ? `AI review ${aiReviewStatus}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return removeUndefined({
    userFacingSummary: `${summary}.`,
    photoId: data.photoId,
    uploadSessionId: data.uploadSessionId,
    decisions,
    media: mediaSummary,
    derivativeStatus: data.derivativeStatus,
    derivativeError: data.derivativeError,
    derivativeNote,
    derivativeVariants: data.derivativeVariants,
    aiReviewStatus,
    aiReview: data.aiReview,
    correctionPrompt:
      "Tell the user these choices were used so they can correct the caption, target, privacy, quantity, or AI suggestions only if something looks wrong.",
  });
}

function imageBatchAgentReview({ input, results }) {
  const uploadedCount = results.filter((result) => result.ok).length;
  const failedCount = results.length - uploadedCount;
  const target = evidenceTargetFromInput(input);
  return removeUndefined({
    userFacingSummary:
      failedCount > 0
        ? `Uploaded ${uploadedCount} of ${results.length} image evidence files; ${failedCount} failed.`
        : `Uploaded ${uploadedCount} image evidence file${uploadedCount === 1 ? "" : "s"}.`,
    defaultDecisions: removeUndefined({
      attachmentTarget: target,
      room: input.room,
      photoType: input.photoType ?? defaultPhotoTypeForTarget(target),
      privacyLevel: input.privacyLevel,
      visibilityScope: input.visibilityScope,
      confidence: input.confidence,
      notes: input.notes,
      generateAiSuggestions: input.generateAiSuggestions,
    }),
    imageCount: results.length,
    uploadedCount,
    failedCount,
    derivativeVariants: derivativeVariantsForStatus("pending"),
    correctionPrompt:
      "For a batch, summarize the shared defaults and mention only failed uploads or choices the user may want to correct.",
  });
}

function createItemWithImagesAgentReview({ input, itemId, item, imageResult }) {
  const quantity = input.quantity ?? 1;
  return removeUndefined({
    userFacingSummary: `Created "${input.name}" with quantity ${quantity} and uploaded ${imageResult.uploadedCount} image${imageResult.uploadedCount === 1 ? "" : "s"} attached to the item.`,
    item: removeUndefined({
      itemId,
      name: input.name,
      room: input.room,
      category: input.category,
      quantity,
      quantityDefaulted: input.quantity === undefined,
      disposition: input.disposition,
      condition: input.condition,
      fragility: input.fragility,
    }),
    photoIds: imageResult.results
      .filter((result) => result.ok && result.photoId)
      .map((result) => result.photoId),
    failedImageCount: imageResult.failedCount,
    photoDefaults: input.photoDefaults,
    correctionPrompt:
      "Tell the user the item quantity, caption/photo assumptions, and any failed uploads so they can correct only the parts that look wrong.",
    createdItem: item,
  });
}

function evidenceTargetFromInput(input) {
  if (input.itemId) {
    return { type: "item", id: input.itemId, label: `item ${input.itemId}` };
  }
  if (input.boxId) {
    return { type: "box", id: input.boxId, label: `box ${input.boxId}` };
  }
  if (input.spaceId) {
    return { type: "space", id: input.spaceId, label: `space ${input.spaceId}` };
  }
  if (input.transportResourceId) {
    return {
      type: "transportResource",
      id: input.transportResourceId,
      label: `transport resource ${input.transportResourceId}`,
    };
  }
  if (input.transportZoneId) {
    return {
      type: "transportZone",
      id: input.transportZoneId,
      label: `transport zone ${input.transportZoneId}`,
    };
  }
  if (input.room) {
    return { type: "room", label: `room ${input.room}`, room: input.room };
  }
  return { type: "move", label: "the move" };
}

function defaultPhotoTypeForTarget(target) {
  switch (target.type) {
    case "item":
      return "item";
    case "box":
      return "boxContents";
    case "space":
    case "room":
      return "room";
    default:
      return "other";
  }
}

async function loadEvidenceMedia(config, input) {
  if (Boolean(input.filePath) === Boolean(input.sourceUrl)) {
    throw new Error("Provide exactly one of filePath or sourceUrl.");
  }

  if (input.filePath) {
    const { bytes } = await readAllowedLocalMedia({
      filePath: input.filePath,
      transport: config.mediaIngress?.transport,
      allowedFileRoots: config.mediaIngress?.allowedFileRoots,
      maxBytes: 500 * 1024 * 1024,
    });
    return {
      bytes,
      source: "filePath",
      fileName: input.fileName ?? path.basename(input.filePath),
      mimeType:
        input.mimeType ??
        sniffMimeType(bytes) ??
        mimeTypeForFilename(input.fileName ?? input.filePath),
    };
  }

  const remote = await downloadPublicHttpsMedia(input.sourceUrl, {
    maxBytes: 25 * 1024 * 1024,
  });
  const bytes = remote.bytes;
  const url = remote.finalUrl;
  return {
    bytes,
    source: "sourceUrl",
    fileName: input.fileName ?? (path.basename(url.pathname) || "evidence"),
    mimeType:
      input.mimeType ??
      normalizeMimeType(remote.contentType ?? "") ??
      sniffMimeType(bytes) ??
      mimeTypeForFilename(url.pathname),
  };
}

async function putEvidenceBytes({ uploadUrl, contentType, bytes }) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });
  if (!response.ok) {
    throw new Error(`Storage upload failed with HTTP ${response.status}.`);
  }
}

function normalizeMimeType(mimeType) {
  return mimeType?.trim().toLowerCase().split(";")[0] || undefined;
}

function mimeTypeForFilename(filename) {
  switch (path.extname(filename).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    case ".wav":
      return "audio/wav";
    case ".weba":
      return "audio/webm";
    case ".ogg":
      return "audio/ogg";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    default:
      return undefined;
  }
}

function sniffMimeType(bytes) {
  if (bytes.length >= 12) {
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return "image/png";
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    if (
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    ) {
      return "image/webp";
    }
    if (bytes.toString("ascii", 4, 8) === "ftyp") {
      const majorBrand = bytes.toString("ascii", 8, 12);
      if (["M4A ", "M4B ", "M4P "].includes(majorBrand)) return "audio/mp4";
      return majorBrand === "qt  " ? "video/quicktime" : "video/mp4";
    }
  }
  if (bytes.length >= 3 && bytes.toString("ascii", 0, 3) === "ID3") {
    return "audio/mpeg";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF") {
    const riffType = bytes.toString("ascii", 8, 12);
    if (riffType === "WAVE") return "audio/wav";
  }
  if (
    bytes.length >= 2 &&
    bytes[0] === 0xff &&
    (bytes[1] & 0xe0) === 0xe0 &&
    ((bytes[1] >> 1) & 0x03) !== 0
  ) {
    return "audio/mpeg";
  }
  if (bytes.length >= 4 && bytes.toString("ascii", 0, 4) === "OggS") {
    return "audio/ogg";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) {
    return "audio/aac";
  }
  return undefined;
}

function mediaMimeTypesCompatible(requestedMimeType, detectedMimeType) {
  if (requestedMimeType === detectedMimeType) return true;
  return (
    (requestedMimeType === "audio/mp4" && detectedMimeType === "video/mp4") ||
    (requestedMimeType === "video/mp4" && detectedMimeType === "audio/mp4") ||
    (requestedMimeType === "audio/webm" && detectedMimeType === "video/webm") ||
    (requestedMimeType === "video/webm" && detectedMimeType === "audio/webm")
  );
}

function imageDimensionsFromBuffer(bytes, mimeType) {
  switch (mimeType) {
    case "image/png":
      return pngDimensions(bytes);
    case "image/jpeg":
      return jpegDimensions(bytes);
    case "image/webp":
      return webpDimensions(bytes);
    default:
      return undefined;
  }
}

function pngDimensions(bytes) {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return undefined;
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (segmentLength < 2) return undefined;
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + segmentLength;
  }
  return undefined;
}

function webpDimensions(bytes) {
  if (
    bytes.length < 30 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return undefined;
  }
  const chunkType = bytes.toString("ascii", 12, 16);
  if (chunkType === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (chunkType === "VP8 " && bytes.length >= 30) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunkType === "VP8L" && bytes.length >= 25) {
    const bits = bytes.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return undefined;
}

export async function listTransportResources(config, input) {
  const [resources, zones] = await Promise.all([
    movingManifestRequest(config, { path: `/moves/${input.moveId}/resources` }),
    movingManifestRequest(config, { path: `/moves/${input.moveId}/zones` }),
  ]);
  return { resources, zones };
}

export async function listMovePeople(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/people`,
    query: {
      limit: input.limit,
      includeArchived: input.includeArchived,
    },
  });
}

export async function createMovePerson(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/moves/${input.moveId}/people`,
        body: input,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/people`,
    body: {
      name: input.name,
      role: input.role,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
      sortOrder: input.sortOrder,
    },
  });
}

export async function updateMovePerson(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "PATCH",
        path: `/moves/${input.moveId}/people/${input.personId}`,
        body: input,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "PATCH",
    path: `/moves/${input.moveId}/people/${input.personId}`,
    body: {
      name: input.name,
      role: input.role,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
      sortOrder: input.sortOrder,
      archivedAt: input.archivedAt,
    },
  });
}

export async function archiveMovePerson(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "DELETE",
        path: `/moves/${input.moveId}/people/${input.personId}`,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "DELETE",
    path: `/moves/${input.moveId}/people/${input.personId}`,
  });
}

export async function createTransportResource(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/moves/${input.moveId}/resources`,
        body: input,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/resources`,
    body: input,
  });
}

export async function updateTransportResource(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "PATCH",
        path: `/moves/${input.moveId}/resources/${input.resourceId}`,
        body: input,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "PATCH",
    path: `/moves/${input.moveId}/resources/${input.resourceId}`,
    body: input,
  });
}

export async function createTransportZone(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: { method: "POST", path: `/moves/${input.moveId}/zones`, body: input },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/zones`,
    body: input,
  });
}

export async function updateTransportZone(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "PATCH",
        path: `/moves/${input.moveId}/zones/${input.zoneId}`,
        body: input,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "PATCH",
    path: `/moves/${input.moveId}/zones/${input.zoneId}`,
    body: input,
  });
}

export async function getCapacityReport(config, input) {
  const response = await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/capacity-report`,
  });
  return response.data;
}

export async function listDocumentationProfiles(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/documentation-profiles`,
    query: { limit: input.limit, status: input.status },
  });
}

export async function createDocumentationProfile(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/moves/${input.moveId}/documentation-profiles`,
        body: input,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/documentation-profiles`,
    body: {
      type: input.type,
      status: input.status,
      name: input.name,
      includedFields: input.includedFields,
      imageRule: input.imageRule,
      filters: input.filters,
      allowedActions: input.allowedActions,
      disclaimer: input.disclaimer,
      ownerNotes: input.ownerNotes,
    },
  });
}

export async function updateDocumentationProfile(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "PATCH",
        path: `/moves/${input.moveId}/documentation-profiles/${input.documentationProfileId}`,
        body: input,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "PATCH",
    path: `/moves/${input.moveId}/documentation-profiles/${input.documentationProfileId}`,
    body: {
      type: input.type,
      status: input.status,
      name: input.name,
      includedFields: input.includedFields,
      imageRule: input.imageRule,
      filters: input.filters,
      allowedActions: input.allowedActions,
      disclaimer: input.disclaimer,
      ownerNotes: input.ownerNotes,
    },
  });
}

export async function archiveDocumentationProfile(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "DELETE",
        path: `/moves/${input.moveId}/documentation-profiles/${input.documentationProfileId}`,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "DELETE",
    path: `/moves/${input.moveId}/documentation-profiles/${input.documentationProfileId}`,
  });
}

export async function createExport(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/exports`,
    body: {
      type: input.type,
      documentationProfileId: input.documentationProfileId,
    },
  });
}

export async function listExports(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/exports`,
    query: { limit: input.limit },
  });
}

export async function downloadExport(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/exports/${input.exportJobId}/download`,
  });
}

export async function listShareLinks(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/share-links`,
    query: { limit: input.limit, status: input.status },
  });
}

export async function listShareLinkComments(config, input) {
  return await movingManifestRequest(config, {
    path: input.shareLinkId
      ? `/moves/${input.moveId}/share-links/${input.shareLinkId}/comments`
      : `/moves/${input.moveId}/share-links/comments`,
    query: {
      limit: input.limit,
      documentationProfileId: input.documentationProfileId,
    },
  });
}

export async function createShareLink(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/moves/${input.moveId}/share-links`,
        body: input,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/share-links`,
    body: {
      documentationProfileId: input.documentationProfileId,
      scope: input.scope,
      label: input.label,
      role: input.role,
      allowedActions: input.allowedActions,
      expiresAt: input.expiresAt,
    },
  });
}

export async function revokeShareLink(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "DELETE",
        path: `/moves/${input.moveId}/share-links/${input.shareLinkId}`,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "DELETE",
    path: `/moves/${input.moveId}/share-links/${input.shareLinkId}`,
  });
}

function validateBoxIntake(input) {
  if (!input?.moveId) {
    throw new Error("moveId is required.");
  }
  const box = input.box ?? {};
  if (!input.dryRun && !box.boxId && !input.idempotencyKey) {
    throw new Error(
      "idempotencyKey is required when save_box_intake creates a new box."
    );
  }

  validateImageSources(input.photos ?? [], "photos");
  for (const [index, content] of (input.contents ?? []).entries()) {
    if (!content.itemId && !content.name) {
      throw new Error(`contents[${index}].name is required when creating an item.`);
    }
    validateImageSources(content.images ?? [], `contents[${index}].images`);
  }
  for (const [index, item] of (input.linkedItems ?? []).entries()) {
    if (!item.itemId) {
      throw new Error(`linkedItems[${index}].itemId is required.`);
    }
  }
}

function validateImageSources(images, label) {
  for (const [index, image] of images.entries()) {
    const sourceCount = [
      image.filePath,
      image.sourceUrl,
      image.dataUrl,
      image.fileBase64,
    ].filter(Boolean).length;
    if (sourceCount !== 1) {
      throw new Error(
        `${label}[${index}] must provide exactly one of filePath, sourceUrl, dataUrl, or fileBase64.`
      );
    }
  }
}

function removeUndefined(value) {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, removeUndefined(entry)])
  );
}
