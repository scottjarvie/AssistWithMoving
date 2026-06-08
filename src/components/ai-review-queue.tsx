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

export function AiReviewQueue({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const textSuggestions = useQuery(
    api.aiTextIntake.listForMove,
    householdId && moveId ? { householdId, moveId, status: "pending", limit: 80 } : "skip"
  );
  const photoSuggestions = useQuery(
    api.aiPhotoIntake.listForMove,
    householdId && moveId ? { householdId, moveId, status: "pending", limit: 80 } : "skip"
  );
  const planningSuggestions = useQuery(
    api.aiPlanningSuggestions.listForMove,
    householdId && moveId ? { householdId, moveId, status: "pending", limit: 80 } : "skip"
  );
  const approveText = useMutation(api.aiTextIntake.approveMany);
  const rejectText = useMutation(api.aiTextIntake.rejectMany);
  const approvePhoto = useMutation(api.aiPhotoIntake.approveMany);
  const rejectPhoto = useMutation(api.aiPhotoIntake.rejectMany);
  const approvePlanning = useMutation(api.aiPlanningSuggestions.approveMany);
  const rejectPlanning = useMutation(api.aiPlanningSuggestions.rejectMany);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const entries = useMemo(
    () =>
      sortAiReviewEntries([
        ...(textSuggestions ?? []).map((suggestion): AiReviewEntry => ({
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
          href: "#ai-text-intake",
        })),
        ...(photoSuggestions ?? []).map((suggestion): AiReviewEntry => ({
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
          href: "#ai-photo-intake",
          duplicateCount: suggestion.duplicatePhotoIds?.length ?? 0,
        })),
        ...(planningSuggestions ?? []).map((suggestion): AiReviewEntry => ({
          id: suggestion._id,
          kind: "planning",
          type: suggestion.type,
          confidence: suggestion.confidence,
          title:
            suggestion.type === "estimate"
              ? "Estimate suggestion"
              : "Assignment suggestion",
          detail:
            suggestion.estimateDraft
              ? `${formatNumber(suggestion.estimateDraft.estimatedWeightLb)} lb / ${formatNumber(suggestion.estimateDraft.estimatedVolumeCuFt)} cu ft`
              : suggestion.assignmentDraft
                ? `${suggestion.assignmentDraft.assignmentWarnings.length} warnings`
                : "",
          reasoning: suggestion.reasoning,
          href: "#ai-planning-suggestions",
        })),
      ]),
    [photoSuggestions, planningSuggestions, textSuggestions]
  );
  const summary = useMemo(() => summarizeAiReviewQueue(entries), [entries]);
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
        `${selected.size} suggestions approved across ${results.filter(Boolean).length} queues.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not approve selected AI suggestions."
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
          : "Could not reject selected AI suggestions."
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

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!entries.length || working}
            onClick={() => setSelected(new Set(entries.map((entry) => entry.id)))}
          >
            Select all
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
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Use</TableHead>
                  <TableHead>Suggestion</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.slice(0, 80).map((entry) => (
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
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{entry.kind}</Badge>
                        <Badge variant="outline">{entry.type}</Badge>
                        {entry.confidence ? (
                          <Badge
                            variant={
                              entry.confidence === "low" ? "secondary" : "outline"
                            }
                          >
                            {entry.confidence}
                          </Badge>
                        ) : null}
                        {entry.duplicateCount ? (
                          <Badge variant="secondary">
                            {entry.duplicateCount} duplicates
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 font-medium">{entry.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {entry.detail}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[360px] text-xs leading-5 text-muted-foreground">
                      {entry.reasoning}
                    </TableCell>
                    <TableCell>
                      <Button asChild type="button" size="sm" variant="outline">
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
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No pending AI suggestions.
          </div>
        )}
      </CardContent>
    </Card>
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

function formatNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "0";
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
