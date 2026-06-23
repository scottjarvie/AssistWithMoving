import type { Metadata } from "next";
import { CheckCircle2, Sparkles, Wrench } from "lucide-react";

import {
  PublicBand,
  PublicFooter,
  PublicHeader,
} from "@/components/public-page-chrome";
import { Badge } from "@/components/ui/badge";
import {
  appVersion,
  formatReleaseTimestamp,
  releaseEntries,
} from "@/lib/release-notes";

export const metadata: Metadata = {
  title: "What's New",
  description:
    "MovingManifest release notes with user-safe updates for product capabilities, fixes, and workflow improvements.",
};

const sectionStyles = {
  created: {
    label: "Created",
    icon: Sparkles,
    className: "border-primary/25 bg-primary/5",
  },
  fixed: {
    label: "Fixed",
    icon: Wrench,
    className: "border-emerald-500/25 bg-emerald-500/5",
  },
  upgraded: {
    label: "Upgraded",
    icon: CheckCircle2,
    className: "border-sky-500/25 bg-sky-500/5",
  },
} as const;

export default function UpdatesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicHeader />

      <section className="border-y border-border">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(280px,0.55fr)] lg:px-8 lg:py-14">
          <div>
            <Badge variant="secondary" className="mb-5">
              Release notes
            </Badge>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
              What&apos;s New
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Product updates for MovingManifest, written for users and helpers.
              These notes describe capabilities and reliability changes without
              exposing private move records, credentials, or internal proof.
            </p>
          </div>

          <div className="self-start rounded-md border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Current version
            </div>
            <div className="mt-3 font-mono text-3xl font-semibold">
              v{appVersion}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Version comes from the app package. MCP/API protocol versions are
              tracked separately when those contracts change.
            </p>
          </div>
        </div>
      </section>

      <PublicBand>
        <div className="space-y-5">
          {releaseEntries.map((entry) => (
            <article
              key={`${entry.version}-${entry.releasedAt}`}
              id={`v${entry.version.replaceAll(".", "-")}`}
              className="rounded-md border border-border bg-card p-4 shadow-sm shadow-black/10"
            >
              <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>v{entry.version}</Badge>
                    <time
                      dateTime={entry.releasedAt}
                      className="font-mono text-sm text-muted-foreground"
                    >
                      {formatReleaseTimestamp(entry.releasedAt)}
                    </time>
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold tracking-normal">
                    {entry.title}
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {entry.summary}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <ReleaseSection kind="created" items={entry.created} />
                <ReleaseSection kind="fixed" items={entry.fixed} />
                <ReleaseSection kind="upgraded" items={entry.upgraded} />
              </div>
            </article>
          ))}
        </div>
      </PublicBand>

      <PublicFooter />
    </main>
  );
}

function ReleaseSection({
  kind,
  items,
}: {
  kind: keyof typeof sectionStyles;
  items: string[];
}) {
  const style = sectionStyles[kind];
  const Icon = style.icon;

  return (
    <section className={`rounded-md border p-4 ${style.className}`}>
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold tracking-normal">
          {style.label}
        </h3>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item}
            className="flex gap-2 text-sm leading-6 text-muted-foreground"
          >
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
