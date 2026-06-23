import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Boxes,
  Camera,
  FileText,
  KeyRound,
  Map,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  FeatureGrid,
  PublicBand,
  PublicPageChrome,
} from "@/components/public-page-chrome";
import { CopyTextButton } from "@/components/copy-text-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "MovingManifest API",
  description:
    "Public REST API overview for MovingManifest agents and integrations.",
};

const apiCards = [
  {
    title: "Move setup",
    copy: "Create or update a move, origin/destination context, spaces, transport resources, transport zones, and starter inventory.",
    icon: Map,
  },
  {
    title: "Inventory intake",
    copy: "Create one item or batch upsert up to 100 items with dimensions, weight estimates, provenance, review flags, and disposition.",
    icon: Boxes,
  },
  {
    title: "Rough movable units",
    copy: "Capture boxes, cartons, totes, and large loose items as load-planning units before every box is itemized. Patch missing weight, dimensions, volume, or assignment later without duplicating records.",
    icon: PackageCheck,
  },
  {
    title: "Photo evidence",
    copy: "Upload JPEG, PNG, or WebP evidence in one API call as raw bytes, multipart form data, URL, data URL, or base64. Images get web-ready derivatives server-side, uploads can queue AI review suggestions, and direct uploads return agentReview summaries for quick user correction.",
    icon: Camera,
  },
  {
    title: "Capture queue",
    copy: "Store phone photos and notes for an agent to process later, with intent and target fields that can tie work to B-001 or an existing item.",
    icon: Camera,
  },
  {
    title: "Sell workflow",
    copy: "Prepare sale listings for sell-marked items with platform status, title, description, pricing, research depth, and buyer counts.",
    icon: FileText,
  },
  {
    title: "Layout and load planning",
    copy: "Fetch agent context, planned items, floor plans, resources, zones, capacity reports, and move-day checklists.",
    icon: RefreshCw,
  },
  {
    title: "Scoped access",
    copy: "Use revocable API keys with explicit scopes. Add or invite household collaborators by email with the members/manage scope.",
    icon: ShieldCheck,
  },
];

const scopes = [
  "moves/read",
  "moves/write",
  "inventory/read",
  "inventory/write",
  "plans/read",
  "plans/write",
  "photos/write",
  "exports/read",
  "exports/create",
  "members/manage",
];

const apiReferenceRows = [
  ["Base URL", "https://movingmanifest.com/api/v1"],
  ["Auth", "Authorization: Bearer mmk_..."],
  ["Discovery", "GET /me, GET /moves, GET /moves/{moveId}/agent-context"],
  ["Movable units", "POST /moves/{moveId}/movable-units/batch-upsert"],
  ["Batch intake", "POST /moves/{moveId}/items/batch-upsert"],
  ["Capture queue", "POST /moves/{moveId}/ingestion-queue"],
  ["Image upload", "POST /images/upload or POST /photos/upload"],
  ["Machine contract", "GET /openapi.json"],
] as const;

export default function ApiPage() {
  return (
    <PublicPageChrome
      eyebrow="REST API"
      title="A structured API for move helpers and AI agents."
      description="The MovingManifest API lets trusted tools create moves, add inventory, upload evidence, prepare sale listings, plan loads, and export documentation. Public docs are readable before login; private data requires a user-created API key."
      primaryAction={{ href: "/ai/kit", label: "Download agent kit" }}
      secondaryAction={{ href: "/openapi.json", label: "OpenAPI schema" }}
      visual={<ApiVisual />}
    >
      <PublicBand>
        <FeatureGrid cards={apiCards} />
      </PublicBand>

      <PublicBand>
        <div className="grid gap-5 rounded-md border border-primary/25 bg-primary/5 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <Badge variant="secondary">Need private access?</Badge>
            <h2 className="mt-3 text-xl font-semibold tracking-normal">
              Start with AI setup. Use a key only when the client needs one.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              OAuth MCP keeps the user in a browser sign-in flow. Scoped helper
              keys are still useful for REST clients, local tools, and assistants
              that cannot use remote MCP.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/ai">
                Start AI setup
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/settings/ai-connections">Create helper key</Link>
            </Button>
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <Badge variant="secondary">Base URL</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              Start with context, then write in batches.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Assistants should avoid clicking around when the API can return a
              structured move context. Use dry runs for bulk changes, preserve
              provenance for estimates, and prefer batch endpoints over chatty
              loops.
            </p>
          </div>
          <div className="space-y-3">
            {apiReferenceRows.map(([label, value]) => (
              <div
                key={label}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {label}
                  </div>
                  <code className="mt-2 block break-words font-mono text-sm">
                    {value}
                  </code>
                </div>
                <CopyTextButton
                  text={value}
                  label="Copy"
                  ariaLabel={`Copy ${label} API reference`}
                />
              </div>
            ))}
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">
              Available AI helper scopes.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The Settings screen defaults to a useful assistant key. Users can
              still remove scopes, restrict a key to one move, rotate it, or
              revoke it after the helper session. Member management is an
              explicit extra scope because it grants real account access. A
              spouse or collaborator can be invited by email before they create
              an account; access activates when they sign in with that email.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {scopes.map((scope) => (
              <Badge key={scope} variant="outline">
                {scope}
              </Badge>
            ))}
          </div>
        </div>
      </PublicBand>
    </PublicPageChrome>
  );
}

function ApiVisual() {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-xl shadow-black/25">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            API flow
          </p>
          <p className="mt-1 text-lg font-semibold">Assistant-safe order</p>
        </div>
        <Badge>
          <KeyRound aria-hidden="true" />
          scoped key
        </Badge>
      </div>
      <ol className="mt-4 space-y-3">
        {[
          "Authenticate with a user-created key.",
          "Read /me and list moves.",
          "Fetch /agent-context for IDs, spaces, items, and guidance.",
          "Dry-run rough movable-unit or detailed item batch changes.",
          "Write, verify, then summarize what changed.",
        ].map((step, index) => (
          <li
            key={step}
            className="flex gap-3 rounded-md border border-border bg-background/65 p-3"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
              {index + 1}
            </span>
            <span className="text-sm leading-6 text-muted-foreground">
              {step}
            </span>
          </li>
        ))}
      </ol>
      <Link
        href="/openapi.json"
        className="mt-4 inline-flex items-center gap-2 text-sm text-primary"
      >
        Open machine-readable OpenAPI
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
