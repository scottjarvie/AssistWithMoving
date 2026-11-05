import assert from "node:assert/strict";

/** Reject mismatched or modified evidence before any browser is launched. */
export function assertFrozenFixture(source, current) {
  assert.equal(source.sourceHead, current.head, "Rebuild the fixture at this exact candidate HEAD before capture");
  assert.equal(source.sourceDirty, false, "Fixture source was dirty at generation");
  assert.equal(current.dirty, false, "Commit application and tooling changes before frozen-candidate capture");
  assert.deepEqual(source.artifactHashes, current.artifactHashes, "Generated fixture artifacts differ from their provenance");
}
