"use client";

// Detail modal for a single agent-queue capture (MOVE-356). The queue list rows
// are clickable; opening one shows the full media gallery (tap a photo for the
// full-screen lightbox), the agent's question/summary, editable directions, a
// link to any produced items, and the same lifecycle actions the list row
// offers — just with room to breathe. Centered modal on desktop, full-screen on
// mobile, matching the item-detail modal shipped in #87.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ImageOff,
  ImagePlus,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { moveWorkspacePath } from "@/lib/move-links";

type QueueEntry = FunctionReturnType<
  typeof api.ingestionQueue.listForMove
>[number];

// Resolves card-variant display URLs for the entry's media and lays them out in
// a responsive grid. Tapping a tile opens the shared full-screen lightbox.
function QueueDetailGallery({
  householdId,
  moveId,
  mediaPhotoIds,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  mediaPhotoIds: Id<"itemPhotos">[];
}) {
  const getDisplayUrl = useAction(api.photos.getDisplayUrl);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const idKey = mediaPhotoIds.join("|");
  const ids = useMemo(
    () => (idKey ? (idKey.split("|") as Id<"itemPhotos">[]) : []),
    [idKey],
  );

  useEffect(() => {
    if (!householdId || !moveId || ids.length === 0) return;
    let cancelled = false;
    void Promise.all(
      ids.map(async (photoId) => {
        try {
          const display = await getDisplayUrl({
            householdId,
            moveId,
            photoId,
            variant: "card",
          });
          return [photoId, display.url] as const;
        } catch {
          return [photoId, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setUrls(
        entries.reduce<Record<string, string>>((acc, [photoId, url]) => {
          if (url) acc[photoId] = url;
          return acc;
        }, {}),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [getDisplayUrl, householdId, moveId, ids]);

  if (ids.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        <ImageOff className="size-4" aria-hidden="true" />
        No photos on this capture — directions only.
      </div>
    );
  }

  return (
    <>
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        aria-label="Capture media"
      >
        {ids.map((photoId, index) => {
          const url = urls[photoId];
          return (
            <button
              key={photoId}
              type="button"
              onClick={() => setLightboxIndex(index)}
              className="aspect-square overflow-hidden rounded-md border border-border bg-muted transition-opacity hover:opacity-90"
              aria-label={`View photo ${index + 1} of ${ids.length}`}
            >
              {url ? (
                // B2/edge delivery URLs are short-lived and provider-controlled,
                // so Next image optimization is intentionally bypassed.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageOff className="size-5" aria-hidden="true" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      <PhotoLightbox
        householdId={householdId}
        moveId={moveId}
        photoIds={ids}
        open={lightboxIndex !== null}
        onOpenChange={(open) => {
          if (!open) setLightboxIndex(null);
        }}
        initialIndex={lightboxIndex ?? 0}
        title="Capture media"
      />
    </>
  );
}

export function QueueEntryDetailSheet({
  householdId,
  moveId,
  entry,
  index,
  open,
  onOpenChange,
  busy,
  editable,
  onChangeStatus,
  onSaveInstructions,
  onAddImages,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  entry: QueueEntry | null;
  // 1-based position in the current list, for a human-friendly title.
  index: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  editable: boolean;
  onChangeStatus: (status: "queued" | "resolved" | "discarded") => void;
  onSaveInstructions: (text: string) => void | Promise<void>;
  onAddImages: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);

  // Re-seed the editable directions whenever a different entry opens. Adjust-
  // during-render keeps the textarea in sync without a setState-in-effect.
  const entryId = entry?._id ?? null;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (open && entryId && seededFor !== entryId) {
    setSeededFor(entryId);
    setDraft(entry?.instructions ?? "");
    setSaved(false);
  }
  if (!open && seededFor !== null) {
    setSeededFor(null);
  }

  if (!entry) return null;

  const dirty = draft.trim() !== (entry.instructions ?? "").trim();

  async function handleSave() {
    setSaved(false);
    await onSaveInstructions(draft);
    setSaved(true);
  }

  function handleTerminal(status: "queued" | "resolved" | "discarded") {
    onChangeStatus(status);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="pr-12">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {index != null ? `Capture ${index}` : "Capture"}
            {entry.claimedByAgentLabel ? (
              <Badge variant="secondary">
                <Bot className="size-3" aria-hidden="true" />
                {entry.claimedByAgentLabel}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {new Date(entry.createdAt).toLocaleString()}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4">
          <QueueDetailGallery
            householdId={householdId}
            moveId={moveId}
            mediaPhotoIds={entry.mediaPhotoIds}
          />

          {entry.agentQuestion ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              Agent asks: {entry.agentQuestion}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <label
              htmlFor="queue-detail-directions"
              className="text-sm font-medium text-foreground"
            >
              Directions
            </label>
            {editable ? (
              <Textarea
                id="queue-detail-directions"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setSaved(false);
                }}
                placeholder="Tell the agent what to do with this capture…"
                className="min-h-24"
              />
            ) : entry.instructions ? (
              <p className="text-sm leading-6">{entry.instructions}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No written directions — media only.
              </p>
            )}
          </div>

          {entry.agentSummary ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Agent result</p>
              <p className="text-sm text-muted-foreground">
                {entry.agentSummary}
                {entry.resultItemIds?.length
                  ? ` (${entry.resultItemIds.length} items proposed)`
                  : ""}
              </p>
              {entry.resultItemIds?.length && moveId ? (
                <Button
                  asChild
                  size="sm"
                  variant="link"
                  className="h-auto p-0"
                >
                  <Link
                    href={`${moveWorkspacePath(moveId, "inventory")}#inventory-records`}
                  >
                    View{" "}
                    {entry.resultItemIds.length === 1
                      ? "the produced item"
                      : `${entry.resultItemIds.length} produced items`}
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          {saved ? (
            <p
              className="text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              Directions saved.
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-row flex-wrap items-center gap-2 border-t border-border">
          {editable ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={busy || !dirty}
                onClick={() => void handleSave()}
              >
                Save directions
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={onAddImages}
              >
                <ImagePlus aria-hidden="true" />
                Add images
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => handleTerminal("discarded")}
              >
                <Trash2 aria-hidden="true" />
                Discard
              </Button>
            </>
          ) : null}

          {entry.status === "processed" ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => handleTerminal("resolved")}
              >
                <CheckCircle2 aria-hidden="true" />
                Mark resolved
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => handleTerminal("queued")}
              >
                <RotateCcw aria-hidden="true" />
                Requeue
              </Button>
            </>
          ) : null}

          {entry.status === "discarded" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => handleTerminal("queued")}
            >
              <RotateCcw aria-hidden="true" />
              Restore
            </Button>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ms-auto"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
