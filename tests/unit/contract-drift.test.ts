import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { restRouteManifest } from "../../convex/lib/routeManifest.mjs";
import { restRouteFamilies } from "../../convex/lib/restRouteFamilies.mjs";
import { contractDriftResults } from "../../scripts/contract-drift-check.mjs";

describe("REST/OpenAPI/MCP contract drift", () => {
  it("keeps REST manifest, OpenAPI, MCP client paths, and core enums in sync", () => {
    expect(contractDriftResults()).toEqual([]);
  });

  it("keeps high-value extraction candidate route families visible in the manifest", () => {
    const manifestRoutes = new Set(
      restRouteManifest.map((route) => `${route.method} ${route.pathPattern}`)
    );
    const restApiSource = readFileSync(
      resolve(process.cwd(), "convex/restApi.ts"),
      "utf8"
    );

    expect(
      restRouteFamilies.movableUnitsAndBoxContents.firstExtractionCandidate
    ).toBe(true);

    for (const family of Object.values(restRouteFamilies)) {
      expect(family.routes.length).toBeGreaterThan(0);
      expect(family.sourceAnchors.length).toBeGreaterThan(0);

      for (const sourceAnchor of family.sourceAnchors) {
        expect(restApiSource).toContain(sourceAnchor);
      }

      for (const route of family.routes) {
        expect(manifestRoutes).toContain(
          `${route.method} ${route.pathPattern}`
        );
      }
    }
  });

  it("keeps routeRequest edits pointed at the manifest", () => {
    const restApiSource = readFileSync(
      resolve(process.cwd(), "convex/restApi.ts"),
      "utf8"
    );
    expect(restApiSource).toContain("convex/lib/routeManifest.mjs");

    const manifestPaths = new Set(
      restRouteManifest.map((route) => route.pathPattern)
    );
    const routeAnchors = [
      "/me",
      "/moves/{moveId}/summary",
      "/moves/{moveId}/agent-context",
      "/moves/{moveId}/ingestion-queue",
      "/moves/{moveId}/share-links/{shareLinkId}/comments",
      "/plans/{planId}/snapshot.svg",
      "/photos/{photoId}/display-url",
    ];

    for (const path of routeAnchors) {
      expect(manifestPaths).toContain(path);
    }
  });

  it("keeps REST movable-unit itemId patches from defaulting tags", () => {
    const restApiSource = readFileSync(
      resolve(process.cwd(), "convex/restApi.ts"),
      "utf8"
    );

    expect(restApiSource).toContain(
      "const shouldSendMovableUnitTags =\n    !isExistingItemPatch || Array.isArray(item.aiTags);"
    );
    expect(restApiSource).toContain("...(shouldSendMovableUnitTags");
    expect(restApiSource).toContain(
      "without defaulting omitted status, quantity, needsReview, reviewFlags, or aiTags"
    );
  });

  it("keeps movable-unit box count validation in structured REST error responses", () => {
    const restApiSource = readFileSync(
      resolve(process.cwd(), "convex/restApi.ts"),
      "utf8"
    );

    expect(restApiSource).toContain(
      "expanded = expandRestMovableUnitBoxRows(unit, unitIndex);"
    );
    expect(restApiSource).toContain("return restErrorFromUnknown(error);");
    expect(restApiSource).toContain(
      "Box row index ${unitIndex} has count ${count} with an existing boxId/code."
    );
  });
});
