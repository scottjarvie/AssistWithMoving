import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { assertFrozenFixture } from "../../design-council/tools/frozen-fixture.mjs";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const hashes = { "index.html": hash("synthetic HTML"), "components.js": hash("synthetic component bundle") };
const source = { sourceHead: "synthetic-candidate", sourceDirty: false, artifactHashes: hashes };
const current = { head: "synthetic-candidate", dirty: false, artifactHashes: hashes };

describe("frozen council evidence preflight", () => {
  it("accepts clean artifacts from the requested candidate", () => {
    expect(() => assertFrozenFixture(source, current)).not.toThrow();
  });
  it("rejects an older bundle even when both commits were clean", () => {
    expect(() => assertFrozenFixture({ ...source, sourceHead: "older-candidate" }, current)).toThrow(/exact candidate HEAD/);
  });
  it("rejects source edits at generation or capture time", () => {
    expect(() => assertFrozenFixture({ ...source, sourceDirty: true }, current)).toThrow(/dirty at generation/);
    expect(() => assertFrozenFixture(source, { ...current, dirty: true })).toThrow(/Commit application and tooling changes/);
  });
  it.each(["index.html", "components.js"] as const)("rejects modified %s bytes", file => {
    expect(() => assertFrozenFixture(source, { ...current, artifactHashes: { ...hashes, [file]: hash("modified artifact") } })).toThrow(/differ from their provenance/);
  });
  it("rejects artifacts lacking generation hashes", () => {
    expect(() => assertFrozenFixture({ ...source, artifactHashes: undefined }, current)).toThrow(/differ from their provenance/);
  });
});
