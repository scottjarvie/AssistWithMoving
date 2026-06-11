import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Boxes,
  Camera,
  FileText,
  KeyRound,
  Map,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  FeatureGrid,
  PublicBand,
  PublicPageChrome,
} from "@/components/public-page-chrome";
import { Badge } from "@/components/ui/badge";

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
    title: "Photo evidence",
    copy: "Start upload sessions, PUT files to storage, then finalize item, room, box, receipt, serial, and condition photos.",
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

export default function ApiPage() {
  return (
    <PublicPageChrome
      eyebrow="REST API"
      title="A structured API for move helpers and AI agents."
      description="The MovingManifest API lets trusted tools create moves, add inventory, upload evidence, prepare sale listings, plan loads, and export documentation. Public docs are readable before login; private data requires a user-created API key."
      visual={<ApiVisual />}
    >
      <PublicBand>
        <FeatureGrid cards={apiCards} />
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
            {[
              ["Base URL", "https://movingmanifest.com/api/v1"],
              ["Auth", "Authorization: Bearer mmk_..."],
              ["Discovery", "GET /me, GET /moves, GET /moves/{moveId}/agent-context"],
              ["Batch intake", "POST /moves/{moveId}/items/batch-upsert"],
              ["Machine contract", "GET /openapi.json"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-md border border-border bg-card p-3"
              >
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {label}
                </div>
                <code className="mt-2 block break-words font-mono text-sm">
                  {value}
                </code>
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
          "Dry-run batch changes.",
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
