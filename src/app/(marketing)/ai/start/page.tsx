import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  KeyRound,
  ShieldAlert,
} from "lucide-react";

import { AiStartActions } from "@/components/ai-start-actions";
import { PublicFooter, PublicHeader } from "@/components/public-page-chrome";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Start with an AI assistant",
  description:
    "A short setup path for people using MovingManifest with Claude, ChatGPT, Codex, or another AI assistant.",
};

const keyOptions = [
  "Hosted MCP OAuth",
  "Fallback helper key",
  "Move-restricted access",
  "Read-only fallback",
];

// OAuth (sign-in) connector URL. NOT /api/mcp — that is the API-key door and
// rejects OAuth sign-ins. See src/lib/mcp-oauth.ts.
const remoteMcpEndpoint = "https://movingmanifest.com/mcp/connect";

export default function AiStartPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <section className="border-y border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-16">
          <div>
            <Badge variant="secondary">AI-assisted setup</Badge>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
              Your assistant can help after you create one connection.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              MovingManifest saves the move. Your AI assistant can help fill it
              in. You only need to sign in and connect the assistant. Use hosted
              MCP OAuth when your assistant supports it; create a fallback key
              only for local or non-OAuth tools.
            </p>
            <div className="mt-7">
              <AiStartActions />
            </div>
          </div>

          <div className="rounded-md border border-border bg-card p-4 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  What you will do
                </p>
                <p className="mt-1 text-lg font-semibold">
                  Simple connection setup
                </p>
              </div>
              <Badge>
                <Bot aria-hidden="true" />
                AI ready
              </Badge>
            </div>
            <ol className="mt-4 space-y-3">
              {[
                "Create or sign into your account.",
                "Paste the MCP endpoint into an OAuth-capable assistant.",
                "Sign in and approve the connection.",
                "Use a fallback helper key only if OAuth is unavailable.",
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
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-8 sm:px-6 md:grid-cols-2 lg:px-8">
          <div className="rounded-md border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="size-4 text-primary" aria-hidden="true" />
              Connection choices you will see
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {keyOptions.map((option) => (
                <div
                  key={option}
                  className="flex items-center gap-2 rounded-md border border-border bg-background/65 p-3 text-sm"
                >
                  <CheckCircle2
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  {option}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bot className="size-4 text-primary" aria-hidden="true" />
              Hosted MCP endpoint
            </div>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/35 p-3 font-mono text-xs leading-5 text-muted-foreground">
              {remoteMcpEndpoint}
            </pre>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Paste this URL into hosted MCP clients that support browser
              sign-in. The hosted OAuth tool surface is intentionally narrower
              than the local/API-key surface and prefers workflow tools such as
              save_box_intake.
            </p>
          </div>
          <div className="rounded-md border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldAlert className="size-4 text-primary" aria-hidden="true" />
              Use the key carefully
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A fallback key can read and change your move data according to
              its scopes. Only paste it into an assistant you trust when hosted
              OAuth is not available. Do not put keys in public chats,
              screenshots, issues, or documents. You can revoke connections and
              keys later in Settings.
            </p>
            <Link
              href="/ai"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary"
            >
              Learn what the assistant can help with
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
