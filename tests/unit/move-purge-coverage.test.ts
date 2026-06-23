import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Guards moves.purge against silently leaving data behind: every table in the
// schema that carries a top-level moveId must be deleted by the purge cascade.
// If someone adds a new move-scoped table and forgets the purge list, this
// fails — orphaned rows after a "permanently delete" are the bug we prevent.

const schemaSource = readFileSync(
  resolve(__dirname, "../../convex/schema.ts"),
  "utf8",
);
const movesSource = readFileSync(
  resolve(__dirname, "../../convex/moves.ts"),
  "utf8",
);

function tablesWithMoveId(source: string): string[] {
  // Locate each top-level `name: defineTable(` and slice to the next one, then
  // keep the tables whose block declares a top-level moveId field.
  const headerRegex = /^ {2}(\w+): defineTable\(/gm;
  const headers: Array<{ name: string; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(source)) !== null) {
    headers.push({ name: match[1], index: match.index });
  }

  const moveScoped: string[] = [];
  for (let i = 0; i < headers.length; i += 1) {
    const start = headers[i].index;
    const end = i + 1 < headers.length ? headers[i + 1].index : source.length;
    const block = source.slice(start, end);
    if (/\n {4}moveId: v\./.test(block)) {
      moveScoped.push(headers[i].name);
    }
  }
  return moveScoped;
}

function purgeTableNames(source: string): Set<string> {
  const names = new Set<string>();
  const tableRegex = /\btable:\s*"(\w+)"/g;
  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(source)) !== null) {
    names.add(match[1]);
  }
  // moveRoleGrants is handled on its own branch, by name.
  if (/"moveRoleGrants"/.test(source)) {
    names.add("moveRoleGrants");
  }
  return names;
}

describe("move purge coverage", () => {
  const expected = tablesWithMoveId(schemaSource);
  const covered = purgeTableNames(movesSource);

  it("finds a meaningful set of move-scoped tables in the schema", () => {
    // Sanity: the parser actually matched tables (guards against a regex that
    // silently returns nothing and makes the coverage check vacuous).
    expect(expected.length).toBeGreaterThan(20);
    expect(expected).toContain("items");
    expect(expected).toContain("boxes");
    expect(expected).toContain("ingestionQueueEntries");
  });

  it("deletes every move-scoped table when a move is purged", () => {
    const missing = expected.filter((table) => !covered.has(table));
    expect(missing).toEqual([]);
  });

  it("does not list tables that no longer carry a moveId", () => {
    const schemaTables = new Set(expected);
    const stale = [...covered].filter((table) => !schemaTables.has(table));
    expect(stale).toEqual([]);
  });
});
