/**
 * The documentation gate for the canonical MCP tool catalog.
 *
 * Why this file exists: on 2026-08-17 a reconciliation found that Moving's
 * public surfaces were accurate while `docs/` and the tracker were a whole Work
 * Order behind — twenty-two places still said the canonical OAuth door exposed
 * "eight tools" when the shipped array had fifteen, and the "authoritative"
 * API guide had become the least accurate MCP document in the repo. Nothing
 * caught it, because nothing derived the count from code.
 *
 * `tests/unit/mcp-capabilities.test.ts` already guards the public surfaces
 * (`public/*.txt`, the marketing pages, `/mcp/guide`). This file extends the
 * same discipline to the maintainer-facing documents, and it is wired into
 * Required CI rather than the informational suite, so a tool added to or removed
 * from the transport blocks the PR until the documents agree.
 *
 * Everything is derived from source. No expected count or tool name is typed as
 * a literal anywhere below.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Number words this repo actually writes out, so a count claim is readable. */
const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
] as const;

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * The canonical catalog, parsed out of the shipped transport.
 *
 * Parsed rather than imported because `convex/httpRoutes/mcp.ts` pulls in Convex
 * codegen and the MCP SDK at module load. The point here is only that the
 * documents cannot disagree with the array a deployment actually serves.
 */
function canonicalToolNames(): string[] {
  const source = read("convex/httpRoutes/mcp.ts");
  const block = source.match(
    /export const STATELESS_MOVING_TOOL_NAMES = \[([\s\S]*?)\] as const;/,
  );
  if (!block) {
    throw new Error(
      "Could not locate STATELESS_MOVING_TOOL_NAMES in convex/httpRoutes/mcp.ts. " +
        "If the array moved or was renamed, update this gate rather than deleting it.",
    );
  }
  const names = [...block[1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
  if (names.length === 0) {
    throw new Error("STATELESS_MOVING_TOOL_NAMES parsed as empty.");
  }
  return names;
}

/** The per-tool scope map, also parsed from source. */
function toolScopes(): Record<string, string> {
  const source = read("convex/lib/aiGrants.ts");
  const block = source.match(
    /export const MOVING_TOOL_SCOPES[^=]*=\s*\{([\s\S]*?)\};/,
  );
  if (!block) {
    throw new Error("Could not locate MOVING_TOOL_SCOPES in convex/lib/aiGrants.ts.");
  }
  const entries = [...block[1].matchAll(/([a-z_]+):\s*"([a-z.]+)"/g)].map(
    (match) => [match[1], match[2]] as const,
  );
  return Object.fromEntries(entries);
}

/**
 * Documents that state present-tense truth about the canonical door, and which
 * must therefore agree with source.
 *
 * Not every markdown file in the repo: dated receipts legitimately record what
 * an older, smaller catalog proved on a given date, and rewriting those would
 * destroy evidence. Instead each file below is scanned with its historical
 * sections skipped (see `RECEIPT_HEADINGS`). Add a file here when it starts
 * making live claims about the catalog.
 */
const LIVE_CLAIM_DOCS = [
  "README.md",
  "AGENTS.md",
  "docs/api-and-mcp.md",
  "docs/planning/assist-with-moving-project-philosophy.md",
  "docs/planning/moving-stateless-mcp-foundation.md",
  "docs/planning/moving-bring-your-ai-mcp-oauth-alignment.md",
] as const;

/**
 * Headings whose sections are dated evidence, not live claims.
 *
 * A receipt saying "the official SDK listed all eight tools" on 2026-08-13 is
 * true and must survive. A capability sentence in the body saying the door
 * "exposes eight tools" today is the drift this gate exists to catch.
 */
const RECEIPT_HEADINGS =
  /(changelog|released evidence|execution evidence|history|receipt|acceptance|proof ladder|deploy readiness)/i;

/** Strip the sections that hold dated evidence, keeping the live body. */
function liveClaimText(markdown: string): string {
  const lines = markdown.split("\n");
  const kept: string[] = [];
  let skipping = false;
  let skipDepth = 0;

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const depth = heading[1].length;
      if (skipping && depth <= skipDepth) skipping = false;
      if (!skipping && RECEIPT_HEADINGS.test(heading[2])) {
        skipping = true;
        skipDepth = depth;
        continue;
      }
    }
    if (!skipping) kept.push(line);
  }

  return kept.join("\n");
}

/**
 * The rows of the API guide's canonical catalog table, and nothing after it.
 *
 * The guide also publishes the much larger API-key registry table further down;
 * scanning past the canonical table's end would silently start asserting things
 * about that one instead.
 */
function canonicalTableRows(): Array<{ tool: string; cells: string[] }> {
  const text = read("docs/api-and-mcp.md");
  const start = text.indexOf("Canonical OAuth tool catalog");
  if (start === -1) {
    throw new Error(
      "docs/api-and-mcp.md must keep a 'Canonical OAuth tool catalog' table.",
    );
  }

  const rows: Array<{ tool: string; cells: string[] }> = [];
  for (const line of text.slice(start).split("\n")) {
    const row = line.match(/^\|\s*`([a-z_]+)`\s*\|(.*)$/);
    if (row) {
      rows.push({
        tool: row[1],
        cells: row[2].split("|").map((cell) => cell.trim()),
      });
      continue;
    }
    // The table ends at the first non-row line after rows have started.
    if (rows.length > 0 && !line.trimStart().startsWith("|")) break;
  }

  if (rows.length === 0) {
    throw new Error("Parsed no rows from the canonical OAuth tool catalog table.");
  }
  return rows;
}

describe("canonical MCP tool catalog cannot drift from documentation", () => {
  const expected = canonicalToolNames();

  it("parses a plausible catalog and scope map out of source", () => {
    // Guards the gate itself: a regex that silently stops matching would make
    // every assertion below vacuous.
    expect(expected.length).toBeGreaterThan(1);
    expect(new Set(expected).size, "duplicate tool name in source").toBe(
      expected.length,
    );
    expect(expected).toContain("describe_connection");

    const scopes = toolScopes();
    // Every tool except the always-available one carries a scope, and the scope
    // map introduces no tool the transport does not serve.
    const scoped = expected.filter((name) => name in scopes);
    expect(scoped.length).toBe(expected.length - 1);
    for (const name of Object.keys(scopes)) {
      expect(expected, `${name} is scoped but not in the catalog`).toContain(name);
    }
  });

  it("states no wrong tool count in any document that makes live claims", () => {
    const correct = new Set<string>([
      String(expected.length),
      NUMBER_WORDS[expected.length] ?? `__no_word_for_${expected.length}__`,
    ]);

    // "eight tools", "eight-tool catalog", "15 workflow tools", and so on.
    const countClaim = new RegExp(
      `\\b(${NUMBER_WORDS.join("|")}|\\d{1,3})[-\\s]+` +
        `(?:[a-z-]+[-\\s]+){0,3}?tools?\\b`,
      "gi",
    );

    for (const path of LIVE_CLAIM_DOCS) {
      const text = liveClaimText(read(path));
      const wrong: string[] = [];

      for (const match of text.matchAll(countClaim)) {
        const phrase = match[0];
        const number = match[1].toLowerCase();
        if (correct.has(number)) continue;
        // 29-tool legacy catalog and 7 API-key Queue tools are different
        // catalogs with their own counts; only claims about the canonical
        // catalog are gated, and those name it.
        const context = text
          .slice(Math.max(0, match.index - 240), match.index + phrase.length + 120)
          .toLowerCase();
        const aboutCanonical =
          /canonical|stateless_moving_tool_names|\/mcp\b/.test(context) &&
          !/legacy|\/mcp\/connect|api-key|api key|\/api\/mcp|stdio|29-tool/.test(
            context,
          );
        if (aboutCanonical) wrong.push(phrase.trim());
      }

      expect(
        wrong,
        `${path} states a canonical tool count that disagrees with ` +
          `STATELESS_MOVING_TOOL_NAMES (${expected.length}). Derive the count from ` +
          `source or name the array instead of retyping a number.`,
      ).toEqual([]);
    }
  });

  it("publishes exactly the shipped catalog in the API guide's tool table", () => {
    // Exact and ordered: a tool added to or removed from the transport must be
    // reflected here before the docs can pass again.
    expect(
      canonicalTableRows().map((row) => row.tool),
      "canonical catalog drift in docs/api-and-mcp.md",
    ).toEqual(expected);
  });

  it("documents each tool's required scope exactly as source assigns it", () => {
    const scopes = toolScopes();

    for (const { tool, cells } of canonicalTableRows()) {
      const scopeCell = cells[0] ?? "";
      const expectedScope = scopes[tool];

      if (expectedScope) {
        expect(
          scopeCell,
          `docs/api-and-mcp.md gives ${tool} the wrong required scope`,
        ).toContain(expectedScope);
      } else {
        // The one tool with no scope must be documented as needing none, not
        // quietly given someone else's.
        expect(
          scopeCell.toLowerCase(),
          `docs/api-and-mcp.md must say ${tool} needs no scope`,
        ).toMatch(/none|always available/);
      }
    }
  });

  it("names four doors, not three, wherever the doors are counted", () => {
    // The stdio server is a public door with its own catalog. Calling it three
    // doors is how a reader concludes a capability is missing.
    for (const path of ["README.md", "AGENTS.md", "docs/api-and-mcp.md"]) {
      const text = liveClaimText(read(path));
      expect(
        text,
        `${path} must not describe the MCP surface as three doors`,
      ).not.toMatch(/three[\s-]+(?:\w+[\s-]+){0,2}doors/i);
    }
  });

  it("keeps the honest Partial and Unknown position in maintainer docs", () => {
    // The reconciliation that added this gate corrected overclaims in one
    // direction only. This asserts it did not also quietly delete the honesty:
    // no named AI client has completed the lifecycle, and the docs must say so.
    const guide = read("docs/api-and-mcp.md");
    expect(guide, "the API guide must not claim a named AI client works").toMatch(
      /no named AI client has completed the lifecycle/i,
    );

    const philosophy = read(
      "docs/planning/assist-with-moving-project-philosophy.md",
    );
    expect(philosophy, "the philosophy must keep its Partial label").toMatch(
      /\bPartial\b/,
    );
    expect(philosophy, "the philosophy must keep clients Unknown").toMatch(
      /\bUnknown\b/,
    );
  });
});
