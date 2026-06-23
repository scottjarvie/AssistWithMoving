import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("API public page copy", () => {
  it("surfaces rough movable-unit intake as a first-class API workflow", () => {
    const source = readSource("src/app/api/page.tsx");

    expect(source).toContain("MovingManifest API");
    expect(source).toContain("Need private access?");
    expect(source).toContain(
      "Start with AI setup. Use a key only when the client needs one.",
    );
    expect(source).toContain(
      "OAuth MCP keeps the user in a browser sign-in flow.",
    );
    expect(source).toContain(
      "that cannot use remote MCP.",
    );
    expect(source).toContain('Link href="/ai"');
    expect(source).toContain("Start AI setup");
    expect(source).toContain("Create helper key");
    expect(source).toContain("CopyTextButton");
    expect(source).toContain("apiReferenceRows");
    expect(source).toContain("Copy ${label} API reference");
    expect(source).toContain("Rough movable units");
    expect(source).toContain("Capture queue");
    expect(source).toContain("intent and target fields");
    expect(source).toContain("POST /moves/{moveId}/ingestion-queue");
    expect(source).toContain(
      "Capture boxes, cartons, totes, and large loose items as load-planning units",
    );
    expect(source).toContain(
      "Patch missing weight, dimensions, volume, or assignment later without duplicating records.",
    );
    expect(source).toContain(
      "POST /moves/{moveId}/movable-units/batch-upsert",
    );
    expect(source).toContain(
      "Dry-run rough movable-unit or detailed item batch changes.",
    );
    expect(source).toContain("POST /moves/{moveId}/items/batch-upsert");
    expect(source).toContain("GET /openapi.json");
    expect(source).not.toContain("Need a key?");
    expect(source).not.toContain(
      "Create a scoped AI helper key before using private routes.",
    );
  });
});
