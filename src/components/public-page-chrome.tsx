import Link from "next/link";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { DisplayPreferences } from "@/components/display-preferences";
import { MoveIllustration, MovingSymbol, type MovingSymbolName } from "@/components/moving-symbol";
import { PublicMobileNav } from "@/components/public-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { product } from "@/lib/product";
import { supportDesk, supportDeskUrl } from "@/lib/support";

// Primary, informational-leaning links shown inline on desktop.
const publicNavPrimary = [
  { href: "/features", label: "Features" },
  { href: "/ai", label: "Your AI" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
] as const;

// Secondary links: surfaced in the footer and the mobile "more" group.
const publicNavSecondary = [
  { href: "/api", label: "API" },
  { href: "/mcp/guide", label: "MCP" },
  { href: "/pcs-moving", label: "PCS moving" },
  { href: "/claims-inventory", label: "Claims inventory" },
  { href: "/privacy", label: "Privacy" },
  { href: "/updates", label: "Updates" },
] as const;

const footerNav = [...publicNavPrimary, ...publicNavSecondary] as const;

export type PublicFeatureCard = {
  title: string;
  copy: string;
  icon: MovingSymbolName;
};

export type PublicNavigationMode = "app" | "document";

type PublicPageAction = {
  href: string;
  label: string;
  navigation?: PublicNavigationMode;
};

function headingText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(headingText).join("");
  return isValidElement<{ children?: ReactNode }>(node) ? headingText(node.props.children) : "";
}

function firstHeading(node: ReactNode): string | undefined {
  let found: string | undefined;
  Children.forEach(node, child => {
    if (found || !isValidElement<{ children?: ReactNode }>(child)) return;
    if (child.type === "h2") found = headingText(child.props.children).trim();
    else found = firstHeading(child.props.children);
  });
  return found;
}

export function PublicPageChrome({
  eyebrow,
  title,
  description,
  children,
  primaryAction,
  secondaryAction,
  visual,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  primaryAction?: PublicPageAction;
  secondaryAction?: PublicPageAction;
  visual?: React.ReactNode;
}) {
  const resolvedPrimaryAction = primaryAction ?? {
    href: "/sign-up",
    label: "Create account",
  };
  const resolvedSecondaryAction = secondaryAction ?? {
    href: "/ai",
    label: "Set up your chosen AI",
  };
  const sections: Array<{ id: string; label: string }> = [];
  const readingContent = Children.map(children, child => {
    if (!isValidElement(child) || child.type !== PublicBand) return child;
    const band = child as ReactElement<{ children?: ReactNode; id?: string; label?: string; reader?: boolean }>;
    const id = band.props.id ?? `guide-section-${sections.length + 1}`;
    const label = band.props.label ?? firstHeading(band.props.children) ?? `Guide section ${sections.length + 1}`;
    sections.push({ id, label });
    return cloneElement(band, { id, reader: true });
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div>
            <Badge variant="secondary" className="mb-3">
              {eyebrow}
            </Badge>
            <h1 className="max-w-4xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {title}
            </h1>
            <p className="mt-4 max-w-[72ch] text-base leading-7 text-muted-foreground">
              {description}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild size="sm" className="min-h-11 sm:min-h-8">
                {resolvedPrimaryAction.navigation === "document" ? (
                  <a href={resolvedPrimaryAction.href}>
                    {resolvedPrimaryAction.label}
                    <MovingSymbol name="arrow" aria-hidden="true" />
                  </a>
                ) : (
                  <Link href={resolvedPrimaryAction.href}>
                    {resolvedPrimaryAction.label}
                    <MovingSymbol name="arrow" aria-hidden="true" />
                  </Link>
                )}
              </Button>
              <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-8">
                {resolvedSecondaryAction.navigation === "document" ? (
                  <a href={resolvedSecondaryAction.href}>
                    {resolvedSecondaryAction.label}
                  </a>
                ) : (
                  <Link href={resolvedSecondaryAction.href}>
                    {resolvedSecondaryAction.label}
                  </Link>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto grid w-full max-w-7xl gap-x-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:px-8">
          {sections.length ? <nav aria-label="On this page" className="border-b border-border py-5 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:self-start"><h2 className="text-sm font-semibold">Contents</h2><ol className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 lg:grid-cols-1">{sections.map(section => <li key={section.id}><a href={`#${section.id}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring lg:min-h-8"><MovingSymbol name="arrow" className="size-3 shrink-0" />{section.label}</a></li>)}</ol></nav> : null}
        <article className="min-w-0 lg:col-start-1 lg:row-start-1 [&_p]:max-w-[75ch]">{readingContent}</article>
        <aside aria-label="Guide context" className="grid min-w-0 gap-6 border-t border-border py-5 lg:col-span-2 lg:row-start-2 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="hidden lg:block"><MoveIllustration kind="route" decorative className="h-24 w-full" /></div>
            <h2 className="text-sm font-semibold">Guide context</h2>
            <p className="text-xs leading-5 text-muted-foreground">First-party product guidance. Send questions and corrections to the <a href={supportDeskUrl("home")} className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">{supportDesk.name}</a>.</p>
          </div>
          <div data-reader-visual className="min-w-0 max-w-2xl">{visual ?? <details><summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"><MovingSymbol name="route" className="size-4" />How Moving works</summary><div className="mt-2"><HowItWorksPanel /></div></details>}</div>
        </aside>
      </div>
      <PublicFooter />
    </main>
  );
}

export function PublicHeader() {
  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
      <BrandMark />
      <nav aria-label="Public navigation" className="hidden items-center gap-4 lg:flex">
        {publicNavPrimary.map((item) => (
          <Link
            key={item.href}
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
            href={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <DisplayPreferences />
        <Button asChild size="touch" className="hidden lg:inline-flex">
          <Link href="/sign-in">
            Sign in
            <MovingSymbol name="arrow" aria-hidden="true" />
          </Link>
        </Button>
        <div className="lg:hidden">
          <PublicMobileNav primary={publicNavPrimary} secondary={publicNavSecondary} />
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="max-w-xl space-y-1">
          <p>{product.name} organizes move records, evidence, and documentation packets.</p>
          <p>
            Need help? Everything goes through the{" "}
            <a
              href={supportDeskUrl("home")}
              className="text-foreground underline underline-offset-4 hover:text-primary"
            >
              {supportDesk.name}
            </a>
            . There is no support email address — {product.name} does not run a
            mailbox.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          {footerNav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground">
              {item.label}
            </Link>
          ))}
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <a href={supportDeskUrl("home")} className="hover:text-foreground">
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}

export function FeatureGrid({ cards }: { cards: PublicFeatureCard[] }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {cards.map((card) => (
        <div key={card.title} className="py-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold tracking-normal">
            <MovingSymbol name={card.icon} className="size-5 shrink-0 text-primary" aria-hidden="true" />
            {card.title}
          </h3>
          <p className="mt-2 pl-7 text-sm leading-6 text-muted-foreground">
            {card.copy}
          </p>
        </div>
      ))}
    </div>
  );
}

export function PublicBand({ children, id, label, reader = false }: { children: React.ReactNode; id?: string; label?: string; reader?: boolean }) {
  return (
    <section id={id} aria-label={label} className="scroll-mt-6 border-b border-border">
      <div className={reader ? "min-w-0 py-6 sm:py-8" : "mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8"}>
        {children}
      </div>
    </section>
  );
}

// Honest "how it works" explainer — a labeled workflow diagram, not a
// screenshot of live data. No counts, metrics, or progress bars.
const howItWorksSteps: {
  icon: MovingSymbolName;
  label: string;
  copy: string;
}[] = [
  {
    icon: "route" as const,
    label: "Start with the move",
    copy: "Capture where, when, why, and the decisions that shape everything else.",
  },
  {
    icon: "plan" as const,
    label: "Build the living plan",
    copy: "Keep questions, handoffs, timing, and next decisions together as plans change.",
  },
  {
    icon: "camera" as const,
    label: "Map places and belongings",
    copy: "Connect rooms, items, boxes, destinations, transport, and private evidence.",
  },
  {
    icon: "truck" as const,
    label: "Work with your chosen AI",
    copy: "Let your AI research and organize while the workspace keeps durable context and provenance.",
  },
  {
    icon: "note" as const,
    label: "Return to trusted results",
    copy: "Review decisions, estimates, plans, source checks, evidence, and scoped packets later.",
  },
];

export function HowItWorksPanel() {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            How it works
          </p>
          <p className="mt-1 text-lg font-semibold">A move becomes a usable record</p>
        </div>
        <Badge>
          <MovingSymbol name="shield" aria-hidden="true" />
          Scoped packets
        </Badge>
      </div>
      <ol className="divide-y divide-border py-1">
        {howItWorksSteps.map((step) => (
          <li key={step.label} className="flex items-start gap-3 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
              <MovingSymbol name={step.icon} className="size-5" aria-hidden="true" />
            </span>
            <div>
              <div className="text-sm font-semibold">{step.label}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {step.copy}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className="rounded-md bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
        <span className="mb-2 flex items-center gap-2 font-medium text-foreground">
          <MovingSymbol name="lock" className="size-4 text-primary" aria-hidden="true" />
          Privacy default
        </span>
        Values, serials, private notes, and sensitive photos stay hidden from
        helper and mover views unless you share them.
      </div>
    </div>
  );
}
