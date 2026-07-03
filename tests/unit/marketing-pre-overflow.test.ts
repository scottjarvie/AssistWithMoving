import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("marketing code blocks", () => {
  it("wraps the hosted MCP endpoint URL without forcing command snippets to word-break", () => {
    const aiStart = readFileSync(
      join(process.cwd(), "src/app/(marketing)/ai/start/page.tsx"),
      "utf8",
    );
    const mcpGuide = readFileSync(
      join(process.cwd(), "src/app/(marketing)/mcp/guide/page.tsx"),
      "utf8",
    );

    expect(aiStart).toContain(
      "overflow-x-auto whitespace-pre-wrap break-words",
    );
    expect(mcpGuide).toMatch(/<pre className="[^"]*overflow-x-auto/g);
    expect(mcpGuide).not.toContain("break-words");
  });
});

