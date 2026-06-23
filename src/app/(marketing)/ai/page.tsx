import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  FileJson,
  MessageSquareText,
  Network,
  PackageCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { PublicBand, PublicPageChrome } from "@/components/public-page-chrome";
import { CopyTextButton } from "@/components/copy-text-button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Use MovingManifest with an AI assistant",
  description:
    "AI-readable setup instructions for connecting MovingManifest through OAuth MCP or scoped API access.",
};

const mcpEndpoint = "https://movingmanifest.com/api/mcp";

const setupPrompt =
  "Open https://movingmanifest.com/ai and help me connect MovingManifest to this assistant. Start with the AI assistant setup method. Prefer browser sign-in with the remote MCP endpoint https://movingmanifest.com/api/mcp if this client supports it. If it does not, walk me through creating a scoped helper key at /ai/start. After access works, call agent_workbench, get_api_context, and list_moves before changing anything. I may want to rough in boxes, loose large items, photos, load planning, or packets.";

const continuePrompt =
  "Open https://movingmanifest.com/ai and continue helping me with MovingManifest. Use the existing connection if available; if it is missing, reconnect through the setup method. Start by calling agent_workbench, get_api_context, and list_moves or setup_move. Then summarize what you can see, ask what move task I want next, and use review-first behavior for rough movable units, photos, inventory, opened rough boxes, load planning, sale prep, and packets.";

const oauthSnippet = `Remote MCP OAuth endpoint:
https://movingmanifest.com/api/mcp

Use this first when the assistant/client supports hosted MCP with browser sign-in. The user signs in with MovingManifest; do not ask for a raw key in this flow.`;

const apiKeySnippet = `Fallback for clients that cannot use remote MCP OAuth:
1. Ask the user to open https://movingmanifest.com/ai/start
2. Have them create a scoped helper key.
3. Use the key as Authorization: Bearer mmk_...

Do not place keys in public chats, screenshots, issues, or shared documents.`;

const firstCallsSnippet = `Start every private MovingManifest session with:
1. agent_workbench
2. get_api_context
3. list_moves or setup_move
4. get_agent_context before multi-step edits`;

const assistantCopyChoices = [
  {
    title: "First time with this assistant",
    copy: "Use when the assistant has not connected to MovingManifest yet.",
    label: "Copy setup",
    text: setupPrompt,
  },
  {
    title: "Already connected",
    copy: "Use when the assistant should continue work on an existing move.",
    label: "Copy continue",
    text: continuePrompt,
  },
  {
    title: "Tool configuration only",
    copy: "Use only when an MCP-capable client asks for a server URL.",
    label: "Copy MCP URL",
    text: mcpEndpoint,
  },
] as const;

const directReferences = [
  {
    title: "Remote MCP endpoint",
    label: "Tool URL",
    href: mcpEndpoint,
    copyText: mcpEndpoint,
    display: "movingmanifest.com/api/mcp",
  },
  {
    title: "MCP setup details",
    label: "Guide",
    href: "/mcp",
    copyText: "https://movingmanifest.com/mcp",
    display: "movingmanifest.com/mcp",
  },
  {
    title: "Short AI guide",
    label: "AI-readable",
    href: "/llms.txt",
    copyText: "https://movingmanifest.com/llms.txt",
    display: "movingmanifest.com/llms.txt",
  },
  {
    title: "Full AI guide",
    label: "AI-readable",
    href: "/llms-full.txt",
    copyText: "https://movingmanifest.com/llms-full.txt",
    display: "movingmanifest.com/llms-full.txt",
  },
  {
    title: "OpenAPI contract",
    label: "REST fallback",
    href: "/openapi.json",
    copyText: "https://movingmanifest.com/openapi.json",
    display: "movingmanifest.com/openapi.json",
  },
];

const directReferencesSnippet = [
  "Direct MovingManifest references:",
  ...directReferences.map(
    (reference) => `- ${reference.title}: ${reference.copyText}`,
  ),
].join("\n");

const aiLearningDocs = [
  {
    title: "Connection behavior",
    label: "Auth",
    icon: Network,
    copy: "Prefer remote MCP OAuth when the client supports browser sign-in. Ask for a scoped helper key only when OAuth is not available.",
    text: `AI learning: connection behavior
- Prefer remote MCP OAuth at ${mcpEndpoint}.
- The user signs in through MovingManifest; do not ask for a raw key in that flow.
- If OAuth MCP is unavailable, ask the user to create a scoped helper key at /ai/start.
- Use REST/OpenAPI only when the client supports API actions but not MCP.`,
  },
  {
    title: "Session startup",
    label: "First calls",
    icon: CheckCircle2,
    copy: "Learn the user's context before writing. Do not invent household, move, room, or item identifiers.",
    text: `AI learning: session startup
1. Call agent_workbench.
2. Call get_api_context.
3. Call list_moves or setup_move.
4. Call get_agent_context before multi-step edits.
5. Verify substantial writes with get_move_summary or get_agent_context.`,
  },
  {
    title: "Photo handling",
    label: "Media",
    icon: FileJson,
    copy: "Use the Capture queue for repeated phone photos so originals go straight to MovingManifest storage.",
    text: `AI learning: photo handling
- Use original JPEG, PNG, or WebP files when possible.
- For bulk phone photos, send the user to the MovingManifest Capture page or mobile Capture button; do not ask them to base64-wrap images in chat.
- Process captured entries with ingestion_queue and read intent, targetBoxId, targetBoxCode, targetItemId, and targetLabel before writing records.
- For one item from one photo plus a few words, prefer add_item_from_photo.
- When the user is focused on one box, prefer save_box_intake so the box, dimensions, photos, contents, and linked existing items save in one approval.
- For evidence-only photos, use upload_photo or upload_photos.
- Leave uncertain weight, size, condition, and disposition blank or flagged for review.`,
  },
  {
    title: "Open rough boxes",
    label: "Boxes",
    icon: FileJson,
    copy: "When one box is being described or opened, use save_box_intake and keep everything tied to that box.",
    text: `AI learning: open rough boxes
- Keep the original rough box; do not create a replacement box just because the user is now itemizing it.
- Use save_box_intake with boxId or boxCode for an existing box, or omit both when creating a new box with a stable idempotencyKey.
- If the Capture queue says targetBoxCode B-001 or targetBoxId, use that existing box for contents, measurements, and photos.
- Include dimensionsIn, weight, description, box photos, newly described contents, optional content photos, and linkedItems when the user gives them.
- Use the returned boxId, boxCode, photoIds, packedItems, and agentReview.nextStep to summarize and verify the box before continuing.
- Use lower-level box tools only in full/API-key mode for advanced partial work.
- Preserve uncertainty with review flags and verify with get_move_summary or get_agent_context.`,
  },
  {
    title: "Rough movable-unit intake",
    label: "Movable units",
    icon: PackageCheck,
    copy: "Create boxes and large loose items as loadable units before the user is ready to itemize every box.",
    text: `AI learning: rough movable-unit intake
- A movable unit is either a box or a loose item that moves as-is, like furniture, shop equipment, a treadmill, a shovel bundle, or a personal-transport bag.
- When the user gives a rough list, use batch_upsert_movable_units instead of creating detailed contents for every box.
- Keep boxes as boxes even if contents are unknown. Capture code, label, room, rough weight, dimensions, and load assignment when available.
- If the user already gave a load hint and you have resolved it to explicit MovingManifest IDs, include assignedResourceId and optional assignedZoneId on the batch_upsert_movable_units row.
- For loose units, create or update the item with stable externalSource and externalId so future retries update the same unit.
- Do not turn ordinary small unboxed inventory into a loose movable unit unless the user says it moves as-is.
- Leave missing weight, dimensions, volume, and assignment visible for follow-up instead of guessing.
- Later, when a box is opened, add contents into the existing box with save_box_intake.`,
  },
  {
    title: "Owner-carried units",
    label: "Personal",
    icon: ShieldCheck,
    copy: "If a loose item goes with the owner, record that as structured transport intent instead of a note.",
    text: `AI learning: owner-carried movable units
- Rough loose units can travel with the owner instead of movers.
- If the user says "goes with me", "goes in my car", or "do not let movers touch", set requiresPersonalTransport true or disposition personalTransport.
- Do not assign owner-carried loose units to a truck just to clear the load-planning gap.
- Verify owner-carried units count as assigned with movableUnitSummary.`,
  },
  {
    title: "Measurement follow-up",
    label: "Gaps",
    icon: CheckCircle2,
    copy: "When a rough box or loose item already exists, reuse the summary patch target instead of making a duplicate.",
    text: `AI learning: measurement follow-up
- Rough boxes and large loose items are movable units.
- Ordinary unboxed detailed inventory is not automatically a movable unit; leave it in the unpacked queue unless it moves as-is.
- New loose-item rows created with batch_upsert_movable_units require externalSource plus externalId, then become active, reviewable movable units in the load planner.
- Use stable external IDs like garage-treadmill-1 so retries and later measurement patches update the same loose unit.
- Read movableUnitSummary.measurementRoute before asking the user what to measure next.
- Suggest one room/source area at a time, then reuse grouped or flat movableUnitSummary.gapExamples[].measurementPatchHint.target for measurement patches.
- Read movableUnitSummary.assignmentExamples[].assignmentPatchHint.target before assigning unassigned movable units.
- If the user later supplies missing weight, dimensions, volume, or assignment, call batch_upsert_movable_units again.
- Address the existing unit with boxId, exact box code, or loose itemId.
- Send only the new estimatedWeightLb, dimensionsIn, or estimatedVolumeCuFt fields.
- Do not reset item status or quantity just because you are filling a measurement gap.
- Verify the updated gaps with get_move_summary or get_agent_context.`,
  },
  {
    title: "Durable record vs. reasoning",
    label: "Roles",
    icon: MessageSquareText,
    copy: "MovingManifest stores the durable move record. The assistant handles reasoning, estimates, planning, and summaries.",
    text: `AI learning: durable record vs. reasoning
- MovingManifest owns households, moves, inventory, boxes, photos, spaces, transport, and packets.
- The assistant owns identification, estimates, planning, research, summaries, and next-step suggestions.
- Do not replace user review for uncertain evidence or sensitive decisions.`,
  },
  {
    title: "Review behavior",
    label: "Quality",
    icon: Sparkles,
    copy: "Use review-first behavior for uncertain evidence, sensitive calls, and broad edits.",
    text: `AI learning: review behavior
- State assumptions after creating or updating records.
- Mark uncertain fields for review instead of guessing aggressively.
- Ask before broad changes, sale/donate/discard decisions, or sensitive edits.
- Prefer small verified batches over large unreviewed changes.`,
  },
  {
    title: "Safety boundaries",
    label: "Secrets",
    icon: ShieldCheck,
    copy: "Do not expose helper keys, OAuth tokens, private move data, or user secrets in shared places.",
    text: `AI learning: safety boundaries
- Do not place keys in public chats, screenshots, issues, or shared documents.
- Do not reveal OAuth tokens or helper keys back to the user unless the user is in the one-time creation flow.
- Treat private household and move data as user-controlled.
- Use scoped access and respect revocation.`,
  },
  {
    title: "Prompt patterns",
    label: "Prompts",
    icon: MessageSquareText,
    copy: "Use short user-facing prompts that tell the assistant what outcome to pursue and when to ask for review.",
    text: `AI learning: prompt patterns
- Setup: Help me connect MovingManifest to this assistant. Start at https://movingmanifest.com/ai.
- Photo intake: I uploaded photos and notes through Capture. Process my queue, preserve originals, honor target box/item links, and flag uncertain fields for review.
- Load planning: Review the move context, then separate personal-transport items from mover or storage items.
- Sale prep: Draft listing copy, price ranges, confidence, and research notes without publishing anything.`,
  },
  {
    title: "Client routing",
    label: "Clients",
    icon: Network,
    copy: "Choose the least awkward connection path for the assistant the user is actually using.",
    text: `AI learning: client routing
- Hosted MCP client: use ${mcpEndpoint} and browser sign-in first.
- Desktop or CLI agent: use local MCP with a scoped helper key when it can run a local process.
- OpenAPI action client: import /openapi.json and authenticate with a scoped helper key.
- If the client cannot store secrets safely, guide the user back to OAuth-capable MCP.`,
  },
];

const aiLearningDocsByTitle = new Map(
  aiLearningDocs.map((doc) => [doc.title, doc]),
);

function pickLearningDocs(titles: string[]) {
  return titles.map((title) => {
    const doc = aiLearningDocsByTitle.get(title);

    if (!doc) {
      throw new Error(`Missing AI learning document: ${title}`);
    }

    return doc;
  });
}

const aiLearningSections = [
  {
    title: "Setup and access",
    copy: "Connection behavior, first private calls, and client routing for assistants that support MCP, local tools, or REST actions.",
    docs: pickLearningDocs([
      "Connection behavior",
      "Session startup",
      "Client routing",
    ]),
  },
  {
    title: "Move workflows",
    copy: "Photo intake, opened rough boxes, movable units, personal transport, and measurement follow-up.",
    docs: pickLearningDocs([
      "Photo handling",
      "Open rough boxes",
      "Rough movable-unit intake",
      "Owner-carried units",
      "Measurement follow-up",
    ]),
  },
  {
    title: "Review and safety",
    copy: "How the assistant should separate durable records from reasoning, protect secrets, and keep uncertain work reviewable.",
    docs: pickLearningDocs([
      "Durable record vs. reasoning",
      "Review behavior",
      "Safety boundaries",
      "Prompt patterns",
    ]),
  },
];

const completeAssistantBriefing = [
  "MovingManifest assistant briefing",
  "",
  "Setup prompt:",
  setupPrompt,
  "",
  "Return prompt:",
  continuePrompt,
  "",
  directReferencesSnippet,
  "",
  "Remote MCP OAuth snippet:",
  oauthSnippet,
  "",
  "Scoped key fallback snippet:",
  apiKeySnippet,
  "",
  "First private tool calls snippet:",
  firstCallsSnippet,
  "",
  ...aiLearningDocs.map((doc) => doc.text),
].join("\n\n");

export default function AiAssistantPage() {
  return (
    <PublicPageChrome
      eyebrow="Assistant entry point"
      title="Tell your assistant to start here."
      description="MovingManifest is the durable move record. A capable assistant can help identify items, plan rooms, process photos, organize boxes, and prepare packets through OAuth MCP or a scoped fallback key."
      primaryAction={{ href: "/ai/start", label: "Start AI setup" }}
      secondaryAction={{ href: "/mcp", label: "MCP details" }}
      visual={<AssistantConnectionSummary />}
    >
      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.45fr_1.55fr]">
          <div>
            <Badge variant="secondary">Assistant setup</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              Choose the instruction that matches where you are.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Copy one prompt into the assistant you already use. The assistant
              can read the longer notes below, try browser sign-in first, and
              ask for a helper key only when OAuth MCP is not available.
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Use the setup prompt once. Use the return prompt after the
              assistant already has access and you want it to continue work.
            </p>
            <div
              className="mt-4 grid gap-2"
              aria-label="Fast assistant copy choices"
            >
              {assistantCopyChoices.map((choice) => (
                <div
                  key={choice.title}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{choice.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {choice.copy}
                    </p>
                  </div>
                  <CopyTextButton
                    text={choice.text}
                    label={choice.label}
                    ariaLabel={`${choice.label} for ${choice.title}`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-md border border-border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Need only the tool URL?</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Paste this only when an MCP-capable client asks for a remote
                    server endpoint.
                  </p>
                  <code className="mt-2 block overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">
                    {mcpEndpoint}
                  </code>
                </div>
                <CopyTextButton
                  text={mcpEndpoint}
                  label="Copy MCP URL"
                  ariaLabel="Copy MovingManifest MCP endpoint URL"
                />
              </div>
            </div>
          </div>
          <AssistantPromptCards />
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.55fr_1.45fr]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">AI learning</Badge>
              <CopyTextButton
                text={completeAssistantBriefing}
                label="Copy all AI docs"
                ariaLabel="Copy all MovingManifest AI learning documents"
              />
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              Mini-documents for the assistant.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              These short notes explain how the assistant should connect, handle
              photos, choose tools, protect secrets, and verify work. They are
              written for an AI system to read quickly.
            </p>
          </div>
          <div className="grid gap-6">
            {aiLearningSections.map((section) => (
              <section
                key={section.title}
                aria-labelledby={`ai-learning-${section.title
                  .toLowerCase()
                  .replaceAll(" ", "-")}`}
                className="border-t border-border pt-5 first:border-t-0 first:pt-0"
              >
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3
                      id={`ai-learning-${section.title
                        .toLowerCase()
                        .replaceAll(" ", "-")}`}
                      className="text-lg font-semibold tracking-normal"
                    >
                      {section.title}
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                      {section.copy}
                    </p>
                  </div>
                  <CopyTextButton
                    text={section.docs.map((doc) => doc.text).join("\n\n")}
                    label="Copy section"
                    ariaLabel={`Copy ${section.title} AI learning documents`}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {section.docs.map((doc) => (
                    <LearningDocCard key={doc.title} doc={doc} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-5 lg:grid-cols-2">
          <SnippetCard
            title="Remote MCP OAuth"
            copy="Paste this endpoint into hosted MCP clients that support browser sign-in."
            text={oauthSnippet}
            buttonLabel="Copy OAuth setup"
          />
          <SnippetCard
            title="Scoped key fallback"
            copy="Use only when OAuth MCP is unavailable for the assistant or workflow."
            text={apiKeySnippet}
            buttonLabel="Copy fallback"
          />
          <SnippetCard
            title="First private tool calls"
            copy="This keeps the assistant oriented before it creates or changes move data."
            text={firstCallsSnippet}
            buttonLabel="Copy first calls"
          />
          <div className="min-w-0 rounded-md border border-border bg-card p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium">
              <FileJson className="size-4 text-primary" aria-hidden="true" />
              Direct references
            </div>
            <div className="grid min-w-0 gap-2">
              {directReferences.map((reference) => (
                <ReferenceLink key={reference.title} reference={reference} />
              ))}
            </div>
          </div>
        </div>
      </PublicBand>
    </PublicPageChrome>
  );
}

function SnippetCard({
  title,
  copy,
  text,
  buttonLabel,
}: {
  title: string;
  copy: string;
  text: string;
  buttonLabel: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-normal">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
        </div>
        <CopyTextButton
          text={text}
          label={buttonLabel}
          ariaLabel={`Copy ${title} instructions`}
        />
      </div>
      <details className="mt-4 rounded-md border border-border bg-background/65 p-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Preview copy text
        </summary>
        <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/35 p-3 font-mono text-xs leading-5 text-muted-foreground">
          {text}
        </pre>
      </details>
    </div>
  );
}

function LearningDocCard({ doc }: { doc: (typeof aiLearningDocs)[number] }) {
  return (
    <article className="min-w-0 rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <doc.icon className="size-4 text-primary" aria-hidden="true" />
            {doc.label}
          </div>
          <h3 className="text-base font-semibold tracking-normal">
            {doc.title}
          </h3>
        </div>
        <CopyTextButton
          text={doc.text}
          label="Copy doc"
          ariaLabel={`Copy ${doc.title} mini-document`}
        />
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{doc.copy}</p>
      <details className="mt-4 rounded-md border border-border bg-background/65 p-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Read {doc.title.toLowerCase()} mini-doc
        </summary>
        <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
          {doc.text}
        </pre>
      </details>
    </article>
  );
}

function ReferenceLink({
  reference,
}: {
  reference: (typeof directReferences)[number];
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {reference.label}
        </p>
        <a
          href={reference.href}
          className="mt-1 inline-flex min-w-0 items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
        >
          <span className="min-w-0">{reference.title}</span>
          <ArrowRight
            className="size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
        </a>
        <code className="mt-1 block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">
          {reference.display}
        </code>
      </div>
      <CopyTextButton
        text={reference.copyText}
        label="Copy"
        ariaLabel={`Copy ${reference.title} reference`}
      />
    </div>
  );
}

function AssistantConnectionSummary() {
  return (
    <section className="rounded-md border border-border bg-card p-4 shadow-xl shadow-black/25">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Setup method
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-normal">
            Browser sign-in when possible.
          </h2>
        </div>
        <Badge>
          <ShieldCheck aria-hidden="true" />
          revocable access
        </Badge>
      </div>
      <div className="mt-4 grid gap-3">
        {[
          "Paste the MCP endpoint when the assistant supports hosted tools.",
          "Sign in with MovingManifest in the browser.",
          "Use a helper key only as fallback.",
          "Make the assistant read move context before changing data.",
        ].map((step, index) => (
          <div
            key={step}
            className="flex gap-3 rounded-md border border-border bg-background/65 p-3"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
              {index + 1}
            </span>
            <p className="text-sm leading-6 text-muted-foreground">{step}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-primary/25 bg-primary/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Best first handoff</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Copy the setup prompt. It points the assistant here, then lets the
              assistant use browser sign-in or ask for a fallback key.
            </p>
          </div>
          <CopyTextButton
            text={setupPrompt}
            label="Copy setup prompt"
            ariaLabel="Copy MovingManifest setup prompt"
          />
        </div>
        <div className="mt-3 rounded-md border border-border bg-background/60 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Remote MCP endpoint
              </p>
              <code className="mt-1 block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs">
                {mcpEndpoint}
              </code>
            </div>
            <CopyTextButton
              text={mcpEndpoint}
              label="Copy URL"
              ariaLabel="Copy remote MCP endpoint URL"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function AssistantPromptCards() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <AssistantPromptCard
        eyebrow="Setup method"
        title="AI assistant setup"
        steps={[
          "Copy the setup prompt below into the assistant you trust.",
          "The assistant opens this guide and checks whether it can use browser sign-in.",
          "You sign in or create a scoped helper key only if the assistant asks.",
          "The assistant reads your move context before it changes anything.",
        ]}
        promptLabel="Paste this into your assistant to set it up"
        copyLabel="Copy setup prompt"
        prompt={setupPrompt}
        outcomes={[
          "Try the remote MCP endpoint and browser sign-in first.",
          "Ask for a scoped helper key only if hosted MCP is not available.",
          "Read move context before creating or changing records.",
        ]}
      />
      <AssistantPromptCard
        eyebrow="Return method"
        title="Continue with your assistant"
        steps={[
          "Use this when MovingManifest access was already set up before.",
          "The assistant reconnects or tells you exactly what access is missing.",
          "It reviews the current move before helping with the next task.",
          "It summarizes changes and flags uncertain decisions for your review.",
        ]}
        promptLabel="Paste this into your assistant when you come back"
        copyLabel="Copy continue prompt"
        prompt={continuePrompt}
        outcomes={[
          "Reuse the existing MovingManifest connection when possible.",
          "Summarize the current move context before starting new work.",
          "Flag uncertain estimates, photos, and assignments for review.",
        ]}
      />
    </div>
  );
}

function AssistantPromptCard({
  eyebrow,
  title,
  steps,
  promptLabel,
  copyLabel,
  prompt,
  outcomes,
}: {
  eyebrow: string;
  title: string;
  steps: string[];
  promptLabel: string;
  copyLabel: string;
  prompt: string;
  outcomes: string[];
}) {
  return (
    <section className="rounded-md border border-border bg-card p-4 shadow-xl shadow-black/25">
      <div className="border-b border-border pb-3">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-normal">{title}</h2>
      </div>
      <div className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <div
            key={step}
            className="flex gap-3 rounded-md border border-border bg-background/65 p-3"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
              {index + 1}
            </span>
            <p className="text-sm leading-6 text-muted-foreground">{step}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-border bg-background/65 p-3">
        <h3 className="text-sm font-medium tracking-normal">
          What the assistant should do next
        </h3>
        <ul className="mt-3 grid gap-2">
          {outcomes.map((outcome) => (
            <li
              key={outcome}
              className="flex gap-2 text-sm leading-6 text-muted-foreground"
            >
              <CheckCircle2
                className="mt-1 size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span>{outcome}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 rounded-md border border-primary/25 bg-primary/5 p-3 text-sm leading-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-medium">
            <MessageSquareText
              className="size-4 text-primary"
              aria-hidden="true"
            />
            {promptLabel}
          </span>
          <CopyTextButton
            text={prompt}
            label={copyLabel}
            ariaLabel={`Copy ${title} prompt`}
          />
        </div>
        <details className="mt-3 rounded-md border border-border bg-background/60 p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Preview exact prompt
          </summary>
          <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/35 p-3 font-mono text-xs leading-5 text-muted-foreground">
            {prompt}
          </pre>
        </details>
      </div>
    </section>
  );
}
