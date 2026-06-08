import { randomUUID } from "node:crypto";

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

export async function listMoves(config, input = {}) {
  return await movingManifestRequest(config, {
    path: "/moves",
    query: { limit: input.limit },
  });
}

export async function getMoveSummary(config, input) {
  const [move, resources, zones, items, boxes, assignments, photos] =
    await Promise.all([
      movingManifestRequest(config, { path: `/moves/${input.moveId}` }),
      movingManifestRequest(config, { path: `/moves/${input.moveId}/resources` }),
      movingManifestRequest(config, { path: `/moves/${input.moveId}/zones` }),
      movingManifestRequest(config, {
        path: `/moves/${input.moveId}/items`,
        query: { limit: input.limit ?? 25 },
      }),
      movingManifestRequest(config, {
        path: `/moves/${input.moveId}/boxes`,
        query: { limit: input.limit ?? 25 },
      }),
      movingManifestRequest(config, { path: `/moves/${input.moveId}/assignments` }),
      movingManifestRequest(config, {
        path: `/moves/${input.moveId}/photos`,
        query: { limit: input.limit ?? 25 },
      }),
    ]);

  return { move: move.data, resources, zones, items, boxes, assignments, photos };
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
    return { dryRun: true, request: { path: `/moves/${input.moveId}/items`, body: input } };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/items`,
    body: input,
  });
}

export async function updateItem(config, input) {
  if (input.dryRun) {
    return {
      dryRun: true,
      request: { path: `/moves/${input.moveId}/items/${input.itemId}`, body: input },
    };
  }
  return await movingManifestRequest(config, {
    method: "PATCH",
    path: `/moves/${input.moveId}/items/${input.itemId}`,
    body: input,
  });
}

export async function createBox(config, input) {
  if (input.dryRun) {
    return { dryRun: true, request: { path: `/moves/${input.moveId}/boxes`, body: input } };
  }
  return await movingManifestRequest(config, {
    method: "POST",
    path: `/moves/${input.moveId}/boxes`,
    body: input,
  });
}

export async function addItemsToBox(config, input) {
  if (input.dryRun) {
    return { dryRun: true, assignments: input.items };
  }
  const results = [];
  for (const item of input.items) {
    results.push(
      await movingManifestRequest(config, {
        method: "POST",
        path: `/moves/${input.moveId}/assignments`,
        body: {
          boxId: input.boxId,
          itemId: item.itemId,
          quantity: item.quantity,
          notes: item.notes,
        },
      })
    );
  }
  return { data: results };
}

export async function startPhotoUpload(config, input) {
  return await movingManifestRequest(config, {
    method: "POST",
    path: "/uploads/init",
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

export async function listDocumentationProfiles(config, input) {
  return await movingManifestRequest(config, {
    path: `/moves/${input.moveId}/documentation-profiles`,
    query: { limit: input.limit },
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

function removeUndefined(value) {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, removeUndefined(entry)])
  );
}
