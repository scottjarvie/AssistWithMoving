"use client";

import { useState } from "react";

import {
  formatReleaseTimestamp,
  getReleaseItems,
  releaseCategories,
  type PublicReleaseEntry,
  type ReleaseCategory,
} from "@/lib/release-note-contract";

const sectionLabels: Record<ReleaseCategory, string> = {
  created: "Created",
  fixed: "Fixed",
  upgraded: "Upgraded",
};

const categoryMarks: Record<ReleaseCategory, string> = {
  created: "+",
  fixed: "✓",
  upgraded: "↑",
};

type ReadingMode = "quick" | "long";

function releaseId(entry: PublicReleaseEntry) {
  return `release-${entry.version.replaceAll(".", "-")}-${entry.releasedAt.slice(0, 10)}`;
}

export function UpdatesReleaseList({
  entries,
}: {
  entries: PublicReleaseEntry[];
}) {
  const [readingMode, setReadingMode] = useState<ReadingMode>("quick");
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});

  return (
    <>
      <div
        aria-label="Release note reading depth"
        className="mb-6 inline-flex min-h-11 flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1"
        role="group"
      >
        <button
          aria-pressed={readingMode === "quick"}
          className="min-h-11 rounded-sm px-4 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          onClick={() => setReadingMode("quick")}
          type="button"
        >
          Quick read
        </button>
        <button
          aria-pressed={readingMode === "long"}
          className="min-h-11 rounded-sm px-4 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          onClick={() => setReadingMode("long")}
          type="button"
        >
          Learn the changes
        </button>
      </div>

      <p className="mb-8 max-w-3xl text-sm leading-6 text-muted-foreground">
        {readingMode === "quick"
          ? "Quick read shows one outcome sentence per change."
          : "Learn the changes adds what changed, why it matters, and where to find it."}
      </p>

      <div className="space-y-8">
        {entries.map((entry) => {
          const entryId = releaseId(entry);

          return (
            <article
              className="min-w-0 scroll-mt-6 rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6"
              id={entryId}
              key={`${entry.version}-${entry.releasedAt}`}
            >
              <div className="flex min-w-0 flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <a
                    className="font-mono text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={`#${entryId}`}
                  >
                    v{entry.version}
                  </a>
                  <h2 className="mt-2 break-words text-2xl font-semibold tracking-normal">
                    {entry.title}
                  </h2>
                </div>
                <time
                  className="shrink-0 font-mono text-sm text-muted-foreground"
                  dateTime={entry.releasedAt}
                >
                  {formatReleaseTimestamp(entry.releasedAt, entry.timezone)}
                </time>
              </div>

              <p className="mt-5 max-w-3xl text-sm leading-6 text-muted-foreground">
                {entry.summary}
              </p>
              {entry.backfillNote ? (
                <p className="mt-3 max-w-3xl rounded-md border border-border bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  <span className="font-semibold text-foreground">Backfilled:</span>{" "}
                  {entry.backfillNote}
                </p>
              ) : null}

              <div
                className="mt-7 grid min-w-0 gap-7 lg:grid-cols-3"
                data-release-categories=""
              >
                {releaseCategories.map((category) => {
                  const items = getReleaseItems(entry, category);
                  const categoryKey = `${entryId}-${category}`;
                  const expanded = expandedCategories[categoryKey] ?? false;
                  const listId = `${categoryKey}-list`;

                  return (
                    <section
                      aria-labelledby={`${categoryKey}-heading`}
                      className="min-w-0"
                      key={category}
                    >
                      <h3
                        aria-label={`${sectionLabels[category]} ${items.length}`}
                        className="flex min-h-7 items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground"
                        id={`${categoryKey}-heading`}
                      >
                        <span
                          aria-hidden="true"
                          className="inline-flex size-6 items-center justify-center rounded-full bg-primary/10 font-mono text-xs text-primary"
                        >
                          {categoryMarks[category]}
                        </span>
                        {sectionLabels[category]}
                        <span className="font-mono text-xs font-normal text-muted-foreground">
                          {items.length}
                        </span>
                      </h3>

                      <ul
                        className="mt-4 space-y-4"
                        id={listId}
                      >
                        {items.map((item, index) => (
                          <li
                            className="min-w-0 border-l-2 border-border pl-3"
                            hidden={!expanded && index >= 3}
                            key={item.id}
                          >
                            <p className="break-words text-sm font-medium leading-6 text-foreground">
                              {item.short}
                            </p>
                            <div
                              className="mt-2 max-w-prose space-y-2 text-sm leading-6 text-muted-foreground"
                              hidden={readingMode !== "long"}
                            >
                              <p>
                                <span className="font-semibold text-foreground">
                                  What:
                                </span>{" "}
                                {item.long.what}
                              </p>
                              <p>
                                <span className="font-semibold text-foreground">
                                  Why:
                                </span>{" "}
                                {item.long.why}
                              </p>
                              {item.long.where ? (
                                <p>
                                  <span className="font-semibold text-foreground">
                                    Where:
                                  </span>{" "}
                                  {item.long.where}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>

                      {items.length > 3 ? (
                        <button
                          aria-label={
                            expanded
                              ? `Show only top 3 ${sectionLabels[category]} changes in v${entry.version}`
                              : `Show all ${items.length} ${sectionLabels[category]} changes in v${entry.version}`
                          }
                          aria-controls={listId}
                          aria-expanded={expanded}
                          className="mt-4 min-h-11 rounded-sm px-1 text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={() =>
                            setExpandedCategories((current) => ({
                              ...current,
                              [categoryKey]: !expanded,
                            }))
                          }
                          type="button"
                        >
                          {expanded ? "Show only top 3" : `Show all ${items.length}`}
                          <span className="sr-only">
                            {" "}
                            {sectionLabels[category]} changes in v{entry.version}
                          </span>
                        </button>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
