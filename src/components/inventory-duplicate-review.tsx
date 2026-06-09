"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckCheck, Flag, ScanSearch } from "lucide-react";

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

type DuplicateGroup = NonNullable<
  ReturnType<typeof useQuery<typeof api.inventoryDuplicates.listForMove>>
>[number];

export function InventoryDuplicateReview({
  householdId,
  moveId,
}: {
  householdId: Id<"households"> | null;
  moveId: Id<"moves"> | null;
}) {
  const groups = useQuery(
    api.inventoryDuplicates.listForMove,
    householdId && moveId ? { householdId, moveId, limit: 8 } : "skip"
  );
  const markForReview = useMutation(api.inventoryDuplicates.markForReview);
  const ignoreGroup = useMutation(api.inventoryDuplicates.ignoreGroup);
  const [workingGroupKey, setWorkingGroupKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const summary = useMemo(() => summarizeGroups(groups ?? []), [groups]);

  async function handleMarkForReview(group: DuplicateGroup) {
    if (!householdId || !moveId) return;
    setWorkingGroupKey(group.groupKey);
    setMessage(null);
    try {
      const result = await markForReview({
        householdId,
        moveId,
        groupKey: group.groupKey,
        itemIds: group.itemIds as Id<"items">[],
      });
      setMessage(`${result.updatedCount} items marked for duplicate review.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not mark duplicate candidates for review."
      );
    } finally {
      setWorkingGroupKey(null);
    }
  }

  async function handleIgnoreGroup(group: DuplicateGroup) {
    if (!householdId || !moveId) return;
    setWorkingGroupKey(group.groupKey);
    setMessage(null);
    try {
      const result = await ignoreGroup({
        householdId,
        moveId,
        groupKey: group.groupKey,
        itemIds: group.itemIds as Id<"items">[],
      });
      setMessage(`${result.ignoredCount} items kept as separate records.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not clear this duplicate candidate group."
      );
    } finally {
      setWorkingGroupKey(null);
    }
  }

  return (
    <Card id="inventory-duplicate-review">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScanSearch className="size-4 text-primary" aria-hidden="true" />
              Duplicate review
            </CardTitle>
            <CardDescription>
              Find likely duplicate inventory records before reports, claims,
              and load plans depend on them.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{summary.groupCount} groups</Badge>
            <Badge variant="outline">{summary.itemCount} items</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        {groups === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : groups.length ? (
          <div className="space-y-3">
            {groups.map((group) => {
              const working = workingGroupKey === group.groupKey;
              return (
                <div
                  key={group.groupKey}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {group.matchLabel || "similar items"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {group.items.length} records · {group.score}% match
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={working}
                        onClick={() => void handleMarkForReview(group)}
                      >
                        <Flag aria-hidden="true" />
                        Mark review
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={working}
                        onClick={() => void handleIgnoreGroup(group)}
                      >
                        <CheckCheck aria-hidden="true" />
                        Not duplicates
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {group.reasons.map((reason) => (
                      <Badge key={reason} variant="secondary">
                        {reason}
                      </Badge>
                    ))}
                  </div>

                  <div className="mt-3 divide-y divide-border rounded-md border border-border">
                    {group.items.map((item) => (
                      <div
                        key={item._id}
                        className="grid gap-2 p-3 text-sm md:grid-cols-[minmax(0,1fr)_160px_150px_100px]"
                      >
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.description ?? "No description"}
                          </p>
                        </div>
                        <Detail label="Room" value={item.room} />
                        <Detail label="Category" value={item.category} />
                        <div className="flex items-start justify-start md:justify-end">
                          <Badge
                            variant={item.needsReview ? "destructive" : "outline"}
                          >
                            {item.needsReview ? "review" : item.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No duplicate candidates found in the active inventory.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function summarizeGroups(groups: DuplicateGroup[]) {
  return {
    groupCount: groups.length,
    itemCount: groups.reduce((count, group) => count + group.items.length, 0),
  };
}

function Detail({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm">{value ?? "Unassigned"}</p>
    </div>
  );
}
