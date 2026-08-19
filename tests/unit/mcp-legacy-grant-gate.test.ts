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
 */
import { describe, expect, it } from "vitest";

import {
  LEGACY_AUTO_GRANT_SCOPES,
  LEGACY_GATEWAY_NEVER_PERMITTED_TOOLS,
  LEGACY_GATEWAY_TOOL_SCOPES,
  LEGACY_RAISED_SCOPES,
  decideLegacyGatewayAccess,
  legacyGatewayCatalogIsComplete,
  legacyScopeForTool,
  legacyScopeVocabularyIsValid,
} from "../../convex/lib/mcpLegacyGrantGate";
import { tools as legacyTools } from "../../convex/mcp";

const registeredNames = legacyTools.map((tool) => tool.name);
const ALL_SCOPES = [...LEGACY_AUTO_GRANT_SCOPES, ...LEGACY_RAISED_SCOPES];

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
    for (const name of Object.keys(LEGACY_GATEWAY_TOOL_SCOPES)) {
      const decision = decideLegacyGatewayAccess({
        toolName: name,
        grantedScopes: [],
      });
      expect(decision.allowed, `${name} must be refused without a grant`).toBe(
        false,
      );
    }
  });

  it("refuses an unknown tool rather than defaulting it open", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "some_tool_added_next_week",
      grantedScopes: ALL_SCOPES,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.refusalCode).toBe("GRANT_SCOPE_MISSING");
  });

  it("refuses an anonymous caller before looking at scopes", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "list_items",
      grantedScopes: ALL_SCOPES,
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
      grantedScopes: ["moving.context.read"],
    });
    expect(decision.allowed).toBe(true);
    expect(decision.scope).toBe("moving.context.read");
  });

  it("does not let reading context imply reading private photos", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "get_images",
      grantedScopes: ["moving.context.read"],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.refusalCode).toBe("GRANT_SCOPE_MISSING");
  });

  it("does not let reading imply writing", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "upsert_items",
      grantedScopes: ["moving.context.read", "moving.evidence.read"],
    });
    expect(decision.allowed).toBe(false);
  });

  it("does not let writing imply working the queue", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "claim_queue",
      grantedScopes: ["moving.work.write"],
    });
    expect(decision.allowed).toBe(false);
  });

  it("does not let writing imply archiving", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "archive_item",
      grantedScopes: ["moving.work.write", "moving.queue.work"],
    });
    expect(decision.allowed).toBe(false);
  });
});

describe("signing in is the approval, but not for everything", () => {
  it("hands over reading, evidence, writing and queue work", () => {
    for (const name of Object.keys(LEGACY_GATEWAY_TOOL_SCOPES)) {
      const scope = legacyScopeForTool(name);
      if (!scope || LEGACY_RAISED_SCOPES.includes(scope)) continue;
      expect(
        decideLegacyGatewayAccess({
          toolName: name,
          grantedScopes: LEGACY_AUTO_GRANT_SCOPES,
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
        grantedScopes: LEGACY_AUTO_GRANT_SCOPES,
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
    // convex/lib/aiGrants.ts NEVER_PERMITTED, shipped as product copy: an AI
    // may never "Invite, remove, or change the access of anyone in your
    // household."
    const decision = decideLegacyGatewayAccess({
      toolName: "add_move_participant",
      grantedScopes: ALL_SCOPES,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.refusalCode).toBe("NEVER_PERMITTED");
  });

  it("says so even when the grant is otherwise perfect", () => {
    expect(
      decideLegacyGatewayAccess({
        toolName: "add_move_participant",
        grantedScopes: ALL_SCOPES,
        block: undefined,
      }).allowed,
    ).toBe(false);
  });
});

describe("refusals name the actor who can lift them", () => {
  it("tells a revoked connection to reconnect, never that it cannot", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "list_items",
      grantedScopes: [],
      block: "revoked",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/reconnect/i);
    expect(decision.reason).toContain("/settings/ai");
    expect(decision.reason).not.toMatch(/\bcannot\b/i);
  });

  it("tells an expired connection to reconnect too", () => {
    const decision = decideLegacyGatewayAccess({
      toolName: "list_items",
      grantedScopes: [],
      block: "expired",
    });
    expect(decision.reason).toMatch(/reconnect/i);
    expect(decision.reason).toContain("/settings/ai");
  });

  it("keeps every refusal message plain ASCII", () => {
    // These strings reach a client through the transport; a non-ASCII
    // character in a header value is a live crash, not a style question.
    const blocks = [
      undefined,
      "noIdentity",
      "noProfile",
      "revoked",
      "expired",
      "noHousehold",
    ] as const;
    for (const block of blocks) {
      for (const name of [...registeredNames, "unknown_tool"]) {
        const { reason } = decideLegacyGatewayAccess({
          toolName: name,
          grantedScopes: [],
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
