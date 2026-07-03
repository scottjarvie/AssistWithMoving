"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { DoorOpen, Plus } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
import { describeMutationError } from "@/lib/mutation-error";

type Spaces = FunctionReturnType<typeof api.moveSpaces.listForMove>;
type Space = Spaces[number];
type SpaceKind = Space["kind"];

// A per-area limit is stored on the shared capacity object and picks one of
// floor area (sq ft), weight (lb), or volume (cu ft).
type LimitType = "weight" | "volume" | "area";

const limitTypeOptions: { value: LimitType; label: string; unit: string }[] = [
  { value: "area", label: "Area (sq ft)", unit: "sq ft" },
  { value: "weight", label: "Weight (lb)", unit: "lb" },
  { value: "volume", label: "Volume (cu ft)", unit: "cu ft" },
];

function capacitySummary(space: Space): string | null {
  const area = space.capacity?.maxAreaSqFt;
  const weight = space.capacity?.maxWeightLb;
  const volume = space.capacity?.maxVolumeCuFt;
  if (typeof area === "number") return `${area} sq ft`;
  if (typeof weight === "number") return `${weight} lb`;
  if (typeof volume === "number") return `${volume} cu ft`;
  return null;
}

// Per-area inline editor for floor + capacity limit. Keyed on the space id by the
// parent list so editing one area never carries state into another.
function AreaCard({
  householdId,
  moveId,
  space,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  space: Space;
}) {
  const updateSpace = useMutation(api.moveSpaces.update);
  const [editing, setEditing] = useState(false);
  const [floorLevel, setFloorLevel] = useState(space.floorLevel ?? "");
  const [limitType, setLimitType] = useState<LimitType>(() => {
    if (typeof space.capacity?.maxAreaSqFt === "number") return "area";
    if (typeof space.capacity?.maxVolumeCuFt === "number") return "volume";
    return "weight";
  });
  const [limitValue, setLimitValue] = useState(() => {
    if (typeof space.capacity?.maxAreaSqFt === "number") {
      return String(space.capacity.maxAreaSqFt);
    }
    if (typeof space.capacity?.maxVolumeCuFt === "number") {
      return String(space.capacity.maxVolumeCuFt);
    }
    if (typeof space.capacity?.maxWeightLb === "number") {
      return String(space.capacity.maxWeightLb);
    }
    return "";
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const summary = capacitySummary(space);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const parsed = Number(limitValue);
    const hasLimit = limitValue.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
    try {
      await updateSpace({
        householdId,
        moveId,
        spaceId: space._id,
        floorLevel: floorLevel.trim() || undefined,
        capacity: {
          ...space.capacity,
          maxWeightLb:
            hasLimit && limitType === "weight" ? parsed : undefined,
          maxVolumeCuFt:
            hasLimit && limitType === "volume" ? parsed : undefined,
          maxAreaSqFt:
            hasLimit && limitType === "area" ? parsed : undefined,
        },
      });
      setEditing(false);
    } catch (error) {
      setSaveError(
        describeMutationError(error, `Couldn't save ${space.name}. Try again.`),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{space.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {space.floorLevel ? `Floor ${space.floorLevel}` : "No floor set"}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? "Close" : "Edit"}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {summary ? (
          <Badge variant="secondary">{summary}</Badge>
        ) : (
          <Badge variant="outline">No limit</Badge>
        )}
      </div>

      {editing ? (
        <div
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
            }
          }}
          className="mt-3 space-y-3 border-t border-border pt-3"
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Floor / level
            </label>
            <Input
              value={floorLevel}
              onChange={(event) => setFloorLevel(event.target.value)}
              placeholder="Main, 2nd, basement..."
              aria-label={`${space.name} floor`}
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Limit type
            </span>
            <div className="flex gap-1.5">
              {limitTypeOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={limitType === option.value ? "secondary" : "outline"}
                  onClick={() => setLimitType(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {limitType === "weight" ? "Max weight (lb)" : "Max volume (cu ft)"}
            </label>
            <Input
              type="number"
              min={0}
              value={limitValue}
              onChange={(event) => setLimitValue(event.target.value)}
              placeholder="Leave blank for no limit"
              aria-label={`${space.name} limit value`}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            Save area
          </Button>
          {saveError ? (
            <p role="status" aria-live="polite" className="text-xs text-destructive">
              {saveError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MoveAreasPanel({
  householdId,
  moveId,
  kind,
  title,
  description,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
  // originRoom for Start; destinationRoom/yardOutdoor for End.
  kind: SpaceKind;
  title: string;
  description: string;
}) {
  const spaces = useQuery(
    api.moveSpaces.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const createSpace = useMutation(api.moveSpaces.create);
  const [name, setName] = useState("");
  const [floorLevel, setFloorLevel] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // End covers both destination rooms and yard/outdoor; Start is origin rooms.
  const kinds = useMemo<SpaceKind[]>(
    () =>
      kind === "destinationRoom"
        ? ["destinationRoom", "yardOutdoor"]
        : [kind],
    [kind],
  );

  const areas = useMemo(
    () => (spaces ?? []).filter((space) => kinds.includes(space.kind)),
    [spaces, kinds],
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdId || !moveId || !name.trim()) return;
    setMessage(null);
    try {
      await createSpace({
        householdId,
        moveId,
        kind,
        name,
        floorLevel: floorLevel.trim() || undefined,
      });
      setName("");
      setFloorLevel("");
      setMessage("Area added.");
    } catch (error) {
      setMessage(
        describeMutationError(
          error,
          "Couldn't add that area. Check the name and try again.",
        ),
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DoorOpen className="size-4 text-primary" aria-hidden="true" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {spaces ? (
            <Badge variant="secondary">{areas.length} areas</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="grid gap-2 sm:grid-cols-[1fr_140px_auto]"
          onSubmit={handleCreate}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Area name"
            aria-label="New area name"
          />
          <Input
            value={floorLevel}
            onChange={(event) => setFloorLevel(event.target.value)}
            placeholder="Floor"
            aria-label="New area floor"
          />
          <Button type="submit" disabled={!moveId || !name.trim()}>
            <Plus aria-hidden="true" />
            Add area
          </Button>
        </form>
        {message ? (
          <p
            className="text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        ) : null}

        {spaces === undefined ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-md" />
            ))}
          </div>
        ) : areas.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No areas yet. Add rooms above, or add them through your connected AI
            agent.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {areas.map((space) => (
              <AreaCard
                key={space._id}
                householdId={householdId as Id<"households">}
                moveId={moveId as Id<"moves">}
                space={space}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
