"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2 } from "lucide-react";

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
  transportResourcePresetOptions,
  type TransportResourcePresetKey,
} from "@/lib/transport-presets";

export function TransportResourcesPanel({
  householdId,
  moveId,
  moveTitle,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  moveTitle?: string;
}) {
  const resourcesWithZones = useQuery(
    api.transportResources.listForMoveWithZones,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const createTransportResourceFromPreset = useMutation(
    api.transportResources.createFromPreset
  );
  const updateTransportResourceCapacityReview = useMutation(
    api.transportResources.updateCapacityReview
  );

  const [addingPreset, setAddingPreset] =
    useState<TransportResourcePresetKey | null>(null);
  const [reviewingResourceId, setReviewingResourceId] =
    useState<Id<"transportResources"> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadingResources = moveId && resourcesWithZones === undefined;

  async function handleAddResourcePreset(presetKey: TransportResourcePresetKey) {
    if (!householdId || !moveId) {
      return;
    }

    setAddingPreset(presetKey);
    setMessage(null);

    try {
      await createTransportResourceFromPreset({
        householdId,
        moveId,
        presetKey,
      });
      setMessage("Resource preset added.");
    } catch {
      setMessage("Could not add that resource preset yet.");
    } finally {
      setAddingPreset(null);
    }
  }

  async function handleCapacityReview(
    resourceId: Id<"transportResources">,
    status: "estimated" | "confirmed"
  ) {
    if (!householdId || !moveId) {
      return;
    }

    setReviewingResourceId(resourceId);
    setMessage(null);

    try {
      await updateTransportResourceCapacityReview({
        householdId,
        moveId,
        resourceId,
        status,
      });
      setMessage(
        status === "confirmed"
          ? "Resource capacity marked as confirmed."
          : "Resource capacity marked as estimated."
      );
    } catch {
      setMessage("Could not update that resource capacity review yet.");
    } finally {
      setReviewingResourceId(null);
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card id="transport-resources">
        <CardHeader>
          <CardTitle>Transport resources</CardTitle>
          <CardDescription>
            Presets create useful default zones for{" "}
            {moveTitle ?? "the selected move"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {transportResourcePresetOptions.map(([key, label, detail]) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                className="h-auto justify-start whitespace-normal p-3 text-left"
                disabled={!moveId || addingPreset !== null}
                onClick={() => void handleAddResourcePreset(key)}
              >
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {detail}
                  </span>
                </span>
              </Button>
            ))}
          </div>

          {loadingResources ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-4/5" />
            </div>
          ) : resourcesWithZones?.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {resourcesWithZones.map(({ resource, zones }) => (
                <div
                  key={resource._id}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{resource.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {resource.description ?? resource.type}
                      </p>
                    </div>
                    <Badge variant="outline">{resource.type}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {zones.map((zone) => (
                      <Badge key={zone._id} variant="secondary">
                        {zone.name}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        resource.capacityReviewStatus === "confirmed"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {capacityReviewLabel(resource.capacityReviewStatus)}
                    </Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={reviewingResourceId === resource._id}
                      onClick={() =>
                        void handleCapacityReview(resource._id, "estimated")
                      }
                    >
                      Estimated
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={reviewingResourceId === resource._id}
                      onClick={() =>
                        void handleCapacityReview(resource._id, "confirmed")
                      }
                    >
                      <CheckCircle2 aria-hidden="true" />
                      Confirmed
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {resource.rules.length
                      ? resource.rules.join(" · ")
                      : "No resource rules yet"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              Add trucks, trailers, movers, storage, sell/donate/dump/free, or
              unknown resources to start the load plan.
            </div>
          )}
          {message ? (
            <p
              className="text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card id="capacity-posture">
        <CardHeader>
          <CardTitle>Capacity posture</CardTitle>
          <CardDescription>
            Resource caps are planning limits, while move-level allowances stay
            on the move.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Trucks and trailers get weight/volume defaults. Mover, storage,
            sell, donate, dump, free, and unknown buckets can be unlimited for
            app planning.
          </p>
          <p>
            Capacity warnings become meaningful after inventory, boxes, and
            assignments land.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function capacityReviewLabel(status?: string) {
  switch (status) {
    case "estimated":
      return "Capacity estimated";
    case "confirmed":
      return "Capacity confirmed";
    default:
      return "Capacity needs review";
  }
}
