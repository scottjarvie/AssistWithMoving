"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, Download, Printer, ShieldCheck } from "lucide-react";

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
  buildEmployerPacketPath,
  employerPacketFilename,
  formatEmployerCurrency,
  type EmployerPacketMode,
} from "@/lib/employer-packet";

type EmployerPacket = NonNullable<
  ReturnType<typeof useQuery<typeof api.employerPackets.getForMove>>
>;

export function PrintableEmployerPacket({
  householdId,
  moveId,
  mode = "submission",
}: {
  householdId?: string;
  moveId?: string;
  mode?: EmployerPacketMode;
}) {
  const packet = useQuery(
    api.employerPackets.getForMove,
    householdId && moveId
      ? {
          householdId: householdId as Id<"households">,
          moveId: moveId as Id<"moves">,
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
            <CardTitle>Employer relocation packet</CardTitle>
            <CardDescription>
              Select a move before exporting an employer relocation packet.
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
            Employer relocation packet
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Print or download a clean relocation-benefit summary without full
            private household details.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant={!ownerMode ? "default" : "outline"}>
            <Link href={buildEmployerPacketPath({ householdId, moveId })}>
              <ShieldCheck aria-hidden="true" />
              Submission
            </Link>
          </Button>
          <Button asChild variant={ownerMode ? "default" : "outline"}>
            <Link
              href={buildEmployerPacketPath({
                householdId,
                moveId,
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
                    employerPacketFilename(mode),
                    employerPacketToCsv(packet)
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
                  MovingManifest Employer Relocation Packet
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {packet.disclaimer}
                </p>
              </div>
              <Badge variant={ownerMode ? "outline" : "secondary"}>
                {ownerMode ? "owner private" : "submission friendly"}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              <Metric label="Items" value={packet.summary.itemCount} />
              <Metric label="Boxes" value={packet.summary.boxCount} />
              <Metric label="Resources" value={packet.summary.resourceCount} />
              <Metric
                label="Weight"
                value={`${formatNumber(packet.summary.shipmentWeightLb)} lb`}
              />
              <Metric
                label="Volume"
                value={`${formatNumber(packet.summary.shipmentVolumeCuFt)} cu ft`}
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
          </section>

          <TotalsSection title="Relocation categories" rows={packet.sections.categoryTotals} ownerMode={ownerMode} />
          <TotalsSection title="Disposition summary" rows={packet.sections.dispositionTotals} ownerMode={ownerMode} />
          <TotalsSection title="Status summary" rows={packet.sections.statusTotals} ownerMode={ownerMode} />

          <section className="packet-section rounded-md border border-border p-4">
            <h2 className="text-xl font-semibold tracking-normal">
              Shipment/resource summary
            </h2>
            <div className="mt-3 overflow-x-auto rounded-md border border-border">
              <table className="packet-table w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2">Resource</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Boxes</th>
                    <th className="px-2 py-2">Weight</th>
                    <th className="px-2 py-2">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {packet.sections.resourceSummaries.map((resource) => (
                    <tr key={resource.resourceId} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-2 font-medium">{resource.name}</td>
                      <td className="px-2 py-2">{resource.type}</td>
                      <td className="px-2 py-2">{resource.boxCount}</td>
                      <td className="px-2 py-2">
                        {formatNumber(resource.estimatedWeightLb)} lb
                      </td>
                      <td className="px-2 py-2">
                        {formatNumber(resource.estimatedVolumeCuFt)} cu ft
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="packet-section rounded-md border border-border p-4">
            <h2 className="text-xl font-semibold tracking-normal">
              Shipment items
            </h2>
            <div className="mt-3 overflow-x-auto rounded-md border border-border">
              <table className="packet-table w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2">Room</th>
                    <th className="px-2 py-2">Qty</th>
                    <th className="px-2 py-2">Disposition</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Boxes</th>
                    <th className="px-2 py-2">Weight</th>
                    {ownerMode ? <th className="px-2 py-2">Private value</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {packet.sections.shipmentItems.map((item) => (
                    <tr key={item.itemId} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-2 font-medium">{item.name}</td>
                      <td className="px-2 py-2">{item.room ?? "unset"}</td>
                      <td className="px-2 py-2">{item.quantity}</td>
                      <td className="px-2 py-2">{item.disposition}</td>
                      <td className="px-2 py-2">{item.status}</td>
                      <td className="px-2 py-2">
                        {item.boxCodes.join(", ") || "unboxed"}
                      </td>
                      <td className="px-2 py-2">
                        {formatNumber(item.estimatedWeightLb)} lb
                      </td>
                      {ownerMode ? (
                        <td className="px-2 py-2">
                          {formatEmployerCurrency(item.private?.valueCents)}
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
  rows: EmployerPacket["sections"]["categoryTotals"];
  ownerMode: boolean;
}) {
  return (
    <section className="packet-section rounded-md border border-border p-4">
      <h2 className="text-xl font-semibold tracking-normal">{title}</h2>
      <div className="mt-3 overflow-x-auto rounded-md border border-border">
        <table className="packet-table w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2">Category</th>
              <th className="px-2 py-2">Items</th>
              <th className="px-2 py-2">Quantity</th>
              <th className="px-2 py-2">Weight</th>
              <th className="px-2 py-2">Volume</th>
              {ownerMode ? <th className="px-2 py-2">Private value</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border last:border-b-0">
                <td className="px-2 py-2 font-medium">{row.label}</td>
                <td className="px-2 py-2">{row.itemCount}</td>
                <td className="px-2 py-2">{row.quantity}</td>
                <td className="px-2 py-2">
                  {formatNumber(row.estimatedWeightLb)} lb
                </td>
                <td className="px-2 py-2">
                  {formatNumber(row.estimatedVolumeCuFt)} cu ft
                </td>
                {ownerMode ? (
                  <td className="px-2 py-2">
                    {formatEmployerCurrency(row.valueCents)}
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

function employerPacketToCsv(packet: EmployerPacket) {
  const header = [
    "item",
    "room",
    "quantity",
    "disposition",
    "status",
    "box_codes",
    "weight_lb",
  ];
  const rows = packet.sections.shipmentItems.map((item) => [
    item.name,
    item.room ?? "",
    item.quantity,
    item.disposition,
    item.status,
    item.boxCodes.join("; "),
    item.estimatedWeightLb,
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}
