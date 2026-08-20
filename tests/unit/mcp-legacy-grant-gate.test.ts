/**
 * The legacy MCP gateway's grant boundary.
 *
 * The door at `/mcp/legacy` (public: `movingmanifest.com/mcp/connect`) is the
 * one people are actually connected through, and until this gate it authorized
 * on the strength of a Clerk subject alone: any signed-in identity received all
 * twenty-nine tools with no grant, no scope check and no way to revoke.
 *
 * These tests are the standing proof that it fails closed. The catalog test in
 * particular is the one that keeps working after everybody forgets: adding a
 * tool to `convex/mcp.ts` without deciding its authority breaks the build.
 *
 * They exercise the pure decision function with hand-built grant rows. The
 * database-side proofs — that a revoked grant is not resurrected, and that two
 * distinct clients get two rows — live in the convex-test file
 * `mcp-legacy-grant-lifecycle.test.ts`, because they need `touchLegacyConnection`
 * to actually run.
 */
import { describe, expect, it } from "vitest";

import type { GrantDecisionInput } from "../../convex/lib/aiGrants";
import {
  LEGACY_AUTO_GRANT_SCOPES,
  LEGACY_GATEWAY_NEVER_PERMITTED_TOOLS,
  LEGACY_GATEWAY_TOOL_SCOPES,
  LEGACY_PENDING_POLICY,
  LEGACY_RAISED_SCOPES,
  decideLegacyGatewayAccess,
  legacyGatewayCatalogIsComplete,
  legacyScopeForTool,
  legacyScopeVocabularyIsValid,
} from "../../convex/lib/mcpLegacyGrantGate";
import { tools as legacyTools } from "../../convex/mcp";

const registeredNames = legacyTools.map((tool) => tool.name);
const ALL_SCOPES = [...LEGACY_AUTO_GRANT_SCOPES, ...LEGACY_RAISED_SCOPES];

/** A grant row for the decision function. Active on all moves by default. */
function grant(
  scopes: readonly string[],
  opts: Partial<GrantDecisionInput> = {},
): GrantDecisionInput {
  return {
    scopes,
    moveScope: opts.moveScope ?? "allMoves",
    moveIds: opts.moveIds ?? [],
    status: opts.status ?? "active",
    expiresAt: opts.expiresAt,
  };
}

/** Every scoped tool, but never the media tools while Q9 could reshape them. */
const SCOPED_TOOLS = Object.keys(LEGACY_GATEWAY_TOOL_SCOPES);

describe("legacy gateway catalog", () => {
  it("has an authority decision for every tool the gateway registers", () => {
    const result = legacyGatewayCatalogIsComplete(registeredNames);
    expect(result.undecided).toEqual([]);
    expect(result.unknown).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("only uses scopes that exist in the Moving vocabulary", () => {
    expect(legacyScopeVocabularyIsValid()).toBe(true);
  });

  it("covers the whole live surface rather than a sample of it", () => {
    expect(registeredNames.length).toBe(29);
    expect(
      Object.keys(LEGACY_GATEWAY_TOOL_SCOPES).length +
        LEGACY_GATEWAY_NEVER_PERMITTED_TOOLS.length,
    ).toBe(29);
  });
});

describe("no grant means no tools", () => {
  it("refuses every scoped tool when the caller holds no grant", () => {
    for (const name of SCOPED_TOOLS) {
      const decision = decideLegacyGatewayAccess({
        toolName: name,
        grants: [],
        mode: "call",
      });
      expect(decision.allowed, `${name} must be refused without a grant`).toBe(
        false,
      );
    }
  });

  it("refuses an unknown tool rather than defaulting it open", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "some_tool_added_next_week",
      grants: [grant(ALL_SCOPES)],
      mode: "call",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.refusalCode).toBe("GRANT_SCOPE_MISSING");
  });

  it("refuses an anonymous caller before looking at scopes", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "list_items",
      grants: [grant(ALL_SCOPES)],
      mode: "call",
      block: "noIdentity",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.refusalCode).toBe("AUTH_REQUIRED");
  });
});

describe("a grant governs, and only for its own scope", () => {
  it("allows a tool the grant covers", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "list_items",
      grants: [grant(["moving.context.read"])],
      moveId: "move_a",
      mode: "call",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.scope).toBe("moving.context.read");
  });

  it("does not let reading context imply reading private photos", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "get_images",
      grants: [grant(["moving.context.read"])],
      moveId: "move_a",
      mode: "call",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.refusalCode).toBe("GRANT_SCOPE_MISSING");
  });

  it("does not let reading imply writing", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "upsert_items",
      grants: [grant(["moving.context.read", "moving.evidence.read"])],
      moveId: "move_a",
      mode: "call",
    });
    expect(decision.allowed).toBe(false);
  });

  it("does not let writing imply archiving", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "archive_item",
      grants: [grant(["moving.work.write", "moving.queue.work"])],
      moveId: "move_a",
      mode: "call",
    });
    expect(decision.allowed).toBe(false);
  });
});

describe("per-move enforcement — the fix for a flat scope union", () => {
  it("permits a selectedMoves grant only on the move it names", () => {
    const grants = [
      grant(["moving.context.read"], {
        moveScope: "selectedMoves",
        moveIds: ["move_a"],
      }),
    ];
    expect(
      decideLegacyGatewayAccess({
        toolName: "list_items",
        grants,
        moveId: "move_a",
        mode: "call",
      }).allowed,
    ).toBe(true);
    const other = decideLegacyGatewayAccess({
      toolName: "list_items",
      grants,
      moveId: "move_b",
      mode: "call",
    });
    expect(other.allowed).toBe(false);
    expect(other.refusalCode).toBe("GRANT_MOVE_MISSING");
  });

  it("never sums scopes across two grants into authority neither carries", () => {
    // Grant A: context.read on move_a only. Grant B: work.write on all moves.
    // The union {context.read, work.write} would wrongly let the AI read
    // move_b. findPermittingGrant must refuse: no single grant permits it.
    const grants = [
      grant(["moving.context.read"], {
        moveScope: "selectedMoves",
        moveIds: ["move_a"],
      }),
      grant(["moving.work.write"], { moveScope: "allMoves" }),
    ];
    const readOther = decideLegacyGatewayAccess({
      toolName: "list_items", // needs context.read
      grants,
      moveId: "move_b",
      mode: "call",
    });
    expect(readOther.allowed).toBe(false);
    expect(readOther.refusalCode).toBe("GRANT_MOVE_MISSING");

    // But work.write on move_b is legitimately covered by grant B alone.
    expect(
      decideLegacyGatewayAccess({
        toolName: "upsert_items",
        grants,
        moveId: "move_b",
        mode: "call",
      }).allowed,
    ).toBe(true);
  });

  it("refuses a call whose grant expired, even with the right scope", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "list_items",
      grants: [grant(["moving.context.read"], { expiresAt: Date.now() - 1 })],
      moveId: "move_a",
      mode: "call",
    });
    expect(decision.allowed).toBe(false);
  });
});

describe("listing is a question, calling is an act", () => {
  it("lists a tool held on some move even without a move named", () => {
    const grants = [
      grant(["moving.context.read"], {
        moveScope: "selectedMoves",
        moveIds: ["move_a"],
      }),
    ];
    // tools/list: no moveId, but the scope is held somewhere → listable.
    expect(
      decideLegacyGatewayAccess({
        toolName: "list_items",
        grants,
        mode: "list",
      }).allowed,
    ).toBe(true);
    // tools/call with no moveId on a selectedMoves grant → refused.
    expect(
      decideLegacyGatewayAccess({
        toolName: "list_items",
        grants,
        mode: "call",
      }).allowed,
    ).toBe(false);
  });
});

describe("signing in is the approval, but not for everything", () => {
  it("hands over reading, evidence, writing and queue work", () => {
    for (const name of SCOPED_TOOLS) {
      const scope = legacyScopeForTool(name);
      if (!scope || LEGACY_RAISED_SCOPES.includes(scope)) continue;
      expect(
        decideLegacyGatewayAccess({
          toolName: name,
          grants: [grant(LEGACY_AUTO_GRANT_SCOPES)],
          moveId: "move_a",
          mode: "call",
        }).allowed,
        `${name} should work on a sign-in grant`,
      ).toBe(true);
    }
  });

  it("does not hand over the destructive verb", () => {
    expect(LEGACY_AUTO_GRANT_SCOPES).not.toContain("moving.archive");
    expect(
      decideLegacyGatewayAccess({
        toolName: "archive_item",
        grants: [grant(LEGACY_AUTO_GRANT_SCOPES)],
        moveId: "move_a",
        mode: "call",
      }).allowed,
    ).toBe(false);
  });

  it("keeps the raised list separate rather than derived by subtraction", () => {
    for (const scope of LEGACY_RAISED_SCOPES) {
      expect(LEGACY_AUTO_GRANT_SCOPES).not.toContain(scope);
    }
  });
});

describe("the product ceiling outranks every grant", () => {
  it("never lets an AI change who can reach a move", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "add_move_participant",
      grants: [grant(ALL_SCOPES)],
      moveId: "move_a",
      mode: "call",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.refusalCode).toBe("NEVER_PERMITTED");
  });
});

describe("Q8 and Q9 are one-line rulings, wired both ways", () => {
  it("permits capture_to_queue while the enqueue setting stands (default)", () => {
    expect(LEGACY_PENDING_POLICY.captureToQueue).toBe("enqueueAllowed");
    expect(
      decideLegacyGatewayAccess({
        toolName: "capture_to_queue",
        grants: [grant(["moving.work.write"])],
        moveId: "move_a",
        mode: "call",
      }).allowed,
    ).toBe(true);
  });

  it("keeps media writes in the standard tier by default", () => {
    expect(LEGACY_PENDING_POLICY.mediaWriteTier).toBe("standard");
    for (const name of ["add_images", "attach_photos"]) {
      expect(
        decideLegacyGatewayAccess({
          toolName: name,
          grants: [grant(["moving.work.write"])],
          moveId: "move_a",
          mode: "call",
        }).allowed,
        `${name} should work under the standard media tier`,
      ).toBe(true);
    }
  });
});

describe("refusals name the actor who can lift them", () => {
  it("tells a revoked connection to reconnect, never that it cannot", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "list_items",
      grants: [],
      mode: "call",
      block: "revoked",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/reconnect/i);
    expect(decision.reason).toContain("/settings/ai");
    expect(decision.reason).not.toMatch(/\bcannot\b/i);
  });

  it("does not blame the account for a lookup it could not run", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "list_items",
      grants: [],
      mode: "call",
      block: "lookupFailed",
    });
    expect(decision.reason).toMatch(/temporary|try again/i);
    expect(decision.reason).not.toMatch(/does not exist|no active.*profile/i);
  });

  it("does not tell a person they revoked something when they hit the limit", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "list_items",
      grants: [],
      mode: "call",
      block: "connectionLimit",
    });
    expect(decision.reason).toMatch(/maximum number of AI connections/i);
    expect(decision.reason).not.toMatch(/revoked/i);
  });

  it("refuses to silently share one grant across unidentified clients", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "list_items",
      grants: [],
      mode: "call",
      block: "unidentifiedClient",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/did not identify itself/i);
    expect(decision.reason).toContain("/settings/ai");
  });

  it("keeps every refusal message plain ASCII", () => {
    const blocks = [
      undefined,
      "noIdentity",
      "noProfile",
      "unidentifiedClient",
      "lookupFailed",
      "connectionLimit",
      "revoked",
      "expired",
      "noHousehold",
    ] as const;
    for (const block of blocks) {
      for (const name of [...registeredNames, "unknown_tool"]) {
        const { reason } = decideLegacyGatewayAccess({
          toolName: name,
          grants: [],
          mode: "call",
          block,
        });
        if (!reason) continue;
        expect(/^[\x20-\x7E]*$/.test(reason), `${name}/${block}: ${reason}`).toBe(
          true,
        );
      }
    }
  });
});
