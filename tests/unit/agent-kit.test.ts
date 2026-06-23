import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS } from "../../mcp-server/movingmanifest-mcp.mjs";

const artifactPaths = [
  "public/agent-kit/CLAUDE.md",
  "public/agent-kit/movingmanifest-skill/SKILL.md",
  "public/agent-kit/chatgpt-instructions.md",
];

function readArtifact(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function sectionBetween(
  source: string,
  startNeedle: string,
  endNeedle: string,
) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  if (start === -1 || end === -1) {
    throw new Error(
      `Could not find section from ${startNeedle} to ${endNeedle}`,
    );
  }
  return source.slice(start, end);
}

describe("downloadable agent kit", () => {
  it("uses the shared clipboard fallback for artifact copy buttons", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/agent-kit-copy-button.tsx"),
      "utf8",
    );

    expect(source).toContain(
      'import { writeClipboard } from "@/components/copy-text-button";',
    );
    expect(source).toContain("await writeClipboard(await response.text())");
  });

  it("publishes paste-ready artifacts with the required setup facts", () => {
    for (const path of artifactPaths) {
      const source = readArtifact(path);
      expect(source).toContain("https://movingmanifest.com");
      expect(source).toContain("mmk_replace_with_a_scoped_api_key");
      expect(source).toContain("GET /me");
      expect(source).toContain("research source `status`");
    }
  });

  it("keeps the Claude Code skill frontmatter valid", () => {
    const source = readArtifact(
      "public/agent-kit/movingmanifest-skill/SKILL.md",
    );
    const match = source.match(/^---\n([\s\S]*?)\n---/);
    expect(match?.[1]).toContain("name: movingmanifest");
    expect(match?.[1]).toContain("description:");
    expect(match?.[1]).toContain("Use when");
  });

  it("keeps hosted MCP setup OAuth-first with API keys as fallback", () => {
    const claude = readArtifact("public/agent-kit/CLAUDE.md");
    const skill = readArtifact(
      "public/agent-kit/movingmanifest-skill/SKILL.md",
    );
    const gptActions = readArtifact("public/agent-kit/chatgpt-instructions.md");
    const llms = readArtifact("public/llms.txt");

    expect(claude).toContain(
      "Remote MCP endpoint for OAuth-capable hosted assistants",
    );
    expect(claude).toMatch(
      /Do not ask the user for a raw `mmk_`\s+key in that flow\./,
    );
    expect(claude).toContain("Remote MCP fallback for API-key clients");

    const oauthSection = claude.slice(
      claude.indexOf("Remote MCP endpoint for OAuth-capable hosted assistants"),
      claude.indexOf("Remote MCP fallback for API-key clients"),
    );
    expect(oauthSection).toContain("https://movingmanifest.com/api/mcp");
    expect(oauthSection).not.toContain("Authorization: Bearer");
    expect(oauthSection).not.toContain("mmk_replace_with_a_scoped_api_key");

    expect(llms).toContain("OAuth-capable clients connect by URL and sign in");
    expect(llms).toContain("That page is the human setup guide");
    expect(llms).toContain("Allow all");
    expect(llms).toContain("API-key-only clients can authenticate");
    expect(llms).toContain(
      "For first hosted/mobile OAuth launch, `MOVINGMANIFEST_MCP_OAUTH_TOOLSET=trusted-helper`",
    );

    expect(skill).toContain(
      "Ask the user for a scoped key only for local MCP, REST/OpenAPI, or hosted",
    );
    expect(skill).toContain(
      "do not ask the user for a raw `mmk_` key in that flow",
    );

    const skillOAuthSection = sectionBetween(
      skill,
      "Remote MCP endpoint for OAuth-capable hosted assistants",
      "Remote MCP fallback for API-key clients",
    );
    expect(skillOAuthSection).toContain("https://movingmanifest.com/api/mcp");
    expect(skillOAuthSection).not.toContain("Authorization: Bearer");
    expect(skillOAuthSection).not.toContain(
      "mmk_replace_with_a_scoped_api_key",
    );

    expect(gptActions).toContain(
      "These instructions are for GPT Actions/OpenAPI fallback setup.",
    );
    expect(gptActions).toContain("prefer `https://movingmanifest.com/api/mcp`");
  });

  it("teaches direct movable-unit load assignment instead of fake loose-item boxes", () => {
    const claude = readArtifact("public/agent-kit/CLAUDE.md");
    const skill = readArtifact(
      "public/agent-kit/movingmanifest-skill/SKILL.md",
    );

    for (const source of [claude, skill]) {
      expect(source).toContain("batch_upsert_movable_units");
      expect(source).toContain("large loose items");
      expect(source).toContain("boxes 1-25");
      expect(source).toContain("one box row per explicit code");
      expect(source).toContain("count: 12");
      expect(source).toContain(
        "fill missing weight, dimensions, volume, or assignment",
      );
      expect(source).toContain("assignedResourceId");
      expect(source).toContain("movableUnitSummary");
      expect(source).toContain("movableUnitSummary.measurementRoute");
      expect(source).toContain("one room/source area");
      expect(source).toContain("gapExamples[].measurementPatchHint.target");
      expect(source).toContain(
        "assignmentExamples[].assignmentPatchHint.target",
      );
      expect(source).toContain("When a user is focused on one box");
      expect(source).toContain("save_box_intake");
      expect(source).toContain("one approval");
      expect(source).toContain("https://movingmanifest.com/mcp");
      expect(source).toContain("Allow all");
      expect(source).toContain("disconnect and reconnect");
      expect(source).toContain("fresh OAuth credentials");
      expect(source).toContain("do not create a replacement box");
      expect(source).toContain("Capture page");
      expect(source).toContain("targetBoxCode");
      expect(source).toContain("targetItemId");
      expect(source).toContain("If queue media or the queue target");
      expect(source).toContain("attachMediaPhotoIds");
      expect(source).toContain("boxAssignments");
      expect(source).toContain("boxCode");
      expect(source).toContain("itemId");
      expect(source).not.toContain("create a load-unit container");
      expect(source).not.toContain("put the item in it");
    }

    const gptActions = readArtifact("public/agent-kit/chatgpt-instructions.md");
    expect(gptActions).toContain("movableUnitSummary");
    expect(gptActions).toContain("measurementRoute");
    expect(gptActions).toContain("one room/source");
    expect(gptActions).toContain("gapExamples[].measurementPatchHint.target");
    expect(gptActions).toContain(
      "assignmentExamples[].assignmentPatchHint.target",
    );
    expect(gptActions).toContain("update existing boxes/loose items");
  });

  it("keeps llms-full scoped to OAuth trusted-helper versus API-key extended tools", () => {
    const full = readArtifact("public/llms-full.txt");
    const llms = readArtifact("public/llms.txt");

    expect(full).not.toContain(
      "MovingManifest offers the same MCP tools two ways",
    );
    expect(full).not.toContain("creating an account and an AI helper key");
    expect(full).toContain("OAuth trusted-helper tools:");
    expect(full).toContain("Local/API-key extended tools:");
    expect(full).toContain(
      "walk me through signing in with MCP OAuth or, if that is not supported",
    );
    expect(llms).toContain(
      "the first hosted OAuth trusted-helper surface may not expose",
    );

    const firstToolsSection = sectionBetween(
      full,
      "Suggested first MCP tools:",
      "OAuth trusted-helper tools:",
    );
    expect(firstToolsSection.indexOf("agent_workbench")).toBeLessThan(
      firstToolsSection.indexOf("get_api_capabilities"),
    );

    const trustedHelperSection = sectionBetween(
      full,
      "OAuth trusted-helper tools:",
      "Local/API-key extended tools:",
    );
    for (const tool of MOVINGMANIFEST_TRUSTED_HELPER_MCP_TOOLS) {
      expect(trustedHelperSection).toContain(tool);
    }

    for (const broadTool of [
      "add_household_member",
      "list_household_members",
      "manage_exports",
      "upsert_sale_listing",
      "start_photo_upload",
      "finalize_photo_upload",
    ]) {
      expect(trustedHelperSection).not.toContain(broadTool);
    }

    const extendedSection = full.slice(
      full.indexOf("Local/API-key extended tools:"),
    );
    expect(extendedSection).toContain("list_household_members");
    expect(extendedSection).toContain("add_household_member");
    expect(extendedSection).toContain("manage_exports");
  });

  it("links the agent kit from AI-readable discovery files", () => {
    const llms = readArtifact("public/llms.txt");
    const full = readArtifact("public/llms-full.txt");

    expect(llms).toContain("https://movingmanifest.com/ai/kit");
    expect(llms).toContain("https://movingmanifest.com/agent-kit/CLAUDE.md");
    expect(full).toContain("/ai/kit");
    expect(full).toContain("/agent-kit/*");
  });
});
