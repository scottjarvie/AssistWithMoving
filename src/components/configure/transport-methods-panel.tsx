"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Plus, Truck } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { TransportTripsEditor } from "@/components/configure/transport-trips-editor";
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
import { cn } from "@/lib/utils";
import {
  transportResourcePresetOptions,
  type TransportResourcePresetKey,
} from "@/lib/transport-presets";

type ResourcesWithZones = FunctionReturnType<
  typeof api.transportResources.listForMoveWithZones
>;
type ResourceEntry = ResourcesWithZones[number];

function capacityChips(resource: ResourceEntry["resource"]): string[] {
  const chips: string[] = [];
  const capacity = resource.capacity;
  if (capacity?.weightIsUnlimited) {
    chips.push("Weight unlimited");
  } else if (typeof capacity?.maxWeightLb === "number") {
    chips.push(`${capacity.maxWeightLb} lb`);
  }
  if (capacity?.volumeIsUnlimited) {
    chips.push("Volume unlimited");
  } else if (typeof capacity?.maxVolumeCuFt === "number") {
    chips.push(`${capacity.maxVolumeCuFt} cu ft`);
  }
  return chips;
}

export function TransportMethodsPanel({
  householdId,
  moveId,
  moveType,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  moveType?: string;
}) {
  const resourcesWithZones = useQuery(
    api.transportResources.listForMoveWithZones,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const createFromPreset = useMutation(api.transportResources.createFromPreset);

  const [selectedResourceId, setSelectedResourceId] =
    useState<Id<"transportResources"> | null>(null);
  const [addingPreset, setAddingPreset] =
    useState<TransportResourcePresetKey | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Military presets only surface for moves using the Military PCS template.
  const presetOptions = transportResourcePresetOptions.filter(
    ([key]) => key !== "militaryMovers" || moveType === "pcs",
  );

  const resources = useMemo(
    () => resourcesWithZones ?? [],
    [resourcesWithZones],
  );

  // Resolve the active method during render (no setState-in-effect): the user's
  // explicit pick wins, else the first method.
  const activeResourceId = useMemo<Id<"transportResources"> | null>(() => {
    if (
      selectedResourceId &&
      resources.some((entry) => entry.resource._id === selectedResourceId)
    ) {
      return selectedResourceId;
    }
    return resources[0]?.resource._id ?? null;
  }, [resources, selectedResourceId]);

  const activeEntry = resources.find(
    (entry) => entry.resource._id === activeResourceId,
  );

  async function handleAddPreset(presetKey: TransportResourcePresetKey) {
    if (!householdId || !moveId) return;
    setAddingPreset(presetKey);
    setMessage(null);
    try {
      await createFromPreset({ householdId, moveId, presetKey });
      setShowPresets(false);
      setMessage("Method added.");
    } catch {
      setMessage("Could not add that method yet.");
    } finally {
      setAddingPreset(null);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="size-4 text-primary" aria-hidden="true" />
                Methods
              </CardTitle>
              <CardDescription>
                Trucks, movers, storage, and disposition resources.
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant={showPresets ? "secondary" : "outline"}
              disabled={!moveId || addingPreset !== null}
              onClick={() => setShowPresets((value) => !value)}
            >
              <Plus aria-hidden="true" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showPresets ? (
            <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-3">
              {presetOptions.map(([key, label, detail]) => (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start whitespace-normal p-3 text-left"
                  disabled={!moveId || addingPreset !== null}
                  onClick={() => void handleAddPreset(key)}
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
          ) : null}

          {resourcesWithZones === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-4/5 rounded-md" />
            </div>
          ) : resources.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No methods yet. Add one above, or create them through your
              connected AI agent.
            </div>
          ) : (
            <div role="list" className="space-y-2">
              {resources.map((entry) => {
                const isActive = entry.resource._id === activeResourceId;
                const chips = capacityChips(entry.resource);
                return (
                  <div key={entry.resource._id} role="listitem">
                  <button
                    type="button"
                    aria-pressed={isActive}
                    className={cn(
                      "w-full rounded-md border p-3 text-left transition-colors",
                      isActive
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40",
                    )}
                    onClick={() => setSelectedResourceId(entry.resource._id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {entry.resource.name}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {entry.resource.description ?? entry.resource.type}
                        </span>
                      </span>
                      <Badge variant="outline">{entry.resource.type}</Badge>
                    </div>
                    {chips.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {chips.map((chip) => (
                          <Badge key={chip} variant="secondary">
                            {chip}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </button>
                  </div>
                );
              })}
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {activeEntry ? activeEntry.resource.name : "Trips"}
          </CardTitle>
          <CardDescription>
            {activeEntry
              ? "Trips for this method, each with its own spaces and area or weight limits."
              : "Select a method to manage its trips and spaces."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeEntry ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Method capacity:
                </span>
                {capacityChips(activeEntry.resource).length ? (
                  capacityChips(activeEntry.resource).map((chip) => (
                    <Badge key={chip} variant="outline">
                      {chip}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline">Not set</Badge>
                )}
              </div>
              <TransportTripsEditor
                householdId={householdId}
                moveId={moveId}
                resourceId={activeEntry.resource._id}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add a method on the left to start planning trips.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
