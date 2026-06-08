"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, Boxes, PackageCheck } from "lucide-react";

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

export function BoxLookup({
  householdId,
  moveId,
  boxId,
}: {
  householdId?: string;
  moveId?: string;
  boxId: string;
}) {
  const boxRecord = useQuery(
    api.boxes.get,
    householdId && moveId
      ? {
          householdId: householdId as Id<"households">,
          moveId: moveId as Id<"moves">,
          boxId: boxId as Id<"boxes">,
        }
      : "skip"
  );

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Box lookup</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            QR labels resolve here after sign-in and permission checks.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/app/dashboard#boxes">
            <ArrowLeft aria-hidden="true" />
            Boxes
          </Link>
        </Button>
      </div>

      {!householdId || !moveId ? (
        <Card>
          <CardHeader>
            <CardTitle>Missing lookup context</CardTitle>
            <CardDescription>
              Use the label generated from the box manager.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : boxRecord === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-4/5" />
        </div>
      ) : boxRecord ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Boxes className="size-5 text-primary" aria-hidden="true" />
              <CardTitle>{boxRecord.box.code}</CardTitle>
              <Badge variant="outline">{boxRecord.box.status}</Badge>
            </div>
            <CardDescription>
              {boxRecord.box.label ?? boxRecord.box.description ?? "Box"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Room</p>
                <p className="font-medium">
                  {boxRecord.box.room ?? "unassigned"}
                </p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Destination</p>
                <p className="font-medium">
                  {boxRecord.box.destinationRoom ?? "unassigned"}
                </p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Items</p>
                <p className="font-medium">{boxRecord.itemCount}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Weight</p>
                <p className="font-medium">
                  {boxRecord.box.actualWeightLb ??
                    boxRecord.box.estimatedWeightLb ??
                    boxRecord.contentsEstimatedWeightLb}{" "}
                  lb
                </p>
              </div>
            </div>

            <div className="rounded-md border border-border">
              {boxRecord.contents.length ? (
                <div className="divide-y divide-border">
                  {boxRecord.contents.map((entry) =>
                    entry ? (
                      <div
                        key={entry.membership._id}
                        className="flex items-center justify-between gap-3 p-3 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <PackageCheck
                            className="size-4 text-primary"
                            aria-hidden="true"
                          />
                          <span className="font-medium">
                            {entry.item.name}
                          </span>
                        </div>
                        <Badge variant="outline">
                          x{entry.membership.quantity}
                        </Badge>
                      </div>
                    ) : null
                  )}
                </div>
              ) : (
                <div className="p-3 text-sm text-muted-foreground">
                  No contents recorded.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Box not found</CardTitle>
            <CardDescription>
              The box may have been archived or you may not have access.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
