"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Info,
  Sparkles,
  X,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// The "connect your own AI agent" educational push. This is the star pitch for
// the queue: a BYO agent (the user's own Claude/Codex/Cursor over MCP/REST)
// claims queued captures, classifies items, researches values, and asks
// questions back — nothing becomes inventory without the user's approval.
//
// Detection mirrors the API key manager: households.summaryStats.activeApiKeyCount
// is the single source of truth for "an agent is connected". When it is > 0 the
// banner collapses to a thin "Agent connected" badge. When it is 0 we show the
// full teaching card, which the user can also dismiss for the session.
const MCP_CONNECTOR_URL = "https://movingmanifest.com/api/mcp";

type SummaryStats = {
  activeApiKeyCount: number;
};

const agentValueProps = [
  {
    title: "No waiting in the app",
    body: "Drop photos and a quick note into the queue. Your agent processes them in the background while you keep walking the house.",
  },
  {
    title: "Classify + research for you",
    body: "It reads your captures, proposes items with rooms and dispositions, and looks up replacement values so you do not have to.",
  },
  {
    title: "Bulk image capture",
    body: "Add a dozen photos at once — one queued capture per photo — and let the agent turn each into a reviewed inventory item.",
  },
] as const;

export function ConnectAgentOnboarding({
  householdId,
  className,
}: {
  householdId: Id<"households"> | null;
  className?: string;
}) {
  const stats = useQuery(
    api.households.summaryStats,
    householdId ? { householdId } : "skip",
  ) as SummaryStats | undefined;
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // While stats are loading, render nothing rather than flashing the wrong
  // state — the queue list below carries its own skeleton.
  if (stats === undefined) {
    return null;
  }

  const connected = stats.activeApiKeyCount > 0;

  // Connected: collapse to a single-line confirmation badge.
  if (connected) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm",
          className,
        )}
      >
        <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
        <span className="font-medium">Agent connected</span>
        <span className="text-muted-foreground">
          {stats.activeApiKeyCount === 1
            ? "1 AI assistant is connected and can work this queue."
            : `${stats.activeApiKeyCount} AI assistants are connected and can work this queue.`}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="text-muted-foreground"
              aria-label="What is a connection?"
            >
              <Info className="size-3.5" aria-hidden="true" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            A &ldquo;connection&rdquo; is an API key you created so your own AI
            assistant (Claude, Codex, Cursor, …) can work this move&rsquo;s
            queue. You can keep up to 3 active at once — manage or revoke them in
            Settings.
          </TooltipContent>
        </Tooltip>
        <Button asChild size="sm" variant="ghost" className="ml-auto">
          <Link href="/settings/ai-connections">Manage</Link>
        </Button>
      </div>
    );
  }

  // Dismissed for the session: leave a thin re-open affordance so the pitch is
  // never permanently lost before the user actually connects.
  if (dismissed) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground",
          className,
        )}
      >
        <Bot className="size-4 text-primary" aria-hidden="true" />
        <span>Connect your AI agent to work this queue automatically.</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => setDismissed(false)}
        >
          Show how
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-label="Connect your AI agent"
      className={cn(
        "rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
              Connect your own AI agent
              <Badge variant="secondary">Recommended</Badge>
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              MovingManifest does not run its own AI. Instead you point your own
              assistant — Claude, Codex, Cursor, or any MCP/REST client — at this
              move. It claims captures from the queue below, turns them into
              proposed inventory, and asks you questions when it is unsure.
            </p>
          </div>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Dismiss for now"
          onClick={() => setDismissed(true)}
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      {/* Desktop: always show the three value props. Mobile: tuck them behind a
          "What's this?" expander so the banner never dominates the first screen. */}
      <div className="mt-4 hidden gap-3 sm:grid sm:grid-cols-3">
        {agentValueProps.map((prop) => (
          <div
            key={prop.title}
            className="rounded-md border border-border bg-background p-3"
          >
            <p className="text-sm font-medium">{prop.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {prop.body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 sm:hidden">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex items-center gap-1 text-sm font-medium text-primary"
        >
          What does connecting do?
          <ChevronDown
            className={cn("size-4 transition", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
        {expanded ? (
          <div className="mt-2 grid gap-2">
            {agentValueProps.map((prop) => (
              <div
                key={prop.title}
                className="rounded-md border border-border bg-background p-3"
              >
                <p className="text-sm font-medium">{prop.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {prop.body}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href="/settings/ai-connections">
            <Bot aria-hidden="true" />
            Connect your AI agent
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/ai">How it works</Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          MCP connector:{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono">
            {MCP_CONNECTOR_URL}
          </code>
        </span>
      </div>
    </section>
  );
}
