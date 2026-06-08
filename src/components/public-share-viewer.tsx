"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { AlertTriangle, Download, Printer, ShieldCheck } from "lucide-react";

import { api } from "../../convex/_generated/api";
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
import type { SubManifestKind } from "@/lib/sub-manifest";
import { subManifestFilename } from "@/lib/sub-manifest";

type ShareMetadata = {
  role: string;
  allowedActions: string[];
  expiresAt: number;
  label?: string;
  canDownload: boolean;
  canStatusUpdate: boolean;
  canComment: boolean;
  canUploadEvidence: boolean;
};

type PublicSubManifestPacket = {
  kind: SubManifestKind;
  mode: "recipient";
  generatedAt: number;
  title: string;
  disclaimer: string;
  move: {
    title: string;
    origin?: string;
    destination?: string;
    dateStart?: string;
    dateEnd?: string;
    notes?: string;
  };
  visibility: {
    ownerPrivateFieldsShown: boolean;
    valuesHidden: boolean;
    serialsHidden: boolean;
    privateNotesHidden: boolean;
    rawStorageHidden: boolean;
  };
  summary: {
    itemCount: number;
    quantity: number;
    boxCount: number;
    photoCount: number;
    estimatedWeightLb: number;
    estimatedVolumeCuFt: number;
    totalValueCents?: number;
  };
  sections: {
    boxes: Array<{
      boxId: string;
      code: string;
      label?: string;
      room?: string;
      status: string;
      assignedResource?: string;
      assignedZone?: string;
    }>;
    items: Array<{
      itemId: string;
      name: string;
      description?: string;
      room?: string;
      category?: string;
      quantity: number;
      disposition: string;
      status: string;
      condition: string;
      photoCount: number;
      estimatedWeightLb?: number;
      boxTrail: Array<{ code: string; label?: string }>;
      owner?: never;
    }>;
  };
};

type PublicShareView =
  | {
      status: "ready";
      kind: "subManifest";
      shareLink: ShareMetadata;
      profile: { name: string; type: string; disclaimer?: string };
      packet: PublicSubManifestPacket;
    }
  | {
      status: "unsupported";
      reason: string;
      shareLink: ShareMetadata;
      profile?: { name: string; type: string };
    };

export function PublicShareViewer({ token }: { token: string }) {
  const resolvePublicView = useAction(api.shareLinks.resolvePublicView);
  const [view, setView] = useState<PublicShareView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function resolve() {
      setLoading(true);
      setError(null);
      try {
        const result = (await resolvePublicView({
          token,
          accessMetadata: { route: "public_share" },
        })) as PublicShareView;
        if (alive) {
          setView(result);
        }
      } catch (unknownError) {
        if (alive) {
          setView(null);
          setError(
            unknownError instanceof Error
              ? unknownError.message
              : "This share link could not be opened."
          );
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    void resolve();
    return () => {
      alive = false;
    };
  }, [resolvePublicView, token]);

  if (loading) {
    return (
      <main className="min-h-screen p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-4/5" />
        </div>
      </main>
    );
  }

  if (error || !view) {
    return (
      <PublicShareShell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
              Share link unavailable
            </CardTitle>
            <CardDescription>
              {error ?? "This token is invalid, expired, or revoked."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/">Open MovingManifest</Link>
            </Button>
          </CardContent>
        </Card>
      </PublicShareShell>
    );
  }

  if (view.status === "unsupported") {
    return (
      <PublicShareShell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              Share link verified
            </CardTitle>
            <CardDescription>{view.reason}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <p>
              Profile: {view.profile?.name ?? view.shareLink.label ?? "Scoped packet"}
            </p>
            <p>Role: {view.shareLink.role}</p>
          </CardContent>
        </Card>
      </PublicShareShell>
    );
  }

  return (
    <PublicShareShell>
      <PublicSubManifest view={view} />
    </PublicShareShell>
  );
}

function PublicShareShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto max-w-6xl">{children}</div>
    </main>
  );
}

function PublicSubManifest({
  view,
}: {
  view: Extract<PublicShareView, { status: "ready" }>;
}) {
  const { packet, shareLink, profile } = view;
  const canDownload = shareLink.canDownload;

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          .print-hidden { display: none !important; }
          body { background: white !important; }
          .packet-page { color: #111 !important; }
          .packet-section { break-inside: avoid; page-break-inside: avoid; }
          .packet-table th, .packet-table td { border-color: #111 !important; }
        }
      `}</style>

      <div className="print-hidden flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">MovingManifest shared packet</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">
            {profile.name}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">recipient safe</Badge>
          <Badge variant="outline">{shareLink.role}</Badge>
          {canDownload ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                downloadCsv(
                  subManifestFilename(packet.kind, "recipient"),
                  subManifestToCsv(packet)
                )
              }
            >
              <Download aria-hidden="true" />
              CSV
            </Button>
          ) : null}
          <Button type="button" onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            Print
          </Button>
        </div>
      </div>

      <div className="packet-page space-y-4">
        <section className="packet-section rounded-md border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal">
                {packet.title}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {profile.disclaimer ?? packet.disclaimer}
              </p>
            </div>
            <Badge variant="outline">
              Expires {new Date(shareLink.expiresAt).toLocaleDateString()}
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
            <Info label="Destination" value={packet.move.destination ?? "Not set"} />
            <Info
              label="Window"
              value={
                [packet.move.dateStart, packet.move.dateEnd].filter(Boolean).join(" to ") ||
                "Not set"
              }
            />
          </div>
        </section>

        <section className="packet-section rounded-md border border-border p-4">
          <h2 className="text-xl font-semibold tracking-normal">Privacy boundary</h2>
          <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <p>Values hidden: {packet.visibility.valuesHidden ? "Yes" : "No"}</p>
            <p>Serials hidden: {packet.visibility.serialsHidden ? "Yes" : "No"}</p>
            <p>
              Private notes hidden:{" "}
              {packet.visibility.privateNotesHidden ? "Yes" : "No"}
            </p>
            <p>Original storage hidden: {packet.visibility.rawStorageHidden ? "Yes" : "No"}</p>
          </div>
        </section>

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
                    <td className="px-2 py-2">{box.assignedResource ?? "unassigned"}</td>
                    <td className="px-2 py-2">{box.assignedZone ?? "any"}</td>
                  </tr>
                ))}
                {!packet.sections.boxes.length ? (
                  <tr>
                    <td className="px-2 py-4 text-muted-foreground" colSpan={5}>
                      No boxes are included in this scoped packet.
                    </td>
                  </tr>
                ) : null}
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
                        {item.description ?? item.category ?? "No description"}
                      </p>
                    </td>
                    <td className="px-2 py-2">{item.room ?? "unset"}</td>
                    <td className="px-2 py-2">{item.quantity}</td>
                    <td className="px-2 py-2">{item.disposition}</td>
                    <td className="px-2 py-2">{item.status}</td>
                    <td className="px-2 py-2">{item.condition}</td>
                    <td className="px-2 py-2">
                      {item.boxTrail.map((box) => box.code).join(", ") || "unboxed"}
                    </td>
                    <td className="px-2 py-2">{item.photoCount}</td>
                  </tr>
                ))}
                {!packet.sections.items.length ? (
                  <tr>
                    <td className="px-2 py-4 text-muted-foreground" colSpan={8}>
                      No items match this scoped packet yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
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

function subManifestToCsv(packet: PublicSubManifestPacket) {
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
