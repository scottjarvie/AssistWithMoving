"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, Download, Printer, ShieldAlert } from "lucide-react";

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
  buildClaimPacketPath,
  claimPacketFilename,
  formatClaimCurrency,
  formatClaimTimestamp,
  type ClaimPacketMode,
} from "@/lib/claim-packet";

type ClaimPacket = NonNullable<
  ReturnType<typeof useQuery<typeof api.claimPackets.getForMove>>
>;

export function PrintableClaimPacket({
  householdId,
  moveId,
  mode = "submission",
}: {
  householdId?: string;
  moveId?: string;
  mode?: ClaimPacketMode;
}) {
  const packet = useQuery(
    api.claimPackets.getForMove,
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
            <CardTitle>Insurance and claims packet</CardTitle>
            <CardDescription>
              Select a move before exporting a claim evidence packet.
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
            Insurance and claims packet
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Build a focused evidence packet for damaged, missing, high-value,
            or review-needed items.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant={!ownerMode ? "default" : "outline"}>
            <Link href={buildClaimPacketPath({ householdId, moveId })}>
              <ShieldAlert aria-hidden="true" />
              Submission
            </Link>
          </Button>
          <Button asChild variant={ownerMode ? "default" : "outline"}>
            <Link
              href={buildClaimPacketPath({
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
                ? downloadCsv(claimPacketFilename(mode), claimPacketToCsv(packet))
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
                  MovingManifest Insurance and Claims Packet
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {packet.disclaimer}
                </p>
              </div>
              <Badge variant={ownerMode ? "outline" : "secondary"}>
                {ownerMode ? "owner audit" : "claim submission"}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              <Metric label="Claim items" value={packet.summary.claimItemCount} />
              <Metric label="Photos" value={packet.summary.evidencePhotoCount} />
              <Metric label="Warnings" value={packet.summary.warningCount} />
              <Metric
                label="High severity"
                value={packet.summary.highSeverityCount}
              />
              <Metric
                label="Avg score"
                value={`${packet.summary.averageEvidenceScore}/100`}
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
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Info
                label="Declared value"
                value={formatClaimCurrency(packet.summary.totalValueCents)}
              />
              <Info
                label="Replacement value"
                value={formatClaimCurrency(
                  packet.summary.totalReplacementValueCents
                )}
              />
            </div>
          </section>

          <TotalsSection title="Severity summary" rows={packet.sections.severityTotals} />
          <TotalsSection title="Status summary" rows={packet.sections.statusTotals} />
          <TotalsSection
            title="Condition summary"
            rows={packet.sections.conditionTotals}
          />

          <section className="packet-section rounded-md border border-border p-4">
            <h2 className="text-xl font-semibold tracking-normal">
              Claim evidence items
            </h2>
            <div className="mt-3 overflow-x-auto rounded-md border border-border">
              <table className="packet-table w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Condition</th>
                    <th className="px-2 py-2">Severity</th>
                    <th className="px-2 py-2">Value</th>
                    <th className="px-2 py-2">Serial/model</th>
                    <th className="px-2 py-2">Evidence</th>
                    <th className="px-2 py-2">Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {packet.sections.claimItems.map((item) => (
                    <tr
                      key={item.itemId}
                      className="border-b border-border align-top last:border-b-0"
                    >
                      <td className="px-2 py-2">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[item.room, item.category].filter(Boolean).join(" / ") ||
                            "Uncategorized"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.claim.relevanceReasons.join(", ")}
                        </p>
                      </td>
                      <td className="px-2 py-2">{item.status}</td>
                      <td className="px-2 py-2">{item.condition}</td>
                      <td className="px-2 py-2">
                        <Badge variant={severityVariant(item.claim.severity)}>
                          {item.claim.severity}
                        </Badge>
                      </td>
                      <td className="px-2 py-2">
                        <p>{formatClaimCurrency(item.claim.valueCents)}</p>
                        <p className="text-xs text-muted-foreground">
                          repl.{" "}
                          {formatClaimCurrency(
                            item.claim.replacementValueCents
                          )}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        {[item.claim.serialNumber, item.claim.modelNumber]
                          .filter(Boolean)
                          .join(" / ") || "Not documented"}
                      </td>
                      <td className="px-2 py-2">
                        <p>{item.photoEvidence.length} photos</p>
                        <p className="text-xs text-muted-foreground">
                          score {item.claim.evidenceScore}/100
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.boxTrail.map((box) => box.code).join(", ") ||
                            "unboxed"}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        {item.claim.evidenceWarnings.length ? (
                          <ul className="list-inside list-disc space-y-1">
                            {item.claim.evidenceWarnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        ) : (
                          "No packet warnings"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="packet-section rounded-md border border-border p-4">
            <h2 className="text-xl font-semibold tracking-normal">
              Photo evidence metadata
            </h2>
            <div className="mt-3 overflow-x-auto rounded-md border border-border">
              <table className="packet-table w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Verification</th>
                    <th className="px-2 py-2">Captured</th>
                    <th className="px-2 py-2">Uploaded</th>
                    <th className="px-2 py-2">Caption</th>
                  </tr>
                </thead>
                <tbody>
                  {packet.sections.claimItems.flatMap((item) =>
                    item.photoEvidence.map((photo) => (
                      <tr
                        key={photo.photoId}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-2 py-2 font-medium">{item.name}</td>
                        <td className="px-2 py-2">{photo.photoType}</td>
                        <td className="px-2 py-2">
                          {photo.verificationStatus}
                        </td>
                        <td className="px-2 py-2">
                          {formatClaimTimestamp(photo.capturedAt)}
                        </td>
                        <td className="px-2 py-2">
                          {formatClaimTimestamp(photo.uploadedAt)}
                        </td>
                        <td className="px-2 py-2">
                          {photo.caption ?? "No caption"}
                          {ownerMode && photo.owner?.notes ? (
                            <span className="block text-xs text-muted-foreground">
                              Owner note: {photo.owner.notes}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
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
}: {
  title: string;
  rows: ClaimPacket["sections"]["severityTotals"];
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
              <th className="px-2 py-2">Declared value</th>
              <th className="px-2 py-2">Replacement value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border last:border-b-0">
                <td className="px-2 py-2 font-medium">{row.label}</td>
                <td className="px-2 py-2">{row.itemCount}</td>
                <td className="px-2 py-2">
                  {formatClaimCurrency(row.valueCents)}
                </td>
                <td className="px-2 py-2">
                  {formatClaimCurrency(row.replacementValueCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function severityVariant(severity: string) {
  return severity === "high"
    ? "destructive"
    : severity === "medium"
      ? "secondary"
      : "outline";
}

function claimPacketToCsv(packet: ClaimPacket) {
  const header = [
    "item",
    "room",
    "status",
    "condition",
    "severity",
    "value",
    "replacement_value",
    "serial_number",
    "model_number",
    "photo_count",
    "evidence_score",
    "warnings",
    "box_codes",
  ];
  const rows = packet.sections.claimItems.map((item) => [
    item.name,
    item.room ?? "",
    item.status,
    item.condition,
    item.claim.severity,
    item.claim.valueCents ?? "",
    item.claim.replacementValueCents ?? "",
    item.claim.serialNumber ?? "",
    item.claim.modelNumber ?? "",
    item.photoEvidence.length,
    item.claim.evidenceScore,
    item.claim.evidenceWarnings.join("; "),
    item.boxTrail.map((box) => box.code).join("; "),
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
