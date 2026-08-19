/**
 * The MCP tool handlers must never be public Convex functions.
 *
 * Every handler in these five modules takes the caller's identity as a plain
 * argument — `caller.subject`, a Clerk user id string — and resolves the person
 * from it with `requireUserBySubject`. None of them consult `ctx.auth`, and
 * they cannot: `ctx.auth` is null across the gateway component boundary, which
 * is exactly why the argument exists.
 *
 * That design is safe only while nothing outside this deployment can supply the
 * argument. A **public** Convex function is callable by anybody who has the
 * deployment URL, and the deployment URL is not a secret — it ships to every
 * browser in the client bundle as `NEXT_PUBLIC_CONVEX_URL`. Exported as
 * `query`/`mutation`/`action`, these handlers therefore accepted an
 * unauthenticated caller who simply asserted whose data they wanted, which
 * walks straight past OAuth, the grant, its scopes, the never-permitted list,
 * revocation, and the activity receipts — every boundary the product has.
 *
 * `internalQuery`/`internalMutation`/`internalAction` are reachable only from
 * inside the deployment, which is what makes the injected `caller` trustworthy.
 * `convex/mcpToolsCanonicalQueue.ts` was already written this way and is the
 * pattern the rest now follow.
 *
 * This test is the standing guard. It fails on the next handler exported
 * publicly, whether by habit, by copy-paste, or by a merge that resolves the
 * wrong way.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Every module whose exports take a caller-supplied identity. */
const IDENTITY_ARGUMENT_MODULES = [
  "convex/mcpTools.ts",
  "convex/mcpToolsWrite.ts",
  "convex/mcpToolsImages.ts",
  "convex/mcpToolsQueue.ts",
  "convex/mcpToolsSetup.ts",
  "convex/mcpToolsCanonicalQueue.ts",
];

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** `export const foo = query({` and friends, public constructors only. */
const PUBLIC_EXPORT = /^export const (\w+) = (query|mutation|action)\(\{/gm;
const INTERNAL_EXPORT =
  /^export const (\w+) = (internalQuery|internalMutation|internalAction)\(\{/gm;

describe("MCP tool handlers are not publicly callable", () => {
  for (const modulePath of IDENTITY_ARGUMENT_MODULES) {
    it(`${modulePath} exports no public Convex function`, () => {
      const source = read(modulePath);
      const offenders = [...source.matchAll(PUBLIC_EXPORT)].map(
        (match) => `${match[1]} (${match[2]})`,
      );
      expect(
        offenders,
        `${modulePath} exports these publicly; a public Convex function is callable by anyone with the deployment URL, and these trust a caller-supplied identity`,
      ).toEqual([]);
    });
  }

  it("still exports the handlers, as internal ones", () => {
    // Guards the lazy way to make the test above pass: deleting the tools.
    const counts = Object.fromEntries(
      IDENTITY_ARGUMENT_MODULES.map((modulePath) => [
        modulePath,
        [...read(modulePath).matchAll(INTERNAL_EXPORT)].length,
      ]),
    );
    expect(counts).toEqual({
      "convex/mcpTools.ts": 6,
      "convex/mcpToolsWrite.ts": 8,
      "convex/mcpToolsImages.ts": 5,
      "convex/mcpToolsQueue.ts": 3,
      "convex/mcpToolsSetup.ts": 9,
      "convex/mcpToolsCanonicalQueue.ts": 7,
    });
  });

  it("never imports the public api surface for its own modules", () => {
    // A self-reference through `api.` would resolve to a public function that
    // no longer exists, and re-adding one to fix it would reopen the hole.
    for (const modulePath of IDENTITY_ARGUMENT_MODULES) {
      expect(read(modulePath), modulePath).not.toMatch(/\bapi\.mcpTools/);
    }
  });
});

describe("the gateway reaches the handlers internally", () => {
  const registry = read("convex/mcp.ts");

  it("registers every tool through an internal reference", () => {
    const references = [...registry.matchAll(/fn: (\w+)\.(mcpTools\w*)\./g)];
    expect(references.length).toBeGreaterThan(0);
    const roots = new Set(references.map((match) => match[1]));
    expect(roots).toEqual(new Set(["internal"]));
  });

  it("registers one tool per catalogued name", () => {
    expect([...registry.matchAll(/^\s+fn: internal\./gm)].length).toBe(29);
  });
});
