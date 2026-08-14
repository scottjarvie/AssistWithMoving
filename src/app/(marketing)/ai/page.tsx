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
    "Current setup, capability, Queue, and access boundaries for using Assist With Moving with a compatible AI.",
};

const starterPrompt =
  "Open https://movingmanifest.com/ai and help me use Assist With Moving. If you support remote MCP with OAuth, connect to https://movingmanifest.com/mcp, call get_move_brief first, search before creating duplicates, and save finished work with save_complete_result. Do not claim or complete Queue items through this OAuth connection; those actions use a separately scoped API-key tool today.";

const quickCapabilities = [
  {
    title: "Use evidence with inventory",
    copy: "The canonical OAuth tools can read bounded private evidence, create or correct inventory records, preserve source notes, and mark uncertainty for review.",
    icon: Camera,
  },
  {
    title: "Keep move context current",
    copy: "Your AI can read a compact move brief, search before creating duplicates, and add or correct core move, place, inventory, and transport context.",
    icon: Truck,
  },
  {
    title: "Keep finished planning work",
    copy: "It can save decisions, estimates, readable plan results, and honest source checks so the work remains visible outside the chat.",
    icon: ClipboardList,
  },
  {
    title: "Choose the right connection",
    copy: "Hosted MCP OAuth covers the normal move-planning loop. A separately scoped helper key provides the granular REST/stdio catalog and today’s Queue claim and completion tools.",
    icon: Bot,
  },
];

const setupSteps = [
  "Create your private move and keep only the context that is useful now.",
  "Leave a Queue handoff in your own words when work should survive the chat.",
  "Connect hosted MCP OAuth from an AI that supports remote MCP and OAuth.",
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
  "Public pages are safe for your assistant to read.",
  "Private move data requires your signed-in OAuth connection or a scoped key you create.",
  "A key is like a temporary password. Only paste it into an assistant you trust.",
  "You can revoke or rotate keys later in Settings.",
  "A Queue note records intent. It does not start an AI or expand that AI’s access.",
];

const connectionTruth = [
  {
    status: "Current",
    title: "Hosted MCP OAuth",
    copy: "Eight workflow tools can brief, search, read bounded records and evidence, create or correct core move records, and save a complete source-backed result in one call.",
  },
  {
    status: "Current",
    title: "Scoped helper key",
    copy: "The separate API-key HTTP/stdio catalog provides granular automation and the Queue claim and completion tools. Create a key only for an AI you trust, then revoke it when it is no longer needed.",
  },
  {
    status: "Partial",
    title: "Queue through hosted OAuth",
    copy: "OAuth can read bounded Queue summaries and link saved work to a handoff. It cannot claim or complete Queue work yet, and saving a handoff never means an AI is already running.",
  },
];

export default function AiAssistantPage() {
  return (
    <PublicPageChrome
      eyebrow="AI assistant ready"
      title="Give your chosen AI the right move context."
      description="Assist With Moving keeps the durable move record. A compatible AI can reason in its own environment, use bounded tools, and save useful work back to the move. You remain the authority."
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
              Create a private move and leave a Queue handoff first. Then use
              hosted MCP OAuth from a compatible AI, or create a scoped helper
              key only for clients and Queue workflows that need the separate
              API-key catalog.
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
            <Badge variant="secondary">Connection truth</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              Current and Partial are different.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Assist With Moving has distinct connection doors. Use the one
              that matches the work instead of assuming every tool appears in
              every AI client.
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
          <ExpandableSection title="Safety basics">
            <ul className="space-y-2">
              {safetyRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </ExpandableSection>
          <ExpandableSection title="Technical docs for the assistant">
            <div className="grid gap-2">
              <DocLink
                href="/llms-full.txt"
                title="Full AI guide"
                navigation="document"
              />
              <DocLink
                href="/openapi.json"
                title="OpenAPI contract"
                navigation="document"
              />
              <DocLink href="/api" title="REST API overview" />
              <DocLink href="/mcp/guide" title="MCP overview" />
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
          <p className="mt-1 text-lg font-semibold">Connect a compatible AI</p>
        </div>
        <Badge>
          <KeyRound aria-hidden="true" />
          scoped
        </Badge>
      </div>
      <div className="mt-4 space-y-3">
        {[
          ["1", "Create a private move."],
          ["2", "Leave a durable Queue handoff."],
          ["3", "Connect hosted MCP OAuth when supported."],
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
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          You stay in control
        </span>
        <p className="mt-2 text-muted-foreground">
          Authentication ties calls to your account, tools enforce bounded
          reads and writes, and you can revoke the connection or key later.
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
