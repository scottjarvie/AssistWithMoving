"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, ImagePlus, ScanSearch, X } from "lucide-react";

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

type PhotoSuggestion = NonNullable<
  ReturnType<typeof useQuery<typeof api.aiPhotoIntake.listForMove>>
>[number];

function photoSuggestionLabel(suggestion: PhotoSuggestion) {
  return (
    suggestion.itemDraft?.name ??
    suggestion.boxDraft?.label ??
    `${suggestion.type} photo suggestion`
  );
}

export function AiPhotoIntake({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const photos = useQuery(
    api.photos.listForMove,
    householdId && moveId ? { householdId, moveId, limit: 80 } : "skip"
  );
  const suggestions = useQuery(
    api.aiPhotoIntake.listForMove,
    householdId && moveId ? { householdId, moveId, limit: 80 } : "skip"
  );
  const createForPhoto = useMutation(api.aiPhotoIntake.createForPhoto);
  const approveMany = useMutation(api.aiPhotoIntake.approveMany);
  const rejectMany = useMutation(api.aiPhotoIntake.rejectMany);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const eligiblePhotos = useMemo(
    () =>
      (photos ?? []).filter(
        (photo) =>
          !photo.aiProcessed &&
          !photo.itemId &&
          !photo.boxId &&
          photo.visibilityScope !== "private" &&
          !["claimOnly", "sensitive", "hiddenFromGuests", "private"].includes(
            photo.privacyLevel
          ) &&
          hasAiUsableDerivative(photo.derivativeRefs)
      ),
    [photos]
  );
  const pendingSuggestions = useMemo(
    () => suggestions?.filter((suggestion) => suggestion.status === "pending") ?? [],
    [suggestions]
  );

  async function analyzePhoto(photoId: Id<"itemPhotos">) {
    if (!householdId || !moveId) return;
    setWorking(true);
    setMessage(null);
    try {
      const result = await createForPhoto({ householdId, moveId, photoId });
      setSelectedIds(new Set(result.suggestionIds.map((id) => String(id))));
      setMessage(`${result.suggestionIds.length} photo suggestions created.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not analyze that photo."
      );
    } finally {
      setWorking(false);
    }
  }

  async function approveSelected() {
    if (!householdId || !moveId || !selectedIds.size) return;
    const approvals = pendingSuggestions
      .filter((suggestion) => selectedIds.has(suggestion._id))
      .map((suggestion) => ({ suggestionId: suggestion._id }));
    setWorking(true);
    setMessage(null);
    try {
      const result = await approveMany({ householdId, moveId, approvals });
      setSelectedIds(new Set());
      setMessage(
        `${result.createdItemIds.length} items and ${result.createdBoxIds.length} boxes approved from photos.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not approve photo suggestions."
      );
    } finally {
      setWorking(false);
    }
  }

  async function rejectSelected() {
    if (!householdId || !moveId || !selectedIds.size) return;
    const suggestionIds = pendingSuggestions
      .filter((suggestion) => selectedIds.has(suggestion._id))
      .map((suggestion) => suggestion._id);
    setWorking(true);
    setMessage(null);
    try {
      await rejectMany({ householdId, moveId, suggestionIds });
      setSelectedIds(new Set());
      setMessage(`${suggestionIds.length} photo suggestions rejected.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not reject photo suggestions."
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card id="ai-photo-intake">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScanSearch className="size-4 text-primary" aria-hidden="true" />
              AI photo intake
            </CardTitle>
            <CardDescription>
              Analyze eligible derivatives, then approve or reject photo-created
              item and box suggestions.
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {pendingSuggestions.length} pending
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {eligiblePhotos.slice(0, 6).map((photo) => (
            <Button
              key={photo._id}
              type="button"
              size="sm"
              variant="outline"
              disabled={working}
              onClick={() => void analyzePhoto(photo._id)}
            >
              <ImagePlus aria-hidden="true" />
              {photo.caption ?? photo.room ?? photo.photoType}
            </Button>
          ))}
          {!eligiblePhotos.length ? (
            <p className="text-sm text-muted-foreground">
              No eligible unprocessed photos found.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selectedIds.size || working}
            onClick={() => void approveSelected()}
          >
            <Check aria-hidden="true" />
            Approve selected
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selectedIds.size || working}
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

        {suggestions === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-4/5" />
          </div>
        ) : pendingSuggestions.length ? (
          <>
            <div
              role="list"
              aria-label="AI photo suggestion cards"
              className="grid gap-3 md:hidden"
            >
              {pendingSuggestions.map((suggestion) => (
                <AiPhotoSuggestionCard
                  key={suggestion._id}
                  suggestion={suggestion}
                  selected={selectedIds.has(suggestion._id)}
                  onSelectedChange={(checked) => {
                    const next = new Set(selectedIds);
                    if (checked) next.add(suggestion._id);
                    else next.delete(suggestion._id);
                    setSelectedIds(next);
                  }}
                />
              ))}
            </div>

            <div className="hidden rounded-md border border-border md:block">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Use</TableHead>
                    <TableHead className="w-[38%]">Suggestion</TableHead>
                    <TableHead className="w-28">Confidence</TableHead>
                    <TableHead>Trace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingSuggestions.map((suggestion) => {
                    const label = photoSuggestionLabel(suggestion);

                    return (
                      <TableRow key={suggestion._id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            className="size-3.5 accent-primary"
                            checked={selectedIds.has(suggestion._id)}
                            onChange={(event) => {
                              const next = new Set(selectedIds);
                              if (event.target.checked) next.add(suggestion._id);
                              else next.delete(suggestion._id);
                              setSelectedIds(next);
                            }}
                            aria-label={`Use ${label}`}
                          />
                        </TableCell>
                        <TableCell className="min-w-0 whitespace-normal">
                          <PhotoSuggestionSummary suggestion={suggestion} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {suggestion.confidence}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="line-clamp-3 break-words text-xs leading-5 text-muted-foreground">
                            {suggestion.sourceSummary}
                          </p>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No pending AI photo suggestions.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AiPhotoSuggestionCard({
  suggestion,
  selected,
  onSelectedChange,
}: {
  suggestion: PhotoSuggestion;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
}) {
  const label = photoSuggestionLabel(suggestion);

  return (
    <div role="listitem" className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={selected}
            onChange={(event) => onSelectedChange(event.target.checked)}
            aria-label={`Use ${label}`}
          />
          Use suggestion
        </label>
        <span className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{suggestion.type}</Badge>
          <Badge variant="secondary">{suggestion.confidence}</Badge>
        </span>
      </div>

      <div className="mt-3">
        <PhotoSuggestionSummary suggestion={suggestion} />
      </div>
      <p className="mt-3 line-clamp-3 break-words rounded-md border border-border/70 bg-muted/30 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
        {suggestion.sourceSummary}
      </p>
    </div>
  );
}

function PhotoSuggestionSummary({
  suggestion,
}: {
  suggestion: PhotoSuggestion;
}) {
  return (
    <div className="min-w-0">
      <div className="font-medium">{photoSuggestionLabel(suggestion)}</div>
      <div className="mt-1 line-clamp-3 break-words text-xs leading-5 text-muted-foreground">
        {suggestion.reasoning}
      </div>
    </div>
  );
}

function hasAiUsableDerivative(derivativeRefs: Record<string, string>) {
  return Boolean(derivativeRefs.card ?? derivativeRefs.detail);
}
