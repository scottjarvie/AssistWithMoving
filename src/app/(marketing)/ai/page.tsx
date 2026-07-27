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
  title: "Use MovingManifest with an AI assistant",
  description:
    "A simple starting point for using MovingManifest with Claude, ChatGPT, Codex, or another AI assistant.",
};

const starterPrompt =
  "Go to movingmanifest.com/ai and help me set up my move. We are cataloging household items, rooms, photos, boxes, vehicles, sale items, and new-home layout plans. If I provide photos, upload the originals through the easiest image/photo tool and let MovingManifest create web-ready versions. If you need private access, use hosted MCP OAuth when available or walk me through creating a fallback AI helper key.";

const quickCapabilities = [
  {
    title: "Turn photos into inventory",
    copy: "Your assistant can upload originals, create item records from a few words, and mark uncertain dimensions or weights for review.",
    icon: Camera,
  },
  {
    title: "Set up the move",
    copy: "It can create rooms, destination spaces, trucks, trailers, storage, and moving-company shipment areas.",
    icon: Truck,
  },
  {
    title: "Prepare selling and packets",
    copy: "It can save box intake with photos and contents, draft sale listings, and prepare mover-safe or owner packets.",
    icon: ClipboardList,
  },
  {
    title: "Use structured tools",
    copy: "With hosted MCP OAuth or a key you create, it can use structured tools instead of asking you to click every field.",
    icon: Bot,
  },
];

const setupSteps = [
  "Tell your assistant to open this page.",
  "Create or sign into your MovingManifest account.",
  "Use hosted MCP OAuth when your assistant supports it.",
  "Create a fallback AI helper key only when OAuth is not available.",
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
  "Private move data requires your account or a key you create.",
  "A key is like a temporary password. Only paste it into an assistant you trust.",
  "You can revoke or rotate keys later in Settings.",
];

export default function AiAssistantPage() {
  return (
    <PublicPageChrome
      eyebrow="AI assistant ready"
      title="Let your AI help with the move."
      description="MovingManifest gives your assistant a structured place to save rooms, photos, inventory, boxes, vehicles, sale prep, layouts, and packets. You stay in control of the account and the key."
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
              If an AI sent you here, start with the setup page.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The setup page keeps the human part short: sign in, connect with
              hosted MCP OAuth when available, or create a fallback key for
              local/headless tools. The assistant can read the deeper docs when
              it needs them.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/ai/start" prefetch={false}>
                  Start AI setup
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <a href="/llms.txt">AI-readable guide</a>
              </Button>
            </div>
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
        <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <Badge variant="secondary">What happens next</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              Four short steps.
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
      <summary className="cursor-pointer text-base font-medium text-foreground">
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
    "inline-flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-foreground hover:bg-muted/40";
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
          <p className="mt-1 text-lg font-semibold">Connect the assistant</p>
        </div>
        <Badge>
          <KeyRound aria-hidden="true" />
          scoped
        </Badge>
      </div>
      <div className="mt-4 space-y-3">
        {[
          ["1", "Sign in or create an account."],
          ["2", "Connect hosted MCP with OAuth when available."],
          ["3", "Create a fallback key only when needed."],
          ["4", "Return to the AI chat."],
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
          Your assistant only gets the access you choose, and you can revoke the
          connection or key later.
        </p>
      </div>
      <Button asChild className="mt-4 w-full">
        <Link href="/ai/start" prefetch={false}>
          Start AI setup
          <Sparkles aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
