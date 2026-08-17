import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  Cable,
  DoorOpen,
  FileJson,
  KeyRound,
  Laptop,
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
  title: "Assist With Moving MCP",
  description:
    "How the canonical MCP endpoint works: the grant that decides authority, the exact tool catalog, the four doors, and what is still unproved.",
};

const mcpCards = [
  {
    title: "A grant decides authority",
    copy: "OAuth proves who is calling. A separate product grant, approved by the person and re-read on every discovery and every call, decides which moves, which data, and which operations. Revoking it refuses the very next call.",
    icon: ShieldCheck,
  },
  {
    title: "The tool list is the grant",
    copy: "tools/list shows only the tools the current grant covers, so nothing is advertised that would only be refused. describe_connection is always listed and needs no scope.",
    icon: Bot,
  },
  {
    title: "Canonical door first",
    copy: "Connect to https://movingmanifest.com/mcp and sign in — no key to copy. The API-key door at https://movingmanifest.com/api/mcp is a separate surface with a separate catalog for headless or non-OAuth tools.",
    icon: Laptop,
  },
  {
    title: "Capability discovery",
    copy: "Canonical clients call describe_connection when nothing is listed, then get_move_brief. API-key clients use get_api_capabilities, because that automation catalog is different and larger.",
    icon: FileJson,
  },
  {
    title: "Client identity",
    copy: "A Client ID Metadata Document is preferred, validated, and its digest bound to the grant. Dynamic registration is a labelled fallback. A metadata document that fails validation is refused, never downgraded.",
    icon: KeyRound,
  },
  {
    title: "Batch over chatty loops",
    copy: "save_complete_result keeps a finished plan, its inventory, locations, decisions, estimates, and source checks together in one replay-safe operation — and can close the Queue handoff in the same approval.",
    icon: Cable,
  },
];

// canonical-tool-catalog:start
// Exactly the catalog served by the canonical door, grouped by the approval
// each tool requires. Keep this in step with STATELESS_MOVING_TOOL_NAMES.
const canonicalToolCatalog = [
  {
    scope: "no scope — always available",
    tools: ["describe_connection"],
  },
  {
    scope: "moving.context.read",
    tools: ["get_move_brief", "search_move_records", "get_move_records"],
  },
  {
    scope: "moving.evidence.read",
    tools: ["get_evidence_media"],
  },
  {
    scope: "moving.work.write",
    tools: [
      "save_move_context",
      "save_inventory",
      "save_planning_record",
      "save_complete_result",
    ],
  },
  {
    scope: "moving.queue.work",
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
    tools: ["archive_move_records"],
  },
];
// canonical-tool-catalog:end

const apiKeyExtendedToolGroups = [
  "Move creation and setup for headless automations",
  "Detailed item and box primitives for advanced partial workflows",
  "Sale-prep workflows when the user grants that scope intentionally",
  "Export and share workflows when the user grants documentation access",
  "Household collaborator management for admin-approved local helpers",
  "Layout Studio operations for plan review and editing",
  "Raw upload sessions for clients that cannot use workflow photo tools",
];

const doors = [
  {
    name: "https://movingmanifest.com/mcp",
    role: "Canonical",
    copy: "Stateless Streamable HTTP with OAuth sign-in, then a person-approved product grant. Serves the catalog listed on this page and nothing outside it.",
  },
  {
    name: "https://movingmanifest.com/mcp/connect",
    role: "Legacy compatibility",
    copy: "The older persisted OAuth gateway, kept working for clients that already connected there. A different and larger catalog, governed by that gateway rather than by product grants. Not an alias of /mcp.",
  },
  {
    name: "https://movingmanifest.com/api/mcp",
    role: "API key only",
    copy: "Accepts a scoped mmk_ key, never advertises OAuth, and rejects OAuth tokens. Its own separate catalog and scopes.",
  },
  {
    name: "assistwithmoving-mcp",
    role: "Local stdio package",
    copy: "Runs locally against the REST API with a scoped mmk_ key. Serves the API-key catalog, not the canonical one.",
  },
];

// THE canonical stateless front door (OAuth sign-in). /mcp/connect preserves
// the older persisted OAuth catalog; /api/mcp is the separate API-key catalog.
const remoteEndpointUrl = "https://movingmanifest.com/mcp";

const remoteOAuthExample = `Paste this MCP URL into any AI that speaks remote Streamable HTTP MCP
with compatible OAuth:
https://movingmanifest.com/mcp

Then sign in with your Assist With Moving account — no key needed.
The client discovers the authorization server from:
/.well-known/oauth-protected-resource/mcp

Signing in is not permission. Approve a grant in Settings afterwards,
or the connection will list only describe_connection.`;

const remoteApiKeyFallbackExample = `Advanced — headless / non-OAuth clients ONLY.
This door is key-only, never advertises OAuth, and rejects OAuth sign-in.
It serves a different catalog from the canonical door.
POST https://movingmanifest.com/api/mcp
Authorization: Bearer mmk_replace_with_a_scoped_api_key`;

const workflowRules = `1. describe_connection when no tools are listed — it says what to ask for.
2. get_move_brief first; use only the move and record IDs it returns.
3. search_move_records before creating anything.
4. get_evidence_media for private photos — never a private page or storage URL.
5. save_complete_result to finish, with completeQueueItem to close the handoff.
6. Reuse operationId on a retry so it corrects instead of duplicating.
7. Stale tools after a deployment: disconnect, then reconnect.`;

export default function McpPage() {
  return (
    <PublicPageChrome
      eyebrow="Model Context Protocol"
      title="Connect an AI you choose to Assist With Moving tools."
      description="The canonical endpoint takes an OAuth sign-in and then obeys a product grant the person approves. Three other doors exist for compatibility, keys, and local use; their catalogs are not the same."
      primaryAction={{ href: "/ai/start", label: "Start AI setup" }}
      secondaryAction={{
        href: "/settings/ai",
        label: "AI connections",
      }}
      visual={<McpVisual />}
    >
      <PublicBand>
        <FeatureGrid cards={mcpCards} />
      </PublicBand>

      <PublicBand>
        <div className="grid gap-5 rounded-md border border-primary/25 bg-primary/5 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <Badge variant="secondary">Hosted connection</Badge>
            <h2 className="mt-3 text-xl font-semibold tracking-normal">
              Paste the MCP URL, sign in, then approve a grant.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              An OAuth-capable AI can connect without the person handling a raw
              secret. Settings manages the grant, revocation, and the API-key
              fallback for local or headless tools.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="touch">
              <Link href="/settings/ai">
                Open AI connections
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="touch">
              <Link href="/ai/start">Start setup</Link>
            </Button>
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <Badge variant="secondary">Remote server</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              Compatible clients connect by URL.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The requirement is remote Streamable HTTP MCP plus compatible
              OAuth; no local process and no repository clone. That is a
              capability requirement rather than a list of AI products, because
              no product has yet completed a full lifecycle here.
            </p>
          </div>
          <div className="min-w-0 rounded-md border border-border bg-card p-4">
            <SnippetBlock
              title="Canonical MCP endpoint"
              text={remoteEndpointUrl}
              buttonLabel="Copy endpoint"
            />
            <SnippetBlock
              title="OAuth-capable clients"
              text={remoteOAuthExample}
              buttonLabel="Copy OAuth setup"
            />
            <SnippetBlock
              title="Advanced: API-key door (headless / non-OAuth only)"
              text={remoteApiKeyFallbackExample}
              buttonLabel="Copy advanced"
            />
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              In a client that supports custom connectors, add Assist With
              Moving by pasting the endpoint URL. If the client cannot do OAuth,
              create a scoped helper key and supply it as the bearer token (or
              an <code>x-api-key</code> header) to the API-key door instead. Do
              not paste raw keys into OAuth-capable clients. Passing the key in
              the URL (<code>?key=...</code>) is no longer supported — URLs get
              logged, so a key that has ever been in one should be rotated.
            </p>
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="min-w-0">
            <Badge variant="secondary">Working the connection</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              First call, evidence, saving, and recovery.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The Queue loop is list_queue_work, claim_queue_work, then either
              ask_queue_question for the smallest Needs you question or
              release_queue_work to hand it back, and finally
              complete_queue_work. A Queue directive says what the person wants;
              it never widens the grant.
            </p>
          </div>
          <div className="min-w-0 rounded-md border border-border bg-card p-4">
            <p className="text-sm font-medium">Rules for the canonical door</p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
              {workflowRules}
            </pre>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Every write takes an operationId, and corrections carry
              expectedUpdatedAt or expectedVersion, so a retry corrects the
              earlier attempt instead of duplicating it. Archive is reversible
              and is the only destructive verb this connection ever gets: it
              cannot permanently delete, archive a whole move, publish, share,
              export, manage household access, or act outside Assist With
              Moving.
            </p>
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <Badge variant="secondary">Tool surfaces</Badge>
            <h2 className="text-2xl font-semibold tracking-normal">
              The canonical catalog is deliberately narrow.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              These are all the tools the canonical door can ever serve, and a
              connection is shown only the ones its grant covers. Sale, export,
              household admin, photo upload, and raw CRUD are not in it.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <section>
              <h3 className="text-sm font-semibold tracking-normal">
                Canonical grant-governed catalog
              </h3>
              <div className="mt-3 divide-y divide-border border-y border-border">
                {canonicalToolCatalog.map((group) => (
                  <div key={group.scope} className="py-3">
                    <p className="font-mono text-xs leading-5 text-foreground">
                      {group.scope}
                    </p>
                    <p className="mt-1 font-mono text-xs leading-5 text-muted-foreground">
                      {group.tools.join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="text-sm font-semibold tracking-normal">
                Remote API-key extended surface
              </h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                A separate catalog on a separate door, available when a user
                intentionally creates a broader API-key connection.
              </p>
              <div className="mt-3 divide-y divide-border border-y border-border">
                {apiKeyExtendedToolGroups.map((group) => (
                  <p
                    key={group}
                    className="py-3 font-mono text-xs leading-5 text-muted-foreground"
                  >
                    {group}
                  </p>
                ))}
              </div>
            </section>
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <Badge variant="secondary">Four doors</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              Named honestly, because they are not equivalent.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A tool that works on one door proves nothing about another. Check
              the live catalog of the door you actually connected to.
            </p>
          </div>
          <div className="grid gap-3">
            {doors.map((door) => (
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
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-md border border-border p-4">
            <Badge variant="outline">Partial</Badge>
            <h2 className="mt-3 text-base font-semibold">Bring your AI</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The endpoint, product scopes, grant boundary, Queue workflow, and
              immediate revocation are implemented. No AI product has completed
              a full connect, grant, read, evidence, save, revoke, and reconnect
              lifecycle against it, so the whole connection is Partial rather
              than Current.
            </p>
          </section>
          <section className="rounded-md border border-border p-4">
            <Badge variant="outline">Partial</Badge>
            <h2 className="mt-3 text-base font-semibold">
              Verified client identity
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The resource prefers, validates, and refuses Client ID Metadata
              Documents in code, but the provider-side configuration that
              enables that path is not yet done, so dynamic registration is
              still what clients meet in practice. The grant screen itself is
              Current: approve, review, and revoke in Settings.
            </p>
          </section>
          <section className="rounded-md border border-border p-4">
            <Badge>Current</Badge>
            <h2 className="mt-3 text-base font-semibold">Manual Queue handoff</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              With no connection at all, a person can copy a Queue item&apos;s
              bounded brief into any AI and paste the result back into the same
              item. The handoff completes without MCP, OAuth, or a key.
            </p>
          </section>
        </div>
      </PublicBand>
    </PublicPageChrome>
  );
}

function SnippetBlock({
  title,
  text,
  buttonLabel,
}: {
  title: string;
  text: string;
  buttonLabel: string;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <CopyTextButton
          text={text}
          label={buttonLabel}
          ariaLabel={`Copy ${title}`}
          className="min-h-11"
        />
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/35 p-3 font-mono text-xs leading-5 text-muted-foreground">
        {text}
      </pre>
    </div>
  );
}

function McpVisual() {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-xl shadow-black/25">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            MCP path
          </p>
          <p className="mt-1 text-lg font-semibold">Your AI calls tools</p>
        </div>
        <Badge>
          <Bot aria-hidden="true" />
          tools
        </Badge>
      </div>
      <div className="mt-4 space-y-3">
        {[
          ["1", "User signs in to Assist With Moving."],
          [
            "2",
            "Their AI connects to the canonical door, or a key-only door for headless tools.",
          ],
          [
            "3",
            "The user approves a grant; only the tools it covers are listed.",
          ],
          ["4", "Revoking the grant refuses the very next call."],
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
      <Link
        href="/api"
        className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-primary"
      >
        REST API fallback
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
