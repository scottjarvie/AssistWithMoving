"use client";

import Link from "next/link";
import { useMemo } from "react";
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
  formatBoxWeightSource,
  formatBoxWeightValue,
} from "@/lib/box-weight";

type PacketMode = "crew" | "owner";
type BoxRecord = NonNullable<
  ReturnType<typeof useQuery<typeof api.boxes.listForMove>>
>[number];
type ResourceWithZones = NonNullable<
  ReturnType<typeof useQuery<typeof api.transportResources.listForMoveWithZones>>
>[number];
type EstimateReport = NonNullable<
  ReturnType<typeof useQuery<typeof api.estimates.reportForMove>>
>;
type BoxReport = EstimateReport["boxReports"][number];

export function PrintableLoadPlanPacket({
  householdId,
  moveId,
  mode = "crew",
}: {
  householdId?: string;
  moveId?: string;
  mode?: PacketMode;
}) {
  const boxes = useQuery(
    api.boxes.listForMove,
    householdId && moveId
      ? {
          householdId: householdId as Id<"households">,
          moveId: moveId as Id<"moves">,
        }
      : "skip"
  );
  const resourcesWithZones = useQuery(
    api.transportResources.listForMoveWithZones,
    householdId && moveId
      ? {
          householdId: householdId as Id<"households">,
          moveId: moveId as Id<"moves">,
        }
      : "skip"
  );
  const report = useQuery(
    api.estimates.reportForMove,
    householdId && moveId
      ? {
          householdId: householdId as Id<"households">,
          moveId: moveId as Id<"moves">,
        }
      : "skip"
  );
  const safeMode = mode !== "owner";

  const boxReportById = useMemo(
    () =>
      new Map(
        report?.boxReports.map((boxReport) => [boxReport.boxId, boxReport]) ?? []
      ),
    [report]
  );
  const resourceReportById = useMemo(
    () =>
      new Map(
        report?.resourceReports.map((resourceReport) => [
          resourceReport.resourceId,
          resourceReport,
        ]) ?? []
      ),
    [report]
  );
  const zoneNameById = useMemo(() => {
    const zones = new Map<string, string>();
    for (const resourceWithZones of resourcesWithZones ?? []) {
      for (const zone of resourceWithZones.zones) {
        zones.set(zone._id, zone.name);
      }
    }
    return zones;
  }, [resourcesWithZones]);
  const packet = useMemo(
    () =>
      boxes && resourcesWithZones && report
        ? buildPacketModel({
            boxes,
            resourcesWithZones,
            boxReportById,
            resourceReportById,
          })
        : null,
    [boxes, boxReportById, report, resourceReportById, resourcesWithZones]
  );

  if (!householdId || !moveId) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Load plan packet</CardTitle>
            <CardDescription>
              Select a move from the dashboard before exporting a packet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/app/dashboard#load-plan">
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
            Load plan packet
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Print or download the current load plan by resource, zone, and
            exception category.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant={safeMode ? "default" : "outline"}>
            <Link
              href={`/app/load-plan-packet?${new URLSearchParams({
                householdId,
                moveId,
                mode: "crew",
              }).toString()}`}
            >
              <ShieldCheck aria-hidden="true" />
              Crew safe
            </Link>
          </Button>
          <Button asChild variant={!safeMode ? "default" : "outline"}>
            <Link
              href={`/app/load-plan-packet?${new URLSearchParams({
                householdId,
                moveId,
                mode: "owner",
              }).toString()}`}
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
                ? downloadCsv({
                    filename: `movingmanifest-load-plan-${mode}.csv`,
                    csv: packetToCsv(packet, safeMode, zoneNameById),
                  })
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
                  Assist With Moving Load Plan
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {safeMode
                    ? "Crew-safe packet: values, serials, private notes, and sensitive photo details are omitted."
                    : "Owner packet: includes full operational details currently available in the planner."}
                </p>
              </div>
              <Badge variant={safeMode ? "secondary" : "outline"}>
                {safeMode ? "crew safe" : "owner private"}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <PacketMetric label="Boxes" value={packet.totals.boxCount} />
              <PacketMetric label="Items" value={packet.totals.itemCount} />
              <PacketMetric
                label="Weight"
                value={`${formatNumber(packet.totals.weightLb)} lb`}
              />
              <PacketMetric
                label="Volume"
                value={`${formatNumber(packet.totals.volumeCuFt)} cu ft`}
              />
            </div>
          </section>

          <section className="packet-section rounded-md border border-border p-4">
            <h2 className="text-xl font-semibold tracking-normal">
              Exception lists
            </h2>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              <ExceptionBlock title="Unassigned" boxes={packet.exceptions.unassigned} />
              <ExceptionBlock title="Fragile" boxes={packet.exceptions.fragile} />
              <ExceptionBlock
                title="First night"
                boxes={packet.exceptions.firstNight}
              />
              <ExceptionBlock
                title="High value"
                boxes={packet.exceptions.highValue}
              />
              <ExceptionBlock
                title="Do not move / personal"
                boxes={packet.exceptions.personal}
              />
              <ExceptionBlock
                title="Assignment warnings"
                boxes={packet.exceptions.warnings}
              />
            </div>
          </section>

          <section className="space-y-4">
            {packet.resources.map((resource) => (
              <div
                key={resource.resourceId}
                className="packet-section rounded-md border border-border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-normal">
                      {resource.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {resource.type}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">
                      {formatNumber(resource.estimatedWeightLb)} lb
                    </Badge>
                    <Badge variant="outline">
                      {formatNumber(resource.estimatedVolumeCuFt)} cu ft
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  {resource.zones.map((zone) => (
                    <ZoneTable
                      key={zone.zoneId}
                      title={zone.name}
                      boxes={zone.boxes}
                      safeMode={safeMode}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="packet-section rounded-md border border-border p-4">
              <h2 className="text-xl font-semibold tracking-normal">Unassigned</h2>
              <ZoneTable
                title="No resource"
                boxes={packet.unassigned}
                safeMode={safeMode}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function PacketMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ExceptionBlock({ title, boxes }: { title: string; boxes: PacketBox[] }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Badge variant={boxes.length ? "secondary" : "outline"}>
          {boxes.length}
        </Badge>
      </div>
      {boxes.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {boxes.slice(0, 16).map((box) => (
            <Badge key={box.boxId} variant="outline">
              {box.code}
            </Badge>
          ))}
          {boxes.length > 16 ? (
            <Badge variant="outline">+{boxes.length - 16} more</Badge>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">None in this packet.</p>
      )}
    </div>
  );
}

function ZoneTable({
  title,
  boxes,
  safeMode,
}: {
  title: string;
  boxes: PacketBox[];
  safeMode: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-normal">{title}</h3>
        <Badge variant="outline">{boxes.length} boxes</Badge>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="packet-table w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2">Code</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">From</th>
              <th className="px-2 py-2">To</th>
              <th className="px-2 py-2">Items</th>
              <th className="px-2 py-2">Weight</th>
              <th className="px-2 py-2">Flags</th>
              {!safeMode ? <th className="px-2 py-2">Contents</th> : null}
            </tr>
          </thead>
          <tbody>
            {boxes.map((box) => (
              <tr key={box.boxId} className="border-b border-border last:border-b-0">
                <td className="px-2 py-2 font-medium">{box.code}</td>
                <td className="px-2 py-2">{box.status}</td>
                <td className="px-2 py-2">{box.room ?? "unset"}</td>
                <td className="px-2 py-2">{box.destinationRoom ?? "unset"}</td>
                <td className="px-2 py-2">{box.itemCount}</td>
                <td className="px-2 py-2">
                  <div>{formatBoxWeightValue(box.weightSummary)}</div>
                  <div className="text-xs text-muted-foreground">
                    {box.weightSourceLabel}
                  </div>
                </td>
                <td className="px-2 py-2">{box.flags.join(", ") || "none"}</td>
                {!safeMode ? (
                  <td className="px-2 py-2">
                    {box.contents.map((entry) => entry.name).join(", ") || "none"}
                  </td>
                ) : null}
              </tr>
            ))}
            {!boxes.length ? (
              <tr>
                <td
                  colSpan={safeMode ? 7 : 8}
                  className="px-2 py-4 text-muted-foreground"
                >
                  No boxes in this section.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type PacketBox = {
  boxId: Id<"boxes">;
  code: string;
  label?: string;
  status: string;
  room?: string;
  destinationRoom?: string;
  assignedResourceId?: Id<"transportResources">;
  assignedZoneId?: Id<"transportZones">;
  itemCount: number;
  weightLb: number;
  weightSourceLabel: string;
  weightSummary: {
    valueLb?: number;
    label?: string;
    source?: string;
  };
  volumeCuFt: number;
  flags: string[];
  contents: { name: string; quantity: number }[];
};

function buildPacketModel({
  boxes,
  resourcesWithZones,
  boxReportById,
  resourceReportById,
}: {
  boxes: BoxRecord[];
  resourcesWithZones: ResourceWithZones[];
  boxReportById: Map<Id<"boxes">, BoxReport>;
  resourceReportById: Map<
    Id<"transportResources">,
    EstimateReport["resourceReports"][number]
  >;
}) {
  const packetBoxes = boxes.map((record) =>
    packetBoxFor(record, boxReportById.get(record.box._id))
  );
  const resources = resourcesWithZones.map(({ resource, zones }) => {
    const resourceReport = resourceReportById.get(resource._id);
    const resourceBoxes = packetBoxes.filter(
      (box) => box.assignedResourceId === resource._id
    );
    return {
      resourceId: resource._id,
      name: resource.name,
      type: resource.type,
      estimatedWeightLb: resourceReport?.estimatedWeightLb ?? 0,
      estimatedVolumeCuFt: resourceReport?.estimatedVolumeCuFt ?? 0,
      zones: [
        {
          zoneId: `${resource._id}:any`,
          name: "Any zone",
          boxes: resourceBoxes.filter((box) => !box.assignedZoneId),
        },
        ...zones.map((zone) => ({
          zoneId: zone._id,
          name: zone.name,
          boxes: resourceBoxes.filter((box) => box.assignedZoneId === zone._id),
        })),
      ],
    };
  });
  const unassigned = packetBoxes.filter((box) => !box.assignedResourceId);
  const exceptions = {
    unassigned,
    fragile: packetBoxes.filter((box) => box.flags.includes("fragile")),
    firstNight: packetBoxes.filter((box) => box.flags.includes("first night")),
    highValue: packetBoxes.filter((box) => box.flags.includes("high value")),
    personal: packetBoxes.filter(
      (box) =>
        box.flags.includes("personal transport") ||
        box.flags.includes("do not move")
    ),
    warnings: packetBoxes.filter((box) =>
      box.flags.some((flag) => flag.startsWith("warning:"))
    ),
  };

  return {
    resources,
    unassigned,
    exceptions,
    totals: {
      boxCount: packetBoxes.length,
      itemCount: packetBoxes.reduce((sum, box) => sum + box.itemCount, 0),
      weightLb: packetBoxes.reduce((sum, box) => sum + box.weightLb, 0),
      volumeCuFt: packetBoxes.reduce((sum, box) => sum + box.volumeCuFt, 0),
    },
  };
}

function packetBoxFor(record: BoxRecord, report?: BoxReport): PacketBox {
  const flags = new Set<string>();
  const weightSummary = report?.weightSummary ?? record.weightSummary;
  for (const entry of record.contents) {
    if (!entry) continue;
    if (entry.item.fragility === "high") flags.add("fragile");
    if (entry.item.highValue) flags.add("high value");
    if (entry.item.requiresPersonalTransport) flags.add("personal transport");
    if (entry.item.planningDefaultKeys.includes("firstNight")) {
      flags.add("first night");
    }
    if (entry.item.planningDefaultKeys.includes("doNotLetMoversTouch")) {
      flags.add("do not move");
    }
  }
  for (const warning of [
    ...(record.box.assignmentWarnings ?? []),
    ...(record.box.assignmentHardBlocks ?? []),
    ...(report?.warnings ?? []),
  ]) {
    flags.add(`warning:${warning}`);
  }

  return {
    boxId: record.box._id,
    code: record.box.code,
    label: record.box.label,
    status: record.box.status,
    room: record.box.room,
    destinationRoom: record.box.destinationRoom,
    assignedResourceId: record.box.assignedResourceId,
    assignedZoneId: record.box.assignedZoneId,
    itemCount: record.itemCount,
    weightLb: report?.estimatedWeightLb ?? weightSummary.valueLb ?? 0,
    weightSourceLabel: formatBoxWeightSource(weightSummary),
    weightSummary,
    volumeCuFt: report?.estimatedVolumeCuFt ?? record.box.estimatedVolumeCuFt ?? 0,
    flags: Array.from(flags),
    contents: record.contents
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .map((entry) => ({
        name: entry.item.name,
        quantity: entry.membership.quantity,
      })),
  };
}

function packetToCsv(
  packet: ReturnType<typeof buildPacketModel>,
  safeMode: boolean,
  zoneNameById: Map<string, string>
) {
  const header = [
    "resource",
    "zone",
    "box_code",
    "status",
    "from_room",
    "to_room",
    "item_count",
    "weight_lb",
    "weight_source",
    "volume_cuft",
    "flags",
    ...(safeMode ? [] : ["contents"]),
  ];
  const rows = packet.resources.flatMap((resource) =>
    resource.zones.flatMap((zone) =>
      zone.boxes.map((box) => [
        resource.name,
        zone.zoneId.toString().includes(":any")
          ? "Any zone"
          : zoneNameById.get(zone.zoneId.toString()) ?? zone.name,
        box.code,
        box.status,
        box.room ?? "",
        box.destinationRoom ?? "",
        box.itemCount,
        box.weightSummary.valueLb === undefined
          ? ""
          : formatNumber(box.weightSummary.valueLb),
        box.weightSourceLabel,
        formatNumber(box.volumeCuFt),
        box.flags.join("; "),
        ...(safeMode
          ? []
          : [
              box.contents
                .map((entry) => `${entry.name} x${entry.quantity}`)
                .join("; "),
            ]),
      ])
    )
  );
  for (const box of packet.unassigned) {
    rows.push([
      "Unassigned",
      "",
      box.code,
      box.status,
      box.room ?? "",
      box.destinationRoom ?? "",
      box.itemCount,
      box.weightSummary.valueLb === undefined
        ? ""
        : formatNumber(box.weightSummary.valueLb),
      box.weightSourceLabel,
      formatNumber(box.volumeCuFt),
      box.flags.join("; "),
      ...(safeMode
        ? []
        : [
            box.contents
              .map((entry) => `${entry.name} x${entry.quantity}`)
              .join("; "),
          ]),
    ]);
  }

  return [header, ...rows]
    .map((row) => row.map((cell) => csvCell(String(cell))).join(","))
    .join("\n");
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function downloadCsv({ filename, csv }: { filename: string; csv: string }) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : "0";
}
