"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { ArrowRight, Home, Plus } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  type MoveWorkspaceValue,
  useMoveWorkspace,
} from "@/components/move-workspace-context";
import { MovesStatsStrip } from "@/components/moves-stats-strip";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
type HomeMove = MoveWorkspaceValue["activeMoves"][number];
type CreateMoveTask = "basics" | "pcs" | "packets";

const createMoveTasks: Array<{ value: CreateMoveTask; label: string }> = [
  { value: "basics", label: "Basics" },
  { value: "pcs", label: "PCS details" },
  { value: "packets", label: "Packets" },
];

// The new product home. Replaces the old /app/dashboard surface: a header, a
// New move action, an optional (non-load-bearing) stats strip, and a responsive
// grid of move cards. The create-move + household-create flows are preserved
// here so a brand-new user can still bootstrap their first household and move.
export function MovesHome() {
  const {
    householdId,
    households,
    selectHousehold,
    activeMoves,
    moveId,
    selectMove,
    loadingIdentity,
    loadingHouseholds,
    loadingMoves,
  } = useMoveWorkspace();

  const [createOpen, setCreateOpen] = useState(false);

  const identityResolving = loadingIdentity || loadingHouseholds;
  const hasHousehold = Boolean(householdId);
  const needsHousehold = !identityResolving && !hasHousehold;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Workspace
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Your moves
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Open a move to capture, plan, and document. Every move belongs to a
            household permission boundary.
          </p>
        </div>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={!hasHousehold}
          onClick={() => setCreateOpen(true)}
        >
          <Plus aria-hidden="true" />
          New move
        </Button>
      </header>

      {households && households.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2">
          <label
            htmlFor="household-switcher"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Household
          </label>
          <select
            id="household-switcher"
            value={householdId ?? ""}
            onChange={(event) =>
              selectHousehold(event.target.value as Id<"households">)
            }
            aria-label="Switch household"
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm font-medium text-foreground sm:min-w-56 sm:flex-none"
          >
            {households.map((entry) => (
              <option key={entry.household._id} value={entry.household._id}>
                {entry.household.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            Switch to see moves in another household.
          </span>
        </div>
      ) : null}

      {hasHousehold ? <MovesStatsStrip activeMoves={activeMoves} /> : null}

      {needsHousehold ? (
        <HouseholdSetupCard />
      ) : loadingMoves ? (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44 rounded-md" />
          <Skeleton className="h-44 rounded-md" />
          <Skeleton className="h-44 rounded-md" />
        </div>
      ) : activeMoves.length ? (
        <div
          className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3"
          role="list"
          aria-label="Active moves"
        >
          {activeMoves.map((move) => (
            <MoveCard
              key={move._id}
              move={move}
              selected={move._id === moveId}
              onSelect={selectMove}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          <p>
            Create your first move to unlock resources, zones, inventory, AI
            planning, and documentation packets.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-3"
            onClick={() => setCreateOpen(true)}
          >
            <Plus aria-hidden="true" />
            New move
          </Button>
        </div>
      )}

      <CreateMoveSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function MoveCard({
  move,
  selected,
  onSelect,
}: {
  move: HomeMove;
  selected: boolean;
  onSelect: (moveId: Id<"moves">) => void;
}) {
  const route = [move.origin, move.destination].filter(Boolean).join(" -> ");

  return (
    <Card role="listitem" className="flex flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{move.title}</CardTitle>
            <CardDescription className="mt-1">
              {route || "Route not set"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {selected ? <Badge variant="secondary">selected</Badge> : null}
            <Badge variant="outline">{move.status}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-3">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <MoveField label="Type" value={move.type} />
          <MoveField
            label="Packets"
            value={String(move.documentationProfileTypes?.length ?? 0)}
          />
          <MoveField label="System" value={move.unitSystem} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {!selected ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onSelect(move._id)}
            >
              Select
            </Button>
          ) : null}
          <Button asChild size="sm">
            <Link href={moveWorkspacePath(move._id)}>
              Open
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MoveField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/70 px-2 py-1.5">
      <p className="text-[0.68rem] uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}

// The very first setup step that must survive outside a move: creating the
// household permission boundary that moves, inventory, and packets belong to.
function HouseholdSetupCard() {
  const { selectHousehold } = useMoveWorkspace();
  const createHousehold = useMutation(api.households.create);
  const [householdName, setHouseholdName] = useState("My household");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      setMessage("Household created. You can now create your first move.");
    } catch {
      setMessage("Could not create the household yet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Home className="size-4 text-primary" aria-hidden="true" />
          Create your household
        </CardTitle>
        <CardDescription>
          Start here. The household is the permission boundary that moves,
          inventory, and packets belong to.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleCreateHousehold}>
          <Input
            value={householdName}
            onChange={(event) => setHouseholdName(event.target.value)}
            placeholder="Household name"
            aria-label="Household name"
          />
          <Button type="submit" size="sm" disabled={saving || !householdName.trim()}>
            <Plus aria-hidden="true" />
            Create household
          </Button>
          {message ? (
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {message}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

// Create-move form. Ported from the old dashboard, with the same mutation shape,
// presented in a sheet off the New move button.
function CreateMoveSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { householdId, moveLinkMessage, selectMove } = useMoveWorkspace();
  const createMove = useMutation(api.moves.create);

  const [activeTask, setActiveTask] = useState<CreateMoveTask>("basics");
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
        pcsDependentStatus: moveType === "pcs" ? pcsDependentStatus : undefined,
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
      setPcsOrdersNumber("");
      setMoveLevelWeightAllowanceLb("");
      selectMove(id);
      onOpenChange(false);
      router.push(moveWorkspacePath(id));
    } catch {
      setMessage("Could not create the move yet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New move</SheetTitle>
          <SheetDescription>
            Choose the workflow and recipient packet defaults up front.
          </SheetDescription>
        </SheetHeader>
        <form className="space-y-3 px-4 pb-4" onSubmit={handleCreateMove}>
          <Tabs
            value={activeTask}
            onValueChange={(value) => setActiveTask(value as CreateMoveTask)}
            className="gap-4"
          >
            <div className="overflow-x-auto pb-1">
              <TabsList className="min-w-max" aria-label="Create move sections">
                {createMoveTasks.map((task) => (
                  <TabsTrigger key={task.value} value={task.value}>
                    {task.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="basics" className="space-y-3">
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
            </TabsContent>

            <TabsContent value="pcs">
              {moveType === "pcs" ? (
                <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                  <div>
                    <p className="text-sm font-medium">PCS details</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Track what you know, then verify allowances, restrictions,
                      and required forms with the current transportation office
                      or official guidance.
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
              ) : (
                <div className="rounded-md border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
                  Choose the Military PCS template in Basics when this move needs
                  branch, allowance, orders, transportation office, or restricted
                  item tracking.
                </div>
              )}
            </TabsContent>

            <TabsContent value="packets">
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
            </TabsContent>
          </Tabs>
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
      </SheetContent>
    </Sheet>
  );
}
