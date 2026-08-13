import Link from "next/link";
import { ArrowRight, Bot, HelpCircle, Info, LayoutGrid } from "lucide-react";

import {
  HowItWorksPanel,
  PublicFooter,
  PublicHeader,
} from "@/components/public-page-chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { product } from "@/lib/product";

const starterPrompt =
  "Open movingmanifest.com/ai and help me set up Assist With Moving. Start with my move context, places, decisions, and what needs attention. Connect to movingmanifest.com/mcp with OAuth, call get_move_brief first, search before creating duplicates, and save finished work with save_complete_result.";

// Honest "learn more" links. No counts, metrics, or claims — just where to read next.
const learnMoreLinks: {
  href: string;
  title: string;
  copy: string;
  icon: typeof Info;
}[] = [
  {
    href: "/about",
    title: "About",
    copy: "Why a move needs durable memory, not another disposable checklist.",
    icon: Info,
  },
  {
    href: "/faq",
    title: "FAQ",
    copy: "Common questions about accounts, privacy, and AI.",
    icon: HelpCircle,
  },
  {
    href: "/features",
    title: "Features",
    copy: "Everything the workspace can do.",
    icon: LayoutGrid,
  },
];

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicHeader />

      <section className="border-b border-border">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.8fr)] lg:px-8 lg:py-16">
          <div className="max-w-2xl">
            <Badge variant="secondary" className="mb-5">
              Assist With Moving · currently hosted at {product.domain}
            </Badge>
            <h1 className="text-5xl font-semibold leading-[0.95] tracking-tight text-balance sm:text-6xl lg:text-7xl">
              Keep the whole move coherent.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              One durable workspace for the changing plan, places, decisions,
              belongings, evidence, and handoffs you share with your chosen AI.
              Start simply, then add detail only when the move needs it.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/ai">
                  Set up your chosen AI
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/sign-up">Create account</Link>
              </Button>
            </div>
            <div className="mt-6 rounded-md border border-primary/25 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Bot className="size-4 text-primary" aria-hidden="true" />
                Assist your AI, so it can assist you with moving
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Tell it:
              </p>
              <blockquote className="mt-2 border-l-2 border-primary pl-3 text-sm leading-6">
                {starterPrompt}
              </blockquote>
              <Link
                href="/ai"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary"
              >
                Open the assistant guide
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <HowItWorksPanel />
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-normal">
            Learn about the project
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Assist With Moving is in active development. Read the current
            product boundaries, privacy model, and available workflows before
            you create an account.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {learnMoreLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-md border border-border p-4 hover:bg-muted/40"
              >
                <item.icon
                  className="mb-4 size-5 text-primary"
                  aria-hidden="true"
                />
                <div className="flex items-center gap-2 text-lg font-semibold tracking-normal">
                  {item.title}
                  <ArrowRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.copy}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
