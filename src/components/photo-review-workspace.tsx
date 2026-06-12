"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Camera,
  Download,
  ImageOff,
  Images,
  ShieldCheck,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
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
import {
  filterPhotosForReview,
  photoReviewFilters,
  type PhotoReviewFilterKey,
} from "@/lib/photo-review-filters";

type PhotoReviewWorkspaceProps = {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
};

type DisplayUrlState = Record<string, string>;

type PhotoPrivacyLevel = Doc<"itemPhotos">["privacyLevel"];
type PhotoVisibilityScope = Doc<"itemPhotos">["visibilityScope"];
type ReviewPhoto = Pick<
  Doc<"itemPhotos">,
  | "_id"
  | "aiProcessed"
  | "caption"
  | "confidence"
  | "derivativeStatus"
  | "height"
  | "mimeType"
  | "photoType"
  | "privacyLevel"
  | "room"
  | "source"
  | "sizeBytes"
  | "updatedAt"
  | "verificationStatus"
  | "visibilityScope"
  | "width"
>;

const privacyOptions = [
  ["normal", "Normal"],
  ["moverVisible", "Mover-visible"],
  ["reportVisible", "Report-visible"],
  ["claimOnly", "Claim-only"],
  ["sensitive", "Sensitive"],
  ["hiddenFromGuests", "Hidden from guests"],
  ["private", "Private"],
] as const satisfies ReadonlyArray<readonly [PhotoPrivacyLevel, string]>;

const visibilityOptions = [
  ["moveCollaborators", "Move collaborators"],
  ["household", "Household"],
  ["documentationScoped", "Documentation scoped"],
  ["private", "Private"],
] as const satisfies ReadonlyArray<readonly [PhotoVisibilityScope, string]>;

export function PhotoReviewWorkspace({
  householdId,
  moveId,
}: PhotoReviewWorkspaceProps) {
  const [filter, setFilter] = useState<PhotoReviewFilterKey>("all");
  const photos = useQuery(
    api.photos.listForMove,
    householdId && moveId ? { householdId, moveId, limit: 120 } : "skip",
  );
  const summary = useQuery(
    api.photos.evidenceSummary,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const getDisplayUrl = useAction(api.photos.getDisplayUrl);
  const getOriginalDownloadUrl = useAction(api.photos.getOriginalDownloadUrl);
  const updateEvidence = useMutation(api.photos.updateEvidence);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] =
    useState<Id<"itemPhotos"> | null>(null);
  const filteredPhotos = useMemo(() => {
    return filterPhotosForReview(photos ?? [], filter);
  }, [filter, photos]);
  const activeFilter = photoReviewFilters.find((entry) => entry.key === filter);
  const filterCounts = useMemo(() => {
    const sourcePhotos = photos ?? [];
    return photoReviewFilters.reduce<Record<PhotoReviewFilterKey, number>>(
      (counts, entry) => {
        counts[entry.key] = filterPhotosForReview(
          sourcePhotos,
          entry.key,
        ).length;
        return counts;
      },
      {
        all: 0,
        review: 0,
        unassigned: 0,
        claimEvidence: 0,
        serialNumber: 0,
        condition: 0,
        roomOrBox: 0,
        aiPending: 0,
        sensitive: 0,
        derivatives: 0,
      },
    );
  }, [photos]);
  const visiblePhotos = useMemo(
    () => filteredPhotos.slice(0, 24),
    [filteredPhotos],
  );
  const selectedPhoto =
    visiblePhotos.find((photo) => photo._id === selectedPhotoId) ??
    visiblePhotos[0] ??
    null;
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
      }),
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
        }, {}),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [getDisplayUrl, householdId, moveId, photoKey, visiblePhotos]);

  async function updatePhotoPrivacy(
    photo: ReviewPhoto,
    patch:
      | { privacyLevel: PhotoPrivacyLevel }
      | { visibilityScope: PhotoVisibilityScope },
  ) {
    if (!householdId || !moveId) {
      return;
    }
    setPhotoMessage(null);
    try {
      await updateEvidence({
        householdId,
        moveId,
        photoId: photo._id,
        ...patch,
      });
      setPhotoMessage("Photo privacy updated.");
    } catch {
      setPhotoMessage("Could not update photo privacy.");
    }
  }

  async function downloadOriginal(photo: ReviewPhoto) {
    if (!householdId || !moveId) {
      return;
    }
    setPhotoMessage(null);
    try {
      const download = await getOriginalDownloadUrl({
        householdId,
        moveId,
        photoId: photo._id,
      });
      window.open(download.url, "_blank", "noopener,noreferrer");
      setPhotoMessage("Original download URL created and audited.");
    } catch {
      setPhotoMessage(
        "Original download is not available for this role or scope.",
      );
    }
  }

  return (
    <section id="photos">
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
            <EvidenceMetric
              label="Unassigned"
              value={summary?.unassignedCount}
            />
            <EvidenceMetric
              label="Needs review"
              value={summary?.needsReviewCount}
            />
            <EvidenceMetric
              label="High-value gaps"
              value={summary?.highValueWithoutPhotoCount}
            />
          </div>

          <div className="space-y-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
              {photoReviewFilters.map(({ key, label }) => {
                const active = filter === key;
                const count = filterCounts[key];

                return (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    className="h-10 shrink-0 gap-2"
                    variant={active ? "default" : "outline"}
                    aria-pressed={active}
                    aria-label={`${label}: ${formatPhotoCount(count)}`}
                    onClick={() => setFilter(key)}
                  >
                    <span>{label}</span>
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
              {activeFilter?.description}
            </p>
          </div>
          {photoMessage ? (
            <p className="text-xs text-muted-foreground">{photoMessage}</p>
          ) : null}

          {photos === undefined ? (
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="aspect-square rounded-md" />
              ))}
            </div>
          ) : filteredPhotos.length ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
                  {visiblePhotos.map((photo) => {
                    const url = displayUrls[photo._id];
                    const photoLabel = getPhotoLabel(photo);
                    const selected = selectedPhoto?._id === photo._id;

                    return (
                      <button
                        key={photo._id}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`Review ${photoLabel}`}
                        className={`overflow-hidden rounded-md border bg-card text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          selected
                            ? "border-primary shadow-sm"
                            : "border-border hover:bg-muted/40"
                        }`}
                        onClick={() => setSelectedPhotoId(photo._id)}
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
                            {photoLabel}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {filteredPhotos.length > visiblePhotos.length ? (
                  <p className="text-xs text-muted-foreground">
                    Showing 24 of {filteredPhotos.length} matching photos.
                  </p>
                ) : null}
              </div>

              <PhotoReviewInspector
                photo={selectedPhoto}
                displayUrl={
                  selectedPhoto ? displayUrls[selectedPhoto._id] : null
                }
                onDownloadOriginal={downloadOriginal}
                onPrivacyChange={updatePhotoPrivacy}
              />
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              No {activeFilter?.emptyLabel ?? "photos"} match this review
              filter.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function PhotoReviewInspector({
  photo,
  displayUrl,
  onDownloadOriginal,
  onPrivacyChange,
}: {
  photo: ReviewPhoto | null;
  displayUrl?: string | null;
  onDownloadOriginal: (photo: ReviewPhoto) => Promise<void>;
  onPrivacyChange: (
    photo: ReviewPhoto,
    patch:
      | { privacyLevel: PhotoPrivacyLevel }
      | { visibilityScope: PhotoVisibilityScope },
  ) => Promise<void>;
}) {
  if (!photo) {
    return (
      <aside className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        Select a photo to review privacy, visibility, and original download
        access.
      </aside>
    );
  }

  const photoLabel = getPhotoLabel(photo);

  return (
    <aside className="rounded-md border border-border p-3 xl:sticky xl:top-4 xl:self-start">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Selected photo</h3>
          <p className="mt-1 max-w-[28rem] truncate text-xs text-muted-foreground">
            {photoLabel}
          </p>
        </div>
        <Badge
          variant={
            photo.verificationStatus === "needsReview" ? "secondary" : "outline"
          }
        >
          {photo.verificationStatus}
        </Badge>
      </div>

      <div className="mt-3 aspect-video overflow-hidden rounded-md bg-muted">
        {displayUrl ? (
          // Vercel Image Optimization is intentionally bypassed;
          // photo delivery URLs are short-lived and provider-owned.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt={photo.caption ?? `${photo.photoType} photo`}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-5" aria-hidden="true" />
          </div>
        )}
      </div>

      <dl className="mt-3 grid gap-2 text-xs">
        <PhotoDetail label="Type" value={photo.photoType} />
        <PhotoDetail label="Room" value={photo.room ?? "Unassigned"} />
        <PhotoDetail label="Source" value={photo.source} />
        <PhotoDetail
          label="Processing"
          value={photo.aiProcessed ? "AI processed" : "Awaiting AI review"}
        />
        <PhotoDetail
          label="Dimensions"
          value={
            photo.width && photo.height
              ? `${photo.width} x ${photo.height}`
              : "Unknown"
          }
        />
        <PhotoDetail label="Size" value={formatBytes(photo.sizeBytes)} />
        <PhotoDetail label="Confidence" value={photo.confidence} />
        <PhotoDetail
          label="Web versions"
          value={photo.derivativeStatus ?? "queued"}
        />
      </dl>

      <div className="mt-3 grid gap-2">
        <label className="grid gap-1 text-xs font-medium">
          Privacy
          <select
            className="h-9 rounded-md border border-input bg-background px-2 font-normal"
            value={photo.privacyLevel}
            aria-label={`Privacy level for ${photoLabel}`}
            onChange={(event) =>
              void onPrivacyChange(photo, {
                privacyLevel: event.target.value as PhotoPrivacyLevel,
              })
            }
          >
            {privacyOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Visibility
          <select
            className="h-9 rounded-md border border-input bg-background px-2 font-normal"
            value={photo.visibilityScope}
            aria-label={`Visibility scope for ${photoLabel}`}
            onChange={(event) =>
              void onPrivacyChange(photo, {
                visibilityScope: event.target.value as PhotoVisibilityScope,
              })
            }
          >
            {visibilityOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => void onDownloadOriginal(photo)}
        >
          <Download aria-hidden="true" />
          Original
        </Button>
      </div>
    </aside>
  );
}

function PhotoDetail({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md bg-muted/40 px-2 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[12rem] truncate text-right font-medium">
        {value || "Unknown"}
      </dd>
    </div>
  );
}

function getPhotoLabel(
  photo: Pick<ReviewPhoto, "_id" | "caption" | "photoType" | "room">,
) {
  return photo.caption ?? photo.room ?? `${photo.photoType} photo`;
}

function formatPhotoCount(count: number) {
  return `${count} ${count === 1 ? "photo" : "photos"}`;
}

function formatBytes(value?: number) {
  if (!value || value <= 0) {
    return "Unknown";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function PhotoRoomSweepPanel({
  householdId,
  moveId,
}: PhotoReviewWorkspaceProps) {
  const [room, setRoom] = useState("");

  return (
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
          aria-label="Room or area"
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
  );
}

export function PhotoEvidenceGapsPanel({
  householdId,
  moveId,
}: PhotoReviewWorkspaceProps) {
  const summary = useQuery(
    api.photos.evidenceSummary,
    householdId && moveId ? { householdId, moveId } : "skip",
  );

  return (
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
                  {gap.room ? (
                    <Badge variant="outline">{gap.room}</Badge>
                  ) : null}
                  {gap.highValue ? (
                    <Badge variant="secondary">value</Badge>
                  ) : null}
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
