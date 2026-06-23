export const restRouteFamilies = {
  movableUnitsAndBoxContents: {
    description:
      "Rough movable-unit intake plus box item assignment routes for agent load planning.",
    firstExtractionCandidate: true,
    sourceAnchors: [
      "async function routeMovableUnits",
      "async function routeMoveBoxItems",
      "async function routeTopLevelBoxItems",
      'nestedSegment === "items"',
    ],
    routes: [
      route("POST", "/moves/{moveId}/movable-units/batch-upsert"),
      route("POST", "/moves/{moveId}/boxes/{boxId}/items"),
      route("PUT", "/moves/{moveId}/boxes/{boxId}/items"),
      route("DELETE", "/moves/{moveId}/boxes/{boxId}/items"),
      route("POST", "/moves/{moveId}/box-items"),
      route("PUT", "/moves/{moveId}/box-items"),
      route("DELETE", "/moves/{moveId}/box-items"),
      route("POST", "/boxes/{boxId}/items"),
      route("DELETE", "/boxes/{boxId}/items/{itemId}"),
    ],
  },
  ingestionQueue: {
    description:
      "Agent capture queue, claim, result, status, and evidence retrieval routes.",
    firstExtractionCandidate: false,
    sourceAnchors: ["async function routeIngestionQueue"],
    routes: [
      route("GET", "/moves/{moveId}/ingestion-queue"),
      route("POST", "/moves/{moveId}/ingestion-queue"),
      route("POST", "/moves/{moveId}/ingestion-queue/claim"),
      route("POST", "/moves/{moveId}/ingestion-queue/{entryId}/results"),
      route("POST", "/moves/{moveId}/ingestion-queue/{entryId}/status"),
      route(
        "GET",
        "/moves/{moveId}/ingestion-queue/{entryId}/evidence/{photoId}/url",
      ),
    ],
  },
  documentationProfiles: {
    description:
      "Scoped documentation profile read/create/update/archive routes for exports.",
    firstExtractionCandidate: false,
    sourceAnchors: ["async function routeDocumentationProfiles"],
    routes: [
      route("GET", "/moves/{moveId}/documentation-profiles"),
      route("POST", "/moves/{moveId}/documentation-profiles"),
      route(
        "GET",
        "/moves/{moveId}/documentation-profiles/{documentationProfileId}",
      ),
      route(
        "PATCH",
        "/moves/{moveId}/documentation-profiles/{documentationProfileId}",
      ),
      route(
        "DELETE",
        "/moves/{moveId}/documentation-profiles/{documentationProfileId}",
      ),
      route(
        "POST",
        "/moves/{moveId}/documentation-profiles/{documentationProfileId}/archive",
      ),
    ],
  },
};

function route(method, pathPattern) {
  return { method, pathPattern };
}
