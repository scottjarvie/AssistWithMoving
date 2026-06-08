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
  buildMoverPacketPath,
  moverModeLabel,
  moverPacketFilename,
  type MoverPacketMode,
} from "@/lib/mover-packet";

type MoverPacket = NonNullable<
  ReturnType<typeof useQuery<typeof api.moverPackets.getForMove>>
>;
type MoverBox = MoverPacket["sections"]["allBoxes"][number];

export function PrintableMoverPacket({
  householdId,
  moveId,
  mode = "movingCompany",
}: {
  householdId?: string;
  moveId?: string;
  mode?: MoverPacketMode;
}) {
  const packet = useQuery(
    api.moverPackets.getForMove,
    householdId && moveId
      ? {
          householdId: householdId as Id<"households">,
          moveId: moveId as Id<"moves">,
          mode,
        }
      : "skip"
  );

  if (!householdId || !moveId) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Mover packet</CardTitle>
            <CardDescription>
              Select a move before exporting a mover or load crew packet.
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
            Mover packet
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Print or download box codes, load destinations, handling flags,
            and exception lists for movers and helpers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeButton householdId={householdId} moveId={moveId} mode="movingCompany" active={mode === "movingCompany"} />
          <ModeButton householdId={householdId} moveId={moveId} mode="loadCrew" active={mode === "loadCrew"} />
          <ModeButton householdId={householdId} moveId={moveId} mode="owner" active={mode === "owner"} />
          <Button
            type="button"
            variant="outline"
            disabled={!packet}
            onClick={() =>
              packet
                ? downloadCsv(moverPacketFilename(mode), moverPacketToCsv(packet))
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
                  MovingManifest {moverModeLabel(packet.mode)} Packet
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Values, serial numbers, private notes, and unrelated household
                  records are hidden unless owner-private mode is selected.
                </p>
              </div>
              <Badge variant={packet.mode === "owner" ? "outline" : "secondary"}>
                {packet.mode === "owner" ? "owner private" : "recipient safe"}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              <Metric label="Boxes" value={packet.summary.boxCount} />
              <Metric label="Items" value={packet.summary.itemCount} />
              <Metric label="Clear" value={packet.summary.clearCount} />
              <Metric label="Attention" value={packet.summary.attentionCount} />
              <Metric label="Blockers" value={packet.summary.blockerCount} />
            </div>
          </section>

          <section className="packet-section rounded-md border border-border p-4">
            <h2 className="text-xl font-semibold tracking-normal">
              Exception list
            </h2>
            <BoxTable boxes={packet.sections.attention} showContents={packet.visibility.contentsShown} />
          </section>

          <section className="space-y-4">
            {packet.sections.resources.map((resource) => (
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
                </div>
                <div className="mt-4 space-y-4">
                  {resource.zones.map((zone) => (
                    <div key={zone.zoneId.toString()}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold">{zone.name}</h3>
                        <Badge variant="outline">{zone.boxes.length} boxes</Badge>
                      </div>
                      <BoxTable
                        boxes={zone.boxes}
                        showContents={packet.visibility.contentsShown}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <section className="packet-section rounded-md border border-border p-4">
              <h2 className="text-xl font-semibold tracking-normal">
                Unassigned
              </h2>
              <BoxTable
                boxes={packet.sections.unassigned}
                showContents={packet.visibility.contentsShown}
              />
            </section>
          </section>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  householdId,
  moveId,
  mode,
  active,
}: {
  householdId: string;
  moveId: string;
  mode: MoverPacketMode;
  active: boolean;
}) {
  return (
    <Button asChild variant={active ? "default" : "outline"}>
      <Link href={buildMoverPacketPath({ householdId, moveId, mode })}>
        {mode !== "owner" ? <ShieldCheck aria-hidden="true" /> : null}
        {moverModeLabel(mode)}
      </Link>
    </Button>
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

function BoxTable({
  boxes,
  showContents,
}: {
  boxes: MoverBox[];
  showContents: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="packet-table w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-2 py-2">Code</th>
            <th className="px-2 py-2">Status</th>
            <th className="px-2 py-2">From</th>
            <th className="px-2 py-2">To</th>
            <th className="px-2 py-2">Load target</th>
            <th className="px-2 py-2">Items</th>
            <th className="px-2 py-2">Flags</th>
            <th className="px-2 py-2">Warnings</th>
            {showContents ? <th className="px-2 py-2">Contents</th> : null}
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
              <td className="px-2 py-2">{box.flags.join(", ") || "none"}</td>
              <td className="px-2 py-2">{box.warnings.join(", ") || "none"}</td>
              {showContents ? (
                <td className="px-2 py-2">
                  {box.contents
                    .map((entry) => `${entry.name} x${entry.quantity}`)
                    .join(", ") || "none"}
                </td>
              ) : null}
            </tr>
          ))}
          {!boxes.length ? (
            <tr>
              <td
                colSpan={showContents ? 9 : 8}
                className="px-2 py-4 text-muted-foreground"
              >
                No boxes in this section.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function moverPacketToCsv(packet: MoverPacket) {
  const header = [
    "box_code",
    "status",
    "from_room",
    "to_room",
    "load_target",
    "item_count",
    "flags",
    "warnings",
    ...(packet.visibility.contentsShown ? ["contents"] : []),
  ];
  const rows = packet.sections.allBoxes.map((box) => [
    box.code,
    box.status,
    box.room ?? "",
    box.destinationRoom ?? "",
    [box.assignedResource, box.assignedZone].filter(Boolean).join(" / "),
    box.itemCount,
    box.flags.join("; "),
    box.warnings.join("; "),
    ...(packet.visibility.contentsShown
      ? [box.contents.map((entry) => `${entry.name} x${entry.quantity}`).join("; ")]
      : []),
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
