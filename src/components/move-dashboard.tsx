"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  ClipboardList,
  FileStack,
  Home,
  KeyRound,
  Plus,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ConvexAuthStatus } from "@/components/convex-auth-status";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  defaultDocumentationProfilesForMoveType,
  documentationProfileOptions,
  moveTypeOptions,
  pcsBranchOptions,
  pcsDependentStatusOptions,
  pcsShipmentTypeOptions,
  type DocumentationProfileType,
  type MoveType,
  type PcsBranch,
  type PcsDependentStatus,
  type PcsShipmentType,
} from "@/lib/move-presets";
import { moveWorkspacePath } from "@/lib/move-links";

const DEFAULT_MOVE_TYPE: MoveType = "local";

export function MoveDashboard() {
  const router = useRouter();
  const {
    householdId,
    selectHousehold,
    households,
    activeMoves,
    moveId,
    selectMove,
    loadingIdentity,
    loadingHouseholds,
    loadingMoves,
    moveLinkMessage,
  } = useMoveWorkspace();

  const createHousehold = useMutation(api.households.create);
  const createMove = useMutation(api.moves.create);

  const [householdName, setHouseholdName] = useState("My household");
  const [moveTitle, setMoveTitle] = useState("");
  const [moveType, setMoveType] = useState<MoveType>(DEFAULT_MOVE_TYPE);
  const [documentationProfileTypes, setDocumentationProfileTypes] = useState<
    DocumentationProfileType[]
  >(defaultDocumentationProfilesForMoveType(DEFAULT_MOVE_TYPE));
  const [pcsBranch, setPcsBranch] = useState<PcsBranch | "">("");
  const [pcsShipmentType, setPcsShipmentType] = useState<PcsShipmentType | "">(
    "mixed"
  );
  const [pcsDependentStatus, setPcsDependentStatus] =
    useState<PcsDependentStatus>("unknown");
  const [pcsRankPayGrade, setPcsRankPayGrade] = useState("");
  const [pcsOrdersNumber, setPcsOrdersNumber] = useState("");
  const [moveLevelWeightAllowanceLb, setMoveLevelWeightAllowanceLb] =
    useState("");
  const [pcsAllowanceNotes, setPcsAllowanceNotes] = useState("");
  const [proGearNotes, setProGearNotes] = useState("");
  const [pcsTransportationOfficeNotes, setPcsTransportationOfficeNotes] =
    useState("");
  const [pcsRestrictedItemsNotes, setPcsRestrictedItemsNotes] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedPacketCount = documentationProfileTypes.length;
  const statusMessage = moveLinkMessage ?? message;

  async function handleCreateHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextHouseholdName = householdName.trim();
    if (!nextHouseholdName) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const id = await createHousehold({ name: nextHouseholdName });
      selectHousehold(id);
      setHouseholdName("My household");
      setMessage("Household created.");
    } catch {
      setMessage("Could not create the household yet.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!householdId || !moveTitle.trim()) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const parsedWeightAllowance = Number(moveLevelWeightAllowanceLb);
      const id = await createMove({
        householdId,
        title: moveTitle,
        type: moveType,
        origin: origin || undefined,
        destination: destination || undefined,
        unitSystem: "imperial",
        documentationProfileTypes,
        moveLevelWeightAllowanceLb:
          Number.isFinite(parsedWeightAllowance) && parsedWeightAllowance > 0
            ? parsedWeightAllowance
            : undefined,
        pcsBranch: moveType === "pcs" && pcsBranch ? pcsBranch : undefined,
        pcsShipmentType:
          moveType === "pcs" && pcsShipmentType ? pcsShipmentType : undefined,
        pcsDependentStatus:
          moveType === "pcs" ? pcsDependentStatus : undefined,
        pcsRankPayGrade:
          moveType === "pcs" ? pcsRankPayGrade || undefined : undefined,
        pcsOrdersNumber:
          moveType === "pcs" ? pcsOrdersNumber || undefined : undefined,
        pcsAllowanceNotes:
          moveType === "pcs" ? pcsAllowanceNotes || undefined : undefined,
        proGearNotes: moveType === "pcs" ? proGearNotes || undefined : undefined,
        pcsTransportationOfficeNotes:
          moveType === "pcs"
            ? pcsTransportationOfficeNotes || undefined
            : undefined,
        pcsRestrictedItemsNotes:
          moveType === "pcs" ? pcsRestrictedItemsNotes || undefined : undefined,
      });
      setMoveTitle("");
      setOrigin("");
      setDestination("");
      selectMove(id);
      setPcsOrdersNumber("");
      setMoveLevelWeightAllowanceLb("");
      setMessage("Move created.");
      router.push(moveWorkspacePath(id));
    } catch {
      setMessage("Could not create the move yet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Dashboard
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                Create your household, start a move, then open its workspace to
                manage inventory, boxes, photos, the load plan, move day, and
                documentation packets.
              </p>
            </div>
            <Badge>
              <ShieldCheck aria-hidden="true" />
              audited workspace
            </Badge>
          </div>
        </div>
        <ConvexAuthStatus />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Moves"
          value={activeMoves.length}
          icon={Truck}
          note="active records"
        />
        <Metric
          label="Households"
          value={households?.length ?? 0}
          icon={Home}
          note="you can access"
        />
        <Metric
          label="Packet profiles"
          value={documentationProfileOptions.length}
          icon={FileStack}
          note="recipient types"
        />
        <Card>
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Workspace
              <ArrowRight className="size-4 text-primary" aria-hidden="true" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {moveId ? (
              <Button asChild size="sm" className="mt-1">
                <Link href={moveWorkspacePath(moveId)}>
                  Open selected move
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Create a move to unlock its workspace pages.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="border-primary/25 bg-primary/5">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="size-4 text-primary" aria-hidden="true" />
                Do you need a key for your AI assistant?
              </CardTitle>
              <CardDescription className="mt-2 max-w-3xl leading-6">
                If Claude, ChatGPT, Codex, or another assistant sent you here,
                create an AI helper key, copy it once, and paste it only into an
                assistant you trust. A full trusted key can read and change your
                household move data and invite collaborators.
              </CardDescription>
            </div>
            <Badge variant="outline">one-time secret</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/settings#api-keys">
              <KeyRound aria-hidden="true" />
              Create and copy AI key
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/ai">
              AI setup guide
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Home className="size-4 text-primary" aria-hidden="true" />
                Household
              </CardTitle>
              <CardDescription>
                Every move belongs to a household permission boundary.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingIdentity || loadingHouseholds ? (
                <div className="space-y-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-2/3" />
                </div>
              ) : households?.length ? (
                <>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={householdId ?? ""}
                    aria-label="Selected household"
                    onChange={(event) =>
                      selectHousehold(event.target.value as Id<"households">)
                    }
                  >
                    {households.map(({ household, role }) => (
                      <option key={household._id} value={household._id}>
                        {household.name} - {role}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Owner/admin/editor roles can create and update move records.
                    Helper and mover-safe access stays restricted by policy.
                  </p>
                  <form
                    className="flex flex-wrap gap-2"
                    onSubmit={handleCreateHousehold}
                  >
                    <Input
                      value={householdName}
                      onChange={(event) => setHouseholdName(event.target.value)}
                      placeholder="New household name"
                      aria-label="Household name"
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={saving || !householdName.trim()}
                    >
                      <Plus aria-hidden="true" />
                      Create household
                    </Button>
                  </form>
                </>
              ) : (
                <form className="space-y-3" onSubmit={handleCreateHousehold}>
                  <p className="rounded-md border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
                    Start here: create your household. It is the permission
                    boundary that moves, inventory, and packets belong to.
                  </p>
                  <Input
                    value={householdName}
                    onChange={(event) => setHouseholdName(event.target.value)}
                    placeholder="Household name"
                    aria-label="Household name"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={saving || !householdName.trim()}
                  >
                    <Plus aria-hidden="true" />
                    Create household
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="size-4 text-primary" aria-hidden="true" />
                New move
              </CardTitle>
              <CardDescription>
                Choose the workflow and recipient packet defaults up front.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!householdId && !loadingIdentity && !loadingHouseholds ? (
                <p
                  className="mb-3 rounded-md border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground"
                  role="status"
                >
                  Create a household first — these fields unlock once one
                  exists.
                </p>
              ) : null}
              <form className="space-y-3" onSubmit={handleCreateMove}>
                <Input
                  value={moveTitle}
                  onChange={(event) => setMoveTitle(event.target.value)}
                  placeholder="Move title"
                  aria-label="Move title"
                  disabled={!householdId}
                />
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  value={moveType}
                  aria-label="Move template"
                  onChange={(event) => {
                    const nextMoveType = event.target.value as MoveType;
                    setMoveType(nextMoveType);
                    setDocumentationProfileTypes(
                      defaultDocumentationProfilesForMoveType(nextMoveType)
                    );
                  }}
                  disabled={!householdId}
                >
                  {moveTypeOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-muted-foreground">
                  The template sets wording, suggested packets, and defaults.
                  Military options only appear with the Military PCS template.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={origin}
                    onChange={(event) => setOrigin(event.target.value)}
                    placeholder="Origin"
                    aria-label="Move origin"
                    disabled={!householdId}
                  />
                  <Input
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    placeholder="Destination"
                    aria-label="Move destination"
                    disabled={!householdId}
                  />
                </div>
                {moveType === "pcs" ? (
                  <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                    <div>
                      <p className="text-sm font-medium">PCS details</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Track what you know, then verify allowances,
                        restrictions, and required forms with the current
                        transportation office or official guidance.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        value={pcsBranch}
                        aria-label="Military branch"
                        onChange={(event) =>
                          setPcsBranch(event.target.value as PcsBranch | "")
                        }
                        disabled={!householdId}
                      >
                        <option value="">Branch</option>
                        {pcsBranchOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        value={pcsShipmentType}
                        aria-label="PCS shipment type"
                        onChange={(event) =>
                          setPcsShipmentType(
                            event.target.value as PcsShipmentType
                          )
                        }
                        disabled={!householdId}
                      >
                        {pcsShipmentTypeOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={pcsRankPayGrade}
                        onChange={(event) =>
                          setPcsRankPayGrade(event.target.value)
                        }
                        placeholder="Rank / pay grade"
                        aria-label="Rank or pay grade"
                        disabled={!householdId}
                      />
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        value={pcsDependentStatus}
                        aria-label="PCS dependent status"
                        onChange={(event) =>
                          setPcsDependentStatus(
                            event.target.value as PcsDependentStatus
                          )
                        }
                        disabled={!householdId}
                      >
                        {pcsDependentStatusOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={pcsOrdersNumber}
                        onChange={(event) =>
                          setPcsOrdersNumber(event.target.value)
                        }
                        placeholder="Orders number"
                        aria-label="Orders number"
                        disabled={!householdId}
                      />
                      <Input
                        inputMode="numeric"
                        value={moveLevelWeightAllowanceLb}
                        onChange={(event) =>
                          setMoveLevelWeightAllowanceLb(event.target.value)
                        }
                        placeholder="Official allowance lb"
                        aria-label="Official weight allowance in pounds"
                        disabled={!householdId}
                      />
                    </div>
                    <Textarea
                      value={pcsAllowanceNotes}
                      onChange={(event) =>
                        setPcsAllowanceNotes(event.target.value)
                      }
                      placeholder="Allowance notes"
                      aria-label="Allowance notes"
                      disabled={!householdId}
                    />
                    <Textarea
                      value={proGearNotes}
                      onChange={(event) => setProGearNotes(event.target.value)}
                      placeholder="Pro gear / PBP&E notes"
                      aria-label="Pro gear notes"
                      disabled={!householdId}
                    />
                    <Textarea
                      value={pcsTransportationOfficeNotes}
                      onChange={(event) =>
                        setPcsTransportationOfficeNotes(event.target.value)
                      }
                      placeholder="Transportation office notes"
                      aria-label="Transportation office notes"
                      disabled={!householdId}
                    />
                    <Textarea
                      value={pcsRestrictedItemsNotes}
                      onChange={(event) =>
                        setPcsRestrictedItemsNotes(event.target.value)
                      }
                      placeholder="Restricted item notes"
                      aria-label="Restricted item notes"
                      disabled={!householdId}
                    />
                  </div>
                ) : null}
                <div className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Documentation profiles</p>
                    <Badge variant="secondary">
                      {selectedPacketCount} selected
                    </Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {documentationProfileOptions
                      .filter(
                        ([value]) => value !== "pcsMove" || moveType === "pcs"
                      )
                      .map(([value, label]) => (
                      <label
                        key={value}
                        className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs"
                      >
                        <input
                          type="checkbox"
                          className="size-3.5 accent-primary"
                          checked={documentationProfileTypes.includes(value)}
                          disabled={!householdId}
                          onChange={(event) => {
                            setDocumentationProfileTypes((current) =>
                              event.target.checked
                                ? Array.from(new Set([...current, value]))
                                : current.filter((profile) => profile !== value)
                            );
                          }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    !householdId ||
                    !moveTitle.trim() ||
                    !documentationProfileTypes.length ||
                    saving
                  }
                >
                  <Plus aria-hidden="true" />
                  Create move
                </Button>
                {statusMessage ? (
                  <p
                    className="text-xs text-muted-foreground"
                    role="status"
                    aria-live="polite"
                  >
                    {statusMessage}
                  </p>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </div>

        <Card id="active-moves">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4 text-accent" aria-hidden="true" />
              Active moves
            </CardTitle>
            <CardDescription>
              Open a move to work in its inventory, boxes, photos, load plan,
              move day, packets, and AI review pages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingMoves ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-3/4" />
              </div>
            ) : activeMoves.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Move</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Profiles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Route</TableHead>
                    <TableHead className="text-right">Workspace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeMoves.map((move) => (
                    <TableRow key={move._id}>
                      <TableCell className="font-medium">{move.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{move.type}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {move.documentationProfileTypes?.length ?? 0}
                      </TableCell>
                      <TableCell>{move.status}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {[move.origin, move.destination]
                          .filter(Boolean)
                          .join(" -> ") || "not set"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={moveWorkspacePath(move._id)}>
                            Open
                            <ArrowRight aria-hidden="true" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                Create the first move to unlock resources, zones, inventory, AI
                planning, and documentation packet setup.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  note,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  note: string;
}) {
  return (
    <Card>
      <CardHeader className="space-y-0 pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          {label}
          <Icon className="size-4 text-primary" aria-hidden="true" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-3xl font-semibold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}
