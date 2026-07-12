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
  title: "MovingManifest MCP",
  description:
    "MCP setup overview for AI assistants that can connect to MovingManifest tools.",
};

const mcpCards = [
  {
    title: "Tool-based move work",
    copy: "MCP exposes structured tools for move setup, inventory intake, rooms, boxes, planning, photos, and capacity checks. Hosted OAuth defaults to a trusted-helper surface for normal move help.",
    icon: Bot,
  },
  {
    title: "MCP first, API only if you must",
    copy: "Recommended: hosted assistants connect to https://movingmanifest.com/mcp and sign in with your MovingManifest account — no key to copy, works with your subscription. Advanced only: local/headless or non-OAuth agents use a scoped API key, either at https://movingmanifest.com/api/mcp (key-only, NOT for OAuth sign-in) or the local MCP server run from a clone of the repo.",
    icon: Laptop,
  },
  {
    title: "Capability discovery",
    copy: "Agents should call get_api_capabilities first, then get_api_context and get_agent_context before writing.",
    icon: FileJson,
  },
  {
    title: "Scoped credentials",
    copy: "OAuth connections and API keys are revocable. Use API keys for local/headless automation, and use separate keys for separate assistants when OAuth is not available.",
    icon: KeyRound,
  },
  {
    title: "Batch over chatty loops",
    copy: "The MCP tool list favors workflow operations such as setup_move, save_box_intake, batch_upsert_items, and apply_assignments so agents use fewer tokens and make fewer mistakes.",
    icon: Cable,
  },
  {
    title: "Human permission remains clear",
    copy: "The public docs tell assistants not to invent access. Private move data requires the user to sign in with OAuth or intentionally create a scoped helper key.",
    icon: ShieldCheck,
  },
];

const trustedHelperToolGroups = [
  "Start here: get_api_capabilities, get_api_context",
  "Move context: list_moves, setup_move, get_move_summary, get_agent_context, get_move_questions, get_move_day_checklist",
  "Inventory workflows: search_inventory, save_box_intake, add_item_from_photo, batch_upsert_items",
  "Box workflow: save_box_intake for one box, dimensions, weight, photos, described contents, and linked existing items",
  "Photos and evidence: upload_photo, upload_photos, upload_evidence_image, upload_evidence_images",
  "Spaces and planning: list_move_spaces, create_move_space, suggest_assignments, apply_assignments",
  "Move-day and planning helpers: list_planned_items, create_planned_item, update_planned_item",
];

const localExtendedToolGroups = [
  "Move creation and local setup for headless automations",
  "Detailed item and box primitives for advanced partial workflows",
  "Sale-prep workflows when the user grants that scope intentionally",
  "Export and share workflows when the user grants documentation access",
  "Household collaborator management for admin-approved local helpers",
  "Layout Studio operations for plan review and editing",
  "Raw upload sessions for clients that cannot use workflow photo tools",
];

// THE front door (OAuth sign-in): https://movingmanifest.com/mcp. /mcp/connect
// is a still-working alias. The API-key door is /api/mcp — a DIFFERENT, advanced
// endpoint for local/non-OAuth clients only (see src/lib/mcp-oauth.ts).
const remoteEndpointUrl = "https://movingmanifest.com/mcp";

const remoteOAuthExample = `Paste this MCP URL into an OAuth-capable hosted client (recommended):
https://movingmanifest.com/mcp

Then sign in with your MovingManifest account — no key needed.
The client discovers Clerk auth from:
/.well-known/oauth-protected-resource/mcp`;

const remoteApiKeyFallbackExample = `Advanced — local / headless / non-OAuth clients ONLY.
This door is key-only and rejects OAuth sign-in; do not use it for hosted clients.
POST https://movingmanifest.com/api/mcp
Authorization: Bearer mmk_replace_with_a_scoped_api_key`;

const localInstallCommand = `git clone https://github.com/scottjarvie/movingmanifest
cd movingmanifest/mcp-server
npm install`;

const codexCliCommand = `codex mcp add movingmanifest \\
  --env MOVINGMANIFEST_API_KEY=mmk_replace_with_a_scoped_api_key \\
  -- node /absolute/path/to/movingmanifest/mcp-server/movingmanifest-mcp.mjs`;

const codexTomlConfig = `[mcp_servers.movingmanifest]
command = "node"
args = ["/absolute/path/to/movingmanifest/mcp-server/movingmanifest-mcp.mjs"]

[mcp_servers.movingmanifest.env]
MOVINGMANIFEST_API_KEY = "mmk_replace_with_a_scoped_api_key"`;

const desktopJsonConfig = `{
  "mcpServers": {
    "movingmanifest": {
      "command": "node",
      "args": [
        "/absolute/path/to/movingmanifest/mcp-server/movingmanifest-mcp.mjs"
      ],
      "env": {
        "MOVINGMANIFEST_API_KEY": "mmk_replace_with_a_scoped_api_key"
      }
    }
  }
}`;

export default function McpPage() {
  return (
    <PublicPageChrome
      eyebrow="Model Context Protocol"
      title="Connect capable assistants to MovingManifest tools."
      description="For AI apps that support MCP, MovingManifest provides a hosted OAuth MCP endpoint and a local MCP server that wrap the REST API with move-aware tools. The user still controls sign-in, connection access, API-key fallback, and revocation."
      primaryAction={{ href: "/ai/start", label: "Start AI setup" }}
      secondaryAction={{ href: "/settings/ai-connections", label: "AI connections" }}
      visual={<McpVisual />}
    >
      <PublicBand>
        <FeatureGrid cards={mcpCards} />
      </PublicBand>

      <PublicBand>
        <div className="grid gap-5 rounded-md border border-primary/25 bg-primary/5 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
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
            <Button asChild>
              <Link href="/settings/ai-connections">
                Open AI connections
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
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
              a local process. Add MovingManifest as a custom connector using
              the remote endpoint. OAuth-capable clients open MovingManifest
              sign-in and consent instead of asking the user to paste a key.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
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
              title="Advanced: API-key door (local / non-OAuth only)"
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
          <div>
            <Badge variant="secondary">Local server</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              What an assistant should know.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Desktop and CLI agents (Claude Desktop, Claude Code, Codex) run
              the server locally from a clone of the open-source repo — clone,
              npm install once, then point the client at the server script. (An
              npm package install is planned for a future launch.) The local
              server can use the broader API-key tool surface. Hosted OAuth is
              narrower by default so a mobile or hosted assistant gets trusted
              move-helper powers without also receiving export, sale, household
              admin, or lower-level workflow primitives.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium">
              One-time install (clone the repo)
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
              {localInstallCommand}
            </pre>
            <p className="mt-4 text-sm font-medium">
              Codex CLI/App setup (use your absolute clone path)
            </p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
              {codexCliCommand}
            </pre>
            <p className="mt-4 text-sm font-medium">
              Or edit Codex config.toml
            </p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
              {codexTomlConfig}
            </pre>
            <details className="mt-4 rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                JSON config used by Claude Desktop and similar MCP clients
              </summary>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
                {desktopJsonConfig}
              </pre>
            </details>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Restart Codex after adding the server. In a new Codex thread,
              check MCP tools for movingmanifest, then call get_api_context.
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
              for move setup, item intake, photos, boxes, transport planning,
              and review, without publicly advertising sale, export, household
              admin, or low-level box primitives as hosted-default tools.
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
                Local/API-key extended surface
              </h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Available when a user intentionally grants a broader local or
                API-key connection.
              </p>
              <div className="mt-3 divide-y divide-border border-y border-border">
                {localExtendedToolGroups.map((group) => (
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
          ["1", "User signs in to MovingManifest."],
          ["2", "Assistant connects via the hosted MCP URL or a locally cloned server."],
          ["3", "Hosted OAuth clients ask for consent; local clients use a scoped key."],
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
        className="mt-4 inline-flex items-center gap-2 text-sm text-primary"
      >
        REST API fallback
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
