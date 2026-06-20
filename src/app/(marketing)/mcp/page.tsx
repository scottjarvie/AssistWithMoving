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
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "MovingManifest MCP",
  description:
    "MCP setup overview for AI assistants that can connect to MovingManifest tools.",
};

const mcpCards = [
  {
    title: "Tool-based move work",
    copy: "MCP exposes structured tools for move setup, inventory intake, rooms, boxes, planning, photos, sale listings, exports, and share links. save_box_intake captures one packed box with dimensions, weight, photos, described contents, and existing item IDs in one call.",
    icon: Bot,
  },
  {
    title: "Hosted or local",
    copy: "Hosted assistants (claude.ai, Claude Cowork) connect to the remote endpoint at https://movingmanifest.com/api/mcp with an API key. Desktop agents can instead run the local server via npx movingmanifest-mcp. Both expose the same tools.",
    icon: Laptop,
  },
  {
    title: "Capability discovery",
    copy: "Agents should call get_api_capabilities first, then get_api_context and get_agent_context before writing.",
    icon: FileJson,
  },
  {
    title: "Scoped credentials",
    copy: "Use separate keys for separate assistants. With members/manage, assistants can add existing members or create pending email invitations.",
    icon: KeyRound,
  },
  {
    title: "Batch over chatty loops",
    copy: "The MCP tool list favors coarse operations such as setup_move, save_box_intake, and batch_upsert_items so agents use fewer tokens and make fewer mistakes.",
    icon: Cable,
  },
  {
    title: "Human permission remains clear",
    copy: "The public docs tell assistants not to invent access. Private move data requires the user to sign in and share a key intentionally.",
    icon: ShieldCheck,
  },
];

const toolGroups = [
  "get_api_capabilities and get_api_context",
  "list_moves, create_move, setup_move",
  "list_household_members and add_household_member, including pending invitations",
  "get_agent_context and get_move_questions",
  "search_inventory, create_item, add_item_from_photo, batch_upsert_items, update_item",
  "list_move_spaces and create_move_space",
  "create_item_with_images, upload_image, upload_images, upload_photo, upload_photos, upload_evidence_image, upload_evidence_images, upload_evidence_file, start_photo_upload, finalize_photo_upload, attach_photo",
  "upsert_sale_listing",
  "plan_get, plan_apply_ops, plan_propose_ops, plan_snapshot",
  "save_box_intake, create_box, add_items_to_box, suggest_assignments, apply_assignments",
  "create_export, list_exports, download_export",
];

const remoteEndpointUrl = "https://movingmanifest.com/api/mcp";

const remoteCurlExample = `POST https://movingmanifest.com/api/mcp
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
      title="Connect capable assistants to MovingManifest tools."
      description="For AI apps that support MCP, MovingManifest provides a local MCP server that wraps the REST API with move-aware tools. The user still controls account creation, key creation, and revocation."
      visual={<McpVisual />}
    >
      <PublicBand>
        <FeatureGrid cards={mcpCards} />
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
              the remote endpoint and a scoped API key — no install required.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium">Remote MCP endpoint</p>
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
              {remoteEndpointUrl}
            </pre>
            <p className="mt-4 text-sm font-medium">
              Authentication (Streamable HTTP)
            </p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
              {remoteCurlExample}
            </pre>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              In claude.ai or Claude Cowork: Settings → Connectors → Add custom
              connector, paste the endpoint URL, and supply the API key as the
              bearer token. Clients that cannot set headers may append
              ?key=mmk_... to the URL, but header auth is recommended. Create
              and revoke keys at Settings → AI Connections in MovingManifest.
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
              and remote servers expose identical tools, so configs are
              interchangeable. Household collaborators can be invited by email
              before they create an account, then access activates when they
              sign in with that email.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium">
              Codex CLI/App setup
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
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
            <h2 className="text-2xl font-semibold tracking-normal">
              Tool categories.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The detailed local tool list is in the repo docs and in
              get_api_capabilities. Public discovery files point assistants here
              first so they choose the right tool group.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {toolGroups.map((group) => (
              <div
                key={group}
                className="rounded-md border border-border p-3 font-mono text-xs"
              >
                {group}
              </div>
            ))}
          </div>
        </div>
      </PublicBand>
    </PublicPageChrome>
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
          ["1", "User creates a MovingManifest account and key."],
          ["2", "Assistant connects via the hosted MCP URL or a local npx server."],
          ["3", "Assistant calls structured tools, including pending household invites."],
          ["4", "User can revoke the key when finished."],
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
