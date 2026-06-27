// Regression guard for the "Tool execution failed" opacity bug.
//
// The convex-mcp-gateway dispatch layer (node_modules/convex-mcp-gateway,
// dist/component/dispatch.js) deliberately REDACTS the message of any thrown
// error that is not a ConvexError, replacing it on the wire with the generic
// string "Tool execution failed". Only ConvexError messages reach the calling
// agent. See the dispatch comment: "ConvexError is the deliberate user-facing
// channel ... Anything else is treated as an unexpected internal error and the
// wire gets a generic message."
//
// Historically every MCP write handler threw plain `new Error(...)` for its
// validation failures (item not found, needs an override reason, queue entry
// not claimed, over quota, …). The agent only ever saw "Tool execution failed"
// and could not self-correct — which is exactly how a real agent run mistook an
// override-reason gate for a backend crash and chased a phantom for hours.
//
// These files are 100% agent-facing tool handlers: every throw is an actionable
// validation message meant for the LLM, and none carry secrets. So every throw
// in them MUST be a ConvexError. This test fails if a plain `throw new Error`
// sneaks back in.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Every throw here is surfaced to the connected agent through the OAuth MCP
// gateway, so each must be a ConvexError to survive the gateway's redaction.
const agentFacingToolFiles = [
  "convex/mcpToolsSetup.ts",
  "convex/mcpToolsWrite.ts",
  "convex/mcpToolsQueue.ts",
  "convex/mcpToolsImages.ts",
  "convex/mcpTools.ts",
];

describe("MCP gateway error surfacing", () => {
  for (const relPath of agentFacingToolFiles) {
    it(`${relPath} throws ConvexError, never a plain Error (gateway would redact it)`, () => {
      const source = readFileSync(join(repoRoot, relPath), "utf8");
      const plainErrorThrows = source.match(/throw new Error\(/g) ?? [];
      expect(plainErrorThrows).toHaveLength(0);
      // And it must actually import ConvexError to be able to throw one.
      expect(source).toMatch(/import\s*\{[^}]*\bConvexError\b[^}]*\}\s*from\s*"convex\/values"/);
    });
  }

  it("shared assignment validators throw ConvexError for the override-reason gate", () => {
    // loadItemAssignmentValidation (items) and loadAssignmentValidation (boxes)
    // are reached by update_item / update_box transport assignment. The soft-
    // warning gate must reach the agent so it knows to pass assignmentOverrideReason.
    for (const relPath of ["convex/items.ts", "convex/boxes.ts"]) {
      const source = readFileSync(join(repoRoot, relPath), "utf8");
      expect(source).toMatch(/import\s*\{[^}]*\bConvexError\b[^}]*\}\s*from\s*"convex\/values"/);
      // The override-reason gate is thrown as a ConvexError and points the agent
      // at the exact field it needs to pass.
      expect(source).toMatch(/throw new ConvexError\(/);
      expect(source).toContain("Pass assignmentOverrideReason");
      // No plain-Error variant of the old override-reason / hard-block gates.
      expect(source).not.toMatch(/throw new Error\(\s*[`'"]Assignment warnings require/);
      expect(source).not.toMatch(/throw new Error\(\s*[`'"]Assignment blocked/);
    }
  });
});
