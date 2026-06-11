import { randomUUID } from "node:crypto";

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
  if (input.dryRun) {
    return {
      dryRun: true,
      request: { method: "POST", path: `/moves/${input.moveId}/items`, body: input },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/items`,
    body: input,
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
