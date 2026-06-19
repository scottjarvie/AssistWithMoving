import type { Metadata } from "next";

import {
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
    "Release notes for MovingManifest product updates, fixes, and upgrades.",
};

const sectionLabels = [
  ["created", "Created"],
  ["fixed", "Fixed"],
  ["upgraded", "Upgraded"],
] as const;

export default function UpdatesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <Badge variant="secondary" className="mb-5">
            Release notes
          </Badge>
          <h1 className="text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
            What&apos;s New
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
            Product-visible MovingManifest changes, written at a safe boundary
            for customers, helpers, movers, and agents. Private move records,
            account data, credentials, and internal handoff details are never
            included here.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Version source: <span className="font-mono">package.json</span>{" "}
            currently reports <span className="font-mono">v{appVersion}</span>.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="space-y-6">
            {releaseEntries.map((entry) => (
              <article
                key={`${entry.version}-${entry.releasedAt}`}
                className="rounded-md border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-sm text-muted-foreground">
                      v{entry.version}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-normal">
                      {entry.title}
                    </h2>
                  </div>
                  <time
                    dateTime={entry.releasedAt}
                    className="font-mono text-sm text-muted-foreground"
                  >
                    {formatReleaseTimestamp(entry.releasedAt)}
                  </time>
                </div>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {entry.summary}
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {sectionLabels.map(([key, label]) => (
                    <section key={key} aria-labelledby={`${entry.version}-${key}`}>
                      <h3
                        id={`${entry.version}-${key}`}
                        className="text-sm font-semibold uppercase tracking-normal text-foreground"
                      >
                        {label}
                      </h3>
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                        {entry[key].map((item) => (
                          <li key={item} className="flex gap-2">
                            <span aria-hidden="true" className="text-primary">
                              -
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
