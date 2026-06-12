"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Plus } from "lucide-react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHashTab } from "@/components/use-hash-tab";
import {
  transportResourcePresetOptions,
  type TransportResourcePresetKey,
} from "@/lib/transport-presets";

type TransportResourceTask = "resources" | "add" | "capacity";

const transportResourceTaskHashes = {
  "#add-transport-resource": "add",
  "#capacity-posture": "capacity",
  "#transport-resource-presets": "add",
  "#transport-resources": "resources",
} as const satisfies Partial<Record<string, TransportResourceTask>>;

export function TransportResourcesPanel({
  householdId,
  moveId,
  moveTitle,
  moveType,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  moveTitle?: string;
  moveType?: string;
}) {
  // Military presets only surface for moves using the Military PCS template.
  const presetOptions = transportResourcePresetOptions.filter(
    ([key]) => key !== "militaryMovers" || moveType === "pcs"
  );
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
  const [activeTask, setActiveTask] = useHashTab<TransportResourceTask>(
    "resources",
    transportResourceTaskHashes
  );

  const loadingResources = moveId && resourcesWithZones === undefined;
  const resourceCount = resourcesWithZones?.length ?? 0;

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
      setActiveTask("resources");
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
    <Card id="transport-resources">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Transport resources</CardTitle>
            <CardDescription>
              Trucks, movers, storage, and disposition resources for{" "}
              {moveTitle ?? "the selected move"}.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{resourceCount} resources</Badge>
            <Button
              type="button"
              size="sm"
              variant={activeTask === "add" ? "secondary" : "outline"}
              disabled={!moveId || addingPreset !== null}
              onClick={() => setActiveTask("add")}
            >
              <Plus aria-hidden="true" />
              Add resource
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTask} onValueChange={setActiveTask} className="gap-4">
          <div className="overflow-x-auto pb-1">
            <TabsList
              className="min-w-max"
              aria-label="Transport resource tasks"
            >
              <TabsTrigger value="resources">Resources</TabsTrigger>
              <TabsTrigger value="add">Add</TabsTrigger>
              <TabsTrigger value="capacity">Capacity</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="resources" id="transport-resource-list">
            {loadingResources ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-4/5" />
              </div>
            ) : resourcesWithZones?.length ? (
              <div
                role="list"
                aria-label="Transport resource cards"
                className="grid gap-3 xl:grid-cols-2"
              >
                {resourcesWithZones.map(({ resource, zones }) => (
                  <div
                    key={resource._id}
                    role="listitem"
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
                No transport resources yet. Open Add to create trucks, trailers,
                movers, storage, sell/donate/dump/free, or unknown planning
                buckets.
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="add"
            id="add-transport-resource"
            className="space-y-3"
          >
            <div
              id="transport-resource-presets"
              className="rounded-md border border-border bg-muted/20 p-3"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Add from preset</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Presets create useful default zones without making you build
                    each vehicle or destination bucket by hand.
                  </p>
                </div>
                <Badge variant="secondary">{presetOptions.length} choices</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {presetOptions.map(([key, label, detail]) => (
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
            </div>
          </TabsContent>

          <TabsContent value="capacity" id="capacity-posture">
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Capacity posture</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Review capacity assumptions separately from the resource list.
                  </p>
                </div>
                <Badge variant="outline">
                  {resourceCount} resources to review
                </Badge>
              </div>
              <div
                id="capacity-posture-details"
                className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2"
              >
                <p>
                  Trucks and trailers get weight/volume defaults. Mover, storage,
                  sell, donate, dump, free, and unknown buckets can be unlimited
                  for app planning.
                </p>
                <p>
                  Capacity warnings become meaningful after inventory, boxes, and
                  assignments land.
                </p>
              </div>
              {resourcesWithZones?.length ? (
                <div
                  role="list"
                  aria-label="Transport capacity review"
                  className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
                >
                  {resourcesWithZones.map(({ resource }) => (
                    <div
                      key={resource._id}
                      role="listitem"
                      className="rounded-md border border-border bg-background p-3"
                    >
                      <p className="text-sm font-medium">{resource.name}</p>
                      <Badge
                        className="mt-2"
                        variant={
                          resource.capacityReviewStatus === "confirmed"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {capacityReviewLabel(resource.capacityReviewStatus)}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>

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
