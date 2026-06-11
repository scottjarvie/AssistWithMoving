"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import {
  AlertTriangle,
  Download,
  Printer,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

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
  canViewPlan: boolean;
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

type PublicDocumentationPacket = {
  packetKind: "pcs" | "movingCompany" | "loadCrew" | "employer" | "claim";
  profileType: string;
  title: string;
  generatedAt: number;
  recipientMode: string;
  disclaimer?: string;
  move: {
    title: string;
    type: string;
    origin?: string;
    destination?: string;
    dateStart?: string;
    dateEnd?: string;
    pcsBranch?: string;
    pcsRankPayGrade?: string;
    pcsDependentStatus?: string;
    pcsShipmentType?: string;
    pcsAllowanceNotes?: string;
    pcsTransportationOfficeNotes?: string;
    pcsRestrictedItemsNotes?: string;
    proGearNotes?: string;
    moveLevelWeightAllowanceLb?: number;
  };
  visibility: {
    ownerPrivateFieldsShown: boolean;
    valuesHidden: boolean;
    serialsHidden: boolean;
    privateNotesHidden: boolean;
    rawStorageHidden: boolean;
    disclosure?: string;
  };
  summary: {
    itemCount: number;
    boxCount: number;
    photoCount: number;
    totalEstimatedWeightLb: number;
    totalEstimatedVolumeCuFt: number;
    totalValueCents?: number;
    metrics: Array<{ label: string; value: string | number }>;
  };
  sections: {
    boxes: Array<{
      boxId: string;
      code: string;
      label?: string;
      room?: string;
      destinationRoom?: string;
      status: string;
      assignedResource?: string;
      assignedZone?: string;
      itemCount: number;
      estimatedWeightLb?: number;
      estimatedVolumeCuFt?: number;
      warnings: string[];
    }>;
    items: Array<{
      itemId: string;
      name: string;
      description?: string;
      room?: string;
      destinationRoom?: string;
      category?: string;
      disposition: string;
      status: string;
      condition: string;
      quantity: number;
      estimatedWeightLb?: number;
      estimatedVolumeCuFt?: number;
      photoCount: number;
      boxCodes: string[];
      flags: string[];
      claim?: {
        relevanceReasons: string[];
        evidenceScore: number;
        evidenceWarnings: string[];
        valueCents?: number;
        replacementValueCents?: number;
        serialNumber?: string;
        modelNumber?: string;
      };
    }>;
  };
};

type PublicPlanPacket = {
  plan: {
    planId: string;
    moveId: string;
    name: string;
    kind: string;
    moveTitle: string;
    updatedAt: number;
  };
  privacy: {
    underlayHidden: boolean;
    valuesHidden: boolean;
    privateNotesHidden: boolean;
    annotationsHidden: boolean;
  };
  levels: Array<{
    levelId: string;
    name: string;
    levelType: string;
    svg: string;
    rooms: Array<{
      roomId: string;
      shortId: string;
      name: string;
      areaSqFt: number;
      placed: Array<{
        placementId: string;
        shortId: string;
        label: string;
      }>;
      items: Array<{
        itemId: string;
        name: string;
        quantity: number;
        room?: string;
        category?: string;
        status: string;
        fragility: string;
        doNotLetMoversTouch: boolean;
        fragile: boolean;
      }>;
      boxes: Array<{
        boxId: string;
        code: string;
        label?: string;
        room?: string;
        status: string;
        itemCount: number;
      }>;
    }>;
  }>;
  unplaced: {
    items: PublicPlanPacket["levels"][number]["rooms"][number]["items"];
    boxes: PublicPlanPacket["levels"][number]["rooms"][number]["boxes"];
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
      status: "ready";
      kind: "documentationPacket";
      shareLink: ShareMetadata;
      profile: { name: string; type: string; disclaimer?: string };
      packet: PublicDocumentationPacket;
    }
  | {
      status: "ready";
      kind: "plan";
      shareLink: ShareMetadata;
      plan: PublicPlanPacket;
    }
  | {
      status: "unsupported";
      reason: string;
      shareLink: ShareMetadata;
      profile?: { name: string; type: string };
    };

type PublicItemStatus =
  | "draft"
  | "active"
  | "packed"
  | "staged"
  | "loaded"
  | "delivered"
  | "missing"
  | "damaged"
  | "archived";

type PublicBoxStatus =
  | "open"
  | "packing"
  | "sealed"
  | "staged"
  | "loaded"
  | "delivered"
  | "missing"
  | "damaged"
  | "archived";

type PublicStatusUpdateTarget =
  | {
      type: "item";
      itemId: Id<"items">;
      status: PublicItemStatus;
    }
  | {
      type: "box";
      boxId: Id<"boxes">;
      status: PublicBoxStatus;
    };

type PublicStatusUpdateHandler = (
  target: PublicStatusUpdateTarget
) => Promise<void>;

type PublicCommentInput = {
  body: string;
  authorLabel?: string;
};

type PublicCommentHandler = (input: PublicCommentInput) => Promise<boolean>;

const publicItemStatusOptions = [
  "packed",
  "staged",
  "loaded",
  "delivered",
  "missing",
  "damaged",
] as const satisfies readonly PublicItemStatus[];

const publicBoxStatusOptions = [
  "sealed",
  "staged",
  "loaded",
  "delivered",
  "missing",
  "damaged",
] as const satisfies readonly PublicBoxStatus[];

export function PublicShareViewer({ token }: { token: string }) {
  const resolvePublicView = useAction(api.shareLinks.resolvePublicView);
  const updatePublicStatus = useAction(api.shareLinks.updatePublicStatus);
  const createPublicComment = useAction(api.shareLinks.createPublicComment);
  const [view, setView] = useState<PublicShareView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [workingTarget, setWorkingTarget] = useState<string | null>(null);
  const [commentMessage, setCommentMessage] = useState<string | null>(null);
  const [commentWorking, setCommentWorking] = useState(false);

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
          setError(publicShareErrorMessage(unknownError));
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

  async function handleStatusUpdate(target: PublicStatusUpdateTarget) {
    setStatusMessage(null);
    setWorkingTarget(statusTargetKey(target));
    try {
      const result = await updatePublicStatus({
        token,
        target,
        accessMetadata: { route: "public_share", action: "status_update" },
      });
      const nextView = (await resolvePublicView({
        token,
        accessMetadata: { route: "public_share", after: "status_update" },
      })) as PublicShareView;
      setView(nextView);
      setStatusMessage(
        result.changed
          ? `Status updated to ${result.nextStatus}.`
          : `Status was already ${result.nextStatus}.`
      );
    } catch (unknownError) {
      setStatusMessage(
        unknownError instanceof Error
          ? unknownError.message
          : "Status update failed."
      );
    } finally {
      setWorkingTarget(null);
    }
  }

  async function handlePublicComment(input: PublicCommentInput) {
    setCommentMessage(null);
    setCommentWorking(true);
    try {
      await createPublicComment({
        token,
        body: input.body,
        authorLabel: input.authorLabel,
        accessMetadata: { route: "public_share", action: "comment" },
      });
      setCommentMessage("Note sent.");
      return true;
    } catch (unknownError) {
      setCommentMessage(
        unknownError instanceof Error ? unknownError.message : "Note failed."
      );
      return false;
    } finally {
      setCommentWorking(false);
    }
  }

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
      {statusMessage ? (
        <p
          className="print-hidden mb-3 rounded-md border border-border p-3 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {statusMessage}
        </p>
      ) : null}
      {view.shareLink.canComment ? (
        <PublicCommentPanel
          onSubmit={handlePublicComment}
          working={commentWorking}
          message={commentMessage}
        />
      ) : null}
      {view.kind === "plan" ? (
        <PublicPlanView view={view} />
      ) : view.kind === "documentationPacket" ? (
        <PublicDocumentationPacketView
          view={view}
          onStatusUpdate={handleStatusUpdate}
          workingTarget={workingTarget}
        />
      ) : (
        <PublicSubManifest
          view={view}
          onStatusUpdate={handleStatusUpdate}
          workingTarget={workingTarget}
        />
      )}
    </PublicShareShell>
  );
}

function publicShareErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (
    /not found|expired|revoked|does not allow viewing|Server Error/i.test(message)
  ) {
    return "This token is invalid, expired, or revoked.";
  }
  return "This share link could not be opened.";
}

function PublicCommentPanel({
  onSubmit,
  working,
  message,
}: {
  onSubmit: PublicCommentHandler;
  working: boolean;
  message: string | null;
}) {
  const [authorLabel, setAuthorLabel] = useState("");
  const [body, setBody] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sent = await onSubmit({
      body,
      authorLabel: authorLabel || undefined,
    });
    if (sent) {
      setBody("");
    }
  }

  return (
    <section className="print-hidden mb-4 rounded-md border border-border p-4">
      <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
        <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]">
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={authorLabel}
            onChange={(event) => setAuthorLabel(event.target.value)}
            placeholder="Name or company"
            aria-label="Comment author"
            maxLength={80}
          />
          <textarea
            className="min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Recipient note"
            aria-label="Recipient note"
            maxLength={1200}
          />
          <Button type="submit" disabled={working || !body.trim()}>
            {working ? (
              <RefreshCw className="animate-spin" aria-hidden="true" />
            ) : null}
            Send note
          </Button>
        </div>
        {message ? (
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function PublicPlanView({
  view,
}: {
  view: Extract<PublicShareView, { status: "ready"; kind: "plan" }>;
}) {
  const { plan, shareLink } = view;
  const [activeLevelId, setActiveLevelId] = useState(
    plan.levels[0]?.levelId ?? ""
  );
  const activeLevel =
    plan.levels.find((level) => level.levelId === activeLevelId) ??
    plan.levels[0];
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const selectedRoom =
    activeLevel?.rooms.find((room) => room.roomId === selectedRoomId) ??
    activeLevel?.rooms[0] ??
    null;

  if (!activeLevel) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{plan.plan.name}</CardTitle>
          <CardDescription>No plan levels are available.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">MovingManifest plan</p>
              <CardTitle>{plan.plan.name}</CardTitle>
              <CardDescription>{plan.plan.moveTitle}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{shareLink.role}</Badge>
              <Badge variant="secondary">Plan</Badge>
            </div>
          </div>
          <div className="print-hidden flex flex-wrap gap-2">
            {plan.levels.map((level) => (
              <Button
                key={level.levelId}
                type="button"
                size="sm"
                variant={level.levelId === activeLevel.levelId ? "secondary" : "outline"}
                onClick={() => {
                  setActiveLevelId(level.levelId);
                  setSelectedRoomId(null);
                }}
              >
                {level.name}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-md border border-border bg-background">
            <div
              className="public-plan-svg overflow-auto p-2 [&_svg]:h-auto [&_svg]:min-h-[320px] [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: activeLevel.svg }}
            />
          </div>
          <div className="grid content-start gap-2">
            {activeLevel.rooms.map((room) => (
              <button
                key={room.roomId}
                type="button"
                className={
                  selectedRoom?.roomId === room.roomId
                    ? "rounded-md border border-primary bg-primary/10 p-3 text-left"
                    : "rounded-md border border-border bg-background p-3 text-left"
                }
                onClick={() => setSelectedRoomId(room.roomId)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{room.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {room.shortId} / {room.areaSqFt} sq ft
                    </div>
                  </div>
                  <Badge variant="outline">
                    {room.items.length + room.boxes.length}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedRoom ? <PublicPlanRoomManifest room={selectedRoom} /> : null}

      {plan.unplaced.items.length || plan.unplaced.boxes.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Unplaced</CardTitle>
            <CardDescription>
              {plan.unplaced.items.length} items / {plan.unplaced.boxes.length} boxes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PublicPlanManifestRows
              items={plan.unplaced.items}
              boxes={plan.unplaced.boxes}
            />
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

function PublicPlanRoomManifest({
  room,
}: {
  room: PublicPlanPacket["levels"][number]["rooms"][number];
}) {
  return (
    <Card className="sticky bottom-3 z-10 shadow-lg lg:static lg:shadow-none">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{room.name}</CardTitle>
            <CardDescription>
              {room.items.length} items / {room.boxes.length} boxes /{" "}
              {room.placed.length} placements
            </CardDescription>
          </div>
          <Badge variant="outline">{room.shortId}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <PublicPlanManifestRows items={room.items} boxes={room.boxes} />
      </CardContent>
    </Card>
  );
}

function PublicPlanManifestRows({
  items,
  boxes,
}: {
  items: PublicPlanPacket["levels"][number]["rooms"][number]["items"];
  boxes: PublicPlanPacket["levels"][number]["rooms"][number]["boxes"];
}) {
  if (!items.length && !boxes.length) {
    return <p className="text-sm text-muted-foreground">No unload rows.</p>;
  }

  return (
    <div className="grid gap-2">
      {boxes.map((box) => (
        <div
          key={`box-${box.boxId}`}
          className="rounded-md border border-border bg-background p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium">
                {box.code}
                {box.label ? ` ${box.label}` : ""}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {box.status} / {box.itemCount} items
              </div>
            </div>
            <Badge variant="secondary">Box</Badge>
          </div>
        </div>
      ))}
      {items.map((item) => (
        <div
          key={`item-${item.itemId}`}
          className="rounded-md border border-border bg-background p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{item.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Qty {item.quantity} / {item.status}
                {item.category ? ` / ${item.category}` : ""}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {item.fragile ? <Badge variant="outline">Fragile</Badge> : null}
                {item.doNotLetMoversTouch ? (
                  <Badge variant="destructive">Do not move</Badge>
                ) : null}
              </div>
            </div>
            <Badge variant="outline">Item</Badge>
          </div>
        </div>
      ))}
    </div>
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
  onStatusUpdate,
  workingTarget,
}: {
  view: Extract<PublicShareView, { status: "ready"; kind: "subManifest" }>;
  onStatusUpdate: PublicStatusUpdateHandler;
  workingTarget: string | null;
}) {
  const { packet, shareLink, profile } = view;
  const canDownload = shareLink.canDownload;
  const canStatusUpdate = shareLink.canStatusUpdate;

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
          {canStatusUpdate ? (
            <Badge variant="outline">status updates</Badge>
          ) : null}
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
                    <td className="px-2 py-2">
                      <StatusCell
                        currentStatus={box.status}
                        control={
                          canStatusUpdate ? (
                            <PublicStatusControl
                              ariaLabel={`Status for box ${box.code}`}
                              target={{
                                type: "box",
                                boxId: box.boxId as Id<"boxes">,
                                status: box.status as PublicBoxStatus,
                              }}
                              options={publicBoxStatusOptions}
                              workingTarget={workingTarget}
                              onStatusUpdate={onStatusUpdate}
                            />
                          ) : null
                        }
                      />
                    </td>
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
                    <td className="px-2 py-2">
                      <StatusCell
                        currentStatus={item.status}
                        control={
                          canStatusUpdate ? (
                            <PublicStatusControl
                              ariaLabel={`Status for ${item.name}`}
                              target={{
                                type: "item",
                                itemId: item.itemId as Id<"items">,
                                status: item.status as PublicItemStatus,
                              }}
                              options={publicItemStatusOptions}
                              workingTarget={workingTarget}
                              onStatusUpdate={onStatusUpdate}
                            />
                          ) : null
                        }
                      />
                    </td>
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

function PublicDocumentationPacketView({
  view,
  onStatusUpdate,
  workingTarget,
}: {
  view: Extract<
    PublicShareView,
    { status: "ready"; kind: "documentationPacket" }
  >;
  onStatusUpdate: PublicStatusUpdateHandler;
  workingTarget: string | null;
}) {
  const { packet, shareLink, profile } = view;
  const canDownload = shareLink.canDownload;
  const canStatusUpdate = shareLink.canStatusUpdate;
  const pcsDetails = [
    { label: "Branch", value: packet.move.pcsBranch },
    { label: "Rank / pay grade", value: packet.move.pcsRankPayGrade },
    { label: "Dependents", value: packet.move.pcsDependentStatus },
    { label: "Shipment", value: packet.move.pcsShipmentType },
    {
      label: "Weight allowance",
      value:
        typeof packet.move.moveLevelWeightAllowanceLb === "number"
          ? `${formatNumber(packet.move.moveLevelWeightAllowanceLb)} lb`
          : undefined,
    },
  ].filter((entry): entry is { label: string; value: string } =>
    Boolean(entry.value)
  );

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
          <Badge variant="outline">{packet.recipientMode}</Badge>
          <Badge variant="outline">{shareLink.role}</Badge>
          {canStatusUpdate ? (
            <Badge variant="outline">status updates</Badge>
          ) : null}
          {canDownload ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                downloadCsv(
                  documentationPacketFilename(packet),
                  documentationPacketToCsv(packet)
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
                {profile.disclaimer ?? packet.disclaimer ?? "Recipient packet"}
              </p>
            </div>
            <Badge variant="outline">
              Expires {new Date(shareLink.expiresAt).toLocaleDateString()}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {packet.summary.metrics.map((metric) => (
              <Metric
                key={metric.label}
                label={metric.label}
                value={metric.value}
              />
            ))}
          </div>
        </section>

        <section className="packet-section rounded-md border border-border p-4">
          <h2 className="text-xl font-semibold tracking-normal">Move overview</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Info label="Move" value={packet.move.title} />
            <Info label="Type" value={packet.move.type} />
            <Info label="Origin" value={packet.move.origin ?? "Not set"} />
            <Info
              label="Destination"
              value={packet.move.destination ?? "Not set"}
            />
            <Info
              label="Window"
              value={
                [packet.move.dateStart, packet.move.dateEnd]
                  .filter(Boolean)
                  .join(" to ") || "Not set"
              }
            />
          </div>

          {pcsDetails.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {pcsDetails.map((entry) => (
                <Info key={entry.label} label={entry.label} value={entry.value} />
              ))}
            </div>
          ) : null}

          {packet.packetKind === "pcs" &&
          (packet.move.pcsAllowanceNotes ||
            packet.move.pcsTransportationOfficeNotes ||
            packet.move.pcsRestrictedItemsNotes ||
            packet.move.proGearNotes) ? (
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <LongInfo
                label="Allowance notes"
                value={packet.move.pcsAllowanceNotes}
              />
              <LongInfo
                label="Transportation office notes"
                value={packet.move.pcsTransportationOfficeNotes}
              />
              <LongInfo
                label="Restricted-item notes"
                value={packet.move.pcsRestrictedItemsNotes}
              />
              <LongInfo label="Pro gear notes" value={packet.move.proGearNotes} />
            </div>
          ) : null}
        </section>

        <section className="packet-section rounded-md border border-border p-4">
          <h2 className="text-xl font-semibold tracking-normal">Privacy boundary</h2>
          {packet.visibility.disclosure ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {packet.visibility.disclosure}
            </p>
          ) : null}
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
                  <th className="px-2 py-2">Items</th>
                  <th className="px-2 py-2">Weight</th>
                  <th className="px-2 py-2">Warnings</th>
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
                    <td className="px-2 py-2">
                      {[box.room, box.destinationRoom].filter(Boolean).join(" -> ") ||
                        "unset"}
                    </td>
                    <td className="px-2 py-2">
                      <StatusCell
                        currentStatus={box.status}
                        control={
                          canStatusUpdate ? (
                            <PublicStatusControl
                              ariaLabel={`Status for box ${box.code}`}
                              target={{
                                type: "box",
                                boxId: box.boxId as Id<"boxes">,
                                status: box.status as PublicBoxStatus,
                              }}
                              options={publicBoxStatusOptions}
                              workingTarget={workingTarget}
                              onStatusUpdate={onStatusUpdate}
                            />
                          ) : null
                        }
                      />
                    </td>
                    <td className="px-2 py-2">{box.assignedResource ?? "unassigned"}</td>
                    <td className="px-2 py-2">{box.assignedZone ?? "any"}</td>
                    <td className="px-2 py-2">{box.itemCount}</td>
                    <td className="px-2 py-2">
                      {typeof box.estimatedWeightLb === "number"
                        ? `${formatNumber(box.estimatedWeightLb)} lb`
                        : "unset"}
                    </td>
                    <td className="px-2 py-2">
                      {box.warnings.length ? box.warnings.join(", ") : "clear"}
                    </td>
                  </tr>
                ))}
                {!packet.sections.boxes.length ? (
                  <tr>
                    <td className="px-2 py-4 text-muted-foreground" colSpan={8}>
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
                  <th className="px-2 py-2">
                    {packet.packetKind === "claim" ? "Claim evidence" : "Flags"}
                  </th>
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
                      {typeof item.estimatedWeightLb === "number" ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatNumber(item.estimatedWeightLb)} lb
                          {typeof item.estimatedVolumeCuFt === "number"
                            ? ` / ${formatNumber(item.estimatedVolumeCuFt)} cu ft`
                            : ""}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      {[item.room, item.destinationRoom].filter(Boolean).join(" -> ") ||
                        "unset"}
                    </td>
                    <td className="px-2 py-2">{item.quantity}</td>
                    <td className="px-2 py-2">{item.disposition}</td>
                    <td className="px-2 py-2">
                      <StatusCell
                        currentStatus={item.status}
                        control={
                          canStatusUpdate ? (
                            <PublicStatusControl
                              ariaLabel={`Status for ${item.name}`}
                              target={{
                                type: "item",
                                itemId: item.itemId as Id<"items">,
                                status: item.status as PublicItemStatus,
                              }}
                              options={publicItemStatusOptions}
                              workingTarget={workingTarget}
                              onStatusUpdate={onStatusUpdate}
                            />
                          ) : null
                        }
                      />
                    </td>
                    <td className="px-2 py-2">{item.condition}</td>
                    <td className="px-2 py-2">
                      {item.boxCodes.join(", ") || "unboxed"}
                    </td>
                    <td className="px-2 py-2">{item.photoCount}</td>
                    <td className="px-2 py-2">
                      {packet.packetKind === "claim" ? (
                        <ClaimEvidenceSummary item={item} />
                      ) : (
                        item.flags.join(", ") || "none"
                      )}
                    </td>
                  </tr>
                ))}
                {!packet.sections.items.length ? (
                  <tr>
                    <td className="px-2 py-4 text-muted-foreground" colSpan={9}>
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

function ClaimEvidenceSummary({
  item,
}: {
  item: PublicDocumentationPacket["sections"]["items"][number];
}) {
  if (!item.claim) {
    return <span>Not claim-scoped</span>;
  }

  return (
    <div className="min-w-48 space-y-1">
      <p>Score: {item.claim.evidenceScore}</p>
      <p>Value: {formatCurrency(item.claim.valueCents)}</p>
      <p>Replacement: {formatCurrency(item.claim.replacementValueCents)}</p>
      <p>Serial/model: {[item.claim.serialNumber, item.claim.modelNumber].filter(Boolean).join(" / ") || "unset"}</p>
      <p>
        Reasons:{" "}
        {item.claim.relevanceReasons.length
          ? item.claim.relevanceReasons.join(", ")
          : "none"}
      </p>
      {item.claim.evidenceWarnings.length ? (
        <p>Warnings: {item.claim.evidenceWarnings.join(", ")}</p>
      ) : null}
    </div>
  );
}

function StatusCell({
  currentStatus,
  control,
}: {
  currentStatus: string;
  control: React.ReactNode;
}) {
  return (
    <div className="min-w-32 space-y-1">
      <span>{currentStatus}</span>
      {control}
    </div>
  );
}

function PublicStatusControl({
  ariaLabel,
  target,
  options,
  workingTarget,
  onStatusUpdate,
}: {
  ariaLabel: string;
  target: PublicStatusUpdateTarget;
  options: readonly string[];
  workingTarget: string | null;
  onStatusUpdate: PublicStatusUpdateHandler;
}) {
  const targetKey = statusTargetKey(target);
  const disabled = workingTarget !== null;

  return (
    <div className="flex items-center gap-1 print-hidden">
      <select
        className="h-8 max-w-32 rounded-md border border-input bg-background px-2 text-xs"
        value={target.status}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event) => {
          const nextStatus = event.target.value;
          void onStatusUpdate(
            target.type === "item"
              ? { ...target, status: nextStatus as PublicItemStatus }
              : { ...target, status: nextStatus as PublicBoxStatus }
          );
        }}
      >
        {options.includes(target.status) ? null : (
          <option value={target.status}>{target.status}</option>
        )}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {workingTarget === targetKey ? (
        <RefreshCw className="size-3 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : null}
    </div>
  );
}

function statusTargetKey(target: PublicStatusUpdateTarget) {
  return target.type === "item"
    ? `item:${target.itemId}`
    : `box:${target.boxId}`;
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

function LongInfo({ label, value }: { label: string; value?: string }) {
  if (!value) return null;

  return (
    <div>
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 leading-6">{value}</p>
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

function documentationPacketFilename(packet: PublicDocumentationPacket) {
  return `movingmanifest-${packet.packetKind}-${packet.recipientMode}.csv`;
}

function documentationPacketToCsv(packet: PublicDocumentationPacket) {
  const header = [
    "item",
    "room",
    "destination_room",
    "quantity",
    "disposition",
    "status",
    "condition",
    "box_codes",
    "photo_count",
    "weight_lb",
    "volume_cu_ft",
    "flags",
    "claim_value",
    "claim_replacement_value",
    "serial_number",
    "model_number",
    "claim_evidence_score",
    "claim_warnings",
  ];
  const rows = packet.sections.items.map((item) => [
    item.name,
    item.room ?? "",
    item.destinationRoom ?? "",
    item.quantity,
    item.disposition,
    item.status,
    item.condition,
    item.boxCodes.join("; "),
    item.photoCount,
    item.estimatedWeightLb ?? "",
    item.estimatedVolumeCuFt ?? "",
    item.flags.join("; "),
    item.claim?.valueCents ? formatCurrency(item.claim.valueCents) : "",
    item.claim?.replacementValueCents
      ? formatCurrency(item.claim.replacementValueCents)
      : "",
    item.claim?.serialNumber ?? "",
    item.claim?.modelNumber ?? "",
    item.claim?.evidenceScore ?? "",
    item.claim?.evidenceWarnings.join("; ") ?? "",
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

function formatCurrency(valueCents?: number) {
  if (typeof valueCents !== "number") return "unset";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(valueCents / 100);
}
