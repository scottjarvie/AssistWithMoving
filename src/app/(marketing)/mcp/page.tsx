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
  title: "MovingManifest MCP Setup",
  description:
    "MCP setup overview and the correct /api/mcp connector endpoint for AI assistants.",
};

const mcpCards = [
  {
    title: "Tool-based move work",
    copy: "MCP exposes structured tools for move setup, inventory intake, rooms, boxes, planning, photos, capture queues, and capacity checks. Local/API-key setups can use extended admin and export tools when the user intentionally grants them.",
    icon: Bot,
  },
  {
    title: "Hosted or local",
    copy: "Hosted assistants connect to https://movingmanifest.com/api/mcp and sign in with MovingManifest OAuth when the client supports it. Desktop agents can instead run the local server via npx movingmanifest-mcp with a scoped key.",
    icon: Laptop,
  },
  {
    title: "Setup page is not the endpoint",
    copy: "The human setup page is https://movingmanifest.com/mcp. The connector URL to paste into Claude or another hosted MCP client is https://movingmanifest.com/api/mcp.",
    icon: FileJson,
  },
  {
    title: "Capability discovery",
    copy: "Agents should call agent_workbench first, then get_api_context and get_agent_context before writing.",
    icon: FileJson,
  },
  {
    title: "Scoped credentials",
    copy: "OAuth connections and API keys are revocable. Use API keys for local/headless automation, and use separate keys for separate assistants when OAuth is not available.",
    icon: KeyRound,
  },
  {
    title: "Batch over chatty loops",
    copy: "The MCP tool list favors workflow operations such as setup_move, save_box_intake, batch_upsert_movable_units, and batch_upsert_items so agents use fewer tokens and make fewer mistakes.",
    icon: Cable,
  },
  {
    title: "Human permission remains clear",
    copy: "The public docs tell assistants not to invent access. Private move data requires the user to sign in with OAuth or intentionally create a scoped helper key.",
    icon: ShieldCheck,
  },
];

const oauthTrustedToolGroups = [
  "Start here: agent_workbench, get_api_capabilities, get_api_context",
  "Move context: list_moves, setup_move, get_move_summary, get_agent_context, get_move_questions, get_move_day_checklist",
  "Inventory workflows: search_inventory, create_item_with_images, add_item_from_photo, save_box_intake, batch_upsert_movable_units, batch_upsert_items, append_item_note",
  "Capture queue: ingestion_queue for claim, media, and submitResults work; honor intent, targetBoxCode, targetBoxId, targetItemId, and targetLabel",
  "Photos and evidence: upload_photo, upload_photos, get_photo_display_url",
  "Boxes and assignments: save_box_intake, suggest_assignments, apply_assignments",
  "Spaces: list_move_spaces, create_move_space",
  "Capacity checks: get_capacity_report",
];

const localApiKeyExtendedToolGroups = [
  "Move creation and admin setup: create_move",
  "Detailed item/box primitives: create_item, update_item, create_box, add_box_item_from_photo, batch_add_box_contents, add_items_to_box, attach_photo",
  "Transport management: list_transport_resources, manage_transport_resource, manage_transport_zone",
  "Household collaborators: list_household_members, add_household_member",
  "Exports and sharing: manage_exports, manage_share_link",
  "Destructive cleanup: delete_item, remove_item_from_box",
  "Sale workflow: upsert_sale_listing",
  "Floor-plan ops: plan_get, plan_apply_ops, plan_propose_ops, plan_snapshot",
  "Raw upload sessions: start_photo_upload, finalize_photo_upload",
];

const remoteEndpointUrl = "https://movingmanifest.com/api/mcp";
const trustedHelperLaunchPosture =
  "MOVINGMANIFEST_MCP_OAUTH_TOOLSET=trusted-helper";

const remoteOAuthExample = `Paste this MCP URL into an OAuth-capable hosted client:
https://movingmanifest.com/api/mcp

Do not paste https://movingmanifest.com/mcp as the connector URL.
That page is the human setup guide.

The client discovers Clerk auth from:
/.well-known/oauth-protected-resource/api/mcp`;

const remoteApiKeyFallbackExample = `POST https://movingmanifest.com/api/mcp
Authorization: Bearer mmk_replace_with_a_scoped_api_key`;

const codexCliCommand = `codex mcp add movingmanifest \\
  --env MOVINGMANIFEST_API_KEY=mmk_replace_with_a_scoped_api_key \\
  -- npx -y movingmanifest-mcp`;

const codexTomlConfig = `[mcp_servers.movingmanifest]
command = "npx"
args = ["-y", "movingmanifest-mcp"]

[mcp_servers.movingmanifest.env]
MOVINGMANIFEST_API_KEY = "mmk_replace_with_a_scoped_api_key"`;

const desktopJsonConfig = `{
  "mcpServers": {
    "movingmanifest": {
      "command": "npx",
      "args": ["-y", "movingmanifest-mcp"],
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
      title="Use /api/mcp as the connector URL."
      description="This /mcp page is the human setup guide. For AI apps that support remote MCP, paste https://movingmanifest.com/api/mcp as the connector endpoint. MovingManifest also provides a local MCP server for desktop agents."
      primaryAction={{ href: "/ai/kit", label: "Download agent kit" }}
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
              handling a raw secret. Settings → AI Connections still manages
              revocation and API-key fallback for local or headless tools.
              If a connector shows this page as HTML, or tools never appear,
              the setup page was probably used instead of the endpoint.
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
              <Link href="/ai/kit">Agent kit</Link>
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
              the remote endpoint. OAuth-capable clients will open MovingManifest
              sign-in and consent instead of asking the user to paste a key.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <SnippetBlock
              title="Remote MCP endpoint"
              text={remoteEndpointUrl}
              buttonLabel="Copy endpoint"
            />
            <SnippetBlock
              title="OAuth-capable hosted clients"
              text={remoteOAuthExample}
              buttonLabel="Copy OAuth setup"
            />
            <SnippetBlock
              title="API-key fallback"
              text={remoteApiKeyFallbackExample}
              buttonLabel="Copy fallback"
            />
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              In claude.ai or Claude Cowork: Settings → Connectors → Add custom
              connector and paste the endpoint URL, not this /mcp setup page.
              Claude may ask the user to approve each tool individually; for a
              smoother trusted-helper workflow, the user can open connector
              permissions and choose Allow all only if they trust the
              MovingManifest connector and account. If the client does not
              support OAuth, create a scoped helper key and supply it as the
              bearer token. Do not paste raw keys into OAuth-capable hosted
              clients. Clients that cannot set headers may append ?key=mmk_...
              to the URL for temporary fallback, but header auth is safer
              because URLs can be logged.
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
              Desktop and CLI agents (Claude Desktop, Claude Code, Codex) can
              run the server locally with npx — no repo clone needed. The local
              server can use the broader API-key tool surface. Hosted OAuth is
              narrower for the first launch so a mobile or hosted assistant gets
              trusted move-helper powers without also receiving admin, export,
              or destructive cleanup tools.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <SnippetBlock
              title="Codex CLI/App setup"
              text={codexCliCommand}
              buttonLabel="Copy Codex command"
            />
            <SnippetBlock
              title="Or edit Codex config.toml"
              text={codexTomlConfig}
              buttonLabel="Copy TOML"
            />
            <details className="mt-4 rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                JSON config used by Claude Desktop and similar MCP clients
              </summary>
              <div className="mt-3">
                <SnippetBlock
                  title="Desktop MCP JSON"
                  text={desktopJsonConfig}
                  buttonLabel="Copy JSON"
                />
              </div>
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
              The first hosted/mobile OAuth launch should expose the
              trusted-helper surface: enough for move setup, item intake, queue
              processing, photos, boxes, transport, and review, without also
              granting admin, export, share-link, or destructive cleanup tools.
            </p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Launch posture for production:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {trustedHelperLaunchPosture}
              </code>
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <section>
              <h3 className="text-sm font-semibold tracking-normal">
                OAuth trusted-helper surface
              </h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Expected for hosted OAuth clients after publish.
              </p>
              <div className="mt-3 divide-y divide-border border-y border-border">
                {oauthTrustedToolGroups.map((group) => (
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
                Available only when a user intentionally grants a broader local
                or API-key connection.
              </p>
              <div className="mt-3 divide-y divide-border border-y border-border">
                {localApiKeyExtendedToolGroups.map((group) => (
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
          ["2", "Assistant connects via the hosted MCP URL or a local npx server."],
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
