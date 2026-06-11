"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Camera, DoorOpen, Plus } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";
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
import { Textarea } from "@/components/ui/textarea";

type Spaces = FunctionReturnType<typeof api.moveSpaces.listForMove>;
type Space = Spaces[number];
type SpaceKind = Space["kind"];

const kindLabels: Record<SpaceKind, string> = {
  originRoom: "Origin room",
  destinationRoom: "Destination room",
  yardOutdoor: "Yard/outdoor",
  storage: "Storage",
  transportResource: "Transport resource",
  transportZone: "Transport zone",
  custom: "Custom",
};

const kindOrder: SpaceKind[] = [
  "originRoom",
  "destinationRoom",
  "yardOutdoor",
  "storage",
  "transportResource",
  "transportZone",
  "custom",
];

export function SpacesWorkspacePage() {
  const { householdId, moveId } = useMoveWorkspace();
  const spaces = useQuery(
    api.moveSpaces.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip",
  );
  const createSpace = useMutation(api.moveSpaces.create);
  const [kind, setKind] = useState<SpaceKind>("originRoom");
  const [name, setName] = useState("");
  const [floorLevel, setFloorLevel] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<SpaceKind, Space[]>();
    for (const space of spaces ?? []) {
      map.set(space.kind, [...(map.get(space.kind) ?? []), space]);
    }
    return kindOrder
      .map((entry) => ({ kind: entry, spaces: map.get(entry) ?? [] }))
      .filter((entry) => entry.spaces.length);
  }, [spaces]);

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
        floorLevel: floorLevel || undefined,
        notes: notes || undefined,
      });
      setName("");
      setFloorLevel("");
      setNotes("");
      setMessage("Space added.");
    } catch {
      setMessage("Could not add that space yet.");
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Spaces"
        description="Rooms, destination rooms, yards, storage areas, and transport zones that inventory and photos can target."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-4 text-primary" aria-hidden="true" />
            Add space
          </CardTitle>
          <CardDescription>
            Spaces give AI and Layout Studio durable targets instead of loose room
            text.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 lg:grid-cols-[180px_1fr_160px_1.2fr_auto]" onSubmit={handleCreate}>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={kind}
              aria-label="Space kind"
              onChange={(event) => setKind(event.target.value as SpaceKind)}
            >
              {kindOrder.map((entry) => (
                <option key={entry} value={entry}>
                  {kindLabels[entry]}
                </option>
              ))}
            </select>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              aria-label="Space name"
            />
            <Input
              value={floorLevel}
              onChange={(event) => setFloorLevel(event.target.value)}
              placeholder="Floor"
              aria-label="Floor or level"
            />
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notes"
              aria-label="Space notes"
              rows={1}
            />
            <Button type="submit" disabled={!name.trim()}>
              Add
            </Button>
          </form>
          {message ? (
            <p className="mt-3 text-sm text-muted-foreground">{message}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DoorOpen className="size-4 text-primary" aria-hidden="true" />
                Move spaces
              </CardTitle>
              <CardDescription>
                These records can be used by inventory, photos, transport
                planning, selling context, and Layout Studio.
              </CardDescription>
            </div>
            {spaces ? (
              <Badge variant="secondary">{spaces.length} spaces</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {spaces === undefined ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-20 rounded-md" />
              ))}
            </div>
          ) : spaces.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No spaces yet. Add origin and destination rooms first; transport
              resources/zones can be linked as the workflow matures.
            </div>
          ) : (
            grouped.map((group) => (
              <section key={group.kind} className="space-y-2">
                <h3 className="text-sm font-medium">{kindLabels[group.kind]}</h3>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {group.spaces.map((space) => (
                    <div key={space._id} className="rounded-md border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{space.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[space.floorLevel, space.notes].filter(Boolean).join(" - ") ||
                              "No details yet"}
                          </p>
                        </div>
                        <Badge variant="outline">{space.status}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant={space.photoCount ? "secondary" : "outline"}>
                          <Camera className="mr-1 size-3" aria-hidden="true" />
                          {space.photoCount} photos
                        </Badge>
                        {space.transportResourceId ? (
                          <Badge variant="outline">resource linked</Badge>
                        ) : null}
                        {space.transportZoneId ? (
                          <Badge variant="outline">zone linked</Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
