"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { KeyRound, PlugZap, RefreshCw } from "lucide-react";

import { ApiKeyManager } from "@/components/api-key-manager";
import { CopyTextButton } from "@/components/copy-text-button";
import { Button } from "@/components/ui/button";

export function AiConnectionSetup() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
        Checking your signed-in session.
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="rounded-md border border-border p-4">
        <p className="text-sm text-muted-foreground">
          Sign in first, then this page will open the AI connection setup.
        </p>
        <Button asChild className="mt-3">
          <Link href="/sign-in?redirect_url=/settings/ai-connections">
            Sign in and connect AI
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-primary/30 bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <PlugZap className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Recommended · hosted MCP OAuth
            </p>
            <h3 className="mt-1 text-lg font-semibold">Connect without copying a key</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              In Claude, ChatGPT, Codex, or another OAuth-capable MCP client,
              add the endpoint below. Your AI will open Assist With Moving
              sign-in and ask you to approve access.
            </p>
            <div className="mt-4 flex flex-col gap-2 rounded-md border border-border bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between">
              <code className="min-w-0 break-all text-xs sm:text-sm">
                https://movingmanifest.com/mcp
              </code>
              <CopyTextButton
                text="https://movingmanifest.com/mcp"
                label="Copy endpoint"
                ariaLabel="Copy hosted MCP endpoint"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/mcp/guide">Open connection steps</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/ai">See the current AI workflow</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <details className="rounded-lg border border-border bg-card p-5">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
          <KeyRound className="size-4 text-primary" aria-hidden="true" />
          Fallback API key for local or non-OAuth tools
        </summary>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Create a scoped key only when your trusted AI client cannot use hosted
          OAuth or needs the separate API-key tool catalog.
        </p>
        <div className="mt-4">
          <ApiKeyManager enabled={isLoaded && isSignedIn} mode="setup" />
        </div>
      </details>
    </div>
  );
}
