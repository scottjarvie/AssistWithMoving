"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
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
  buildPcsPacketPath,
  formatPcsCurrency,
  formatPcsValue,
  pcsPacketFilename,
  type PcsPacketMode,
} from "@/lib/pcs-packet";

type PcsPacket = NonNullable<
  ReturnType<typeof useQuery<typeof api.pcsPackets.getForMove>>
>;
type PcsItem = PcsPacket["sections"]["hhgItems"][number];

export function PrintablePcsPacket({
  householdId,
  moveId,
  mode = "submission",
}: {
  householdId?: string;
  moveId?: string;
  mode?: PcsPacketMode;
}) {
  const auth = useConvexAuth();
  const packet = useQuery(
    api.pcsPackets.getForMove,
    householdId && moveId && auth.isAuthenticated
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
            <CardTitle>PCS packet</CardTitle>
            <CardDescription>
              Select a move from the dashboard before exporting a PCS packet.
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
          <h2 className="text-3xl font-semibold tracking-tight">PCS packet</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Print or download a PCS-focused record for HHG, PPM, pro gear,
            claims evidence, and transportation-office reference.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant={!ownerMode ? "default" : "outline"}>
            <Link href={buildPcsPacketPath({ householdId, moveId })}>
              <ShieldCheck aria-hidden="true" />
              Submission
            </Link>
          </Button>
          <Button asChild variant={ownerMode ? "default" : "outline"}>
            <Link href={buildPcsPacketPath({ householdId, moveId, mode: "owner" })}>
              Owner
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!packet}
            onClick={() =>
              packet
                ? downloadCsv(pcsPacketFilename(mode), pcsPacketToCsv(packet))
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

      {auth.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-4/5" />
        </div>
      ) : !auth.isAuthenticated ? (
        <Card>
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>
              Sign in before exporting a PCS packet for this move.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/sign-in">
                <ShieldCheck aria-hidden="true" />
                Sign in
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : !packet ? (
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
                  Assist With Moving PCS Support Packet
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {packet.disclaimer}
                </p>
              </div>
              <Badge variant={ownerMode ? "outline" : "secondary"}>
                {ownerMode ? "owner private" : "submission friendly"}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Metric label="Items" value={packet.summary.itemCount} />
              <Metric label="Boxes" value={packet.summary.boxCount} />
              <Metric
                label="Weight"
                value={`${formatNumber(packet.summary.totalEstimatedWeightLb)} lb`}
              />
              <Metric
                label="Allowance left"
                value={
                  typeof packet.summary.allowanceRemainingLb === "number"
                    ? `${formatNumber(packet.summary.allowanceRemainingLb)} lb`
                    : "Not set"
                }
              />
            </div>
          </section>

          <section className="packet-section rounded-md border border-border p-4">
            <h2 className="text-xl font-semibold tracking-normal">
              PCS reference
            </h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Info label="Move" value={packet.move.title} />
              <Info label="Origin" value={formatPcsValue(packet.move.origin)} />
              <Info
                label="Destination"
                value={formatPcsValue(packet.move.destination)}
              />
              <Info label="Branch" value={formatPcsValue(packet.move.pcsBranch)} />
              <Info
                label="Shipment"
                value={formatPcsValue(packet.move.pcsShipmentType)}
              />
              <Info
                label="Dependents"
                value={formatPcsValue(packet.move.pcsDependentStatus)}
              />
              <Info
                label="Rank/pay grade"
                value={formatPcsValue(packet.move.pcsRankPayGrade)}
              />
              <Info
                label="Orders/reference"
                value={formatPcsValue(packet.move.pcsOrdersNumber)}
              />
              <Info
                label="Weight allowance"
                value={
                  packet.move.moveLevelWeightAllowanceLb
                    ? `${formatNumber(packet.move.moveLevelWeightAllowanceLb)} lb`
                    : "Not set"
                }
              />
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <Note title="Allowance notes" value={packet.move.pcsAllowanceNotes} />
              <Note
                title="Transportation office notes"
                value={packet.move.pcsTransportationOfficeNotes}
              />
              <Note
                title="Restricted items notes"
                value={packet.move.pcsRestrictedItemsNotes}
              />
              <Note title="Pro gear notes" value={packet.move.proGearNotes} />
            </div>
          </section>

          <section className="packet-section rounded-md border border-border p-4">
            <h2 className="text-xl font-semibold tracking-normal">
              Packet sections
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="HHG" value={packet.summary.hhgCount} />
              <Metric label="PPM / personal" value={packet.summary.ppmCount} />
              <Metric label="Pro gear" value={packet.summary.proGearCount} />
              <Metric
                label="Claims evidence"
                value={packet.summary.claimsEvidenceCount}
              />
              <Metric label="High value" value={packet.summary.highValueCount} />
              <Metric label="Sensitive" value={packet.summary.sensitiveCount} />
              <Metric label="Exceptions" value={packet.summary.exceptionCount} />
              <Metric
                label="PCS evidence photos"
                value={packet.summary.pcsEvidencePhotoCount}
              />
            </div>
          </section>

          <ReadinessChecklist items={packet.readinessChecklist} />

          <ItemTable title="HHG inventory" items={packet.sections.hhgItems} ownerMode={ownerMode} />
          <ItemTable title="PPM / personal transport" items={packet.sections.ppmItems} ownerMode={ownerMode} />
          <ItemTable title="Pro gear" items={packet.sections.proGearItems} ownerMode={ownerMode} />
          <ItemTable title="High-value / sensitive" items={[...packet.sections.highValueItems, ...packet.sections.sensitiveItems]} ownerMode={ownerMode} />
          <ItemTable title="Claims evidence" items={packet.sections.claimsEvidenceItems} ownerMode={ownerMode} />
          <BoxTable boxes={packet.sections.boxes} />
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

function Note({ title, value }: { title: string; value?: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {value?.trim() || "Not set"}
      </p>
    </div>
  );
}

function ReadinessChecklist({
  items,
}: {
  items: PcsPacket["readinessChecklist"];
}) {
  return (
    <section className="packet-section rounded-md border border-border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">
            PCS documentation readiness
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use this as a preparation checklist; verify official requirements
            with the transportation office or current guidance.
          </p>
        </div>
        <Badge variant="outline">{items.length} checks</Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.key} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-medium">{item.label}</p>
              <ChecklistStatus status={item.status} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
            <p className="mt-2 text-xs text-muted-foreground">{item.action}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChecklistStatus({
  status,
}: {
  status: PcsPacket["readinessChecklist"][number]["status"];
}) {
  if (status === "missing") {
    return <Badge variant="destructive">missing</Badge>;
  }
  if (status === "attention") {
    return <Badge variant="secondary">attention</Badge>;
  }
  return <Badge variant="outline">ready</Badge>;
}

function ItemTable({
  title,
  items,
  ownerMode,
}: {
  title: string;
  items: PcsItem[];
  ownerMode: boolean;
}) {
  return (
    <section className="packet-section rounded-md border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-normal">{title}</h2>
        <Badge variant="outline">{items.length} items</Badge>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="packet-table w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2">Item</th>
              <th className="px-2 py-2">Room</th>
              <th className="px-2 py-2">Qty</th>
              <th className="px-2 py-2">Condition</th>
              <th className="px-2 py-2">Box</th>
              <th className="px-2 py-2">Weight</th>
              <th className="px-2 py-2">Flags</th>
              {ownerMode ? <th className="px-2 py-2">Private</th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.itemId} className="border-b border-border last:border-b-0">
                <td className="px-2 py-2 font-medium">{item.name}</td>
                <td className="px-2 py-2">{item.room ?? "unset"}</td>
                <td className="px-2 py-2">{item.quantity}</td>
                <td className="px-2 py-2">{item.condition}</td>
                <td className="px-2 py-2">{item.boxCodes.join(", ") || "unboxed"}</td>
                <td className="px-2 py-2">
                  {typeof item.estimatedWeightLb === "number"
                    ? `${formatNumber(item.estimatedWeightLb)} lb`
                    : "missing"}
                </td>
                <td className="px-2 py-2">{item.flags.join(", ") || "none"}</td>
                {ownerMode ? (
                  <td className="px-2 py-2">
                    {formatPcsCurrency(item.sensitive?.valueCents)}
                    {item.sensitive?.serialNumber
                      ? ` / SN ${item.sensitive.serialNumber}`
                      : ""}
                  </td>
                ) : null}
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td
                  colSpan={ownerMode ? 8 : 7}
                  className="px-2 py-4 text-muted-foreground"
                >
                  No items in this section.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BoxTable({ boxes }: { boxes: PcsPacket["sections"]["boxes"] }) {
  return (
    <section className="packet-section rounded-md border border-border p-4">
      <h2 className="text-xl font-semibold tracking-normal">Box/load summary</h2>
      <div className="mt-3 overflow-x-auto rounded-md border border-border">
        <table className="packet-table w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2">Code</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">From</th>
              <th className="px-2 py-2">To</th>
              <th className="px-2 py-2">Resource</th>
              <th className="px-2 py-2">Items</th>
              <th className="px-2 py-2">Weight</th>
              <th className="px-2 py-2">Warnings</th>
            </tr>
          </thead>
          <tbody>
            {boxes.map((box) => (
              <tr key={box.boxId} className="border-b border-border last:border-b-0">
                <td className="px-2 py-2 font-medium">{box.code}</td>
                <td className="px-2 py-2">{box.status}</td>
                <td className="px-2 py-2">{box.room ?? "unset"}</td>
                <td className="px-2 py-2">{box.destinationRoom ?? "unset"}</td>
                <td className="px-2 py-2">
                  {[box.assignedResource, box.assignedZone].filter(Boolean).join(" / ") ||
                    "unassigned"}
                </td>
                <td className="px-2 py-2">{box.itemCount}</td>
                <td className="px-2 py-2">
                  {typeof box.estimatedWeightLb === "number"
                    ? `${formatNumber(box.estimatedWeightLb)} lb`
                    : "missing"}
                </td>
                <td className="px-2 py-2">{box.warnings.join(", ") || "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function pcsPacketToCsv(packet: PcsPacket) {
  const header = [
    "section",
    "item",
    "room",
    "quantity",
    "condition",
    "box_codes",
    "weight_lb",
    "flags",
    "detail",
    "action",
  ];
  const rows = [
    ...packet.readinessChecklist.map((entry) => checklistRow(entry)),
    ...packet.sections.hhgItems.map((item) => rowFor("HHG", item)),
    ...packet.sections.ppmItems.map((item) => rowFor("PPM", item)),
    ...packet.sections.proGearItems.map((item) => rowFor("Pro gear", item)),
    ...packet.sections.highValueItems.map((item) => rowFor("High value", item)),
    ...packet.sections.claimsEvidenceItems.map((item) =>
      rowFor("Claims evidence", item)
    ),
  ];
  return [header, ...rows]
    .map((row) => row.map((cell) => csvCell(String(cell))).join(","))
    .join("\n");
}

function rowFor(section: string, item: PcsItem) {
  return [
    section,
    item.name,
    item.room ?? "",
    item.quantity,
    item.condition,
    item.boxCodes.join("; "),
    item.estimatedWeightLb ?? "",
    item.flags.join("; "),
    "",
    "",
  ];
}

function checklistRow(entry: PcsPacket["readinessChecklist"][number]) {
  return [
    "PCS readiness",
    entry.label,
    "",
    "",
    entry.status,
    "",
    "",
    "",
    entry.detail,
    entry.action,
  ];
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
