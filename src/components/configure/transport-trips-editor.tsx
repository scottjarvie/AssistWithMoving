"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TripsWithSpaces = FunctionReturnType<
  typeof api.transportTrips.listForMoveWithSpaces
>;
type TripWithSpaces = TripsWithSpaces[number];
type TripSpace = TripWithSpaces["spaces"][number];

type LimitType = "area" | "weight";

function spaceLimitType(space: TripSpace): LimitType {
  return typeof space.maxAreaSqFt === "number" ? "area" : "weight";
}

function spaceLimitLabel(space: TripSpace): string {
  if (typeof space.maxAreaSqFt === "number") return `${space.maxAreaSqFt} sq ft`;
  if (typeof space.maxWeightLb === "number") return `${space.maxWeightLb} lb`;
  return "No limit";
}

// Shared editor body for a trip space's name + area-OR-weight limit. Used inline
// in the desktop table row and inside the mobile Sheet.
function SpaceLimitFields({
  name,
  setName,
  limitType,
  setLimitType,
  limitValue,
  setLimitValue,
  idPrefix,
}: {
  name: string;
  setName: (value: string) => void;
  limitType: LimitType;
  setLimitType: (value: LimitType) => void;
  limitValue: string;
  setLimitValue: (value: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Name</label>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Space name"
          aria-label={`${idPrefix} space name`}
        />
      </div>
      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          Limit type
        </span>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={limitType === "area" ? "secondary" : "outline"}
            onClick={() => setLimitType("area")}
          >
            Area (sq ft)
          </Button>
          <Button
            type="button"
            size="sm"
            variant={limitType === "weight" ? "secondary" : "outline"}
            onClick={() => setLimitType("weight")}
          >
            Weight (lb)
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          {limitType === "area" ? "Max area (sq ft)" : "Max weight (lb)"}
        </label>
        <Input
          type="number"
          min={0}
          value={limitValue}
          onChange={(event) => setLimitValue(event.target.value)}
          placeholder="Leave blank for no limit"
          aria-label={`${idPrefix} limit value`}
        />
      </div>
    </div>
  );
}

// A single trip: rename/remove + its spaces. Desktop renders a table with inline
// add; the mobile Sheet handles the same create/edit form for narrow viewports.
function TripRow({
  householdId,
  moveId,
  trip,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  trip: TripWithSpaces;
}) {
  const updateTrip = useMutation(api.transportTrips.updateTrip);
  const archiveTrip = useMutation(api.transportTrips.archiveTrip);
  const createTripSpace = useMutation(api.transportTrips.createTripSpace);
  const updateTripSpace = useMutation(api.transportTrips.updateTripSpace);
  const archiveTripSpace = useMutation(api.transportTrips.archiveTripSpace);

  const [expanded, setExpanded] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [tripName, setTripName] = useState(trip.name);

  // New-space inline draft.
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newLimitType, setNewLimitType] = useState<LimitType>("area");
  const [newLimitValue, setNewLimitValue] = useState("");

  // Mobile Sheet editor: null = closed, "new" = create, otherwise edit a space.
  const [sheetSpace, setSheetSpace] = useState<TripSpace | "new" | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [sheetLimitType, setSheetLimitType] = useState<LimitType>("area");
  const [sheetLimitValue, setSheetLimitValue] = useState("");
  const [busy, setBusy] = useState(false);

  function limitArgs(limitType: LimitType, raw: string) {
    const parsed = Number(raw);
    const hasLimit = raw.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
    return {
      maxAreaSqFt: hasLimit && limitType === "area" ? parsed : undefined,
      maxWeightLb: hasLimit && limitType === "weight" ? parsed : undefined,
      clearMaxAreaSqFt: limitType !== "area",
      clearMaxWeightLb: limitType !== "weight",
    };
  }

  async function handleRenameTrip() {
    setBusy(true);
    try {
      await updateTrip({ householdId, moveId, tripId: trip._id, name: tripName });
      setRenaming(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveTrip() {
    setBusy(true);
    try {
      await archiveTrip({ householdId, moveId, tripId: trip._id });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newSpaceName.trim()) return;
    setBusy(true);
    const { maxAreaSqFt, maxWeightLb } = limitArgs(newLimitType, newLimitValue);
    try {
      await createTripSpace({
        householdId,
        moveId,
        tripId: trip._id,
        name: newSpaceName,
        maxAreaSqFt,
        maxWeightLb,
      });
      setNewSpaceName("");
      setNewLimitValue("");
    } finally {
      setBusy(false);
    }
  }

  async function handleInlineEditLimit(space: TripSpace, limitType: LimitType) {
    setBusy(true);
    try {
      // Toggling type alone keeps any existing matching value, clears the other.
      const existing =
        limitType === "area" ? space.maxAreaSqFt : space.maxWeightLb;
      await updateTripSpace({
        householdId,
        moveId,
        spaceId: space._id,
        maxAreaSqFt:
          limitType === "area" && typeof existing === "number"
            ? existing
            : undefined,
        maxWeightLb:
          limitType === "weight" && typeof existing === "number"
            ? existing
            : undefined,
        clearMaxAreaSqFt: limitType !== "area",
        clearMaxWeightLb: limitType !== "weight",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveSpace(space: TripSpace) {
    setBusy(true);
    try {
      await archiveTripSpace({ householdId, moveId, spaceId: space._id });
    } finally {
      setBusy(false);
    }
  }

  function openSheet(space: TripSpace | "new") {
    setSheetSpace(space);
    if (space === "new") {
      setSheetName("");
      setSheetLimitType("area");
      setSheetLimitValue("");
    } else {
      setSheetName(space.name);
      setSheetLimitType(spaceLimitType(space));
      setSheetLimitValue(
        typeof space.maxAreaSqFt === "number"
          ? String(space.maxAreaSqFt)
          : typeof space.maxWeightLb === "number"
            ? String(space.maxWeightLb)
            : "",
      );
    }
  }

  async function handleSheetSave() {
    if (!sheetSpace || !sheetName.trim()) return;
    setBusy(true);
    const { maxAreaSqFt, maxWeightLb, clearMaxAreaSqFt, clearMaxWeightLb } =
      limitArgs(sheetLimitType, sheetLimitValue);
    try {
      if (sheetSpace === "new") {
        await createTripSpace({
          householdId,
          moveId,
          tripId: trip._id,
          name: sheetName,
          maxAreaSqFt,
          maxWeightLb,
        });
      } else {
        await updateTripSpace({
          householdId,
          moveId,
          spaceId: sheetSpace._id,
          name: sheetName,
          maxAreaSqFt,
          maxWeightLb,
          clearMaxAreaSqFt,
          clearMaxWeightLb,
        });
      }
      setSheetSpace(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronUp className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          )}
          {renaming ? (
            <Input
              value={tripName}
              onChange={(event) => setTripName(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              className="h-8 w-44"
              aria-label="Trip name"
            />
          ) : (
            <span className="truncate font-medium">{trip.name}</span>
          )}
          <Badge variant="outline">{trip.spaces.length} spaces</Badge>
        </button>
        <div className="flex items-center gap-1.5">
          {renaming ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void handleRenameTrip()}
              >
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTripName(trip.name);
                  setRenaming(false);
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setRenaming(true)}
            >
              Rename
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void handleArchiveTrip()}
            aria-label={`Remove trip ${trip.name}`}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-border p-3">
          {/* Desktop: table with inline editing. */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Space</TableHead>
                  <TableHead>Limit type</TableHead>
                  <TableHead>Limit</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trip.spaces.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-sm text-muted-foreground"
                    >
                      No spaces yet. Add one below.
                    </TableCell>
                  </TableRow>
                ) : (
                  trip.spaces.map((space) => {
                    const limit = spaceLimitType(space);
                    return (
                      <TableRow key={space._id}>
                        <TableCell className="font-medium">
                          {space.name}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant={limit === "area" ? "secondary" : "outline"}
                              disabled={busy}
                              onClick={() =>
                                void handleInlineEditLimit(space, "area")
                              }
                            >
                              Area
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={
                                limit === "weight" ? "secondary" : "outline"
                              }
                              disabled={busy}
                              onClick={() =>
                                void handleInlineEditLimit(space, "weight")
                              }
                            >
                              Weight
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>{spaceLimitLabel(space)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => openSheet(space)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => void handleArchiveSpace(space)}
                              aria-label={`Remove space ${space.name}`}
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            <form
              className="mt-3 grid items-end gap-2 lg:grid-cols-[1fr_auto_140px_auto]"
              onSubmit={handleAddSpace}
            >
              <Input
                value={newSpaceName}
                onChange={(event) => setNewSpaceName(event.target.value)}
                placeholder="New space name"
                aria-label="New space name"
              />
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={newLimitType === "area" ? "secondary" : "outline"}
                  onClick={() => setNewLimitType("area")}
                >
                  Area
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={newLimitType === "weight" ? "secondary" : "outline"}
                  onClick={() => setNewLimitType("weight")}
                >
                  Weight
                </Button>
              </div>
              <Input
                type="number"
                min={0}
                value={newLimitValue}
                onChange={(event) => setNewLimitValue(event.target.value)}
                placeholder={newLimitType === "area" ? "sq ft" : "lb"}
                aria-label="New space limit value"
              />
              <Button type="submit" disabled={busy || !newSpaceName.trim()}>
                <Plus aria-hidden="true" />
                Add space
              </Button>
            </form>
          </div>

          {/* Mobile: chips + Sheet editor. */}
          <div className="space-y-2 md:hidden">
            {trip.spaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No spaces yet.
              </p>
            ) : (
              trip.spaces.map((space) => (
                <button
                  key={space._id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border p-3 text-left"
                  onClick={() => openSheet(space)}
                >
                  <span className="truncate font-medium">{space.name}</span>
                  <Badge variant="secondary">{spaceLimitLabel(space)}</Badge>
                </button>
              ))
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => openSheet("new")}
            >
              <Plus aria-hidden="true" />
              Add space
            </Button>
          </div>
        </div>
      ) : null}

      <Sheet
        open={sheetSpace !== null}
        onOpenChange={(open) => {
          if (!open) setSheetSpace(null);
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {sheetSpace === "new" ? "Add space" : "Edit space"}
            </SheetTitle>
            <SheetDescription>
              Each space is limited by area or weight.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <SpaceLimitFields
              name={sheetName}
              setName={setSheetName}
              limitType={sheetLimitType}
              setLimitType={setSheetLimitType}
              limitValue={sheetLimitValue}
              setLimitValue={setSheetLimitValue}
              idPrefix="sheet"
            />
          </div>
          <SheetFooter>
            <Button
              type="button"
              disabled={busy || !sheetName.trim()}
              onClick={() => void handleSheetSave()}
            >
              Save space
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function TransportTripsEditor({
  householdId,
  moveId,
  resourceId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  resourceId: Id<"transportResources"> | null;
}) {
  const tripsWithSpaces = useQuery(
    api.transportTrips.listForMoveWithSpaces,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const createTrip = useMutation(api.transportTrips.createTrip);
  const [newTripName, setNewTripName] = useState("");
  const [adding, setAdding] = useState(false);

  const trips = useMemo(
    () =>
      (tripsWithSpaces ?? [])
        .filter((trip) => trip.resourceId === resourceId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [tripsWithSpaces, resourceId],
  );

  async function handleAddTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId || !moveId || !resourceId || !newTripName.trim()) return;
    setAdding(true);
    try {
      await createTrip({
        householdId,
        moveId,
        resourceId,
        name: newTripName,
      });
      setNewTripName("");
    } finally {
      setAdding(false);
    }
  }

  if (!resourceId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a method to manage its trips.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <form
        className="grid gap-2 sm:grid-cols-[1fr_auto]"
        onSubmit={handleAddTrip}
      >
        <Input
          value={newTripName}
          onChange={(event) => setNewTripName(event.target.value)}
          placeholder="New trip name (e.g. Load 1)"
          aria-label="New trip name"
        />
        <Button type="submit" disabled={adding || !newTripName.trim()}>
          <Plus aria-hidden="true" />
          Add trip
        </Button>
      </form>

      {tripsWithSpaces === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-16 w-4/5 rounded-md" />
        </div>
      ) : trips.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No trips yet. Add one above, or create them through your connected AI
          agent.
        </div>
      ) : (
        <div className="space-y-2">
          {trips.map((trip) => (
            <TripRow
              key={trip._id}
              householdId={householdId as Id<"households">}
              moveId={moveId as Id<"moves">}
              trip={trip}
            />
          ))}
        </div>
      )}
    </div>
  );
}
