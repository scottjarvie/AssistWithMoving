"use client";

import { useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const pageSize = 12;
const operations: Record<string, string> = {
  created: "Room added",
  updated: "Room updated",
  archived: "Room archived",
  restored: "Room restored",
};
const fields: Record<string, string> = {
  name: "Name",
  kind: "Room type",
  aliases: "Alternate names",
  notes: "Notes",
  floorLevel: "Floor / level",
  sortOrder: "Display order",
  status: "Status",
  availability: "Availability",
  transportResource: "Transport",
  transportZone: "Transport zone",
  linkedPlan: "Linked plan",
  capacity: "Capacity",
};
const transport: Record<string, string> = {
  web: "Website",
  mcp: "MCP",
  rest: "REST API",
};

function DateLabel({ time }: { time: number }) {
  const date = new Date(time);
  return <time dateTime={date.toISOString()}>
    {date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
  </time>;
}

export function RoomHistory({
  householdId, moveId, spaceId, name,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
  spaceId: Id<"moveSpaces">;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(pageSize);
  const history = useQuery(api.moveSpaces.history, open ? { householdId, moveId, spaceId, limit } : "skip");

  return (
    <Sheet open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) setLimit(pageSize);
    }}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" aria-label={`History for ${name}`}>
          History
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-md sm:max-w-md">
        <SheetHeader className="border-b border-border pr-14">
          <SheetTitle>Room history</SheetTitle>
          <SheetDescription className="sr-only">Recorded changes for this room.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6">
          {history === undefined ? <p role="status">Loading room history…</p>
            : history === null ? <p role="status">Room history is unavailable.</p>
            : <>
              {history.rows.length === 0 && !history.legacyCreation && !history.hasMore &&
                <p className="text-muted-foreground">No recorded changes to show.</p>}
              <ol className="space-y-3">
                {history.rows.map((row, index) => (
                  <li key={`${index}-${row.committedAt}-${row.operation}`}>
                    <details className="rounded-md border border-border p-3">
                      <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
                        <span className="font-medium">{operations[row.operation]}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          <DateLabel time={row.committedAt} /> · {row.actor.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {transport[row.transport] ?? "Channel unrecorded"} · {row.source === "manual" ? "Manual entry" : "Source unrecorded"}
                        </span>
                      </summary>
                      <p className="mt-3 text-xs text-muted-foreground">Changed fields</p>
                      <ul className="mt-1 list-inside list-disc text-sm">
                        {row.fields.map(field => <li key={field}>{fields[field]}</li>)}
                      </ul>
                    </details>
                  </li>
                ))}
                {history.legacyCreation && <li className="rounded-md border border-border p-3">
                  <p className="font-medium">Room added</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <DateLabel time={history.legacyCreation.committedAt} /> · Editor and source unrecorded
                  </p>
                </li>}
              </ol>
              {history.olderOmitted
                ? <p className="text-xs text-muted-foreground">Some recorded changes are no longer available.</p>
                : <p className="text-xs text-muted-foreground">Earlier changes may not have been tracked.</p>}
            </>}
          {history !== null && (history?.hasMore || limit > pageSize) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-disabled={!history?.hasMore}
              onClick={() => { if (history?.hasMore) setLimit(limit + pageSize); }}
            >
              {history && !history.hasMore ? "All available changes shown" : "Show older changes"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
