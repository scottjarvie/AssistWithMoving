import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export { getAgentWorkbenchGuide, getApiCapabilities } from "./capabilities.mjs";

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
  };
}

function normalizeBoxCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 24);
}

function normalizeBoxCodeInBody(body) {
  if (body.code !== undefined) {
    const code = normalizeBoxCode(body.code);
    if (code) {
      body.code = code;
    } else {
      delete body.code;
    }
  }
  return body;
}

function addDerivedEstimatedVolume(body) {
  if (body.estimatedVolumeCuFt !== undefined && body.estimatedVolumeCuFt !== null) {
    return body;
  }
  const volume = calculateVolumeFromDimensions(body.dimensionsIn);
  if (volume !== undefined) {
    body.estimatedVolumeCuFt = volume;
  }
  return body;
}

function calculateVolumeFromDimensions(dimensions) {
  const length = dimensions?.lengthIn;
  const width = dimensions?.widthIn;
  const height = dimensions?.heightIn;
  if (
    !Number.isFinite(length) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    length <= 0 ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }

  return Math.round(((length * width * height) / 1728) * 100) / 100;
}

export async function movingManifestRequest(
  config,
  { method = "GET", path, query, body, idempotencyKey },
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
    error.retryAfter = response.headers.get("retry-after") ?? undefined;
    throw error;
  }

  return payload;
}

export async function movingManifestBinaryRequest(
  config,
  { method = "POST", path, query, bytes, mimeType, fileName, idempotencyKey },
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
    error.retryAfter = response.headers.get("retry-after") ?? undefined;
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
  const apiError = error?.payload?.error;
  const hints = remediationHints({
    status: error?.status,
    code: apiError?.code,
    message: apiError?.message ?? (error instanceof Error ? error.message : ""),
    retryAfter: error?.retryAfter,
  });
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: error instanceof Error ? error.message : "Tool failed.",
            status: error?.status,
            code: apiError?.code,
            fields: apiError?.fields,
            remediation: hints,
            details: error?.payload,
          },
          null,
          2,
        ),
      },
    ],
  };
}

function remediationHints({ status, code, message, retryAfter }) {
  const hints = [];
  const needsHousehold = /active household|needs_household/i.test(
    message ?? "",
  );
  if (needsHousehold) {
    hints.push(
      "OAuth sign-in worked, but this account is not connected to a MovingManifest household yet. Open https://movingmanifest.com/app/dashboard#household-setup with that account, or ask a household owner to invite the email with API access enabled.",
    );
  }
  if (
    status === 401 &&
    /invalid api key format|invalid_token|oauth access token|not accepted|missing a client identity/i.test(
      message ?? "",
    )
  ) {
    hints.push(
      "For hosted MCP, confirm the connector URL is https://movingmanifest.com/api/mcp. The /mcp URL is the human setup page; if the client shows HTML, never opens OAuth, or lists no MovingManifest tools, switch the connector to /api/mcp.",
    );
    hints.push(
      "For hosted OAuth MCP, refresh the MCP tool list or restart the assistant session, then retry agent_workbench and get_api_context. If private calls still fail, ask the user to disconnect and reconnect the MovingManifest connector so the client gets fresh OAuth credentials and tool metadata.",
    );
    hints.push(
      "If the connector is already using https://movingmanifest.com/api/mcp and the exact Invalid API key format error persists after one reconnect, stop retrying OAuth. Escalate it as a stale production backend/deploy mismatch: the live Convex REST API is probably still running the API-key-only build and needs the current Next + Convex OAuth changes deployed together.",
    );
    hints.push(
      "For API-key fallback clients, create or copy a fresh scoped helper key from https://movingmanifest.com/settings/ai-connections; a valid helper key starts with mmk_.",
    );
  }
  if ((status === 403 || code === "insufficient_scope") && !needsHousehold) {
    hints.push(
      "API key lacks the required scope or move access; create or update a key at https://movingmanifest.com/settings/ai-connections.",
    );
  }
  if (status === 429) {
    hints.push(
      retryAfter
        ? `Rate limited; retry after ${retryAfter} seconds.`
        : "Rate limited; wait for the API rate-limit window to reset.",
    );
  }
  if (status === 404 && /\b(id|Id|ID)\b/.test(message ?? "")) {
    hints.push(
      "The ID may be stale or from another move; re-list the parent resource.",
    );
  }
  return hints.length ? hints : undefined;
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
    return {
      dryRun: true,
      request: { method: "POST", path: "/moves", body: input },
    };
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
    query: {
      sections: Array.isArray(input.sections)
        ? input.sections.join(",")
        : input.sections,
      maxPerSection: input.maxPerSection,
    },
  });
  return response.data;
}

export async function getAgentContext(config, input) {
  const response = await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/agent-context`,
    query: {
      sections: Array.isArray(input.sections)
        ? input.sections.join(",")
        : input.sections,
      maxPerSection: input.maxPerSection,
    },
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

export async function planCreate(config, input) {
  const { idempotencyKey, dryRun, ...body } = input;
  if (dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: "/plans",
        body,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: "/plans",
    body,
    idempotencyKey,
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

export async function floorPlanEvidence(config, input) {
  if (input.action === "list") {
    return await movingManifestRequest(config, {
      path: `/plans/${input.planId}/floorplan-evidence`,
      query: { moveId: input.moveId },
    });
  }

  if (input.action === "create") {
    const body = {
      evidenceType: input.evidenceType,
      title: input.title,
      summary: input.summary,
      confidence: input.confidence,
      sourceType: input.sourceType,
      areaRole: input.areaRole,
      constraintStrength: input.constraintStrength,
      sourcePhotoId: input.sourcePhotoId,
      sourceLabel: input.sourceLabel,
      sourceRegion: input.sourceRegion,
      imageNumber: input.imageNumber,
      facts: input.facts,
      measurements: input.measurements,
      agentLabel: input.agentLabel,
    };
    if (input.dryRun) {
      return {
        dryRun: true,
        request: {
          method: "POST",
          path: `/plans/${input.planId}/floorplan-evidence`,
          query: { moveId: input.moveId },
          body,
        },
      };
    }
    return await movingManifestRequest(config, {
      method: "POST",
      path: `/plans/${input.planId}/floorplan-evidence`,
      query: { moveId: input.moveId },
      body,
      idempotencyKey: input.idempotencyKey,
    });
  }

  if (input.action === "update") {
    const body = {
      title: input.title,
      summary: input.summary,
      confidence: input.confidence,
      facts: input.facts,
    };
    if (input.dryRun) {
      return {
        dryRun: true,
        request: {
          method: "PATCH",
          path: `/plans/${input.planId}/floorplan-evidence/${input.evidenceId}`,
          query: { moveId: input.moveId },
          body,
        },
      };
    }
    return await movingManifestRequest(config, {
      method: "PATCH",
      path: `/plans/${input.planId}/floorplan-evidence/${input.evidenceId}`,
      query: { moveId: input.moveId },
      body,
      idempotencyKey: input.idempotencyKey,
    });
  }

  const body = {
    reason: input.reason,
  };
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/plans/${input.planId}/floorplan-evidence/${input.evidenceId}/supersede`,
        query: { moveId: input.moveId },
        body,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/plans/${input.planId}/floorplan-evidence/${input.evidenceId}/supersede`,
    query: { moveId: input.moveId },
    body,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function floorPlanObservations(config, input) {
  if (input.action === "list") {
    return await movingManifestRequest(config, {
      path: `/plans/${input.planId}/floorplan-observations`,
      query: { moveId: input.moveId },
    });
  }

  if (input.action === "create") {
    const body = {
      observations: input.observations,
      agentLabel: input.agentLabel,
    };
    if (input.dryRun) {
      return {
        dryRun: true,
        request: {
          method: "POST",
          path: `/plans/${input.planId}/floorplan-observations`,
          query: { moveId: input.moveId },
          body,
        },
      };
    }
    return await movingManifestRequest(config, {
      method: "POST",
      path: `/plans/${input.planId}/floorplan-observations`,
      query: { moveId: input.moveId },
      body,
      idempotencyKey: input.idempotencyKey,
    });
  }

  if (input.action === "update") {
    const body = {
      title: input.title,
      status: input.status,
      subjectKey: input.subjectKey,
      subjectLabel: input.subjectLabel,
      rawText: input.rawText,
      normalized: input.normalized,
      confidence: input.confidence,
    };
    if (input.dryRun) {
      return {
        dryRun: true,
        request: {
          method: "PATCH",
          path: `/plans/${input.planId}/floorplan-observations/${input.observationId}`,
          query: { moveId: input.moveId },
          body,
        },
      };
    }
    return await movingManifestRequest(config, {
      method: "PATCH",
      path: `/plans/${input.planId}/floorplan-observations/${input.observationId}`,
      query: { moveId: input.moveId },
      body,
      idempotencyKey: input.idempotencyKey,
    });
  }

  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/plans/${input.planId}/floorplan-observations/${input.observationId}/supersede`,
        query: { moveId: input.moveId },
        body: { reason: input.reason },
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/plans/${input.planId}/floorplan-observations/${input.observationId}/supersede`,
    query: { moveId: input.moveId },
    body: { reason: input.reason },
    idempotencyKey: input.idempotencyKey,
  });
}

export async function floorPlanRelationships(config, input) {
  if (input.action === "list") {
    return await movingManifestRequest(config, {
      path: `/plans/${input.planId}/floorplan-relationships`,
      query: { moveId: input.moveId },
    });
  }

  if (input.action === "create") {
    const body = {
      relationships: input.relationships,
      agentLabel: input.agentLabel,
    };
    if (input.dryRun) {
      return {
        dryRun: true,
        request: {
          method: "POST",
          path: `/plans/${input.planId}/floorplan-relationships`,
          query: { moveId: input.moveId },
          body,
        },
      };
    }
    return await movingManifestRequest(config, {
      method: "POST",
      path: `/plans/${input.planId}/floorplan-relationships`,
      query: { moveId: input.moveId },
      body,
      idempotencyKey: input.idempotencyKey,
    });
  }

  if (input.action === "update") {
    const body = {
      status: input.status,
      fromSubjectLabel: input.fromSubjectLabel,
      toSubjectLabel: input.toSubjectLabel,
      confidence: input.confidence,
      notes: input.notes,
    };
    if (input.dryRun) {
      return {
        dryRun: true,
        request: {
          method: "PATCH",
          path: `/plans/${input.planId}/floorplan-relationships/${input.relationshipId}`,
          query: { moveId: input.moveId },
          body,
        },
      };
    }
    return await movingManifestRequest(config, {
      method: "PATCH",
      path: `/plans/${input.planId}/floorplan-relationships/${input.relationshipId}`,
      query: { moveId: input.moveId },
      body,
      idempotencyKey: input.idempotencyKey,
    });
  }

  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/plans/${input.planId}/floorplan-relationships/${input.relationshipId}/supersede`,
        query: { moveId: input.moveId },
        body: { reason: input.reason },
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/plans/${input.planId}/floorplan-relationships/${input.relationshipId}/supersede`,
    query: { moveId: input.moveId },
    body: { reason: input.reason },
    idempotencyKey: input.idempotencyKey,
  });
}

export async function floorPlanResetDraft(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/plans/${input.planId}/floorplan-reset-draft`,
        query: { moveId: input.moveId },
        body: { reason: input.reason },
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/plans/${input.planId}/floorplan-reset-draft`,
    query: { moveId: input.moveId },
    body: { reason: input.reason },
    idempotencyKey: input.idempotencyKey,
  });
}

export async function floorPlanSolve(config, input) {
  const body = {
    rooms: input.rooms,
    zones: input.zones,
    levelId: input.levelId,
    includeProposedOps: input.includeProposedOps,
    createProposal: input.createProposal,
    batchId: input.batchId,
    reasoning: input.reasoning,
    agentLabel: input.agentLabel,
  };
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/plans/${input.planId}/floorplan-solve`,
        query: { moveId: input.moveId },
        body,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/plans/${input.planId}/floorplan-solve`,
    query: { moveId: input.moveId },
    body,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function floorPlanCalculate(config, input) {
  return await floorPlanSolve(config, {
    ...input,
    includeProposedOps: false,
    createProposal: false,
    reasoning:
      input.reasoning ??
      "Recompute derived floorplan calculations from the measurement ledger.",
  });
}

export async function floorPlanQuestions(config, input) {
  const response = await floorPlanCalculate(config, input);
  const gaps = response?.data?.solve?.gaps ?? response?.solve?.gaps ?? [];
  const diagnostics =
    response?.data?.solve?.diagnostics ?? response?.solve?.diagnostics ?? [];
  return {
    ...response,
    questions: gaps,
    diagnostics,
    nextStep:
      gaps.length > 0
        ? "Ask or record the highest-impact gap questions before proposing final geometry."
        : "No floorplan gap questions were generated by the current solve.",
  };
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
      query: input.query,
      status: input.status,
      disposition: input.disposition,
      destinationRoom: input.destinationRoom,
      destinationSpaceId: input.destinationSpaceId,
      agentLabel: input.agentLabel,
      maxConfidence: input.maxConfidence,
      cursor: input.cursor,
    },
  });
  return response;
}

export async function getItem(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/items/${input.itemId}`,
  });
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
      note: "Dry run only. On a live run, MovingManifest creates the item first, then uploads each original image attached to that item and creates web-ready derivatives server-side.",
    };
  }

  const itemResponse = await createItem(config, itemRequest);
  const itemData = itemResponse.data ?? itemResponse;
  const itemId = itemData.itemId;
  if (!itemId) {
    throw new Error(
      "Item was created but the API response did not include itemId.",
    );
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
    note: "Created the item, uploaded original image evidence attached to it, and let MovingManifest create web-ready derivatives server-side.",
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

export async function addBoxItemFromPhoto(config, input) {
  const {
    boxId,
    boxCode,
    boxItemNotes,
    boxQuantity,
    idempotencyKey,
    dryRun,
    ...itemPhotoInput
  } = input;
  requireExactlyOneBoxTarget(
    { boxId, boxCode },
    "add_box_item_from_photo",
  );
  const quantity = boxQuantity ?? itemPhotoInput.quantity ?? 1;

  if (dryRun) {
    const itemDryRun = await addItemFromPhoto(config, {
      ...itemPhotoInput,
      idempotencyKey,
      dryRun: true,
    });
    const boxDryRun = await addItemsToBox(config, {
      moveId: input.moveId,
      boxId,
      boxCode,
      items: [
        {
          itemId: "ITEM_ID_CREATED_BY_THIS_TOOL",
          quantity,
          notes: boxItemNotes,
        },
      ],
      idempotencyKey: idempotencyKey ? `${idempotencyKey}-box` : undefined,
      dryRun: true,
    });
    return {
      dryRun: true,
      item: itemDryRun,
      boxAssignment: boxDryRun,
      note: "Dry run only. On a live run, MovingManifest creates the item from the photo, packs it into the existing box, and attaches the uploaded photo to that item/box context.",
    };
  }

  const itemResult = await addItemFromPhoto(config, {
    ...itemPhotoInput,
    idempotencyKey,
  });
  const itemId = itemResult?.itemId ?? itemResult?.data?.itemId;
  if (!itemId) {
    throw new Error(
      "Item was created from photo but the response did not include itemId.",
    );
  }

  const photoIds = Array.isArray(itemResult?.photoIds)
    ? itemResult.photoIds.filter(Boolean)
    : [];
  const boxAssignment = await addItemsToBox(config, {
    moveId: input.moveId,
    boxId,
    boxCode,
    items: [
      {
        itemId,
        quantity,
        notes: boxItemNotes,
      },
    ],
    idempotencyKey: idempotencyKey ? `${idempotencyKey}-box` : undefined,
  });
  const boxTarget = removeUndefined({ boxId, boxCode });
  const [packedItem] = addBoxAssignmentIdsToPackedItems({
    packedItems: [
      removeUndefined({
        index: 0,
        name: input.name,
        itemId,
        quantity,
        notes: boxItemNotes,
        photoIds,
      }),
    ],
    boxAssignment,
  });
  const photoAttachments = [];
  for (const photoId of photoIds) {
    photoAttachments.push(
      await attachPhoto(config, {
        moveId: input.moveId,
        photoId,
        itemId,
        boxId,
        boxCode,
        room: input.room,
        caption: input.caption ?? input.name,
        photoType: "item",
        notes: input.notes,
      }),
    );
  }

  return {
    itemId,
    photoIds,
    packedItem,
    packedItems: packedItem ? [packedItem] : undefined,
    packedItemIds: [itemId],
    assignmentIds: packedItem?.assignmentId ? [packedItem.assignmentId] : [],
    boxTarget,
    item: itemResult,
    boxAssignment,
    photoAttachments,
    agentReview: removeUndefined({
      userFacingSummary: `Created "${input.name}" from a photo and packed it into ${boxCode ?? boxId ?? "the selected box"}.`,
      itemId,
      boxId,
      boxCode,
      quantity,
      photoIds,
      packedItem,
      packedItemIds: [itemId],
      assignmentIds: packedItem?.assignmentId ? [packedItem.assignmentId] : [],
      nextStep:
        "Call get_move_summary or get_agent_context if you need to verify the opened box contents before continuing.",
      correctionPrompt:
        "Tell the user which item was created, which item ID was packed, which existing box it went into, and any quantity or caption assumption they may want to correct.",
    }),
  };
}

export async function batchAddBoxContents(config, input) {
  const { boxId, boxCode, items = [], idempotencyKey, dryRun } = input;
  requireExactlyOneBoxTarget({ boxId, boxCode }, "batch_add_box_contents");
  const normalizedItems = items.map((item) =>
    normalizeBoxContentItemForBatch(item),
  );
  const itemWriteRows = normalizedItems.map(stripBoxContentPackingFields);
  const itemUpserts = await batchUpsertItems(config, {
    moveId: input.moveId,
    items: itemWriteRows,
    idempotencyKey: idempotencyKey ? `${idempotencyKey}-items` : undefined,
    dryRun,
  });

  const upsertResults =
    itemUpserts?.data?.results ?? itemUpserts?.results ?? [];
  const boxItems = [];
  const packedItems = [];
  const skipped = [];
  for (const [index, item] of normalizedItems.entries()) {
    const result = upsertResults.find((row) => row.index === index);
    if (result && result.ok === false) {
      skipped.push({
        index,
        name: item.name,
        reason: result.error ?? "Item upsert failed.",
      });
      continue;
    }

    const itemId = result?.itemId ?? item.itemId;
    const externalSource = item.externalSource;
    const externalId = item.externalId;
    if (!itemId && !(externalSource && externalId) && !dryRun) {
      skipped.push({
        index,
        name: item.name,
        reason:
          "Item upsert did not return itemId and row has no external key.",
      });
      continue;
    }

    boxItems.push(
      removeUndefined({
        itemId: itemId ?? (dryRun ? `ITEM_ID_FROM_ROW_${index}` : undefined),
        externalSource: itemId ? undefined : externalSource,
        externalId: itemId ? undefined : externalId,
        quantity: item.boxQuantity ?? item.quantity ?? 1,
        notes: item.boxItemNotes,
      }),
    );
    packedItems.push(
      removeUndefined({
        index,
        name: item.name,
        itemId: itemId ?? (dryRun ? `ITEM_ID_FROM_ROW_${index}` : undefined),
        externalSource: itemId ? undefined : externalSource,
        externalId: itemId ? undefined : externalId,
        quantity: item.boxQuantity ?? item.quantity ?? 1,
        notes: item.boxItemNotes,
      }),
    );
  }

  const boxAssignment = boxItems.length
    ? await addItemsToBox(config, {
        moveId: input.moveId,
        boxId,
        boxCode,
        items: boxItems,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}-box` : undefined,
        dryRun,
      })
    : null;
  const packedBoxItems = addBoxAssignmentIdsToPackedItems({
    packedItems,
    boxAssignment,
  });
  const packedItemIds = packedBoxItems
    .map((item) => item.itemId)
    .filter(Boolean);
  const assignmentIds = packedBoxItems
    .map((item) => item.assignmentId)
    .filter(Boolean);
  const boxTarget = removeUndefined({ boxId, boxCode });

  return removeUndefined({
    dryRun: Boolean(dryRun),
    itemUpserts,
    boxAssignment,
    packedCount: boxItems.length,
    packedItems: packedBoxItems,
    packedItemIds,
    assignmentIds,
    boxTarget,
    skipped,
    agentReview: {
      userFacingSummary: `${boxItems.length} item${
        boxItems.length === 1 ? "" : "s"
      } saved into ${boxCode ?? boxId ?? "the selected box"}.`,
      boxId,
      boxCode,
      packedCount: boxItems.length,
      packedItems: packedBoxItems,
      packedItemIds,
      assignmentIds,
      skippedCount: skipped.length,
      nextStep:
        "Call get_move_summary or get_agent_context if you need to verify the opened box contents before continuing.",
      correctionPrompt:
        "Tell the user which existing box received the contents, which item names and item IDs were saved, and any skipped rows or quantity assumptions they may want to correct.",
    },
  });
}

export async function saveBoxIntake(config, input) {
  const {
    moveId,
    box = {},
    photos = [],
    contents = [],
    linkedItems = [],
    photoDefaults = {},
    continueOnImageError = true,
    idempotencyKey,
    dryRun,
  } = input;
  const boxInput = normalizeBoxIntakeInput(box);
  if (!boxInput.boxId && !boxInput.code && !dryRun && !idempotencyKey) {
    throw new Error(
      "save_box_intake requires idempotencyKey when creating a box without boxId or boxCode/code.",
    );
  }

  const boxResult = await upsertBoxForIntake(config, {
    moveId,
    box: boxInput,
    idempotencyKey: idempotencyKey ? `${idempotencyKey}-box` : undefined,
    dryRun,
  });
  const resolvedBoxId = boxResult.boxId;
  const resolvedBoxCode = boxResult.code ?? boxInput.code;
  const boxTarget = resolvedBoxId
    ? { boxId: resolvedBoxId }
    : removeUndefined({ boxCode: resolvedBoxCode });

  const boxPhotos = photos.length
    ? await uploadEvidenceImages(config, {
        ...photoDefaults,
        moveId,
        boxId: resolvedBoxId,
        room: photoDefaults.room ?? boxInput.room,
        photoType: photoDefaults.photoType ?? "box",
        images: photos,
        continueOnError: continueOnImageError,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}-box-photos` : undefined,
        dryRun,
      })
    : null;

  const normalizedContents = contents.map(({ photos: itemPhotos, ...content }) => ({
    ...normalizeBoxContentItemForBatch(content),
    photos: itemPhotos,
  }));
  const contentRows = normalizedContents.map((content) => {
    const row = { ...content };
    delete row.photos;
    return row;
  });
  const contentResult = contentRows.length
    ? await batchAddBoxContents(config, {
        moveId,
        ...boxTargetForAssignment(boxTarget, "save_box_intake contents"),
        items: contentRows,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}-contents` : undefined,
        dryRun,
      })
    : null;

  const packedItems = contentResult?.packedItems ?? [];
  const contentPhotoUploads = [];
  for (const [index, content] of normalizedContents.entries()) {
    const itemPhotos = Array.isArray(content.photos) ? content.photos : [];
    if (!itemPhotos.length) continue;
    const packedItem = packedItems.find((item) => item.index === index) ?? packedItems[index];
    const itemId = packedItem?.itemId ?? content.itemId;
    if (!itemId && !dryRun) {
      contentPhotoUploads.push({
        index,
        ok: false,
        name: content.name,
        error: "Content item was saved without an itemId, so photos were not attached.",
      });
      continue;
    }

    try {
      const result = await uploadEvidenceImages(config, {
        ...photoDefaults,
        moveId,
        boxId: resolvedBoxId,
        itemId: itemId ?? `ITEM_ID_FROM_CONTENT_${index}`,
        room: photoDefaults.room ?? content.room ?? boxInput.room,
        photoType: photoDefaults.photoType ?? "item",
        images: itemPhotos,
        continueOnError: continueOnImageError,
        idempotencyKey: idempotencyKey
          ? `${idempotencyKey}-content-${index + 1}-photos`
          : undefined,
        dryRun,
      });
      contentPhotoUploads.push({
        index,
        ok: true,
        itemId: itemId ?? `ITEM_ID_FROM_CONTENT_${index}`,
        result,
      });
    } catch (error) {
      contentPhotoUploads.push({
        index,
        ok: false,
        itemId,
        error: error instanceof Error ? error.message : "Content photo upload failed.",
      });
      if (!continueOnImageError) {
        throw error;
      }
    }
  }

  const linkedItemsResult = linkedItems.length
    ? await addItemsToBox(config, {
        moveId,
        ...boxTargetForAssignment(boxTarget, "save_box_intake linkedItems"),
        items: linkedItems,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}-linked-items` : undefined,
        dryRun,
      })
    : null;

  const photoIds = [
    ...extractPhotoIdsFromBatch(boxPhotos),
    ...contentPhotoUploads.flatMap((entry) =>
      entry.ok ? extractPhotoIdsFromBatch(entry.result) : [],
    ),
  ];
  const linkedAssignmentRows =
    linkedItemsResult?.data?.results ??
    linkedItemsResult?.results ??
    (Array.isArray(linkedItemsResult?.data) ? linkedItemsResult.data : []);

  return removeUndefined({
    dryRun: Boolean(dryRun),
    box: boxResult,
    boxTarget,
    boxPhotos,
    contentResult,
    contentPhotoUploads,
    linkedItemsResult,
    summary: {
      boxAction: boxResult.action,
      photoCount: photos.length,
      uploadedPhotoCount: photoIds.length,
      contentCount: contents.length,
      packedContentCount: packedItems.length,
      linkedItemCount: linkedItems.length,
      linkedAssignmentCount: linkedAssignmentRows.length,
    },
    agentReview: {
      userFacingSummary: buildBoxIntakeSummary({
        boxResult,
        boxInput,
        photoIds,
        packedItems,
        linkedItems,
      }),
      boxId: resolvedBoxId,
      boxCode: resolvedBoxCode,
      photoIds,
      packedItems,
      linkedItemCount: linkedItems.length,
      skippedContentCount: contentResult?.skipped?.length ?? 0,
      imageFailureCount: contentPhotoUploads.filter((entry) => !entry.ok).length,
      nextStep:
        "Call get_move_summary or get_agent_context with the box section if you need to verify this box before continuing.",
      correctionPrompt:
        "Tell the user which box was saved, its dimensions/weight assumptions, which contents or existing items were packed, which photos attached, and any skipped rows.",
    },
  });
}

function addBoxAssignmentIdsToPackedItems({ packedItems, boxAssignment }) {
  const assignmentRows =
    boxAssignment?.data?.results ??
    boxAssignment?.results ??
    (boxAssignment?.data?.assignmentId ? [boxAssignment.data] : []);
  return packedItems.map((item, packedIndex) => {
    const assignment = assignmentRows.find(
      (row) =>
        (packedItems.length === 1 && assignmentRows.length === 1) ||
        row?.index === packedIndex ||
        (item.itemId && row?.itemId === item.itemId) ||
        (item.externalSource &&
          item.externalId &&
          row?.externalSource === item.externalSource &&
          row?.externalId === item.externalId),
    );
    return removeUndefined({
      ...item,
      assignmentId:
        assignment?.assignmentId ?? assignment?.boxItemId ?? assignment?.id,
    });
  });
}

function requireExactlyOneBoxTarget({ boxId, boxCode }, toolName) {
  const targetCount = [boxId, boxCode].filter((value) =>
    hasNonemptyString(value),
  ).length;
  if (targetCount !== 1) {
    throw new Error(`${toolName} requires exactly one of boxId or boxCode.`);
  }
}

function boxTargetForAssignment(target, label) {
  requireExactlyOneBoxTarget(target, label);
  return target;
}

function normalizeBoxIntakeInput(box) {
  const normalized = removeUndefined({
    ...box,
    code: box.code ?? box.boxCode,
  });
  delete normalized.boxCode;
  normalizeBoxCodeInBody(normalized);
  addDerivedEstimatedVolume(normalized);
  return normalized;
}

function boxWriteBodyFromIntake(box) {
  const body = { ...box };
  delete body.boxId;
  return removeUndefined(body);
}

async function upsertBoxForIntake(config, { moveId, box, idempotencyKey, dryRun }) {
  const writeBody = boxWriteBodyFromIntake(box);
  if (box.boxId) {
    if (dryRun) {
      const response = await updateBox(config, {
        moveId,
        boxId: box.boxId,
        ...writeBody,
        idempotencyKey,
        dryRun: true,
      });
      return {
        action: "updated",
        boxId: box.boxId,
        code: box.code,
        response,
      };
    }
    const response = await updateBox(config, {
      moveId,
      boxId: box.boxId,
      ...writeBody,
      idempotencyKey,
    });
    return {
      action: "updated",
      boxId: box.boxId,
      code: box.code ?? response?.data?.code ?? response?.code,
      response,
    };
  }

  const existing = box.code && !dryRun ? await findBoxByExactCode(config, moveId, box.code) : null;
  if (existing?.boxId) {
    const response = await updateBox(config, {
      moveId,
      boxId: existing.boxId,
      ...writeBody,
      idempotencyKey,
    });
    return {
      action: "updated",
      boxId: existing.boxId,
      code: box.code,
      existing,
      response,
    };
  }

  const response = await createBox(config, {
    moveId,
    ...writeBody,
    idempotencyKey,
    dryRun,
  });
  return {
    action: dryRun ? "wouldCreate" : "created",
    boxId: response?.data?.boxId ?? response?.boxId ?? (dryRun ? "BOX_ID_CREATED_BY_THIS_TOOL" : undefined),
    code: box.code,
    response,
  };
}

function extractPhotoIdsFromBatch(batchResult) {
  if (!batchResult) return [];
  const directIds = Array.isArray(batchResult.photoIds) ? batchResult.photoIds : [];
  const resultIds = Array.isArray(batchResult.results)
    ? batchResult.results.map((entry) => entry.photoId)
    : [];
  return uniqueStrings([...directIds, ...resultIds]);
}

function buildBoxIntakeSummary({
  boxResult,
  boxInput,
  photoIds,
  packedItems,
  linkedItems,
}) {
  const boxLabel =
    boxResult.code ?? boxInput.label ?? boxResult.boxId ?? "the selected box";
  const contentText =
    packedItems.length > 0
      ? `${packedItems.length} new content item${packedItems.length === 1 ? "" : "s"}`
      : "no new content items";
  const linkedText =
    linkedItems.length > 0
      ? `${linkedItems.length} existing item${linkedItems.length === 1 ? "" : "s"} linked`
      : "no existing items linked";
  const photoText =
    photoIds.length > 0
      ? `${photoIds.length} photo${photoIds.length === 1 ? "" : "s"} attached`
      : "no photos attached";
  return `${boxResult.action} ${boxLabel}: ${contentText}, ${linkedText}, ${photoText}.`;
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

function normalizeBoxContentItemForBatch(item) {
  const reviewFlags = uniqueStrings([
    ...(item.reviewFlags ?? []),
    "boxContentsReview",
  ]);
  const aiTags = uniqueStrings([...(item.aiTags ?? []), "box-content-capture"]);
  return removeUndefined({
    ...item,
    status: item.status ?? "packed",
    disposition: item.disposition ?? "mover",
    needsReview: item.needsReview ?? true,
    reviewFlags,
    aiTags,
    description:
      item.description ??
      (item.name
        ? `Created while opening box contents: ${item.name}.`
        : undefined),
  });
}

function stripBoxContentPackingFields(item) {
  const itemWriteFields = { ...item };
  delete itemWriteFields.boxQuantity;
  delete itemWriteFields.boxItemNotes;
  return itemWriteFields;
}

export async function batchUpsertMovableUnits(config, input) {
  const boxUnits = [];
  const looseItemUnits = [];
  const looseItemRowsMissingStableKeys = [];
  const autoCodedBoxRowsNeedingIdempotency = new Set();

  for (const [index, unit] of (input.units ?? []).entries()) {
    if (unit.kind === "box") {
      const expandedBoxUnits = expandMovableUnitBoxRows(unit, index);
      boxUnits.push(...expandedBoxUnits);
      if (
        expandedBoxUnits.some(
          ({ unit: boxUnit }) =>
            !hasNonemptyString(boxUnit.boxId) &&
            !hasNonemptyString(boxUnit.code),
        )
      ) {
        autoCodedBoxRowsNeedingIdempotency.add(index);
      }
    } else {
      looseItemUnits.push({ unit, unitIndex: index });
      if (!hasNonemptyString(unit.itemId) && !hasStableExternalItemKey(unit)) {
        looseItemRowsMissingStableKeys.push(index);
      }
    }
  }

  if (looseItemRowsMissingStableKeys.length) {
    throw new Error(
      `batch_upsert_movable_units looseItem rows require itemId for existing units or externalSource plus externalId for new units. Missing stable key on row index${looseItemRowsMissingStableKeys.length === 1 ? "" : "es"} ${looseItemRowsMissingStableKeys.join(", ")}. Use a stable externalSource such as "agent-rough-list" and an externalId such as "garage-treadmill-1" so retries and later measurement patches update the same movable unit instead of creating duplicates.`,
    );
  }

  const autoCodedBoxRetryWarning =
    autoCodedBoxRowsNeedingIdempotency.size &&
    !hasNonemptyString(input.idempotencyKey)
      ? `batch_upsert_movable_units box rows without boxId or code will receive server-generated box codes. Pass a stable idempotencyKey before live writes for row index${autoCodedBoxRowsNeedingIdempotency.size === 1 ? "" : "es"} ${[...autoCodedBoxRowsNeedingIdempotency].join(", ")} so agent retries do not create duplicate auto-coded boxes.`
      : undefined;
  const boxPhotoAttachmentCount = boxUnits.reduce(
    (total, { unit, unitIndex }) =>
      total + photoIdsForMovableUnitBox(unit, unitIndex).length,
    0,
  );

  if (!input.dryRun && autoCodedBoxRetryWarning) {
    throw new Error(
      `${autoCodedBoxRetryWarning} Use explicit box codes or existing boxId rows if you do not want to rely on a batch idempotency key.`,
    );
  }

  const itemRows = looseItemUnits.map(({ unit }) => {
    const item = { ...unit };
    delete item.kind;
    const isExistingItemPatch = Boolean(item.itemId);
    const requiresPersonalTransport =
      item.requiresPersonalTransport === true ||
      item.disposition === "personalTransport";
    const shouldSendMovableUnitTags =
      !isExistingItemPatch || Array.isArray(item.aiTags);
    addDerivedEstimatedVolume(item);
    return {
      ...item,
      ...(isExistingItemPatch ? {} : { status: item.status ?? "active" }),
      ...(isExistingItemPatch ? {} : { quantity: item.quantity ?? 1 }),
      ...(isExistingItemPatch
        ? {}
        : { createdVia: item.createdVia ?? "bulkImport" }),
      ...(isExistingItemPatch ? {} : { needsReview: item.needsReview ?? true }),
      ...(isExistingItemPatch || item.disposition !== undefined
        ? {}
        : {
            disposition: requiresPersonalTransport
              ? "personalTransport"
              : "mover",
          }),
      ...(requiresPersonalTransport &&
      item.requiresPersonalTransport === undefined
        ? { requiresPersonalTransport: true }
        : {}),
      ...(item.estimatedWeightLb !== undefined &&
      item.weightConfidence === undefined
        ? { weightConfidence: "low" }
        : {}),
      ...(item.dimensionsIn !== undefined &&
      item.dimensionsConfidence === undefined
        ? { dimensionsConfidence: "low" }
        : {}),
      ...(item.estimatedVolumeCuFt !== undefined &&
      item.volumeConfidence === undefined
        ? { volumeConfidence: "low" }
        : {}),
      ...(shouldSendMovableUnitTags
        ? {
            aiTags: uniqueStrings([
              ...(item.aiTags ?? []),
              "movable-unit",
              "loose-item",
              ...(requiresPersonalTransport ? ["personal-transport"] : []),
            ]),
          }
        : {}),
      ...(isExistingItemPatch && item.reviewFlags === undefined
        ? {}
        : {
            reviewFlags: uniqueStrings([
              ...(item.reviewFlags ?? []),
              ...(isExistingItemPatch ? [] : ["movableUnitReview"]),
            ]),
          }),
    };
  });

  if (input.dryRun) {
    return {
      dryRun: true,
      summary: removeUndefined({
        totalUnits: boxUnits.length + looseItemUnits.length,
        boxes: boxUnits.length,
        looseItems: looseItemUnits.length,
        photoAttachments: boxPhotoAttachmentCount || undefined,
      }),
      requests: [
        ...boxUnits.flatMap(({ unit, unitIndex, unitCountIndex, unitCount }) => {
          const box = movableUnitBoxRequestBody(unit);
          const boxRequest = {
            method: unit.boxId ? "PATCH" : "POST",
            path: unit.boxId
              ? `/moves/${input.moveId}/boxes/${unit.boxId}`
              : `/moves/${input.moveId}/boxes`,
            body: box,
            unitIndex,
            unitCountIndex,
            unitCount,
          };
          const photoRequests = photoIdsForMovableUnitBox(
            unit,
            unitIndex,
          ).map((photoId, photoIndex) => ({
            method: "POST",
            path: `/photos/${photoId}/attach`,
            body: removeUndefined({
              moveId: input.moveId,
              photoId,
              boxId: unit.boxId,
              boxCode: unit.boxId
                ? undefined
                : box.code ?? normalizeBoxCode(unit.code),
              dryRun: true,
            }),
            unitIndex,
            unitCountIndex,
            unitCount,
            photoIndex,
            deferredTarget:
              unit.boxId || box.code
                ? undefined
                : "Attach to the boxId returned by the preceding live box create request.",
          }));
          return [boxRequest, ...photoRequests];
        }),
        ...(itemRows.length
          ? [
              {
                method: "POST",
                path: `/moves/${input.moveId}/items/batch-upsert`,
                body: { dryRun: true, items: itemRows },
                unitIndexes: looseItemUnits.map(({ unitIndex }) => unitIndex),
              },
            ]
          : []),
      ],
      warnings: autoCodedBoxRetryWarning
        ? [autoCodedBoxRetryWarning]
        : undefined,
      note: `Dry run only. Box rows with boxId would update that box; box rows with code will update an exact existing code on live run or create a box if none exists. Box row photoIds attach to the resolved box after the box upsert. New loose item rows become active, reviewable movable units. Pass itemId to patch an existing loose movable unit without defaulting omitted status, quantity, createdVia, needsReview, reviewFlags, or aiTags.${autoCodedBoxRetryWarning ? " Live writes with auto-coded box rows require a stable idempotencyKey." : ""}`,
    };
  }

  const boxResults = [];
  for (const [
    index,
    { unit, unitIndex, unitCountIndex, unitCount },
  ] of boxUnits.entries()) {
    const result = await upsertMovableUnitBox(config, {
      moveId: input.moveId,
      unit,
      idempotencyKey: scopedIdempotencyKey(
        input.idempotencyKey,
        "box",
        unit,
        index,
      ),
    });
    const photoIds = photoIdsForMovableUnitBox(unit, unitIndex);
    const photoAttachments = photoIds.length
      ? await attachPhotosToMovableUnitBox(config, {
          moveId: input.moveId,
          unit,
          result,
          photoIds,
          idempotencyKey: input.idempotencyKey,
          boxResultIndex: index,
        })
      : [];
    boxResults.push(
      removeUndefined({
        unitIndex,
        unitCountIndex,
        unitCount,
        ...result,
        photoIds: photoIds.length ? photoIds : undefined,
        photoAttachments: photoAttachments.length
          ? photoAttachments
          : undefined,
      }),
    );
  }

  const itemResult = itemRows.length
    ? await batchUpsertItems(config, {
        moveId: input.moveId,
        items: itemRows,
        idempotencyKey: scopedIdempotencyKey(input.idempotencyKey, "items"),
      })
    : null;
  const itemData = itemResult?.data ?? itemResult ?? [];
  const itemResultRows = Array.isArray(itemData?.results)
    ? itemData.results
    : [];
  const looseItemResults = looseItemUnits.map(
    ({ unit, unitIndex }, itemIndex) => {
      const result = itemResultRows.find((row) => row.index === itemIndex);
      return removeUndefined({
        unitIndex,
        itemIndex,
        ok: result?.ok,
        action: result?.action,
        itemId: result?.itemId ?? unit.itemId,
        name: result?.name ?? unit.name,
        externalSource: result?.externalSource ?? unit.externalSource,
        externalId: result?.externalId ?? unit.externalId,
        error: result?.error,
      });
    },
  );

  return {
    data: {
      summary: removeUndefined({
        totalUnits: boxUnits.length + looseItemUnits.length,
        boxes: boxUnits.length,
        looseItems: looseItemUnits.length,
        photoAttachments: boxPhotoAttachmentCount || undefined,
      }),
      boxes: boxResults,
      items: itemData,
      looseItems: looseItemResults,
      nextStep:
        "Open the Load planner Movable units tab, or call get_move_summary/get_agent_context, to review missing weights, dimensions, volume, and load assignments.",
    },
  };
}

function expandMovableUnitBoxRows(unit, unitIndex) {
  const count = parseMovableUnitBoxCount(unit.count);
  const photoIds = photoIdsForMovableUnitBox(unit, unitIndex);
  if (
    count > 1 &&
    (hasNonemptyString(unit.boxId) || hasNonemptyString(unit.code))
  ) {
    throw new Error(
      `batch_upsert_movable_units box row index ${unitIndex} has count ${count} with an existing boxId/code. Expand coded ranges into one row per explicit box code, or omit count when patching an existing box.`,
    );
  }
  if (count > 1 && photoIds.length) {
    throw new Error(
      `batch_upsert_movable_units box row index ${unitIndex} has count ${count} with photoIds. Expand photographed boxes into one row per physical box so each photo attaches to the correct box.`,
    );
  }
  if (count === 1) {
    const singleUnit = { ...unit };
    delete singleUnit.count;
    return [{ unit: singleUnit, unitIndex }];
  }

  const baseLabel = normalizeCountedBoxLabel(unit.label);
  return Array.from({ length: count }, (_, index) => {
    const expandedUnit = {
      ...unit,
      label: `${baseLabel} ${index + 1}`,
    };
    delete expandedUnit.count;
    return {
      unit: expandedUnit,
      unitIndex,
      unitCountIndex: index,
      unitCount: count,
    };
  });
}

function parseMovableUnitBoxCount(count) {
  if (count === undefined || count === null) return 1;
  const parsed = Number(count);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error(
      `batch_upsert_movable_units box count must be an integer from 1 to 100.`,
    );
  }
  return parsed;
}

function normalizeCountedBoxLabel(label) {
  const cleaned = typeof label === "string" ? label.trim() : "";
  const base = cleaned || "Box";
  return base
    .replace(/\bboxes\b/i, "box")
    .replace(/\s+#?\d+$/i, "")
    .trim();
}

export async function updateItem(config, input) {
  const {
    dryRun,
    idempotencyKey,
    researchSourceMode = "append",
    ...bodyInput
  } = input;
  const shouldMergeResearchSources =
    Array.isArray(input.researchSources) && researchSourceMode !== "replace";

  if (dryRun) {
    return {
      dryRun: true,
      request: {
        method: "PATCH",
        path: `/moves/${input.moveId}/items/${input.itemId}`,
        body: bodyInput,
      },
      researchSourceMode: Array.isArray(input.researchSources)
        ? researchSourceMode
        : undefined,
      note: shouldMergeResearchSources
        ? "Dry run only. On a live run, MovingManifest MCP reads the existing item first and appends/merges researchSources before PATCHing the item."
        : undefined,
    };
  }

  let body = bodyInput;
  if (shouldMergeResearchSources) {
    const existingResponse = await getItem(config, input);
    const existingItem = existingResponse.data ?? existingResponse;
    body = {
      ...bodyInput,
      researchSources: mergeItemResearchSources(
        existingItem?.researchSources,
        input.researchSources,
      ),
    };
  }

  return await movingManifestRequest(config, {
    method: "PATCH",
    path: `/moves/${input.moveId}/items/${input.itemId}`,
    body,
    idempotencyKey,
  });
}

function mergeItemResearchSources(existingSources, incomingSources) {
  const merged = [];
  const indexByKey = new Map();

  const pushSource = (source) => {
    if (!source || typeof source !== "object") return;
    const normalized = removeUndefined(source);
    const key = itemResearchSourceKey(normalized);
    if (key && indexByKey.has(key)) {
      const index = indexByKey.get(key);
      merged[index] = removeUndefined({ ...merged[index], ...normalized });
      return;
    }
    if (key) {
      indexByKey.set(key, merged.length);
    }
    merged.push(normalized);
  };

  for (const source of Array.isArray(existingSources) ? existingSources : []) {
    pushSource(source);
  }
  for (const source of Array.isArray(incomingSources) ? incomingSources : []) {
    pushSource(source);
  }

  return merged.slice(0, 25);
}

function itemResearchSourceKey(source) {
  if (typeof source.url === "string" && source.url.trim()) {
    return `url:${source.url.trim().toLowerCase()}`;
  }
  if (typeof source.title === "string" && source.title.trim()) {
    return `title:${source.title.trim().toLowerCase()}`;
  }
  if (typeof source.summary === "string" && source.summary.trim()) {
    return `summary:${source.summary.trim().toLowerCase()}`;
  }
  return undefined;
}

export async function appendItemNote(config, input) {
  const { moveId, itemId, note, label, idempotencyKey, dryRun } = input;
  const body = removeUndefined({ note, label });
  if (dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/moves/${moveId}/items/${itemId}/notes`,
        body,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${moveId}/items/${itemId}/notes`,
    body,
    idempotencyKey,
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
        .some((value) => String(value).toLowerCase().includes(query)),
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
  const body = boxRequestBody(input);
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
  const { moveId, boxId, dryRun, idempotencyKey, ...body } = input;
  normalizeBoxCodeInBody(body);
  if (dryRun) {
    return {
      dryRun: true,
      request: {
        method: "PATCH",
        path: `/moves/${moveId}/boxes/${boxId}`,
        body,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "PATCH",
    path: `/moves/${moveId}/boxes/${boxId}`,
    body,
    idempotencyKey,
  });
}

export async function listBoxes(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/boxes`,
    query: {
      limit: input.limit ?? 50,
      cursor: input.cursor,
      query: input.query,
      destinationRoom: input.destinationRoom,
      destinationSpaceId: input.destinationSpaceId,
    },
  });
}

async function upsertMovableUnitBox(config, { moveId, unit, idempotencyKey }) {
  const box = movableUnitBoxRequestBody(unit);
  if (unit.boxId) {
    const response = await updateBox(config, {
      moveId,
      boxId: unit.boxId,
      ...box,
      idempotencyKey,
    });
    return { action: "updated", boxId: unit.boxId, response };
  }

  const existing = box.code
    ? await findBoxByExactCode(config, moveId, box.code)
    : null;
  if (existing?.boxId) {
    const response = await updateBox(config, {
      moveId,
      boxId: existing.boxId,
      ...box,
      idempotencyKey,
    });
    return {
      action: "updated",
      boxId: existing.boxId,
      code: box.code,
      response,
    };
  }

  const response = await createBox(config, {
    moveId,
    ...box,
    idempotencyKey,
  });
  return {
    action: "created",
    boxId: response?.data?.boxId ?? response?.boxId,
    code: box.code,
    response,
  };
}

function movableUnitBoxRequestBody(unit) {
  const box = { ...unit };
  delete box.kind;
  delete box.boxId;
  delete box.count;
  delete box.photoIds;
  normalizeBoxCodeInBody(box);
  addDerivedEstimatedVolume(box);
  return box;
}

function photoIdsForMovableUnitBox(unit, unitIndex) {
  const photoIds = uniqueStrings(
    Array.isArray(unit.photoIds) ? unit.photoIds : [],
  );
  if (photoIds.length > 20) {
    throw new Error(
      `batch_upsert_movable_units box row index ${unitIndex} has ${photoIds.length} photoIds; attach at most 20 photos to one box row.`,
    );
  }
  return photoIds;
}

function photoAttachmentTargetForMovableUnitBox(unit, result) {
  const boxId = result?.boxId ?? unit.boxId;
  if (hasNonemptyString(boxId)) return { boxId };
  const code = result?.code ?? normalizeBoxCode(unit.code);
  if (hasNonemptyString(code)) return { boxCode: code };
  return {};
}

async function attachPhotosToMovableUnitBox(
  config,
  { moveId, unit, result, photoIds, idempotencyKey, boxResultIndex },
) {
  const target = photoAttachmentTargetForMovableUnitBox(unit, result);
  if (!target.boxId && !target.boxCode) {
    throw new Error(
      "Cannot attach batch_upsert_movable_units box photoIds because the box upsert did not return a boxId or code.",
    );
  }

  const attachments = [];
  for (const [photoIndex, photoId] of photoIds.entries()) {
    const response = await attachPhoto(config, {
      moveId,
      photoId,
      ...target,
      idempotencyKey: scopedIdempotencyKey(
        idempotencyKey,
        `box-photo:${boxResultIndex}`,
        { externalId: photoId },
        photoIndex,
      ),
    });
    attachments.push(removeUndefined({ photoId, ...target, response }));
  }
  return attachments;
}

function boxRequestBody(input) {
  const body = { ...input };
  delete body.dryRun;
  delete body.idempotencyKey;
  return normalizeBoxCodeInBody(body);
}

async function findBoxByExactCode(config, moveId, code) {
  const normalizedCode = normalizeBoxCode(code);
  if (!normalizedCode) {
    return null;
  }
  const response = await listBoxes(config, {
    moveId,
    query: normalizedCode,
    limit: 25,
  });
  const rows = response?.data ?? response?.items ?? [];
  return (
    rows.find((box) => normalizeBoxCode(box.code) === normalizedCode) ?? null
  );
}

export async function addItemsToBox(config, input) {
  const body = {
    moveId: input.moveId,
    boxId: input.boxId,
    boxCode: input.boxCode,
    dryRun: input.dryRun,
    items: input.items.map((item) => ({
      itemId: item.itemId,
      externalSource: item.externalSource,
      externalId: item.externalId,
      quantity: item.quantity,
      notes: item.notes,
    })),
  };
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/moves/${input.moveId}/box-items`,
        body,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/box-items`,
    body,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function removeItemFromBox(config, input) {
  const body = {
    moveId: input.moveId,
    boxId: input.boxId,
    boxCode: input.boxCode,
    itemId: input.itemId,
    externalSource: input.externalSource,
    externalId: input.externalId,
    dryRun: input.dryRun,
  };
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "DELETE",
        path: `/moves/${input.moveId}/box-items`,
        body,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "DELETE",
    path: `/moves/${input.moveId}/box-items`,
    body,
    idempotencyKey: input.idempotencyKey,
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
    idempotencyKey: input.idempotencyKey,
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

export async function listIngestionQueue(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/ingestion-queue`,
    query: {
      limit: input.limit,
      status: input.status,
      room: input.room,
      hasAudio: input.hasAudio,
      hasVideo: input.hasVideo,
      hasImage: input.hasImage,
      includeMedia: input.includeMedia,
      scopeHint: input.scopeHint,
      targetPlanId: input.targetPlanId,
    },
  });
}

export async function createIngestionQueueEntry(config, input) {
  const body = {
    instructions: input.instructions,
    roomHint: input.roomHint ?? input.room,
    dispositionHint: input.dispositionHint,
    scopeHint: input.scopeHint,
    intent: input.intent,
    targetBoxId: input.targetBoxId,
    targetItemId: input.targetItemId,
    targetBoxCode: input.targetBoxCode,
    targetLabel: input.targetLabel,
    targetPlanId: input.targetPlanId,
    mediaPhotoIds: input.mediaPhotoIds,
  };
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/moves/${input.moveId}/ingestion-queue`,
        body,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/ingestion-queue`,
    body,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function claimIngestionQueue(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/ingestion-queue/claim`,
    body: {
      batchSize: input.batchSize,
      agentLabel: input.agentLabel,
      scopeHint: input.scopeHint,
      targetPlanId: input.targetPlanId,
    },
    idempotencyKey: input.idempotencyKey,
  });
}

export async function submitIngestionQueueResults(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/ingestion-queue/${input.entryId}/results`,
    body: {
      agentSummary: input.agentSummary,
      committedItems: input.committedItems,
      committedBoxes: input.committedBoxes,
      boxAssignments: input.boxAssignments,
      loadAssignments: input.loadAssignments,
      proposedItems: input.proposedItems,
      resultItemIds: input.resultItemIds,
      resultRefs: input.resultRefs,
      needsInputQuestion: input.needsInputQuestion,
    },
    idempotencyKey: input.idempotencyKey,
  });
}

export async function setIngestionQueueStatus(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/ingestion-queue/${input.entryId}/status`,
    body: {
      status: input.status,
      question: input.question,
      agentSummary: input.agentSummary,
    },
    idempotencyKey: input.idempotencyKey,
  });
}

export async function getIngestionQueueEvidenceUrl(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/ingestion-queue/${input.entryId}/evidence/${input.photoId}/url`,
    query: {
      variant: input.variant,
    },
  });
}

export async function getIngestionQueueEvidenceMedia(config, input) {
  const photoIds = Array.isArray(input.photoIds)
    ? input.photoIds.filter(Boolean)
    : input.photoId
      ? [input.photoId]
      : [];
  if (!photoIds.length) {
    throw new Error("Provide photoId or at least one photoIds entry.");
  }
  if (photoIds.length > 10) {
    throw new Error(
      "ingestion_queue_media can fetch at most 10 photos at once.",
    );
  }

  const requestedVariant = input.variant ?? "detail";
  const maxBytes = Math.min(
    Math.max(Number(input.maxBytes ?? 8_000_000), 1),
    16_000_000,
  );
  const metadata = {
    moveId: input.moveId,
    entryId: input.entryId,
    requestedVariant,
    maxBytes,
    fetched: [],
    failed: [],
    fallback:
      "If a media item is too large, not an image, or blocked by the client, call ingestion_queue action=evidenceUrl for that photoId and inspect the signed URL directly.",
  };
  const content = [];

  for (const photoId of photoIds) {
    try {
      const urlPayload = await ingestionEvidenceUrlWithFallback(config, {
        moveId: input.moveId,
        entryId: input.entryId,
        photoId,
        variant: requestedVariant,
        fallbackToOriginal: input.fallbackToOriginal !== false,
      });
      const data = urlPayload.data ?? urlPayload;
      const media = await fetchEvidenceMediaBytes({
        url: data.url,
        maxBytes,
        expectedMimeType: data.mimeType,
      });
      if (!media.mimeType?.startsWith("image/")) {
        metadata.failed.push({
          photoId,
          reason: "unsupported_media_kind",
          mimeType: media.mimeType,
          evidenceUrl: data.url,
          mediaKind: data.mediaKind,
        });
        continue;
      }
      metadata.fetched.push({
        photoId,
        moveId: data.moveId,
        entryId: data.entryId,
        requestedVariant,
        servedVariant: data.servedVariant,
        mimeType: media.mimeType,
        sizeBytes: media.bytes.byteLength,
        expiresAt: data.expiresAt,
        deliveryProvider: data.deliveryProvider,
        derivativeStatus: data.derivativeStatus,
      });
      content.push({
        type: "image",
        data: media.bytes.toString("base64"),
        mimeType: media.mimeType,
      });
    } catch (error) {
      const failure = {
        photoId,
        reason: error?.code ?? error?.payload?.error?.code ?? "fetch_failed",
        message:
          error instanceof Error
            ? error.message
            : "Evidence media fetch failed.",
        status: error?.status,
      };
      metadata.failed.push(failure);
      if (input.continueOnError === false) {
        const batchError = new Error(failure.message);
        batchError.payload = { error: failure, partial: metadata };
        throw batchError;
      }
    }
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(metadata, null, 2),
      },
      ...content,
    ],
  };
}

async function ingestionEvidenceUrlWithFallback(config, input) {
  try {
    return await getIngestionQueueEvidenceUrl(config, input);
  } catch (error) {
    const code = error?.payload?.error?.code;
    if (
      input.fallbackToOriginal &&
      input.variant !== "original" &&
      (error?.status === 409 || code === "derivative_not_ready")
    ) {
      return await getIngestionQueueEvidenceUrl(config, {
        ...input,
        variant: "original",
      });
    }
    throw error;
  }
}

export async function createFloorPlanIntake(config, input) {
  const images = floorPlanIntakeImages(input);
  const existingPhotoIds = Array.isArray(input.photoIds)
    ? input.photoIds.filter(Boolean)
    : [];
  let planId = input.planId;
  let planCreateResult;
  if (!planId) {
    const existingPlan = input.dryRun
      ? undefined
      : await firstDestinationPlan(config, input.moveId);
    planId = existingPlan?.planId;
  }
  if (!planId) {
    planCreateResult = await planCreate(config, {
      moveId: input.moveId,
      name: input.planName ?? "AI blueprint draft",
      kind: "destination",
      idempotencyKey: input.idempotencyKey
        ? `${input.idempotencyKey}-plan`
        : undefined,
      dryRun: input.dryRun,
    });
    planId =
      (planCreateResult.data ?? planCreateResult).planId ??
      "PLAN_ID_CREATED_BY_THIS_TOOL";
  }

  const uploaded = [];
  for (const [index, image] of images.entries()) {
    try {
      const upload = await uploadEvidenceFile(config, {
        ...image,
        moveId: input.moveId,
        caption:
          image.caption ??
          input.caption ??
          `Blueprint/floor-plan image ${index + 1}`,
        photoType: "blueprint",
        privacyLevel: input.privacyLevel ?? image.privacyLevel ?? "normal",
        visibilityScope:
          input.visibilityScope ?? image.visibilityScope ?? "moveCollaborators",
        source: input.source ?? image.source ?? "mcp",
        exifHandlingStatus:
          input.exifHandlingStatus ?? image.exifHandlingStatus ?? "pending",
        agentLabel: input.agentLabel ?? image.agentLabel,
        notes:
          image.notes ??
          input.notes ??
          "Blueprint/floor-plan evidence for Layout Studio intake.",
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}-blueprint-${index + 1}`
          : image.idempotencyKey,
        dryRun: input.dryRun,
      });
      uploaded.push({
        index,
        ok: true,
        photoId: upload.photoId ?? `PHOTO_ID_UPLOADED_${index + 1}`,
        upload,
      });
    } catch (error) {
      const failure = {
        index,
        ok: false,
        error:
          error instanceof Error ? error.message : "Blueprint upload failed.",
      };
      uploaded.push(failure);
      if (!input.continueOnImageError) {
        const intakeError = new Error(
          `Blueprint upload ${index + 1} of ${images.length} failed: ${failure.error}`,
        );
        intakeError.partialResults = uploaded;
        throw intakeError;
      }
    }
  }

  const photoIds = [
    ...existingPhotoIds,
    ...uploaded
      .filter((result) => result.ok && result.photoId)
      .map((result) => result.photoId),
  ];
  const queueResult = await createIngestionQueueEntry(config, {
    moveId: input.moveId,
    instructions:
      input.instructions ??
      "Interpret these blueprint/floor-plan images, ask for missing measurements or room labels when needed, and propose Layout Studio plan ops for human review.",
    roomHint: input.roomHint,
    dispositionHint: input.dispositionHint,
    scopeHint: "floorPlan",
    targetPlanId: planId,
    mediaPhotoIds: photoIds,
    idempotencyKey: input.idempotencyKey
      ? `${input.idempotencyKey}-queue`
      : undefined,
    dryRun: input.dryRun,
  });
  const entry = queueResult.data ?? queueResult;
  return {
    entryId: entry.entryId ?? "INGESTION_ENTRY_ID_CREATED_BY_THIS_TOOL",
    planId,
    photoIds,
    planCreate: planCreateResult,
    uploadedBlueprints: uploaded,
    entry,
    nextSteps: [
      "Call floor_plan_context with this moveId and planId to gather the current plan, queue state, questions, and unplaced counts.",
      "Claim floor-plan work with ingestion_queue action=claim, scopeHint=floorPlan, targetPlanId=the returned planId.",
      "Use plan_propose_ops for inferred rooms, walls, underlays, and placements so the user can review before applying.",
      "If interpretation is blocked, set ingestion_queue action=setStatus status=needsInput with a specific question.",
    ],
  };
}

export async function floorPlanContext(config, input) {
  const plansResponse = await plansList(config, {
    moveId: input.moveId,
    limit: 100,
  });
  const plans = plansResponse.data ?? [];
  const planSummary =
    (input.planId
      ? plans.find((plan) => plan.planId === input.planId)
      : undefined) ??
    plans.find(
      (plan) => plan.status === "active" && plan.kind === "destination",
    ) ??
    plans.find((plan) => plan.status === "active") ??
    plans[0];
  const planId = input.planId ?? planSummary?.planId;

  const [
    plan,
    spaces,
    queue,
    questions,
    items,
    boxes,
    plannedItems,
    evidenceLedger,
  ] = await Promise.all([
    planId ? planGet(config, { moveId: input.moveId, planId }) : null,
    collectPaginatedRows((cursor) =>
      listMoveSpaces(config, { moveId: input.moveId, limit: 100, cursor }),
    ),
    listIngestionQueue(config, {
      moveId: input.moveId,
      scopeHint: "floorPlan",
      targetPlanId: planId,
      includeMedia: input.includeMedia ?? true,
      limit: input.queueLimit ?? 25,
    }),
    getMoveQuestions(config, { moveId: input.moveId }),
    collectPaginatedRows((cursor) =>
      searchInventory(config, { moveId: input.moveId, limit: 100, cursor }),
    ),
    collectPaginatedRows((cursor) =>
      listBoxes(config, { moveId: input.moveId, limit: 100, cursor }),
    ),
    collectPaginatedRows((cursor) =>
      listPlannedItems(config, {
        moveId: input.moveId,
        limit: 100,
        cursor,
        includeArchived: false,
      }),
    ),
    planId
      ? floorPlanEvidence(config, {
          action: "list",
          moveId: input.moveId,
          planId,
        })
      : null,
  ]);

  const placed = placedSourceSets(plan);
  const unresolvedQueueQuestions = (queue.data ?? []).filter(
    (entry) => entry.status === "needsInput" && entry.agentQuestion,
  );
  const floorplanEvidenceLedger = evidenceLedger?.data ??
    evidenceLedger ?? {
      evidence: [],
      measurements: [],
      calculations: [],
      latestSolveRun: null,
    };
  return {
    moveId: input.moveId,
    activePlanId: planId,
    plans,
    plan,
    destinationSpaces: spaces.filter((space) =>
      ["destinationRoom", "yardOutdoor", "storage", "custom"].includes(
        space.kind,
      ),
    ),
    floorPlanQueue: queue,
    floorplanEvidence: {
      ...floorplanEvidenceLedger,
      calculations: floorplanEvidenceLedger.calculations ?? [],
    },
    moveQuestions: questions,
    unresolvedAgentQuestions: unresolvedQueueQuestions.map((entry) => ({
      entryId: entry.entryId,
      targetPlanId: entry.targetPlanId,
      question: entry.agentQuestion,
      agentSummary: entry.agentSummary,
      updatedAt: entry.updatedAt,
    })),
    placementProgress: {
      placedInventoryItemCount: placed.itemIds.size,
      placedBoxCount: placed.boxIds.size,
      placedPlannedItemCount: placed.plannedItemIds.size,
      unplacedInventoryItemCount: items.filter(
        (item) => !placed.itemIds.has(String(item.itemId)),
      ).length,
      unplacedBoxCount: boxes.filter(
        (box) => !placed.boxIds.has(String(box.boxId)),
      ).length,
      unplacedPlannedItemCount: plannedItems.filter(
        (item) => !placed.plannedItemIds.has(String(item.plannedItemId)),
      ).length,
      loadedCounts: {
        inventoryItems: items.length,
        boxes: boxes.length,
        plannedItems: plannedItems.length,
      },
    },
    guidance: [
      "Use blueprint media and questions as evidence, but write geometry through plan_propose_ops first.",
      "Use floor_plan_evidence to store extracted image measurements, user edits, official/suspected square footage, lot size, excluded structures, assumptions, and provenance before proposing geometry.",
      "Use floor_plan_calculate to derive conditioned/excluded/footprint totals, lot coverage, square-footage variance, and missing-area estimates from the ledger.",
      "Use floor_plan_solve to validate non-overlap, wall/circulation assumptions, access paths, indoor rooms, excluded structures, and outdoor zones; create proposals only when the user wants a reviewable draft.",
      "Use plan_apply_ops only when the user explicitly approved immediate writes.",
      "When room labels, scale, level mapping, wall thickness, official area variance, access paths, or excluded/conditioned area roles are ambiguous, record the question on the queue with status needsInput or use floor_plan_questions.",
    ],
  };
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
      "Could not determine MIME type. Pass mimeType for files without a known image, audio, or video extension.",
    );
  }

  const dimensions = imageDimensionsFromBuffer(media.bytes, mimeType);
  const width = input.width ?? dimensions?.width;
  const height = input.height ?? dimensions?.height;
  if (mimeType.startsWith("image/") && (!width || !height)) {
    throw new Error(
      "Image uploads require width and height. Pass width and height if they cannot be read from the file.",
    );
  }

  const originalHash =
    input.originalHash ??
    createHash("sha256").update(media.bytes).digest("hex");
  const sessionBody = {
    moveId: input.moveId,
    itemId: input.itemId,
    boxId: input.boxId,
    spaceId: input.spaceId,
    transportResourceId: input.transportResourceId,
    transportZoneId: input.transportZoneId,
    room: input.room,
    agentLabel: input.agentLabel,
    aiConfidenceScore: input.aiConfidenceScore,
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
    agentLabel: input.agentLabel,
    aiConfidenceScore: input.aiConfidenceScore,
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
        finalize: {
          method: "POST",
          path: "/photos/finalize",
          body: finalizeBody,
        },
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
    throw new Error(
      "Provide exactly one of filePath, sourceUrl, dataUrl, or fileBase64.",
    );
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
    agentLabel: input.agentLabel,
    aiConfidenceScore: input.aiConfidenceScore,
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
          `Image upload ${index + 1} of ${images.length} failed: ${failure.error}`,
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

async function loadLocalImageForDirectUpload(input) {
  const bytes = await readFile(input.filePath);
  const fileName = input.fileName ?? path.basename(input.filePath);
  const mimeType = normalizeMimeType(
    input.mimeType ?? sniffMimeType(bytes) ?? mimeTypeForFilename(fileName),
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
  const bytes = Buffer.from(
    decodeURIComponent(match[3]).replace(/\s/g, ""),
    "base64",
  );
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
      "upload_photo accepts JPEG, PNG, or WebP files. Use upload_evidence_file for audio, video, or unsupported media.",
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
  const { idempotencyKey, ...body } = input;
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "POST",
        path: `/photos/${input.photoId}/attach`,
        body,
      },
    };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/photos/${input.photoId}/attach`,
    body,
    idempotencyKey,
  });
}

export async function getPhotoDisplayUrl(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: {
        method: "GET",
        path: `/photos/${input.photoId}/display-url`,
        query: { moveId: input.moveId, variant: input.variant },
      },
      note: "Returns a short-lived URL for a web-ready image derivative, not the original file.",
    };
  }
  return await movingManifestRequest(config, {
    method: "GET",
    path: `/photos/${input.photoId}/display-url`,
    query: {
      moveId: input.moveId,
      variant: input.variant,
    },
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
    return {
      type: "space",
      id: input.spaceId,
      label: `space ${input.spaceId}`,
    };
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

function floorPlanIntakeImages(input) {
  return [
    ...(Array.isArray(input.images) ? input.images : []),
    ...(Array.isArray(input.filePaths)
      ? input.filePaths.map((filePath) => ({ filePath }))
      : []),
    ...(Array.isArray(input.sourceUrls)
      ? input.sourceUrls.map((sourceUrl) => ({ sourceUrl }))
      : []),
  ];
}

async function firstDestinationPlan(config, moveId) {
  const response = await plansList(config, { moveId, limit: 100 });
  const plans = response.data ?? [];
  return (
    plans.find(
      (plan) => plan.status === "active" && plan.kind === "destination",
    ) ??
    plans.find((plan) => plan.status === "active") ??
    plans[0]
  );
}

async function collectPaginatedRows(fetchPage, maxRows = 500) {
  const rows = [];
  let cursor;
  while (rows.length < maxRows) {
    const response = await fetchPage(cursor);
    const pageRows = response?.data ?? [];
    rows.push(...pageRows);
    cursor = response?.page?.nextCursor ?? response?.page?.nextOffset;
    if (!cursor || pageRows.length === 0) {
      break;
    }
  }
  return rows.slice(0, maxRows);
}

function placedSourceSets(plan) {
  const placements = Array.isArray(plan?.placements) ? plan.placements : [];
  const itemIds = new Set();
  const boxIds = new Set();
  const plannedItemIds = new Set();
  for (const placement of placements) {
    const source = placement.source;
    if (!source?.sourceId) continue;
    if (source.kind === "item") itemIds.add(String(source.sourceId));
    if (source.kind === "box") boxIds.add(String(source.sourceId));
    if (source.kind === "plannedItem")
      plannedItemIds.add(String(source.sourceId));
  }
  return { itemIds, boxIds, plannedItemIds };
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

async function fetchEvidenceMediaBytes({ url, maxBytes, expectedMimeType }) {
  if (!url) {
    throw new Error("Evidence URL response did not include a URL.");
  }
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(
      `Could not download evidence media: HTTP ${response.status}.`,
    );
    error.status = response.status;
    throw error;
  }
  const contentLength = Number.parseInt(
    response.headers.get("content-length") ?? "",
    10,
  );
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    const error = new Error(
      `Evidence media is ${contentLength} bytes, above the ${maxBytes} byte MCP inline limit.`,
    );
    error.code = "media_too_large";
    throw error;
  }
  const arrayBuffer = await response.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  if (bytes.byteLength > maxBytes) {
    const error = new Error(
      `Evidence media is ${bytes.byteLength} bytes, above the ${maxBytes} byte MCP inline limit.`,
    );
    error.code = "media_too_large";
    throw error;
  }
  return {
    bytes,
    mimeType:
      normalizeMimeType(response.headers.get("content-type") ?? "") ??
      normalizeMimeType(expectedMimeType) ??
      sniffMimeType(bytes),
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
      request: {
        method: "POST",
        path: `/moves/${input.moveId}/zones`,
        body: input,
      },
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
      .map(([key, entry]) => [key, removeUndefined(entry)]),
  );
}

function uniqueStrings(values) {
  return [
    ...new Set(
      values.filter((value) => typeof value === "string" && value.trim()),
    ),
  ];
}

function hasNonemptyString(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function hasStableExternalItemKey(unit) {
  return (
    hasNonemptyString(unit?.externalSource) &&
    hasNonemptyString(unit?.externalId)
  );
}

function scopedIdempotencyKey(base, scope, unit, index) {
  if (!base) return undefined;
  const stableUnitKey =
    unit?.boxId ??
    (unit?.code ? normalizeBoxCode(unit.code) : undefined) ??
    unit?.externalId ??
    unit?.name ??
    index ??
    "batch";
  return `${base}:${scope}:${stableUnitKey}`;
}
