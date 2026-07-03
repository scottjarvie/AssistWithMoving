"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, ListChecks, Pencil, X } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  sortAiReviewEntries,
  summarizeAiReviewQueue,
  type AiReviewEntry,
} from "@/lib/ai-review-queue";
import { moveWorkspaceAnchorPath } from "@/lib/move-links";

type AiReviewFilter =
  | "all"
  | "attention"
  | "duplicates"
  | AiReviewEntry["kind"];

const reviewFilters: Array<{
  value: AiReviewFilter;
  label: string;
  description: string;
}> = [
  {
    value: "all",
    label: "All",
    description: "Every pending suggestion, sorted by review risk.",
  },
  {
    value: "attention",
    label: "Needs closer look",
    description:
      "Low-confidence or duplicate suggestions that deserve review first.",
  },
  {
    value: "duplicates",
    label: "Duplicates",
    description:
      "Possible duplicate records or photos to resolve before approving.",
  },
  {
    value: "text",
    label: "Text",
    description: "Suggestions produced from typed or pasted text intake.",
  },
  {
    value: "photo",
    label: "Photo",
    description: "Suggestions produced from photo evidence and image analysis.",
  },
  {
    value: "planning",
    label: "Planning",
    description:
      "Estimate and load-assignment suggestions from planning analysis.",
  },
];

export function AiReviewQueue({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const textSuggestions = useQuery(
    api.aiTextIntake.listForMove,
    householdId && moveId
      ? { householdId, moveId, status: "pending", limit: 80 }
      : "skip",
  );
  const photoSuggestions = useQuery(
    api.aiPhotoIntake.listForMove,
    householdId && moveId
      ? { householdId, moveId, status: "pending", limit: 80 }
      : "skip",
  );
  const planningSuggestions = useQuery(
    api.aiPlanningSuggestions.listForMove,
    householdId && moveId
      ? { householdId, moveId, status: "pending", limit: 80 }
      : "skip",
  );
  const approveText = useMutation(api.aiTextIntake.approveMany);
  const rejectText = useMutation(api.aiTextIntake.rejectMany);
  const approvePhoto = useMutation(api.aiPhotoIntake.approveMany);
  const rejectPhoto = useMutation(api.aiPhotoIntake.rejectMany);
  const approvePlanning = useMutation(api.aiPlanningSuggestions.approveMany);
  const rejectPlanning = useMutation(api.aiPlanningSuggestions.rejectMany);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewFilter, setReviewFilter] = useState<AiReviewFilter>("all");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const entries = useMemo(
    () =>
      sortAiReviewEntries([
        ...(textSuggestions ?? []).map(
          (suggestion): AiReviewEntry => ({
            id: suggestion._id,
            kind: "text",
            type: suggestion.type,
            confidence: suggestion.confidence,
            title:
              suggestion.itemDraft?.name ??
              suggestion.boxDraft?.label ??
              suggestion.type,
            detail: suggestion.sourceLine,
            reasoning: suggestion.reasoning,
            href: moveWorkspaceAnchorPath(moveId, "#ai-text-intake"),
          }),
        ),
        ...(photoSuggestions ?? []).map(
          (suggestion): AiReviewEntry => ({
            id: suggestion._id,
            kind: "photo",
            type: suggestion.type,
            confidence: suggestion.confidence,
            title:
              suggestion.itemDraft?.name ??
              suggestion.boxDraft?.label ??
              suggestion.type,
            detail: suggestion.sourceSummary,
            reasoning: suggestion.reasoning,
            href: moveWorkspaceAnchorPath(moveId, "#ai-photo-intake"),
            duplicateCount: suggestion.duplicatePhotoIds?.length ?? 0,
          }),
        ),
        ...(planningSuggestions ?? []).map(
          (suggestion): AiReviewEntry => ({
            id: suggestion._id,
            kind: "planning",
            type: suggestion.type,
            confidence: suggestion.confidence,
            title:
              suggestion.type === "estimate"
                ? "Estimate suggestion"
                : "Assignment suggestion",
            detail: suggestion.estimateDraft
              ? `${formatNumber(suggestion.estimateDraft.estimatedWeightLb)} lb / ${formatNumber(suggestion.estimateDraft.estimatedVolumeCuFt)} cu ft`
              : suggestion.assignmentDraft
                ? `${suggestion.assignmentDraft.assignmentWarnings.length} warnings`
                : "",
            reasoning: suggestion.reasoning,
            href: moveWorkspaceAnchorPath(moveId, "#ai-planning-suggestions"),
          }),
        ),
      ]),
    [moveId, photoSuggestions, planningSuggestions, textSuggestions],
  );
  const summary = useMemo(() => summarizeAiReviewQueue(entries), [entries]);
  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesReviewFilter(entry, reviewFilter)),
    [entries, reviewFilter],
  );
  const activeReviewFilter = reviewFilters.find(
    (filter) => filter.value === reviewFilter,
  );
  const visibleEntries = useMemo(
    () => filteredEntries.slice(0, 80),
    [filteredEntries],
  );
  const filterCounts = useMemo(
    () =>
      reviewFilters.reduce<Record<AiReviewFilter, number>>(
        (acc, filter) => {
          acc[filter.value] =
            filter.value === "all"
              ? entries.length
              : entries.filter((entry) =>
                  matchesReviewFilter(entry, filter.value),
                ).length;
          return acc;
        },
        {} as Record<AiReviewFilter, number>,
      ),
    [entries],
  );
  const loading =
    textSuggestions === undefined ||
    photoSuggestions === undefined ||
    planningSuggestions === undefined;

  async function approveSelected() {
    if (!householdId || !moveId || !selected.size) return;
    setWorking(true);
    setMessage(null);
    try {
      const textIds = selectedTextIds(entries, selected);
      const photoIds = selectedPhotoIds(entries, selected);
      const planningIds = selectedPlanningIds(entries, selected);
      const results = await Promise.all([
        textIds.length
          ? approveText({
              householdId,
              moveId,
              approvals: textIds.map((suggestionId) => ({ suggestionId })),
            })
          : Promise.resolve(null),
        photoIds.length
          ? approvePhoto({
              householdId,
              moveId,
              approvals: photoIds.map((suggestionId) => ({ suggestionId })),
            })
          : Promise.resolve(null),
        planningIds.length
          ? approvePlanning({
              householdId,
              moveId,
              approvals: planningIds.map((suggestionId) => ({ suggestionId })),
            })
          : Promise.resolve(null),
      ]);
      setSelected(new Set());
      setMessage(
        `${selected.size} suggestions approved across ${results.filter(Boolean).length} queues.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not approve selected AI suggestions.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function rejectSelected() {
    if (!householdId || !moveId || !selected.size) return;
    setWorking(true);
    setMessage(null);
    try {
      const textIds = selectedTextIds(entries, selected);
      const photoIds = selectedPhotoIds(entries, selected);
      const planningIds = selectedPlanningIds(entries, selected);
      await Promise.all([
        textIds.length
          ? rejectText({ householdId, moveId, suggestionIds: textIds })
          : Promise.resolve(),
        photoIds.length
          ? rejectPhoto({ householdId, moveId, suggestionIds: photoIds })
          : Promise.resolve(),
        planningIds.length
          ? rejectPlanning({ householdId, moveId, suggestionIds: planningIds })
          : Promise.resolve(),
      ]);
      setSelected(new Set());
      setMessage(`${selected.size} suggestions rejected.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not reject selected AI suggestions.",
      );
    } finally {
      setWorking(false);
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeReviewFilter(nextFilter: AiReviewFilter) {
    setReviewFilter(nextFilter);
    setSelected(new Set());
  }

  return (
    <Card id="ai-review-queue">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="size-4 text-primary" aria-hidden="true" />
              AI review queue
            </CardTitle>
            <CardDescription>
              Clear pending text, photo, duplicate, estimate, and assignment
              suggestions from one review surface.
            </CardDescription>
          </div>
          <Badge variant="secondary">{summary.total} pending</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-5">
          <QueueMetric label="Text" value={summary.byKind.text} />
          <QueueMetric label="Photo" value={summary.byKind.photo} />
          <QueueMetric label="Planning" value={summary.byKind.planning} />
          <QueueMetric label="Low confidence" value={summary.lowConfidence} />
          <QueueMetric label="Duplicates" value={summary.duplicateCandidates} />
        </div>

        <div className="space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {reviewFilters.map((filter) => {
              const active = reviewFilter === filter.value;
              const count = filterCounts[filter.value] ?? 0;

              return (
                <Button
                  key={filter.value}
                  type="button"
                  size="sm"
                  aria-pressed={active}
                  aria-label={`${filter.label}: ${formatSuggestionCount(count)}`}
                  className="h-10 shrink-0 gap-2"
                  variant={active ? "default" : "outline"}
                  onClick={() => changeReviewFilter(filter.value)}
                >
                  <span>{filter.label}</span>
                  <Badge
                    variant={active ? "secondary" : "outline"}
                    className="h-5 min-w-5 px-1"
                  >
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {activeReviewFilter?.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!visibleEntries.length || working}
            onClick={() =>
              setSelected(new Set(visibleEntries.map((entry) => entry.id)))
            }
          >
            Select visible
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selected.size || working}
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selected.size || working}
            onClick={() => void approveSelected()}
          >
            <Check aria-hidden="true" />
            Approve selected
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selected.size || working}
            onClick={() => void rejectSelected()}
          >
            <X aria-hidden="true" />
            Reject selected
          </Button>
        </div>

        {message ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-4/5" />
          </div>
        ) : entries.length ? (
          <>
            {visibleEntries.length ? (
              <>
                <div
                  role="list"
                  aria-label="AI review cards"
                  className="grid gap-3 md:hidden"
                >
                  {visibleEntries.map((entry) => (
                    <AiReviewEntryCard
                      key={entry.id}
                      entry={entry}
                      selected={selected.has(entry.id)}
                      onToggle={() => toggle(entry.id)}
                    />
                  ))}
                </div>

                <div className="hidden rounded-md border border-border md:block">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Use</TableHead>
                        <TableHead className="w-[35%]">Suggestion</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="w-24">Edit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              className="size-3.5 accent-primary"
                              checked={selected.has(entry.id)}
                              onChange={() => toggle(entry.id)}
                              aria-label={`Use ${entry.title}`}
                            />
                          </TableCell>
                          <TableCell className="min-w-[220px]">
                            <AiReviewEntrySummary entry={entry} />
                          </TableCell>
                          <TableCell>
                            <p className="line-clamp-3 break-words text-xs leading-5 text-muted-foreground">
                              {entry.reasoning}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Button
                              asChild
                              type="button"
                              size="sm"
                              variant="outline"
                            >
                              <Link href={entry.href}>
                                <Pencil aria-hidden="true" />
                                Edit
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {filteredEntries.length > visibleEntries.length ? (
                  <p className="text-xs text-muted-foreground">
                    Showing {visibleEntries.length} of {filteredEntries.length}{" "}
                    - resolve or filter to see more.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                No suggestions match this review filter.
              </div>
            )}
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No pending AI suggestions.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function matchesReviewFilter(entry: AiReviewEntry, filter: AiReviewFilter) {
  switch (filter) {
    case "all":
      return true;
    case "attention":
      return entry.confidence === "low" || Boolean(entry.duplicateCount);
    case "duplicates":
      return Boolean(entry.duplicateCount);
    default:
      return entry.kind === filter;
  }
}

function AiReviewEntryCard({
  entry,
  selected,
  onToggle,
}: {
  entry: AiReviewEntry;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="listitem"
      className="rounded-md border border-border bg-card p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={selected}
            onChange={onToggle}
            aria-label={`Use ${entry.title}`}
          />
          Use
        </label>
        <Button asChild type="button" size="sm" variant="outline">
          <Link href={entry.href}>
            <Pencil aria-hidden="true" />
            Edit
          </Link>
        </Button>
      </div>

      <div className="mt-3">
        <AiReviewEntrySummary entry={entry} />
      </div>
      <p className="mt-3 line-clamp-4 break-words text-xs leading-5 text-muted-foreground">
        {entry.reasoning}
      </p>
    </div>
  );
}

function AiReviewEntrySummary({ entry }: { entry: AiReviewEntry }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline">{entry.kind}</Badge>
        <Badge variant="outline">{entry.type}</Badge>
        {entry.confidence ? (
          <Badge variant={entry.confidence === "low" ? "secondary" : "outline"}>
            {entry.confidence}
          </Badge>
        ) : null}
        {entry.duplicateCount ? (
          <Badge variant="secondary">{entry.duplicateCount} duplicates</Badge>
        ) : null}
      </div>
      <div className="mt-2 break-words font-medium">{entry.title}</div>
      <div className="mt-1 break-words text-xs text-muted-foreground">
        {entry.detail}
      </div>
    </div>
  );
}

function QueueMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </div>
  );
}

function formatSuggestionCount(count: number) {
  return `${count} ${count === 1 ? "suggestion" : "suggestions"}`;
}

function formatNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "0";
}

function selectedTextIds(entries: AiReviewEntry[], selected: Set<string>) {
  return entries
    .filter((entry) => entry.kind === "text" && selected.has(entry.id))
    .map((entry) => entry.id as Id<"aiTextSuggestions">);
}

function selectedPhotoIds(entries: AiReviewEntry[], selected: Set<string>) {
  return entries
    .filter((entry) => entry.kind === "photo" && selected.has(entry.id))
    .map((entry) => entry.id as Id<"aiPhotoSuggestions">);
}

function selectedPlanningIds(entries: AiReviewEntry[], selected: Set<string>) {
  return entries
    .filter((entry) => entry.kind === "planning" && selected.has(entry.id))
    .map((entry) => entry.id as Id<"aiPlanningSuggestions">);
}
