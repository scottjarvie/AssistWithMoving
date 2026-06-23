import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("AI public page copy", () => {
  it("keeps the homepage focused and points detailed assistant setup to /ai", () => {
    const source = readSource("src/app/(marketing)/page.tsx");

    expect(source).toContain("export const metadata");
    expect(source).toContain("move inventory, photos, boxes, and packets");
    expect(source).not.toContain("MovingManifest is building at");
    expect(source).not.toContain(
      "If you already use Claude, ChatGPT, or Codex",
    );
    expect(source).not.toContain("const starterPrompt");
    expect(source).not.toContain("Jarvie household");
    expect(source).not.toContain("PCS mixed move");
    expect(source).not.toContain("Owner archive");
    expect(source).toContain("PublicHeader");
    expect(source).toContain("CopyTextButton");
    expect(source).toContain("Already using an assistant?");
    expect(source).toContain("Copy prompt");
    expect(source).toContain("Copy MovingManifest assistant setup prompt");
    expect(source).toContain("Preview the exact handoff");
    expect(source).toContain("assistantHomeLinks");
    expect(source).toContain("Assistant guide");
    expect(source).toContain("Connection setup");
    expect(source).toContain("movingmanifest.com/ai/start");
    expect(source).not.toContain("Remote MCP endpoint");
    expect(source).not.toContain("movingmanifest.com/api/mcp");
    expect(source).toContain("Open https://movingmanifest.com/ai");
    expect(source).toContain(
      "Prefer browser sign-in through the remote MCP endpoint",
    );
    expect(source).toContain(
      "ask me for a scoped helper key only if OAuth/MCP is not available",
    );
    expect(source).toContain("Assistant setup and documentation are at /ai");
    expect(source).toContain("assistantHandoffSteps");
    expect(source).toContain("Copy the prompt into your assistant.");
    expect(source).toContain("The assistant reads the AI guide.");
    expect(source).toContain(
      "You approve sign-in only when private data is needed.",
    );
    expect(source).toContain("should not");
    expect(source).toContain("need to paste a raw key");
    expect(source).toContain("Private move records for real households");
    expect(source).toContain("Turn photos into inventory");
    expect(source).toContain("Rough in boxes and large items");
    expect(source).toContain("loose movable units");
    expect(source).toContain("load assignments later");
    expect(source).toContain("Prepare selling and packets");
    expect(source).toContain("What it handles");
    expect(source).toContain("From first photos to final packets.");
    expect(source).toContain("connected assistant help");
    expect(source).toContain("Connect your assistant safely");
    expect(source).toContain("Sign in through the browser");
    expect(source).toContain("href={card.href}");
    expect(source).toContain("group rounded-md");
    expect(source).not.toContain("Use OAuth or scoped fallback");
    expect(source).not.toContain("Use hosted MCP OAuth when available.");
  });

  it("keeps public AI entry points reachable on mobile", () => {
    const source = readSource("src/components/public-page-chrome.tsx");

    expect(source).toContain("const compactPublicNav");
    expect(source).toContain('aria-label="Quick public navigation"');
    expect(source).toContain("lg:hidden");
    expect(source).toContain('{ href: "/ai", label: "AI" }');
    expect(source).toContain('{ href: "/mcp", label: "MCP" }');
    expect(source).toContain('{ href: "/api", label: "API" }');
    expect(source).toContain("overflow-x-auto");
  });

  it("lets long copy button labels shrink in cramped assistant cards", () => {
    const source = readSource("src/components/copy-text-button.tsx");

    expect(source).toContain("className?: string");
    expect(source).toContain('cn("min-w-0 max-w-full shrink", className)');
    expect(source).toContain('className="min-w-0 truncate"');
  });

  it("makes /ai the copyable OAuth-first assistant handoff", () => {
    const source = readSource("src/app/(marketing)/ai/page.tsx");

    expect(source).toContain("CopyTextButton");
    expect(source).toContain("https://movingmanifest.com/api/mcp");
    expect(source).toContain("AI assistant setup");
    expect(source).toContain("Continue with your assistant");
    expect(source).toContain("Assistant setup");
    expect(source).toContain("Setup method");
    expect(source).toContain("Return method");
    expect(source).toContain(
      "Choose the instruction that matches where you are.",
    );
    expect(source).toContain("Need only the tool URL?");
    expect(source).toContain(
      "Paste this only when an MCP-capable client asks for a remote",
    );
    expect(source).toContain("Copy MCP URL");
    expect(source).toContain("Copy MovingManifest MCP endpoint URL");
    expect(source).toContain("assistantCopyChoices");
    expect(source).toContain("Fast assistant copy choices");
    expect(source).toContain("First time with this assistant");
    expect(source).toContain("Already connected");
    expect(source).toContain("Tool configuration only");
    expect(source).toContain("Copy setup");
    expect(source).toContain("Copy continue");
    expect(source).toContain("xl:grid-cols-2");
    expect(source).toContain(
      "Copy one prompt into the assistant you already use.",
    );
    expect(source).toContain(
      "ask for a helper key only when OAuth MCP is not available.",
    );
    expect(source).toContain("Preview exact prompt");
    expect(source).toContain("Copy setup prompt");
    expect(source).toContain("Copy continue prompt");
    expect(source).not.toContain("assistantPathCards");
    expect(source).not.toContain("Copy-paste handoffs");
    expect(source).not.toContain("Paste one instruction into your assistant.");
    expect(source).not.toContain("pasteTarget");
    expect(source).not.toContain("First-time setup");
    expect(source).not.toContain("Continue work");
    expect(source).not.toContain("Tool endpoint");
    expect(source).not.toContain("bestFor");
    expect(source).not.toContain("userDoes");
    expect(source).not.toContain("Recommended default");
    expect(source).toContain("AI learning");
    expect(source).toContain("Mini-documents for the assistant.");
    expect(source).toContain("completeAssistantBriefing");
    expect(source).toContain("Copy all AI docs");
    expect(source).toContain("Remote MCP OAuth snippet:");
    expect(source).toContain("Scoped key fallback snippet:");
    expect(source).toContain("First private tool calls snippet:");
    expect(source).toContain("aiLearningSections");
    expect(source).toContain("Setup and access");
    expect(source).toContain("Move workflows");
    expect(source).toContain("Review and safety");
    expect(source).toContain("Copy section");
    expect(source).toContain("Copy ${section.title} AI learning documents");
    expect(source).toContain("What the assistant should do next");
    expect(source).toContain("Try the remote MCP endpoint");
    expect(source).toContain(
      "Ask for a scoped helper key only if hosted MCP is not available.",
    );
    expect(source).toContain(
      "Summarize the current move context before starting new work.",
    );
    expect(source).toContain(
      "Flag uncertain estimates, photos, and assignments for review.",
    );
    expect(source).toContain("Best first handoff");
    expect(source).toContain("Copy remote MCP endpoint URL");
    expect(source).toContain("Connection behavior");
    expect(source).toContain("Session startup");
    expect(source).toContain("Photo handling");
    expect(source).toContain("MovingManifest Capture page");
    expect(source).toContain("targetBoxCode");
    expect(source).toContain("targetItemId");
    expect(source).toContain("Open rough boxes");
    expect(source).toContain("targetBoxCode B-001");
    expect(source).toContain("Rough movable-unit intake");
    expect(source).toContain("Movable units");
    expect(source).toContain("Owner-carried units");
    expect(source).toContain("Measurement follow-up");
    expect(source).toContain("Safety boundaries");
    expect(source).toContain("Prompt patterns");
    expect(source).toContain("Client routing");
    expect(source).toContain("directReferences");
    expect(source).toContain("directReferencesSnippet");
    expect(source).toContain("Direct MovingManifest references:");
    expect(source).toContain("ReferenceLink");
    expect(source).not.toContain('import Link from "next/link"');
    expect(source).toContain("Preview copy text");
    expect(source).toContain("Copy ${reference.title} reference");
    expect(source).toContain("Short AI guide");
    expect(source).toContain("OpenAPI contract");
    expect(source).toContain("https://movingmanifest.com/llms-full.txt");
    expect(source).toContain("Copy doc");
    expect(source).toContain("Read {doc.title.toLowerCase()} mini-doc");
    expect(source).toContain("{doc.text}");
    expect(source).toContain("do not ask for a raw key in this flow");
    expect(source).toContain("agent_workbench");
    expect(source).toContain("get_api_context");
    expect(source).toContain("batch_upsert_movable_units again");
    expect(source).toContain("externalSource plus externalId");
    expect(source).toContain("garage-treadmill-1");
    expect(source).toContain("movableUnitSummary.measurementRoute");
    expect(source).toContain("one room/source area");
    expect(source).toContain("measurementPatchHint.target");
    expect(source).toContain("assignmentPatchHint.target");
    expect(source).toContain("Ordinary unboxed detailed inventory");
    expect(source).toContain("batch_upsert_movable_units instead");
    expect(source).toContain("stable externalSource and externalId");
    expect(source).toContain("include assignedResourceId");
    expect(source).toContain("optional assignedZoneId");
    expect(source).toContain("Later, when a box is opened");
    expect(source).toContain("save_box_intake");
    expect(source).toContain("returned boxId");
    expect(source).toContain("boxCode");
    expect(source).toContain("photoIds");
    expect(source).toContain("packedItems");
    expect(source).toContain("agentReview.nextStep");
    expect(source).toContain("lower-level box tools only in full/API-key mode");
    expect(source).toContain("do not create a replacement box");
    expect(source).toContain("honor target box/item links");
    expect(source).toContain("requiresPersonalTransport true");
    expect(source).toContain("Do not reset item status or quantity");
    expect(source).not.toContain("Assistant operating rules");
    expect(source).not.toContain("Prompt examples");
    expect(source).not.toContain("Client routing hints");
    expect(source).not.toMatch(/<details\s+open\s+className=/);
    expect(source).not.toContain("Start with one short instruction");
    expect(source).not.toContain("Best path");
    expect(source).not.toContain("OAuth first, key fallback");
    expect(source).not.toContain("MCP ready");
    expect(source).not.toContain("User controlled");
    expect(source).not.toContain("Connection path");
    expect(source).not.toContain("Hosted MCP with OAuth");
    expect(source).not.toContain("Local MCP with helper key");
    expect(source).not.toContain("REST/OpenAPI fallback");
    expect(source).not.toContain("const quickCapabilities");
    expect(source).not.toContain("Turn photos into inventory");
    expect(source).not.toContain("Prepare selling and packets");
  });

  it("keeps /ai/start OAuth-first for mobile setup before key fallback", () => {
    const source = readSource("src/app/(marketing)/ai/start/page.tsx");

    expect(source).toContain("CopyTextButton");
    expect(source).toContain("remoteMcpEndpoint");
    expect(source).toContain("https://movingmanifest.com/api/mcp");
    expect(source).toContain("Better on mobile");
    expect(source).toContain("Copy MCP URL");
    expect(source).toContain("Copy MovingManifest remote MCP endpoint");
    expect(source).toContain("That avoids putting a raw");
    expect(source).toContain("key in chat");
    expect(source).toContain("OAuth-capable hosted assistants");
    expect(source).toContain("can connect by URL and");
    expect(source).toContain("sign in");
    expect(source).not.toContain("sign-in; older");
  });
});
