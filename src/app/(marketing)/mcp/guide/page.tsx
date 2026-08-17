import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  Cable,
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
    "MCP setup overview for AI assistants that can connect to Assist With Moving tools.",
};

const mcpCards = [
  {
    title: "Tool-based move work",
    copy: "The canonical OAuth MCP exposes eight structured tools for a move brief, bounded search and evidence reads, durable context and inventory, planning records, and complete-result saves.",
    icon: Bot,
  },
  {
    title: "MCP first, API only if you must",
    copy: "Recommended: connect to https://movingmanifest.com/mcp and sign in with your Assist With Moving account — no key to copy, works with your subscription. Advanced only: headless or non-OAuth agents connect directly to https://movingmanifest.com/api/mcp with a scoped API key.",
    icon: Laptop,
  },
  {
    title: "Capability discovery",
    copy: "Canonical OAuth agents call get_move_brief first. API-key agents use get_api_capabilities because that separate automation catalog is larger.",
    icon: FileJson,
  },
  {
    title: "Scoped credentials",
    copy: "OAuth connections and API keys are revocable. Use API keys for headless or non-OAuth automation, and use separate keys for separate assistants when OAuth is not available.",
    icon: KeyRound,
  },
  {
    title: "Batch over chatty loops",
    copy: "save_complete_result keeps a finished plan, its inventory, locations, decisions, estimates, and source checks together in one replay-safe operation.",
    icon: Cable,
  },
  {
    title: "Human permission remains clear",
    copy: "The public docs tell assistants not to invent access. Private move data requires the user to sign in with OAuth or intentionally create a scoped helper key.",
    icon: ShieldCheck,
  },
];

const trustedHelperToolGroups = [
  "Start here: get_move_brief",
  "Find and read: search_move_records, get_move_records",
  "Private evidence: get_evidence_media",
  "Move and rooms: save_move_context",
  "Inventory: save_inventory",
  "Corrections: save_planning_record",
  "Finished work: save_complete_result",
];

const apiKeyExtendedToolGroups = [
  "Move creation and setup for headless automations",
  "Detailed item and box primitives for advanced partial workflows",
  "Sale-prep workflows when the user grants that scope intentionally",
  "Export and share workflows when the user grants documentation access",
  "Household collaborator management for admin-approved local helpers",
  "Layout Studio operations for plan review and editing",
  "Raw upload sessions for clients that cannot use workflow photo tools",
];

// THE canonical stateless front door (OAuth sign-in). /mcp/connect preserves
// the older persisted OAuth catalog; /api/mcp is the separate API-key catalog.
const remoteEndpointUrl = "https://movingmanifest.com/mcp";

const remoteOAuthExample = `Paste this MCP URL into an OAuth-capable hosted client (recommended):
https://movingmanifest.com/mcp

Then sign in with your Assist With Moving account — no key needed.
The client discovers Clerk auth from:
/.well-known/oauth-protected-resource/mcp`;

const remoteApiKeyFallbackExample = `Advanced — headless / non-OAuth clients ONLY.
This door is key-only and rejects OAuth sign-in; do not use it for hosted clients.
POST https://movingmanifest.com/api/mcp
Authorization: Bearer mmk_replace_with_a_scoped_api_key`;

const codexOAuthCommand = `codex mcp add assistwithmoving --url https://movingmanifest.com/mcp
codex mcp login assistwithmoving`;

const codexApiKeyCommand = `export ASSISTWITHMOVING_API_KEY=mmk_replace_with_a_scoped_api_key
codex mcp add assistwithmoving \\
  --url https://movingmanifest.com/api/mcp \\
  --bearer-token-env-var ASSISTWITHMOVING_API_KEY`;

const codexTomlConfig = `[mcp_servers.assistwithmoving]
url = "https://movingmanifest.com/api/mcp"
bearer_token_env_var = "ASSISTWITHMOVING_API_KEY"`;

export default function McpPage() {
  return (
    <PublicPageChrome
      eyebrow="Model Context Protocol"
      title="Connect capable assistants to Assist With Moving tools."
      description="For AI apps that support MCP, Assist With Moving provides a hosted OAuth endpoint plus an advanced remote API-key endpoint. The user still controls sign-in, connection access, fallback keys, and revocation."
      primaryAction={{ href: "/ai/start", label: "Start AI setup" }}
      secondaryAction={{
        href: "/settings/ai-connections",
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
              Paste the MCP URL, then sign in.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              OAuth-capable hosted assistants can connect without the user
              handling a raw secret. Settings manages revocation and API-key
              fallback for local or headless tools.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="touch">
              <Link href="/settings/ai-connections">
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
              Hosted assistants connect by URL.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              claude.ai, Claude Cowork, and other hosted MCP clients cannot run
              a local process. Add Assist With Moving as a custom connector using
              the remote endpoint. OAuth-capable clients open Assist With Moving
              sign-in and consent instead of asking the user to paste a key.
            </p>
          </div>
          <div className="min-w-0 rounded-md border border-border bg-card p-4">
            <SnippetBlock
              title="MCP endpoint (recommended)"
              text={remoteEndpointUrl}
              buttonLabel="Copy endpoint"
            />
            <SnippetBlock
              title="OAuth-capable hosted clients"
              text={remoteOAuthExample}
              buttonLabel="Copy OAuth setup"
            />
            <SnippetBlock
              title="Advanced: API-key door (headless / non-OAuth only)"
              text={remoteApiKeyFallbackExample}
              buttonLabel="Copy advanced"
            />
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              In claude.ai or Claude Cowork: Settings → Connectors → Add custom
              connector and paste the endpoint URL. If the client does not
              support OAuth, create a scoped helper key and supply it as the
              bearer token (or an <code>x-api-key</code> header). Do not paste
              raw keys into OAuth-capable hosted clients. Passing the key in the
              URL (<code>?key=...</code>) is no longer supported — URLs get
              logged, so a key that has ever been in one should be rotated.
            </p>
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
          <div className="min-w-0">
            <Badge variant="secondary">CLI and headless clients</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              Use remote MCP; no clone required.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              OAuth-capable CLI and desktop agents should use the same hosted
              endpoint as other clients. When OAuth is unavailable, connect
              directly to the remote API-key door and read the key from an
              environment variable. The API-key surface can expose broader tools
              when the user grants those scopes intentionally.
            </p>
          </div>
          <div className="min-w-0 rounded-md border border-border bg-card p-4">
            <p className="text-sm font-medium">
              Codex OAuth setup (recommended)
            </p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
              {codexOAuthCommand}
            </pre>
            <p className="mt-4 text-sm font-medium">
              Codex API-key setup (advanced)
            </p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
              {codexApiKeyCommand}
            </pre>
            <p className="mt-4 text-sm font-medium">
              Equivalent advanced Codex config.toml
            </p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
              {codexTomlConfig}
            </pre>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Keep the key in your shell or secret manager, not in the
              checked-in config. Restart Codex after adding the server. In a new
              Codex thread, check MCP tools for assistwithmoving, then call
              get_move_brief. API-key connections start with
              get_api_capabilities instead.
            </p>
          </div>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <Badge variant="secondary">Tool surfaces</Badge>
            <h2 className="text-2xl font-semibold tracking-normal">
              Hosted OAuth is deliberately narrower.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The hosted OAuth launch surface is a trusted-helper set: enough
              to orient to the move, read relevant records and private evidence,
              save inventory, and preserve finished decisions, estimates,
              plans, and source checks without publicly advertising sale,
              export, household admin, Queue transitions, or raw CRUD.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <section>
              <h3 className="text-sm font-semibold tracking-normal">
                Hosted OAuth trusted-helper surface
              </h3>
              <div className="mt-3 divide-y divide-border border-y border-border">
                {trustedHelperToolGroups.map((group) => (
                  <p
                    key={group}
                    className="py-3 font-mono text-xs leading-5 text-muted-foreground"
                  >
                    {group}
                  </p>
                ))}
              </div>
            </section>
            <section>
              <h3 className="text-sm font-semibold tracking-normal">
                Remote API-key extended surface
              </h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Available when a user intentionally grants a broader API-key
                connection.
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
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-md border border-border p-4">
            <Badge variant="secondary">Current</Badge>
            <h2 className="mt-3 text-base font-semibold">Durable move work</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The canonical connection can brief, search, read private evidence,
              save move context and inventory, and keep complete planning results
              visible in the move workspace.
            </p>
          </section>
          <section className="rounded-md border border-border p-4">
            <Badge variant="outline">Partial</Badge>
            <h2 className="mt-3 text-base font-semibold">Client compatibility</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              OAuth and stateless protocol behavior are implemented. Individual
              hosted clients may still need their own consent, refresh, media,
              and reconnect proof.
            </p>
          </section>
          <section className="rounded-md border border-border p-4">
            <Badge variant="outline">Later</Badge>
            <h2 className="mt-3 text-base font-semibold">OAuth Queue actions</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The canonical OAuth connection can read Queue summaries but cannot
              claim or complete Queue work until a distinct chosen-AI grant is
              proven. Scoped API-key automation remains separate.
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
          <p className="mt-1 text-lg font-semibold">Assistant calls tools</p>
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
            "Assistant connects via hosted OAuth or the remote API-key door.",
          ],
          [
            "3",
            "OAuth clients ask for consent; non-OAuth clients use a scoped key.",
          ],
          ["4", "User can revoke the connection or key when finished."],
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
