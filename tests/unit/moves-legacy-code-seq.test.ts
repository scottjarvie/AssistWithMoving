import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the deploy path against a schema-validation failure that has already
// blocked a release once.
//
// An abandoned performance branch (commit 8ebdc13, never merged to main) added
// `nextItemCodeSeq` / `nextBoxCodeSeq` to the moves table and was pushed to the
// shared development deployment, which wrote those fields onto real documents.
// The branch was dropped, but the documents kept the fields. Convex validates
// every document in a table on every push, so a schema without these fields
// fails the push with "Object contains extra field ... not in the validator" —
// which blocks `convex dev` and, on any deployment carrying such a row,
// `convex deploy`.
//
// These fields must therefore stay declared as optional until the documented
// cleanup in docs/operations/convex-legacy-code-seq-cleanup.md has been run and
// verified against every deployment. Deleting them from the schema first turns
// the next deploy into an outage.

const schemaSource = readFileSync(
  resolve(__dirname, "../../convex/schema.ts"),
  "utf8",
);

function movesTableBlock(source: string): string {
  const headerRegex = /^ {2}(\w+): defineTable\(/gm;
  const headers: Array<{ name: string; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(source)) !== null) {
    headers.push({ name: match[1], index: match.index });
  }

  const position = headers.findIndex((header) => header.name === "moves");
  expect(
    position,
    "convex/schema.ts should declare a top-level `moves` table",
  ).toBeGreaterThanOrEqual(0);

  const start = headers[position].index;
  const end =
    position + 1 < headers.length ? headers[position + 1].index : source.length;
  return source.slice(start, end);
}

describe("moves legacy code-sequence fields", () => {
  const block = movesTableBlock(schemaSource);

  it.each(["nextItemCodeSeq", "nextBoxCodeSeq"])(
    "keeps %s declared as an optional number on the moves table",
    (field) => {
      expect(
        block,
        `moves.${field} must stay in the schema as v.optional(v.number()). ` +
          "Documents written by the abandoned code-reservation branch still " +
          "carry it, and Convex fails the whole push on an extra field. " +
          "Run docs/operations/convex-legacy-code-seq-cleanup.md against every " +
          "deployment before removing it.",
      ).toMatch(new RegExp(`\\n {4}${field}: v\\.optional\\(v\\.number\\(\\)\\),`));
    },
  );

  it("explains in the schema why the fields are retained", () => {
    expect(block).toContain(
      "docs/operations/convex-legacy-code-seq-cleanup.md",
    );
  });

  it("has no live backend code reading or writing the legacy counters", () => {
    // If a future change revives the code-reservation work, these fields stop
    // being dead compatibility surface and this guard's framing — plus the
    // cleanup runbook — needs to be rewritten rather than silently outgrown.
    const convexDir = resolve(__dirname, "../../convex");
    const offenders = readdirSync(convexDir, {
      recursive: true,
      encoding: "utf8",
    })
      .filter((entry) => entry.endsWith(".ts") && entry !== "schema.ts")
      .filter((entry) =>
        /next(?:Item|Box)CodeSeq/.test(
          readFileSync(resolve(convexDir, entry), "utf8"),
        ),
      );

    expect(
      offenders,
      "Only convex/schema.ts should mention the legacy code-sequence counters.",
    ).toEqual([]);
  });
});
