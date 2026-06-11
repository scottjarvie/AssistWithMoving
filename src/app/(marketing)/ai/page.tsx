import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  Camera,
  ClipboardList,
  KeyRound,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import {
  FeatureGrid,
  PublicBand,
  PublicPageChrome,
} from "@/components/public-page-chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Use MovingManifest with an AI assistant",
  description:
    "Help Claude, ChatGPT, Codex, and other AI assistants create moves, add inventory, upload photos, and use MovingManifest through the API or MCP server.",
};

const assistantCards = [
  {
    title: "Start before the account exists",
    copy: "A person can open this page on a phone, share it with their assistant, and get guided through account creation, move setup, and key creation.",
    icon: MessageSquareText,
  },
  {
    title: "Give the assistant the map",
    copy: "Public llms.txt, OpenAPI, and MCP docs tell assistants which endpoints, scopes, and workflows to use without guessing from the UI.",
    icon: Bot,
  },
  {
    title: "Create one key for the helper",
    copy: "After sign-up, create a scoped API key in Settings. The key can be revoked, rotated, limited to one move, and used by API or MCP tools.",
    icon: KeyRound,
  },
  {
    title: "Turn photos into inventory",
    copy: "Assistants can add items from room photos, store low-confidence estimates, flag missing measurements, and keep provenance attached to every guess.",
    icon: Camera,
  },
  {
    title: "Use move-aware workflows",
    copy: "Create spaces, transport resources, boxes, sell listings, move-day lists, exports, and load plans through coarse agent-friendly operations.",
    icon: ClipboardList,
  },
  {
    title: "Keep privacy explicit",
    copy: "The public docs explain what is safe to read publicly and what requires the user to sign in or provide an API key.",
    icon: ShieldCheck,
  },
];

const setupSteps = [
  "Ask your assistant to open movingmanifest.com/ai and read /llms.txt.",
  "Create a MovingManifest account if you do not have one yet.",
  "Create or select a move, such as House in Nashua NH to house in Tucson AZ.",
  "Open Settings and create an AI helper key with the recommended scopes.",
  "Give the key only to the assistant or MCP client you trust for this move.",
  "Have the assistant call /api/v1/me, then /api/v1/moves, then /api/v1/moves/{moveId}/agent-context before writing data.",
];

const starterPrompt =
  "Go to movingmanifest.com/ai and help me set up my move. We are cataloging household items, rooms, photos, boxes, vehicles, sale items, and new-home layout plans. If you need private access, walk me through creating an account and an AI helper key.";

const userPaths = [
  {
    title: "I just have Claude or ChatGPT on my phone",
    copy: "Paste the starter prompt. Your assistant should explain the account step, ask before using any key, and guide you through photos, rooms, and inventory.",
  },
  {
    title: "I can use Codex, Claude Code, or another agent",
    copy: "Have the agent read this page, /llms.txt, and /openapi.json. It should use the API or MCP instead of clicking around whenever possible.",
  },
  {
    title: "I am helping someone else move",
    copy: "Use a separate move-restricted helper key. The owner can revoke it later, and private values or serial numbers should stay owner-only unless shared.",
  },
];

const assistantGroundRules = [
  "This is a household moving, inventory, photo, room, box, sale-prep, and layout-planning app.",
  "Public pages are safe to read. Private move data requires the user to sign in or intentionally provide an API key.",
  "Do not scrape private pages, guess credentials, or claim access you do not have.",
  "Ask before creating records, uploading photos, marking items for sale, exporting packets, or using an API key.",
  "Preserve uncertainty: if dimensions, weight, condition, value, or price are estimated, record that they are estimates and need review.",
];

const examples = [
  "Create a move from Nashua, New Hampshire to Tucson, Arizona with a Ram truck, Toyota Tundra, trailer, and moving company shipment.",
  "Add these 20 photos as inventory in the Den. Estimate dimensions and mark all estimates as low confidence.",
  "Create rooms for the origin house, then attach room photos and organize existing items by current room.",
  "Find everything marked sell and draft Facebook Marketplace titles, descriptions, price ranges, and research notes.",
  "Build a move-day checklist for what is unboxed, high value, fragile, first-night, or needs personal transport.",
  "Export a mover-safe packet that hides private notes, serial numbers, and replacement values.",
];

export default function AiAssistantPage() {
  return (
    <PublicPageChrome
      eyebrow="AI assistant ready"
      title="Let your AI assistant help build the move with you."
      description="MovingManifest helps Claude, ChatGPT, Codex, or another assistant set up a move, add inventory from photos, organize rooms, prepare sale listings, and plan layouts. The public docs explain the path before the person has an account."
      visual={<AssistantVisual />}
    >
      <PublicBand>
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <Badge variant="secondary">Start here</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              The one prompt to give your assistant.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              This is intentionally short enough to paste into a phone assistant.
              It tells the assistant where to go, what the task is, and when it
              needs to stop and ask you for account or key access.
            </p>
          </div>
          <div className="rounded-md border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageSquareText className="size-4 text-primary" aria-hidden="true" />
              Paste this into Claude, ChatGPT, Codex, or another assistant
            </div>
            <blockquote className="mt-3 border-l-2 border-primary pl-3 text-sm leading-6">
              {starterPrompt}
            </blockquote>
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <FeatureGrid cards={assistantCards} />
      </PublicBand>

      <PublicBand>
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Badge variant="secondary">Different comfort levels</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              Three common ways people will use this.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              MovingManifest should not require the person to understand API,
              MCP, schemas, or agent tooling. The site gives their assistant
              enough structure to choose the right path.
            </p>
          </div>
          <div className="grid gap-3">
            {userPaths.map((path) => (
              <div key={path.title} className="rounded-md border border-border p-4">
                <h3 className="text-sm font-medium">{path.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {path.copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Badge variant="secondary">For AI assistants</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              This is the safe working boundary.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The assistant should feel clear about what is happening here:
              cataloging household move information, not bypassing privacy,
              scraping accounts, or making irreversible decisions without the
              user.
            </p>
          </div>
          <ul className="grid gap-3">
            {assistantGroundRules.map((rule) => (
              <li key={rule} className="rounded-md border border-border p-4 text-sm leading-6">
                {rule}
              </li>
            ))}
          </ul>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Badge variant="secondary">Phone-friendly setup</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              What the assistant should do first.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The person should not need to understand API or MCP terminology.
              Their assistant can read these public instructions, explain the
              account step in plain language, and ask for permission before any
              private data or key is used.
            </p>
          </div>
          <ol className="grid gap-3">
            {setupSteps.map((step, index) => (
              <li key={step} className="rounded-md border border-border p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {step}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">
              Example prompts that should work well.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              These are written for normal users. The assistant can translate
              them into API or MCP calls after it has an account key.
            </p>
          </div>
          <div className="grid gap-3">
            {examples.map((example) => (
              <div
                key={example}
                className="rounded-md border border-border p-3 text-sm"
              >
                {example}
              </div>
            ))}
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["AI discovery", "/llms.txt", "Short public map for assistants."],
            ["REST API", "/api", "Human overview plus OpenAPI link."],
            ["MCP", "/mcp", "Local MCP server setup for capable assistants."],
          ].map(([title, href, copy]) => (
            <Link
              key={href}
              href={href}
              className="rounded-md border border-border p-4 text-sm hover:bg-muted/40"
            >
              <div className="font-medium">{title}</div>
              <p className="mt-2 leading-6 text-muted-foreground">{copy}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-primary">
                Open {href}
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </PublicBand>
    </PublicPageChrome>
  );
}

function AssistantVisual() {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-xl shadow-black/25">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Assistant workflow
          </p>
          <p className="mt-1 text-lg font-semibold">Photos to move record</p>
        </div>
        <Badge>
          <Sparkles aria-hidden="true" />
          agent ready
        </Badge>
      </div>
      <div className="mt-4 space-y-3">
        <div className="rounded-md border border-primary/25 bg-primary/5 p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Paste-ready prompt
          </div>
          <p className="mt-2 text-sm leading-6">{starterPrompt}</p>
        </div>
        {[
          ["User", "Here are photos of the Den. Add these to my move."],
          [
            "Assistant",
            "I will create items, mark estimates, and flag what needs review.",
          ],
          [
            "MovingManifest",
            "Inventory, photos, provenance, rooms, sale prep, and exports stay structured.",
          ],
        ].map(([speaker, copy]) => (
          <div
            key={speaker}
            className="rounded-md border border-border bg-background/65 p-3"
          >
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              {speaker}
            </div>
            <p className="mt-2 text-sm leading-6">{copy}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button asChild>
          <Link href="/sign-up">Create account</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/api">Read API docs</Link>
        </Button>
      </div>
    </div>
  );
}
