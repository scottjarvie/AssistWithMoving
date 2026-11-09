// @vitest-environment node
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import catalogue from "../../shared/api-tool-access.json";
import { registerTools } from "../../mcp-server/assistwithmoving-mcp.mjs";

it("derives every API tool's access decision from current handlers and backend routes", () => {
  const names: string[] = [];
  registerTools({ registerTool: (name: string) => { names.push(name); } }, { baseUrl: "https://example.test/api/v1", apiKey: "synthetic-not-a-credential" });
  expect(Object.keys(catalogue).sort()).toEqual(names.sort());
  expect(catalogue.upsert_sale_listing.scopes).toEqual(["inventory/write"]);
  expect(catalogue.revoke_share_link.scopes).toEqual([]);
  expect(catalogue.create_share_link.websiteOnly).toBe(false);
  expect(catalogue.add_household_member.websiteOnly).toBe(true);
  expect(execFileSync(process.execPath, ["scripts/build-ai-access.mjs", "--check"], { encoding: "utf8" })).toContain("verified");
});
