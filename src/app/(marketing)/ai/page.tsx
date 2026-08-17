import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  Camera,
  ClipboardList,
  DoorOpen,
  KeyRound,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";

import {
  PublicBand,
  PublicPageChrome,
} from "@/components/public-page-chrome";
import type { PublicNavigationMode } from "@/components/public-page-chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Use Assist With Moving with your chosen AI",
  description:
    "The grant, the tools, the connection doors, and the honest capability state for using Assist With Moving with an AI you choose.",
};

// The one canonical door. The other three are named honestly further down the
// page; none of them share this catalog.
const canonicalEndpoint = "https://movingmanifest.com/mcp";

const starterPrompt =
  "Open https://movingmanifest.com/ai and help me use Assist With Moving. If you speak remote Streamable HTTP MCP with compatible OAuth, connect to https://movingmanifest.com/mcp. Signing in is not permission — I then approve a grant that decides what you may do. Call describe_connection if no tools appear, get_move_brief first, search before creating duplicates, and save finished work with save_complete_result.";

// canonical-tool-catalog:start
// Every tool the canonical door can ever list, with the approval each one
// needs. Your AI sees only the rows your grant covers.
const canonicalToolCatalog = [
  {
    scope: "Always available",
    label: "No approval needed",
    copy: "How your AI finds out what it may do, and what to tell you when it may do nothing.",
    tools: ["describe_connection"],
  },
  {
    scope: "moving.context.read",
    label: "Read the move context you choose",
    copy: "Route, dates, rooms and places, belongings and boxes, decisions, estimates, saved results, source checks, and Queue summaries — for the moves you select.",
    tools: ["get_move_brief", "search_move_records", "get_move_records"],
  },
  {
    scope: "moving.evidence.read",
    label: "Open the private photos and files for that work",
    copy: "Returned through Assist With Moving as protected content, never as a storage link. Reading context does not include this.",
    tools: ["get_evidence_media"],
  },
  {
    scope: "moving.work.write",
    label: "Save the work you asked for",
    copy: "Move context, inventory, decisions, estimates, plan sections, source checks, and one complete reviewed result. Replay-safe, so a retry corrects instead of duplicating.",
    tools: [
      "save_move_context",
      "save_inventory",
      "save_planning_record",
      "save_complete_result",
    ],
  },
  {
    scope: "moving.queue.work",
    label: "Work the Queue handoffs you hand over",
    copy: "See what is waiting, take it, ask you the smallest question, hand it back, or mark it Done with its result attached.",
    tools: [
      "list_queue_work",
      "claim_queue_work",
      "release_queue_work",
      "ask_queue_question",
      "complete_queue_work",
    ],
  },
  {
    scope: "moving.archive",
    label: "Retire records that turned out to be wrong",
    copy: "Reversible archive and restore. You can put any of it back, and nothing is ever permanently deleted.",
    tools: ["archive_move_records"],
  },
];
// canonical-tool-catalog:end

const quickCapabilities = [
  {
    title: "A grant, not a sign-in",
    copy: "Signing in proves who you are. A separate approval decides what your AI may do — which moves, which data, which operations. Revoking it stops the very next call.",
    icon: ShieldCheck,
  },
  {
    title: "Use evidence with inventory",
    copy: "When you approve evidence reading, your AI can open the private photos for that work, create or correct inventory, keep source notes, and mark what still needs review.",
    icon: Camera,
  },
  {
    title: "Keep move context current",
    copy: "Your AI reads a compact move brief, searches before creating duplicates, and adds or corrects the move, place, and inventory context you approved.",
    icon: Truck,
  },
  {
    title: "Keep finished planning work",
    copy: "One call saves the decisions, estimates, readable plan result, and honest source checks together — and can close the Queue handoff in the same approval.",
    icon: ClipboardList,
  },
];

const setupSteps = [
  "Create your private move and keep only the context that is useful now.",
  "Leave a Queue handoff in your own words when work should survive the chat.",
  "Paste the endpoint into an AI that speaks remote MCP with OAuth, and sign in.",
  "Approve a grant: choose the moves and the operations it covers.",
  "Ask it to save finished work, then review the result inside the move.",
];

const examplePrompts = [
  "Create a move from Nashua, New Hampshire to Tucson, Arizona with my Ram truck, Toyota Tundra, trailer, and moving company shipment.",
  "Add these photos as inventory in the Den. Estimate obvious fields, choose confidence from the evidence, and tell me what needs measuring later.",
  "Add this packed office box with these photos, dimensions, weight, and the contents I describe.",
  "Find everything marked sell and draft Facebook Marketplace titles, descriptions, price ranges, and research notes.",
  "Build a move-day checklist for unboxed, fragile, high-value, first-night, or personal-transport items.",
];

const safetyRules = [
  "Public pages are safe for your AI to read.",
  "Private move data needs your sign-in plus a grant you approved, or a scoped key you created.",
  "A grant is re-read on every call, so revoking it refuses the next one instead of waiting for a token to expire.",
  "A key is like a temporary password. Only paste it into an AI you trust, and revoke or rotate it in Settings.",
  "A Queue note records intent. It does not start an AI, and it never widens what that AI may do.",
];

const neverPermitted = [
  "Permanently delete anything, or delete your account. Archive is the destructive default and it is reversible.",
  "Archive a whole move. That stays a signed-in action you take yourself.",
  "Publish, share, create a share link, or export your move.",
  "Invite, remove, or change the access of anyone in your household.",
  "Contact a mover, marketplace, employer, insurer, or government office; book, buy, sign, pay, or message on your behalf.",
  "Grant itself authority, widen its own grant, or inherit another connection's grant.",
  "Turn a Queue instruction into permission. Missing authority becomes the smallest question back to you.",
];

const connectionDoors = [
  {
    name: "https://movingmanifest.com/mcp",
    role: "Canonical",
    copy: "Sign-in plus the grant you approve. The tool list on this page, and nothing outside it.",
  },
  {
    name: "https://movingmanifest.com/mcp/connect",
    role: "Legacy compatibility",
    copy: "Keeps connections that were made through the older gateway working. A different and larger catalog, governed by that older gateway rather than by grants. Not the same door and not the same tools.",
  },
  {
    name: "https://movingmanifest.com/api/mcp",
    role: "API key only",
    copy: "Takes a scoped mmk_ key and never offers sign-in. Its own separate catalog for headless or non-OAuth tools.",
  },
  {
    name: "assistwithmoving-mcp",
    role: "Local package",
    copy: "Runs on your own machine with the same kind of scoped key, serving the API-key catalog rather than the canonical one.",
  },
];

const connectionTruth = [
  {
    status: "Partial",
    title: "Bring your AI",
    copy: "The endpoint, the five approvals, the grant boundary, the Queue workflow, and immediate revocation are built. No AI product has yet completed a full connect, approve, read, save, revoke, and reconnect run against it, and the provider-side setup for verified client identity is not finished. Any AI that speaks remote Streamable HTTP MCP with compatible OAuth can attempt it; that is a requirement, not a promise about a particular product.",
  },
  {
    status: "Current",
    title: "The grant screen",
    copy: "Settings → AI connections is where you approve a grant, choose all moves or only some, read the consent summary, see each connection's client, last use, and activity, and revoke it. Until you approve one, a connected AI sees only describe_connection, which tells it to ask you.",
  },
  {
    status: "Current",
    title: "Scoped helper key",
    copy: "The separate API-key catalog is available today for headless or non-OAuth tools. Create a key only for an AI you trust, then revoke it when it is no longer needed.",
  },
  {
    status: "Current",
    title: "Manual Queue handoff",
    copy: "No connection required. Open the Queue item, copy its bounded brief into any AI, and paste the result back into the same item.",
  },
];

export default function AiAssistantPage() {
  return (
    <PublicPageChrome
      eyebrow="Bring your own AI"
      title="Give your chosen AI the right move context."
      description="Assist With Moving keeps the durable move record. An AI you choose can reason in its own environment, use bounded tools, and save useful work back to the move. Signing in proves who you are; a grant you approve decides what it may do."
      primaryAction={{ href: "/ai/start", label: "Start AI setup" }}
      secondaryAction={{
        href: "/llms.txt",
        label: "AI-readable guide",
        navigation: "document",
      }}
      visual={<AssistantVisual />}
    >
      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <Badge variant="secondary">First step</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              Start with the move, not the connection.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Create a private move and leave a Queue handoff first. Then paste
              the endpoint below into an AI that speaks remote Streamable HTTP
              MCP with compatible OAuth, sign in, and approve a grant for the
              moves and operations you actually want covered.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild size="touch">
                <Link href="/ai/start">
                  Start AI setup
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="touch">
                <a href="/llms.txt">AI-readable guide</a>
              </Button>
            </div>
            <p className="mt-5 font-mono text-xs leading-5 text-muted-foreground">
              {canonicalEndpoint}
            </p>
          </div>
          <div className="rounded-md border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageSquareText className="size-4 text-primary" aria-hidden="true" />
              Paste this into a compatible AI
            </div>
            <blockquote className="mt-3 border-l-2 border-primary pl-3 text-sm leading-6">
              {starterPrompt}
            </blockquote>
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {quickCapabilities.map((card) => (
            <div key={card.title} className="rounded-md border border-border p-4">
              <card.icon className="mb-4 size-5 text-primary" aria-hidden="true" />
              <h2 className="text-base font-semibold tracking-normal">
                {card.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {card.copy}
              </p>
            </div>
          ))}
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <Badge variant="secondary">What you approve</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              Five approvals, and the tools each one unlocks.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Your AI is shown only the tools your grant covers. Everything else
              is not merely refused — it is not listed at all. One tool,
              describe_connection, is always there so your AI can tell you what
              it is missing instead of failing silently.
            </p>
          </div>
          <div className="grid gap-3">
            {canonicalToolCatalog.map((entry) => (
              <article key={entry.scope} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{entry.label}</h3>
                  <Badge variant="outline">{entry.scope}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {entry.copy}
                </p>
                <p className="mt-2 font-mono text-xs leading-5 text-muted-foreground">
                  {entry.tools.join(", ")}
                </p>
              </article>
            ))}
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <Badge variant="secondary">Connection truth</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              Current and Partial are different.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              We would rather tell you what is unfinished than let a page imply
              a connection that nobody has completed end to end yet.
            </p>
          </div>
          <div className="grid gap-3">
            {connectionTruth.map((item) => (
              <article key={item.title} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={item.status === "Current" ? "default" : "outline"}>
                    {item.status}
                  </Badge>
                  <h3 className="font-semibold">{item.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.copy}
                </p>
              </article>
            ))}
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <Badge variant="secondary">Four doors</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              Only one of these is the canonical door.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The others exist, and they are not equivalent. Their tool
              catalogs are different from each other, so a tool working in one
              place says nothing about another.
            </p>
          </div>
          <div className="grid gap-3">
            {connectionDoors.map((door) => (
              <article key={door.name} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <DoorOpen className="size-4 text-primary" aria-hidden="true" />
                  <span className="break-all font-mono text-xs">{door.name}</span>
                  <Badge variant="outline">{door.role}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {door.copy}
                </p>
              </article>
            ))}
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <Badge variant="secondary">What happens next</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              One durable loop.
            </h2>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {setupSteps.map((step, index) => (
              <li key={step} className="rounded-md border border-border p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-muted-foreground">{step}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-3 lg:grid-cols-3">
          <ExpandableSection title="Examples of what your AI can do">
            <ul className="space-y-2">
              {examplePrompts.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
          </ExpandableSection>
          <ExpandableSection title="What this connection can never do">
            <ul className="space-y-2">
              {neverPermitted.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </ExpandableSection>
          <ExpandableSection title="Safety basics">
            <ul className="space-y-2">
              {safetyRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </ExpandableSection>
          <ExpandableSection title="No connection? Hand the work over by copy and paste">
            <p>
              Open the Queue item in your move and copy its bounded brief into
              any AI, however you normally work. Paste the result back into the
              same Queue item and mark it Done. Nothing about this path needs
              MCP, OAuth, or a key, and the handoff still keeps its scope,
              instructions, evidence references, and result.
            </p>
          </ExpandableSection>
          <ExpandableSection title="If your AI loses tools after an update">
            <p>
              A client can hold on to an old tool list. If a tool that used to
              work starts failing, or a new one never appears, disconnect the
              connection and connect again. Your saved move work is untouched,
              and your grant stays as you approved it.
            </p>
          </ExpandableSection>
          <ExpandableSection title="Technical docs for your AI">
            <div className="grid gap-2">
              <DocLink
                href="/llms-full.txt"
                title="Full AI guide"
                navigation="document"
              />
              <DocLink
                href="/ai.txt"
                title="Short agent guide"
                navigation="document"
              />
              <DocLink
                href="/openapi.json"
                title="OpenAPI contract"
                navigation="document"
              />
              <DocLink href="/api" title="REST API overview" />
              <DocLink href="/mcp/guide" title="MCP overview" />
              <DocLink href="/settings/ai" title="AI connections" />
            </div>
          </ExpandableSection>
        </div>
      </PublicBand>
    </PublicPageChrome>
  );
}

function ExpandableSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-md border border-border p-4 text-sm leading-6 text-muted-foreground open:bg-muted/25">
      <summary className="flex min-h-11 cursor-pointer items-center text-base font-medium text-foreground">
        {title}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function DocLink({
  href,
  title,
  navigation = "app",
}: {
  href: string;
  title: string;
  navigation?: PublicNavigationMode;
}) {
  const className =
    "inline-flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-foreground hover:bg-muted/40";
  const content = (
    <>
      {title}
      <ArrowRight className="size-4 text-primary" aria-hidden="true" />
    </>
  );

  if (navigation === "document") {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function AssistantVisual() {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-xl shadow-black/25">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Human part
          </p>
          <p className="mt-1 text-lg font-semibold">Connect an AI you choose</p>
        </div>
        <Badge>
          <KeyRound aria-hidden="true" />
          granted
        </Badge>
      </div>
      <div className="mt-4 space-y-3">
        {[
          ["1", "Create a private move."],
          ["2", "Leave a durable Queue handoff."],
          ["3", "Sign in from a compatible AI, then approve a grant."],
          ["4", "Review saved work inside the move."],
        ].map(([step, copy]) => (
          <div
            key={step}
            className="flex gap-3 rounded-md border border-border bg-background/65 p-3"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
              {step}
            </span>
            <p className="text-sm leading-6 text-muted-foreground">{copy}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-primary/25 bg-primary/5 p-3 text-sm leading-6">
        <span className="flex items-center gap-2 font-medium">
          <Bot className="size-4 text-primary" aria-hidden="true" />
          You stay in control
        </span>
        <p className="mt-2 text-muted-foreground">
          Sign-in ties calls to your account, the grant decides what may be
          done, and revoking it refuses the very next call.
        </p>
      </div>
      <Button asChild size="touch" className="mt-4 w-full">
        <Link href="/ai/start">
          Start AI setup
          <Sparkles aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
