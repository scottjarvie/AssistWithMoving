"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, Download, Printer, Rows3 } from "lucide-react";

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
import {
  buildSubManifestPath,
  formatSubManifestCurrency,
  subManifestFilename,
  type SubManifestKind,
  type SubManifestMode,
} from "@/lib/sub-manifest";

type SubManifest = NonNullable<
  ReturnType<typeof useQuery<typeof api.subManifests.getForMove>>
>;

export function PrintableSubManifest({
  householdId,
  moveId,
  kind,
  mode = "recipient",
}: {
  householdId?: string;
  moveId?: string;
  kind: SubManifestKind;
  mode?: SubManifestMode;
}) {
  const packet = useQuery(
    api.subManifests.getForMove,
    householdId && moveId
      ? {
          householdId: householdId as Id<"households">,
          moveId: moveId as Id<"moves">,
          kind,
          mode,
        }
      : "skip"
  );
  const ownerMode = mode === "owner";

  if (!householdId || !moveId) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Sub-manifest</CardTitle>
            <CardDescription>
              Select a move before exporting a donation, sell/free, or storage
              manifest.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/app/dashboard#documentation-packets">
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
          .packet-page { color: #111 !important; }
          .packet-section { break-inside: avoid; page-break-inside: avoid; }
          .packet-table th, .packet-table td { border-color: #111 !important; }
        }
      `}</style>
      <div className="print-hidden mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">
            {labelForKind(kind)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Print or download a scoped manifest without exposing unrelated move
            inventory.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant={!ownerMode ? "default" : "outline"}>
            <Link href={buildSubManifestPath({ householdId, moveId, kind })}>
              <Rows3 aria-hidden="true" />
              Recipient
            </Link>
          </Button>
          <Button asChild variant={ownerMode ? "default" : "outline"}>
            <Link
              href={buildSubManifestPath({
                householdId,
                moveId,
                kind,
                mode: "owner",
              })}
            >
              Owner
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!packet}
            onClick={() =>
              packet
                ? downloadCsv(
                    subManifestFilename(kind, mode),
                    subManifestToCsv(packet)
                  )
                : undefined
            }
          >
            <Download aria-hidden="true" />
            CSV
          </Button>
          <Button type="button" onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            Print
          </Button>
        </div>
      </div>

      {!packet ? (
        <div className="space-y-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-4/5" />
        </div>
      ) : (
        <div className="packet-page space-y-5">
          <section className="packet-section rounded-md border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-semibold tracking-normal">
                  Assist With Moving {packet.title}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {packet.disclaimer}
                </p>
              </div>
              <Badge variant={ownerMode ? "outline" : "secondary"}>
                {ownerMode ? "owner private" : "recipient safe"}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              <Metric label="Items" value={packet.summary.itemCount} />
              <Metric label="Quantity" value={packet.summary.quantity} />
              <Metric label="Boxes" value={packet.summary.boxCount} />
              <Metric label="Photos" value={packet.summary.photoCount} />
              <Metric
                label="Weight"
                value={`${formatNumber(packet.summary.estimatedWeightLb)} lb`}
              />
            </div>
          </section>

          <section className="packet-section rounded-md border border-border p-4">
            <h2 className="text-xl font-semibold tracking-normal">Move overview</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Info label="Move" value={packet.move.title} />
              <Info label="Origin" value={packet.move.origin ?? "Not set"} />
              <Info
                label="Destination"
                value={packet.move.destination ?? "Not set"}
              />
              <Info
                label="Window"
                value={[packet.move.dateStart, packet.move.dateEnd]
                  .filter(Boolean)
                  .join(" to ") || "Not set"}
              />
            </div>
            {ownerMode ? (
              <div className="mt-3">
                <Info
                  label="Owner value"
                  value={formatSubManifestCurrency(packet.summary.totalValueCents)}
                />
              </div>
            ) : null}
          </section>

          <TotalsSection title="Disposition summary" rows={packet.sections.dispositionTotals} ownerMode={ownerMode} />
          <TotalsSection title="Status summary" rows={packet.sections.statusTotals} ownerMode={ownerMode} />
          <TotalsSection title="Room summary" rows={packet.sections.roomTotals} ownerMode={ownerMode} />

          <section className="packet-section rounded-md border border-border p-4">
            <h2 className="text-xl font-semibold tracking-normal">Box map</h2>
            <div className="mt-3 overflow-x-auto rounded-md border border-border">
              <table className="packet-table w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2">Box</th>
                    <th className="px-2 py-2">Room</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Resource</th>
                    <th className="px-2 py-2">Zone</th>
                    <th className="px-2 py-2">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {packet.sections.boxes.map((box) => (
                    <tr key={box.boxId} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-2 font-medium">
                        {box.code}
                        {box.label ? (
                          <span className="block text-xs text-muted-foreground">
                            {box.label}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">{box.room ?? "unset"}</td>
                      <td className="px-2 py-2">{box.status}</td>
                      <td className="px-2 py-2">
                        {box.assignedResource ?? "unassigned"}
                      </td>
                      <td className="px-2 py-2">{box.assignedZone ?? "any"}</td>
                      <td className="px-2 py-2">
                        {formatOptionalNumber(box.estimatedWeightLb)} lb
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="packet-section rounded-md border border-border p-4">
            <h2 className="text-xl font-semibold tracking-normal">Manifest items</h2>
            <div className="mt-3 overflow-x-auto rounded-md border border-border">
              <table className="packet-table w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2">Room</th>
                    <th className="px-2 py-2">Qty</th>
                    <th className="px-2 py-2">Disposition</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Condition</th>
                    <th className="px-2 py-2">Boxes</th>
                    <th className="px-2 py-2">Photos</th>
                    {ownerMode ? <th className="px-2 py-2">Owner fields</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {packet.sections.items.map((item) => (
                    <tr
                      key={item.itemId}
                      className="border-b border-border align-top last:border-b-0"
                    >
                      <td className="px-2 py-2">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.description ?? item.listing.description ?? "No description"}
                        </p>
                      </td>
                      <td className="px-2 py-2">{item.room ?? "unset"}</td>
                      <td className="px-2 py-2">{item.quantity}</td>
                      <td className="px-2 py-2">{item.disposition}</td>
                      <td className="px-2 py-2">{item.status}</td>
                      <td className="px-2 py-2">{item.condition}</td>
                      <td className="px-2 py-2">
                        {item.boxTrail.map((box) => box.code).join(", ") ||
                          "unboxed"}
                      </td>
                      <td className="px-2 py-2">{item.photoCount}</td>
                      {ownerMode ? (
                        <td className="px-2 py-2">
                          <p>{formatSubManifestCurrency(item.owner?.valueCents)}</p>
                          <p className="text-xs text-muted-foreground">
                            {[item.owner?.serialNumber, item.owner?.modelNumber]
                              .filter(Boolean)
                              .join(" / ") || "No serial/model"}
                          </p>
                          {item.owner?.privateNotes ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.owner.privateNotes}
                            </p>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function TotalsSection({
  title,
  rows,
  ownerMode,
}: {
  title: string;
  rows: SubManifest["sections"]["statusTotals"];
  ownerMode: boolean;
}) {
  return (
    <section className="packet-section rounded-md border border-border p-4">
      <h2 className="text-xl font-semibold tracking-normal">{title}</h2>
      <div className="mt-3 overflow-x-auto rounded-md border border-border">
        <table className="packet-table w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2">Bucket</th>
              <th className="px-2 py-2">Items</th>
              <th className="px-2 py-2">Quantity</th>
              {ownerMode ? <th className="px-2 py-2">Owner value</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border last:border-b-0">
                <td className="px-2 py-2 font-medium">{row.label}</td>
                <td className="px-2 py-2">{row.itemCount}</td>
                <td className="px-2 py-2">{row.quantity}</td>
                {ownerMode ? (
                  <td className="px-2 py-2">
                    {formatSubManifestCurrency(row.valueCents)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function subManifestToCsv(packet: SubManifest) {
  const header = [
    "item",
    "room",
    "quantity",
    "disposition",
    "status",
    "condition",
    "box_codes",
    "photo_count",
    "weight_lb",
    "owner_value_cents",
  ];
  const rows = packet.sections.items.map((item) => [
    item.name,
    item.room ?? "",
    item.quantity,
    item.disposition,
    item.status,
    item.condition,
    item.boxTrail.map((box) => box.code).join("; "),
    item.photoCount,
    item.estimatedWeightLb ?? "",
    item.owner?.valueCents ?? "",
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => csvCell(String(cell))).join(","))
    .join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function labelForKind(kind: SubManifestKind) {
  switch (kind) {
    case "donation":
      return "Donation pickup manifest";
    case "sellFree":
      return "Sell / giveaway manifest";
    case "storage":
      return "Storage manifest";
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatOptionalNumber(value: number | undefined) {
  if (typeof value !== "number") return "not set";
  return formatNumber(value);
}
