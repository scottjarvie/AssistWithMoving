"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { AlertTriangle, Camera, ImageOff, Images, ShieldCheck } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PhotoUploadControl } from "@/components/photo-upload-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type PhotoReviewWorkspaceProps = {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
};

type ReviewFilter = "all" | "review" | "unassigned" | "sensitive" | "derivatives";

type DisplayUrlState = Record<string, string>;

const reviewFilters = [
  ["all", "All"],
  ["review", "Review"],
  ["unassigned", "Unassigned"],
  ["sensitive", "Sensitive"],
  ["derivatives", "Derivative issues"],
] as const satisfies ReadonlyArray<readonly [ReviewFilter, string]>;

export function PhotoReviewWorkspace({
  householdId,
  moveId,
}: PhotoReviewWorkspaceProps) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [room, setRoom] = useState("");
  const photos = useQuery(
    api.photos.listForMove,
    householdId && moveId ? { householdId, moveId, limit: 120 } : "skip"
  );
  const summary = useQuery(
    api.photos.evidenceSummary,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const getDisplayUrl = useAction(api.photos.getDisplayUrl);
  const filteredPhotos = useMemo(() => {
    const records = photos ?? [];
    switch (filter) {
      case "review":
        return records.filter((photo) => photo.verificationStatus === "needsReview");
      case "unassigned":
        return records.filter((photo) => !photo.itemId && !photo.boxId && !photo.room);
      case "sensitive":
        return records.filter((photo) => photo.privacyLevel !== "normal");
      case "derivatives":
        return records.filter(
          (photo) =>
            photo.derivativeStatus === "pending" ||
            photo.derivativeStatus === "failed"
        );
      default:
        return records;
    }
  }, [filter, photos]);
  const visiblePhotos = useMemo(() => filteredPhotos.slice(0, 24), [filteredPhotos]);
  const photoKey = visiblePhotos.map((photo) => photo._id).join("|");
  const [displayUrls, setDisplayUrls] = useState<DisplayUrlState>({});

  useEffect(() => {
    if (!householdId || !moveId || visiblePhotos.length === 0) {
      return;
    }

    let cancelled = false;
    void Promise.all(
      visiblePhotos.map(async (photo) => {
        try {
          const display = await getDisplayUrl({
            householdId,
            moveId,
            photoId: photo._id,
            variant: "card",
          });
          return [photo._id, display.url] as const;
        } catch {
          return [photo._id, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      setDisplayUrls(
        entries.reduce<DisplayUrlState>((acc, [photoId, url]) => {
          if (url) {
            acc[photoId] = url;
          }
          return acc;
        }, {})
      );
    });

    return () => {
      cancelled = true;
    };
  }, [getDisplayUrl, householdId, moveId, photoKey, visiblePhotos]);

  return (
    <section id="photos" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Images className="size-4 text-primary" aria-hidden="true" />
                Photo evidence
              </CardTitle>
              <CardDescription>
                Review item, box, room, and claims photos for the selected move.
              </CardDescription>
            </div>
            <Badge variant="secondary">
              <ShieldCheck aria-hidden="true" />
              controlled URLs
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <EvidenceMetric label="Photos" value={summary?.photoCount} />
            <EvidenceMetric label="Unassigned" value={summary?.unassignedCount} />
            <EvidenceMetric label="Needs review" value={summary?.needsReviewCount} />
            <EvidenceMetric
              label="High-value gaps"
              value={summary?.highValueWithoutPhotoCount}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {reviewFilters.map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => setFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>

          {photos === undefined ? (
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="aspect-square rounded-md" />
              ))}
            </div>
          ) : filteredPhotos.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visiblePhotos.map((photo) => {
                const url = displayUrls[photo._id];
                return (
                  <div
                    key={photo._id}
                    className="overflow-hidden rounded-md border border-border bg-card"
                  >
                    <div className="aspect-square bg-muted">
                      {url ? (
                        // Vercel Image Optimization is intentionally bypassed;
                        // photo delivery URLs are short-lived and provider-owned.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt={photo.caption ?? `${photo.photoType} photo`}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                          <ImageOff className="size-5" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 p-2 text-xs">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{photo.photoType}</Badge>
                        <Badge
                          variant={
                            photo.verificationStatus === "needsReview"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {photo.verificationStatus}
                        </Badge>
                      </div>
                      <p className="truncate text-muted-foreground">
                        {photo.caption ?? photo.room ?? "No caption"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              No photos match this review filter.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="size-4 text-primary" aria-hidden="true" />
              Room sweep
            </CardTitle>
            <CardDescription>
              Add room-level photos before individual items are identified.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              placeholder="Room or area"
              disabled={!householdId || !moveId}
            />
            <PhotoUploadControl
              householdId={householdId}
              moveId={moveId}
              room={room || undefined}
              label="Room photo"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-primary" aria-hidden="true" />
              Evidence gaps
            </CardTitle>
            <CardDescription>
              High-value, sensitive, irreplaceable, or personal-transport items
              without photos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary === undefined ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-5/6" />
              </div>
            ) : summary.evidenceGaps.length ? (
              <div className="space-y-2">
                {summary.evidenceGaps.map((gap) => (
                  <div
                    key={gap.itemId}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div className="font-medium">{gap.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                      {gap.room ? <Badge variant="outline">{gap.room}</Badge> : null}
                      {gap.highValue ? <Badge variant="secondary">value</Badge> : null}
                      {gap.requiresPersonalTransport ? (
                        <Badge variant="secondary">personal</Badge>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No high-priority photo gaps found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function EvidenceMetric({
  label,
  value,
}: {
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">
        {value ?? "..."}
      </div>
    </div>
  );
}
