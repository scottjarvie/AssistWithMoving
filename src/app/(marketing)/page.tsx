import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Camera,
  ClipboardList,
  Link2,
  MessageSquareText,
  Network,
  PackageCheck,
} from "lucide-react";

import { PublicHeader } from "@/components/public-page-chrome";
import { CopyTextButton } from "@/components/copy-text-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "MovingManifest - move inventory, photos, boxes, and packets",
  description:
    "Organize household moves with inventory, boxes, photo evidence, load planning, documentation packets, and AI assistant setup.",
};

const quickCapabilities = [
  {
    title: "Turn photos into inventory",
    copy: "Upload originals, create item records from a few words, and mark uncertain dimensions or weights for review.",
    href: "/features",
    icon: Camera,
  },
  {
    title: "Rough in boxes and large items",
    copy: "List box labels and loose movable units first, then fill weights, dimensions, contents, and load assignments later.",
    href: "/features",
    icon: PackageCheck,
  },
  {
    title: "Prepare selling and packets",
    copy: "Draft sale listings, organize box records, and prepare mover-safe or owner packets.",
    href: "/claims-inventory",
    icon: ClipboardList,
  },
  {
    title: "Connect your assistant safely",
    copy: "Start at /ai. Sign in through the browser when the assistant supports it, and create a revocable helper connection only when it asks.",
    href: "/ai",
    icon: Network,
  },
];

const assistantHomePrompt =
  "Open https://movingmanifest.com/ai and help me use MovingManifest with this assistant. Prefer browser sign-in through the remote MCP endpoint when this client supports it; ask me for a scoped helper key only if OAuth/MCP is not available. Start with setup if access is missing, then read my move context before changing anything. I may ask you to rough in boxes, large loose items, photos, and packets.";

const assistantHandoffSteps = [
  "Copy the prompt into your assistant.",
  "The assistant reads the AI guide.",
  "You approve sign-in only when private data is needed.",
];

const assistantHomeLinks = [
  {
    title: "Assistant guide",
    value: "movingmanifest.com/ai",
    copyText: "https://movingmanifest.com/ai",
  },
  {
    title: "Connection setup",
    value: "movingmanifest.com/ai/start",
    copyText: "https://movingmanifest.com/ai/start",
  },
];

export default function MarketingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <PublicHeader />

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:px-8">
        <div className="max-w-3xl">
          <Badge variant="secondary" className="mb-5">
            Private move records for real households
          </Badge>
          <h1 className="text-5xl font-semibold leading-[0.95] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            The manifest for everything that moves.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            Inventory every item, box every room, attach photo evidence, plan
            every load, and export the right documentation packet for movers,
            employers, insurance, storage, donations, or a military PCS.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/ai">
                Use with your AI assistant
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/sign-up">Create account</Link>
            </Button>
          </div>
          <Link
            href="/ai"
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary"
          >
            Assistant setup and documentation are at /ai
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <div className="mt-5 max-w-2xl rounded-md border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <MessageSquareText
                  className="mt-1 size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <h2 className="text-base font-semibold tracking-normal">
                    Already using an assistant?
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Copy one short instruction. The assistant can read /ai for
                    the setup details.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    If the assistant supports browser sign-in, you should not
                    need to paste a raw key.
                  </p>
                </div>
              </div>
              <CopyTextButton
                text={assistantHomePrompt}
                label="Copy prompt"
                ariaLabel="Copy MovingManifest assistant setup prompt"
              />
            </div>
            <details className="mt-4 rounded-md border border-border bg-background/65 p-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Preview the exact handoff
              </summary>
              <blockquote className="mt-3 border-l-2 border-primary pl-3 text-sm leading-6 text-muted-foreground">
                {assistantHomePrompt}
              </blockquote>
            </details>
            <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
              {assistantHomeLinks.map((resource) => (
                <div
                  key={resource.title}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-background/65 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Link2
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {resource.title}
                      </p>
                      <code className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">
                        {resource.value}
                      </code>
                    </div>
                  </div>
                  <CopyTextButton
                    text={resource.copyText}
                    label="Copy"
                    ariaLabel={`Copy ${resource.title}`}
                  />
                </div>
              ))}
            </div>
            <ol className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-3">
              {assistantHandoffSteps.map((step, index) => (
                <li
                  key={step}
                  className="flex min-w-0 items-start gap-2 text-sm leading-6 text-muted-foreground"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary text-xs font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <Badge variant="secondary">What it handles</Badge>
              <h2 className="mt-3 text-2xl font-semibold tracking-normal">
                From first photos to final packets.
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Use MovingManifest directly, or let a connected assistant help
              with the repetitive record-building work.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {quickCapabilities.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="group rounded-md border border-border bg-card p-4 transition hover:border-primary/45 hover:bg-muted/25"
              >
                <card.icon
                  className="mb-4 size-5 text-primary"
                  aria-hidden="true"
                />
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold tracking-normal">
                    {card.title}
                  </h2>
                  <ArrowRight
                    className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:text-primary"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {card.copy}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
