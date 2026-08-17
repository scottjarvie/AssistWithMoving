import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  KeyRound,
  ShieldAlert,
} from "lucide-react";

import { AiStartActions } from "@/components/ai-start-actions";
import { PublicFooter, PublicHeader } from "@/components/public-page-chrome";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Set up your chosen AI",
  description:
    "A short setup path for using Assist With Moving with an AI you choose: sign in, approve a grant, and know exactly what it covers.",
};

const grantChoices = [
  "Read the move context you choose",
  "Open the private photos and files for that work",
  "Save the work you asked for",
  "Work the Queue handoffs you hand over",
  "Retire records that turned out to be wrong",
];

// OAuth (sign-in) connector URL — the bare /mcp front door. NOT /api/mcp, which
// is the API-key door and rejects OAuth sign-ins. See src/lib/mcp-oauth.ts.
const remoteMcpEndpoint = "https://movingmanifest.com/mcp";

export default function AiStartPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <section className="border-y border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-16">
          <div>
            <Badge variant="secondary">AI-assisted setup</Badge>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
              Your chosen AI can help after you sign in and approve a grant.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Assist With Moving keeps the durable record. Your AI can research,
              organize, and save bounded work into it. Signing in proves who you
              are; the grant you approve afterwards decides what your AI may
              actually do. Create a fallback key only for local or non-OAuth
              tools.
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
                your AI
              </Badge>
            </div>
            <ol className="mt-4 space-y-3">
              {[
                "Create or sign into your account.",
                "Paste the endpoint into an AI that speaks remote MCP with OAuth.",
                "Sign in through your browser.",
                "Approve a grant: the moves it covers and what it may do.",
                "Use a fallback helper key only if that path is unavailable.",
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
              What the grant asks you to choose
            </div>
            <div className="mt-4 grid gap-2">
              {grantChoices.map((option) => (
                <div
                  key={option}
                  className="flex items-center gap-2 rounded-md border border-border bg-background/65 p-3 text-sm"
                >
                  <CheckCircle2
                    className="size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {option}
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Approve only what the work needs. Your AI is shown just the tools
              your grant covers, and revoking it refuses the very next call.
            </p>
          </div>
          <div className="rounded-md border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bot className="size-4 text-primary" aria-hidden="true" />
              Canonical MCP endpoint
            </div>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/35 p-3 font-mono text-xs leading-5 text-muted-foreground">
              {remoteMcpEndpoint}
            </pre>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Paste this URL into any AI that speaks remote Streamable HTTP MCP
              with compatible OAuth. This is a capability requirement, not a
              claim that a particular AI product works — none has completed a
              full run yet, so the connection is Partial. Ask your AI to call
              describe_connection if no tools appear, get_move_brief first,
              search before creating duplicates, and use save_complete_result to
              keep finished decisions, estimates, plans, and source checks
              together.
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The other doors are not the same:
              https://movingmanifest.com/mcp/connect keeps older connections
              working with a different, larger catalog;
              https://movingmanifest.com/api/mcp and the local
              assistwithmoving-mcp package take a scoped mmk_ key and never
              offer sign-in.
            </p>
          </div>
          <div className="rounded-md border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldAlert className="size-4 text-primary" aria-hidden="true" />
              Use the key carefully
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A fallback key can read and change your move data according to
              its scopes, and it is not governed by the grant. Only paste it
              into an AI you trust when the canonical connection is not
              available. Do not put keys in public chats, screenshots, issues,
              or documents. You can revoke connections and keys later in
              Settings.
            </p>
            <Link
              href="/ai"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"
            >
              Learn what your AI can help with
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="rounded-md border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ClipboardList className="size-4 text-primary" aria-hidden="true" />
              No connection needed to hand work over
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              You do not need a connection at all to hand work over. Open a
              Queue item, copy its bounded brief into any AI, and paste the
              result back into the same item. The handoff completes without MCP,
              OAuth, or a key — and Settings → AI connections keeps a copyable
              brief ready for exactly this.
            </p>
            <Link
              href="/mcp/guide"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"
            >
              Read the MCP overview
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
