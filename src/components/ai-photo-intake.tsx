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
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Use</TableHead>
                  <TableHead>Suggestion</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSuggestions.map((suggestion) => (
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
                        aria-label={`Use ${suggestion.type} photo suggestion`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {suggestion.itemDraft?.name ??
                          suggestion.boxDraft?.label ??
                          suggestion.type}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {suggestion.reasoning}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{suggestion.confidence}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[320px] text-xs leading-5 text-muted-foreground">
                      {suggestion.sourceSummary}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No pending AI photo suggestions.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function hasAiUsableDerivative(derivativeRefs: Record<string, string>) {
  return Boolean(derivativeRefs.card ?? derivativeRefs.detail);
}
