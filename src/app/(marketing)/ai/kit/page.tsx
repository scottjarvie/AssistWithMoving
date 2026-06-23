import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  Download,
  FileCode2,
  FileText,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

import { AgentKitCopyButton } from "@/components/agent-kit-copy-button";
import {
  PublicBand,
  PublicPageChrome,
} from "@/components/public-page-chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "MovingManifest Agent Kit",
  description:
    "Paste-ready MovingManifest instructions for Claude Code, Claude Desktop, ChatGPT, Codex, and other AI assistants.",
};

const artifacts = [
  {
    title: "CLAUDE.md block",
    href: "/agent-kit/CLAUDE.md",
    filename: "CLAUDE.md",
    copy: "Paste into a project CLAUDE.md or an assistant's custom instructions when the user wants move help.",
    icon: FileText,
  },
  {
    title: "Claude Code skill",
    href: "/agent-kit/movingmanifest-skill/SKILL.md",
    filename: "SKILL.md",
    copy: "Install at .claude/skills/movingmanifest/SKILL.md so Claude Code can trigger MovingManifest workflows automatically.",
    icon: FileCode2,
  },
  {
    title: "ChatGPT instructions",
    href: "/agent-kit/chatgpt-instructions.md",
    filename: "chatgpt-instructions.md",
    copy: "Use with a custom GPT and import https://movingmanifest.com/openapi.json as the Actions schema.",
    icon: Bot,
  },
];

const flow = [
  "Create or sign into MovingManifest.",
  "Use OAuth MCP for hosted assistants when available.",
  "Create a scoped helper key only for fallback clients.",
  "Copy one artifact into the assistant.",
  "Verify with get_api_context or GET /me.",
  "Work in batches, then verify the move summary.",
];

export default function AgentKitPage() {
  return (
    <PublicPageChrome
      eyebrow="Agent kit"
      title="Give an AI assistant the MovingManifest playbook."
      description="Download or copy paste-ready instructions for Claude Code, ChatGPT, Codex, and other assistants. The kit points agents to the live OpenAPI and MCP contracts so setup stays short."
      primaryAction={{ href: "/mcp", label: "Use OAuth MCP" }}
      secondaryAction={{ href: "/llms-full.txt", label: "Full AI guide" }}
      visual={<AgentKitVisual />}
    >
      <PublicBand>
        <div className="grid gap-3 lg:grid-cols-3">
          {artifacts.map((artifact) => (
            <div
              key={artifact.href}
              className="rounded-md border border-border bg-card p-4"
            >
              <artifact.icon
                className="mb-5 size-5 text-primary"
                aria-hidden="true"
              />
              <h2 className="text-lg font-semibold tracking-normal">
                {artifact.title}
              </h2>
              <p className="mt-2 min-h-20 text-sm leading-6 text-muted-foreground">
                {artifact.copy}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <AgentKitCopyButton href={artifact.href} />
                <Button asChild variant="outline" size="sm">
                  <a href={artifact.href} download={artifact.filename}>
                    <Download aria-hidden="true" />
                    Download
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <Badge variant="secondary">Short setup</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">
              OAuth first, keys only when needed.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              These files do not grant access by themselves. They teach the
              assistant the safe workflow. Hosted assistants that support OAuth
              MCP should connect by URL and ask the user to sign in. Local or
              older clients can still use a scoped key.
            </p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {flow.map((step, index) => (
              <li key={step} className="rounded-md border border-border p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {step}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </PublicBand>

      <PublicBand>
        <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">
              Live contracts stay the source of truth.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The kit intentionally stays compact. For complete route, tool,
              and field details, agents should read the public machine docs.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {[
              ["/openapi.json", "OpenAPI schema"],
              ["/llms.txt", "Short AI guide"],
              ["/llms-full.txt", "Full AI guide"],
              ["/mcp", "MCP setup"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3 text-sm hover:bg-muted/40"
              >
                {label}
                <ArrowRight className="size-4 text-primary" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      </PublicBand>
    </PublicPageChrome>
  );
}

function AgentKitVisual() {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-xl shadow-black/25">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Handoff
          </p>
          <p className="mt-1 text-lg font-semibold">Instructions plus OAuth</p>
        </div>
        <Badge>
          <ShieldCheck aria-hidden="true" />
          scoped
        </Badge>
      </div>
      <div className="mt-4 space-y-3">
        {[
          ["1", "Copy the artifact for the assistant surface."],
          ["2", "Use hosted MCP OAuth when the client supports it."],
          ["3", "Create a scoped key only for fallback clients."],
          ["4", "Agent verifies access before writes."],
          ["5", "Agent summarizes and verifies changed records."],
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
          <KeyRound className="size-4 text-primary" aria-hidden="true" />
          Secret rule
        </span>
        <p className="mt-2 text-muted-foreground">
          OAuth avoids raw keys in hosted/mobile flows. When a key is required,
          agents should treat it like a password and avoid repeating it back.
        </p>
      </div>
      <Link
        href="/ai/start"
        className="mt-4 inline-flex items-center gap-2 text-sm text-primary"
      >
        Human setup page
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
