"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { ArrowLeft, Printer } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BoxQrCode } from "@/components/box-qr-code";
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
import { buildBoxLookupUrl } from "@/lib/box-labels";
import {
  formatBoxWeightSource,
  formatBoxWeightValue,
} from "@/lib/box-weight";

export function PrintableBoxLabels({
  householdId,
  moveId,
}: {
  householdId?: string;
  moveId?: string;
}) {
  const [origin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin
  );
  const boxes = useQuery(
    api.boxes.listForMove,
    householdId && moveId
      ? {
          householdId: householdId as Id<"households">,
          moveId: moveId as Id<"moves">,
        }
      : "skip"
  );

  if (!householdId || !moveId) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Box labels</CardTitle>
            <CardDescription>
              Select a move from the dashboard before printing labels.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/app/dashboard">
                <ArrowLeft aria-hidden="true" />
                Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <style>{`
        @media print {
          header, aside, .print-hidden { display: none !important; }
          main { padding: 0 !important; }
          body { background: white !important; }
          .label-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.18in; }
          .box-label { break-inside: avoid; page-break-inside: avoid; min-height: 2.6in; border-color: #111 !important; color: #111 !important; }
        }
      `}</style>
      <div className="print-hidden mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Box labels</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Print short-code labels with secure QR lookup links.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/app/dashboard#boxes">
              <ArrowLeft aria-hidden="true" />
              Boxes
            </Link>
          </Button>
          <Button type="button" onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            Print
          </Button>
        </div>
      </div>

      {boxes === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-4/5" />
        </div>
      ) : boxes.length ? (
        <div className="label-grid grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {boxes.map(({ box, itemCount, weightSummary }) => {
            const lookupUrl = origin
              ? buildBoxLookupUrl(origin, {
                  householdId,
                  moveId,
                  boxId: box._id,
                })
              : "";

            return (
              <div
                key={box._id}
                className="box-label rounded-md border border-border bg-white p-4 text-foreground"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-4xl font-semibold tracking-normal">
                      {box.code}
                    </p>
                    <p className="mt-1 text-base font-medium">
                      {box.label ?? "MovingManifest box"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {box.room ?? "Room"} to{" "}
                      {box.destinationRoom ?? "destination"}
                    </p>
                  </div>
                  {lookupUrl ? (
                    <BoxQrCode value={lookupUrl} label={box.code} size={132} />
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{box.status}</Badge>
                  <Badge variant="outline">{itemCount} items</Badge>
                  <Badge variant="outline">
                    {formatBoxWeightValue(weightSummary)}
                  </Badge>
                  <Badge variant="outline">
                    {formatBoxWeightSource(weightSummary)}
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-muted-foreground break-all">
                  {lookupUrl}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No boxes yet</CardTitle>
            <CardDescription>
              Create boxes before printing labels.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
