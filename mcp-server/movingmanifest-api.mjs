import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export { getApiCapabilities } from "./capabilities.mjs";

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

export async function batchUpsertItems(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/items/batch-upsert`,
    body: {
      dryRun: input.dryRun,
      items: input.items,
    },
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
  if (input.dryRun) {
    return {
      dryRun: true,
      request: { method: "POST", path: `/moves/${input.moveId}/boxes`, body: input },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/boxes`,
    body: input,
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
      })
    );
  }
  return { data: results };
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
  const media = await loadEvidenceMedia(input);
  const mimeType = normalizeMimeType(input.mimeType ?? media.mimeType);
  if (!mimeType) {
    throw new Error(
      "Could not determine MIME type. Pass mimeType for files without a known image, audio, or video extension."
    );
  }

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
    ? await loadLocalImageForDirectUpload(input)
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
      agentReview: imageUploadAgentReview({
        input,
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
  return {
    ...data,
    derivativeNote,
    agentReview: imageUploadAgentReview({
      input,
      data,
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
    agentReview: imageBatchAgentReview({ input, results }),
  };
}

async function loadLocalImageForDirectUpload(input) {
  const bytes = await readFile(input.filePath);
  const fileName = input.fileName ?? path.basename(input.filePath);
  const mimeType = normalizeMimeType(
    input.mimeType ?? sniffMimeType(bytes) ?? mimeTypeForFilename(fileName)
  );
  return finalizeImageForDirectUpload({
    bytes,
    source: "filePath",
    fileName,
    mimeType,
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

async function loadEvidenceMedia(input) {
  if (Boolean(input.filePath) === Boolean(input.sourceUrl)) {
    throw new Error("Provide exactly one of filePath or sourceUrl.");
  }

  if (input.filePath) {
    const bytes = await readFile(input.filePath);
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

  const response = await fetch(input.sourceUrl);
  if (!response.ok) {
    throw new Error(`Could not download sourceUrl: HTTP ${response.status}.`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  const url = new URL(input.sourceUrl);
  return {
    bytes,
    source: "sourceUrl",
    fileName: input.fileName ?? (path.basename(url.pathname) || "evidence"),
    mimeType:
      input.mimeType ??
      normalizeMimeType(response.headers.get("content-type") ?? "") ??
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
      return bytes.toString("ascii", 8, 12) === "qt  "
        ? "video/quicktime"
        : "video/mp4";
    }
  }
  if (bytes.length >= 3 && bytes.toString("ascii", 0, 3) === "ID3") {
    return "audio/mpeg";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF") {
    const riffType = bytes.toString("ascii", 8, 12);
    if (riffType === "WAVE") return "audio/wav";
  }
  return undefined;
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

function removeUndefined(value) {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, removeUndefined(entry)])
  );
}
