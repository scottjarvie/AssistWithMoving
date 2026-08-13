"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
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
  boxLabelPrintPresetFor,
  boxLabelPrintPresets,
  type BoxLabelPrintLayout,
} from "@/lib/box-label-printing";
import {
  formatBoxWeightSource,
  formatBoxWeightValue,
} from "@/lib/box-weight";
import { moveBoxesPath } from "@/lib/move-links";

export function PrintableBoxLabels({
  householdId,
  moveId,
  layout,
}: {
  householdId?: string;
  moveId?: string;
  layout?: string;
}) {
  const [origin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin
  );
  const [selectedLayout, setSelectedLayout] = useState<BoxLabelPrintLayout>(
    boxLabelPrintPresetFor(layout).key
  );
  const preset = boxLabelPrintPresetFor(selectedLayout);
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
        @page { size: ${preset.pageSize}; margin: ${preset.printMargin}; }
        @media print {
          header, aside, .print-hidden { display: none !important; }
          main { padding: 0 !important; }
          body { background: white !important; }
          .label-grid { display: grid; grid-template-columns: repeat(var(--label-print-columns), minmax(0, 1fr)); gap: var(--label-print-gap); }
          .box-label {
            break-inside: avoid;
            page-break-inside: avoid;
            min-height: var(--label-min-height);
            border-color: #111 !important;
            color: #111 !important;
            box-shadow: none !important;
          }
          .box-label-thermal {
            break-after: page;
            page-break-after: always;
            width: 100%;
          }
          .box-label-thermal:last-child {
            break-after: avoid;
            page-break-after: auto;
          }
          .thermal-compact-url {
            display: none !important;
          }
        }
      `}</style>
      <div className="print-hidden mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Box labels</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Print short-code labels with secure QR lookup links.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-md border border-border bg-muted/30 p-1"
            role="group"
            aria-label="Box label print layout"
          >
            {boxLabelPrintPresets.map((option) => (
              <Button
                key={option.key}
                type="button"
                size="sm"
                variant={option.key === selectedLayout ? "default" : "ghost"}
                aria-pressed={option.key === selectedLayout}
                onClick={() => setSelectedLayout(option.key)}
              >
                {option.shortLabel}
              </Button>
            ))}
          </div>
          <Button asChild variant="outline">
            <Link href={moveBoxesPath(moveId)}>
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
      <div className="print-hidden mb-4 rounded-md border border-border p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">{preset.label}</p>
            <p className="mt-1 text-muted-foreground">{preset.description}</p>
          </div>
          <Badge variant="outline">{preset.pageSize}</Badge>
        </div>
      </div>

      {boxes === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-4/5" />
        </div>
      ) : boxes.length ? (
        <div
          className={`label-grid grid gap-3 ${preset.screenGridClass}`}
          style={
            {
              "--label-print-columns": String(preset.printColumns),
              "--label-print-gap": preset.gap,
              "--label-min-height": preset.minHeight,
            } as CSSProperties
          }
        >
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
                className={`box-label rounded-md border border-border bg-white text-foreground ${
                  preset.thermal ? "box-label-thermal p-3" : "p-4"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className={
                        selectedLayout === "thermal3x2"
                          ? "text-2xl font-semibold tracking-normal"
                          : "text-4xl font-semibold tracking-normal"
                      }
                    >
                      {box.code}
                    </p>
                    <p className="mt-1 truncate text-base font-medium">
                      {box.label ?? "Assist With Moving box"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {box.room ?? "Room"} to{" "}
                      {box.destinationRoom ?? "destination"}
                    </p>
                  </div>
                  {lookupUrl ? (
                    <BoxQrCode
                      value={lookupUrl}
                      label={box.code}
                      size={preset.qrSize}
                    />
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
                {preset.showUrl ? (
                  <p className="mt-3 break-all text-xs text-muted-foreground">
                    {lookupUrl}
                  </p>
                ) : (
                  <p className="thermal-compact-url mt-2 text-xs text-muted-foreground">
                    Secure QR lookup
                  </p>
                )}
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
