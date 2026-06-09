"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  ClipboardCheck,
  DoorOpen,
  Flag,
  PackagePlus,
  ShieldAlert,
} from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { itemDispositionOptions } from "@/lib/inventory-options";
import type { InventoryItem } from "@/lib/inventory-types";

const defaultRooms = [
  "Entry",
  "Living room",
  "Kitchen",
  "Dining room",
  "Primary bedroom",
  "Bedroom",
  "Office",
  "Garage",
  "Storage",
  "Basement",
  "Patio",
];

type ItemDisposition = (typeof itemDispositionOptions)[number];

type RoomSummary = {
  room: string;
  total: number;
  needsReview: number;
  highValue: number;
  unboxed: number;
};

export function RoomWalkIntake({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const items = useQuery(
    api.items.listForMoveWithSignals,
    householdId && moveId ? { householdId, moveId } : "skip"
  ) as InventoryItem[] | undefined;
  const people = useQuery(
    api.movePeople.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const createItem = useMutation(api.items.create);

  const [activeRoom, setActiveRoom] = useState("Garage");
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [disposition, setDisposition] = useState<ItemDisposition>("take");
  const [ownerPersonId, setOwnerPersonId] = useState<Id<"movePeople"> | "">("");
  const [notes, setNotes] = useState("");
  const [highValue, setHighValue] = useState(false);
  const [personalTransport, setPersonalTransport] = useState(false);
  const [firstNight, setFirstNight] = useState(false);
  const [needsEvidence, setNeedsEvidence] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const roomSummaries = useMemo(() => summarizeRooms(items ?? []), [items]);
  const roomOptions = useMemo(() => {
    const rooms = new Set(defaultRooms);
    for (const summary of roomSummaries) {
      rooms.add(summary.room);
    }
    return Array.from(rooms).sort((left, right) => left.localeCompare(right));
  }, [roomSummaries]);
  const activeSummary = roomSummaries.find((summary) => summary.room === activeRoom);
  const recentRoomItems = useMemo(
    () =>
      (items ?? [])
        .filter((item) => (item.room || "Unassigned") === activeRoom)
        .slice(0, 8),
    [activeRoom, items]
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const room = activeRoom.trim();
    const name = itemName.trim();
    if (!householdId || !moveId || !room || !name) return;

    setCreating(true);
    setMessage(null);
    try {
      const planningDefaultKeys = [
        firstNight ? "firstNight" : null,
        personalTransport ? "doNotLetMoversTouch" : null,
      ].filter((key): key is "firstNight" | "doNotLetMoversTouch" => Boolean(key));
      const reviewFlags = [
        "roomWalk",
        needsEvidence ? "evidenceNeeded" : null,
        highValue ? "highValueReview" : null,
      ].filter((flag): flag is string => Boolean(flag));
      await createItem({
        householdId,
        moveId,
        name,
        room,
        category: category || undefined,
        disposition,
        ownerPersonId: ownerPersonId || undefined,
        description: notes || undefined,
        highValue,
        requiresPersonalTransport: personalTransport,
        planningDefaultKeys,
        needsReview: needsEvidence || highValue,
        reviewFlags,
      });
      setItemName("");
      setNotes("");
      setHighValue(false);
      setPersonalTransport(false);
      setFirstNight(false);
      setNeedsEvidence(false);
      setMessage(`${name} added to ${room}.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not add this room-walk item yet."
      );
    } finally {
      setCreating(false);
    }
  }

  const loading = householdId && moveId && items === undefined;

  return (
    <Card id="room-walk">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DoorOpen className="size-4 text-primary" aria-hidden="true" />
              Room walk
            </CardTitle>
            <CardDescription>
              Capture inventory one room at a time while evidence, owner, and
              move-day flags are fresh.
            </CardDescription>
          </div>
          <Badge variant="secondary">{roomSummaries.length} rooms touched</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ClipboardCheck className="size-4 text-primary" aria-hidden="true" />
              Active room
            </div>
            <Input
              list="room-walk-room-options"
              value={activeRoom}
              onChange={(event) => setActiveRoom(event.target.value)}
              aria-label="Room walk active room"
              placeholder="Room name"
              disabled={!moveId}
            />
            <datalist id="room-walk-room-options">
              {roomOptions.map((room) => (
                <option key={room} value={room} />
              ))}
            </datalist>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Signal label="Items" value={activeSummary?.total ?? 0} />
              <Signal label="Review" value={activeSummary?.needsReview ?? 0} />
              <Signal label="Value" value={activeSummary?.highValue ?? 0} />
              <Signal label="Unboxed" value={activeSummary?.unboxed ?? 0} />
            </div>
            <div className="flex flex-wrap gap-1">
              {roomOptions.slice(0, 12).map((room) => (
                <Button
                  key={room}
                  type="button"
                  size="sm"
                  variant={room === activeRoom ? "default" : "outline"}
                  onClick={() => setActiveRoom(room)}
                >
                  {room}
                </Button>
              ))}
            </div>
          </div>

          <form
            className="space-y-3 rounded-md border border-border p-3"
            onSubmit={handleCreate}
          >
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_150px]">
              <Input
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
                placeholder="Item name"
                aria-label="Room walk item name"
                disabled={!moveId}
              />
              <Input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Category"
                aria-label="Room walk item category"
                disabled={!moveId}
              />
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={disposition}
                aria-label="Room walk disposition"
                disabled={!moveId}
                onChange={(event) => setDisposition(event.target.value as ItemDisposition)}
              >
                {itemDispositionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={ownerPersonId}
                aria-label="Room walk owner or contact"
                disabled={!moveId}
                onChange={(event) =>
                  setOwnerPersonId(event.target.value as Id<"movePeople"> | "")
                }
              >
                <option value="">No owner/contact</option>
                {people?.map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.name} - {person.role}
                  </option>
                ))}
              </select>
              <Input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Condition, serial number reminder, contents, or pickup note"
                aria-label="Room walk item note"
                disabled={!moveId}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <FlagToggle
                label="High value"
                checked={highValue}
                onChange={setHighValue}
              />
              <FlagToggle
                label="Personal transport"
                checked={personalTransport}
                onChange={setPersonalTransport}
              />
              <FlagToggle
                label="First night"
                checked={firstNight}
                onChange={setFirstNight}
              />
              <FlagToggle
                label="Needs evidence"
                checked={needsEvidence}
                onChange={setNeedsEvidence}
              />
              <Button
                type="submit"
                size="sm"
                disabled={!moveId || creating || !activeRoom.trim() || !itemName.trim()}
              >
                <PackagePlus aria-hidden="true" />
                {creating ? "Adding" : "Add room item"}
              </Button>
            </div>
          </form>

          <div className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BadgeCheck className="size-4 text-primary" aria-hidden="true" />
                Recent in {activeRoom || "room"}
              </div>
              <Badge variant="outline">{recentRoomItems.length}</Badge>
            </div>
            {loading ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-4/5" />
              </div>
            ) : recentRoomItems.length ? (
              <div className="mt-3 space-y-2">
                {recentRoomItems.map((item) => (
                  <div
                    key={item._id}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div className="font-medium">{item.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline">{item.disposition}</Badge>
                      <Badge variant="outline">{item.status}</Badge>
                      {item.needsReview ? (
                        <Badge variant="secondary">review</Badge>
                      ) : null}
                      {item.highValue ? (
                        <Badge variant="secondary">value</Badge>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No items captured in this room yet.
              </div>
            )}
          </div>
        </div>

        {message ? (
          <p
            className="rounded-md border border-border p-3 text-sm text-muted-foreground"
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

function summarizeRooms(items: InventoryItem[]): RoomSummary[] {
  const summaries = new Map<string, RoomSummary>();
  for (const item of items) {
    if (item.status === "archived") continue;
    const room = item.room || "Unassigned";
    const existing =
      summaries.get(room) ??
      ({
        room,
        total: 0,
        needsReview: 0,
        highValue: 0,
        unboxed: 0,
      } satisfies RoomSummary);
    existing.total += 1;
    if (item.needsReview) existing.needsReview += 1;
    if (item.highValue) existing.highValue += 1;
    if ((item.signals?.boxCount ?? 0) === 0) existing.unboxed += 1;
    summaries.set(room, existing);
  }
  return Array.from(summaries.values()).sort((left, right) =>
    left.room.localeCompare(right.room)
  );
}

function Signal({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function FlagToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-8 items-center gap-2 rounded-md border border-border px-2.5 text-sm">
      <input
        type="checkbox"
        className="size-3.5 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <Flag className="size-3.5 text-muted-foreground" aria-hidden="true" />
      {label}
      {checked ? <ShieldAlert className="size-3.5 text-primary" aria-hidden="true" /> : null}
    </label>
  );
}
