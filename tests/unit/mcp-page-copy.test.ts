import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS } from "../../mcp-server/movingmanifest-mcp.mjs";

const pageSource = () =>
  readFileSync(
    resolve(process.cwd(), "src/app/(marketing)/mcp/page.tsx"),
    "utf8"
  );

function sectionBetween(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  if (start === -1 || end === -1) {
    throw new Error(`Could not find section from ${startNeedle} to ${endNeedle}`);
  }
  return source.slice(start, end);
}

describe("/mcp setup page copy", () => {
  it("keeps hosted OAuth setup separate from local API-key fallback", () => {
    const source = pageSource();

    expect(source).toContain("Paste the MCP URL, then sign in.");
    expect(source).toContain("Use /api/mcp as the connector URL.");
    expect(source).toContain("This /mcp page is the human setup guide.");
    expect(source).toContain("Setup page is not the endpoint");
    expect(source).toContain("Allow all");
    expect(source).toContain("OAuth trusted-helper surface");
    expect(source).toContain("Local/API-key extended surface");
    expect(source).toContain("targetBoxCode");
    expect(source).toContain("targetItemId");
    expect(source).toContain("MOVINGMANIFEST_MCP_OAUTH_TOOLSET=trusted-helper");
    expect(source).toContain("CopyTextButton");
    expect(source).toContain("Copy endpoint");
    expect(source).toContain("Copy OAuth setup");
    expect(source).toContain("Copy fallback");
    expect(source).toContain("Copy Codex command");
    expect(source).toContain("Copy TOML");
    expect(source).toContain("Copy JSON");
    expect(source).toContain("save_box_intake, batch_upsert_movable_units");

    const remoteSection = sectionBetween(
      source,
      "const remoteOAuthExample",
      "const remoteApiKeyFallbackExample"
    );
    expect(remoteSection).toContain("https://movingmanifest.com/api/mcp");
    expect(remoteSection).toContain("https://movingmanifest.com/mcp");
    expect(remoteSection).toContain("human setup guide");
    expect(remoteSection).not.toContain("mmk_replace_with_a_scoped_api_key");
    expect(remoteSection).not.toContain("Authorization: Bearer");
  });

  it("documents every trusted-helper OAuth tool without mixing in broader tools", () => {
    const source = pageSource();
    const oauthToolSource = sectionBetween(
      source,
      "const oauthTrustedToolGroups",
      "const localApiKeyExtendedToolGroups"
    );

    for (const tool of MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS) {
      expect(oauthToolSource).toContain(tool);
    }

    for (const broadTool of [
      "add_household_member",
      "list_household_members",
      "delete_item",
      "remove_item_from_box",
      "manage_exports",
      "manage_share_link",
      "upsert_sale_listing",
      "plan_apply_ops",
      "start_photo_upload",
      "finalize_photo_upload",
    ]) {
      expect(oauthToolSource).not.toContain(broadTool);
    }
  });
});
