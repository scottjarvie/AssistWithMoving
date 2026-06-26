"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Check, Home, Plus } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ActiveMoveMenu,
  ArchivedMovesSection,
  type ManagedMove,
} from "@/components/move-management";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { cn } from "@/lib/utils";

const DEFAULT_MOVE_TYPE: MoveType = "local";
type HomeMove = MoveWorkspaceValue["activeMoves"][number];
type CreateMoveTask = "basics" | "pcs" | "packets";

const createMoveTasks: Array<{ value: CreateMoveTask; label: string }> = [
  { value: "basics", label: "Basics" },
  { value: "pcs", label: "PCS details" },
  { value: "packets", label: "Packets" },
];

// Plain-language status copy. The lifecycle enum stays planning -> active ->
// completed (see MOVE-306); this only controls how each status reads on a card.
const moveStatusMeta: Record<string, { label: string; hint: string }> = {
  planning: {
    label: "Planning",
    hint: "Planning — this move is being set up. It becomes Active once you start working it, and Completed when it's done.",
  },
  active: {
    label: "Active",
    hint: "Active — you're actively working this move.",
  },
  completed: {
    label: "Completed",
    hint: "Completed — this move is finished.",
  },
};

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
    loadingParticipantMoves,
  } = useMoveWorkspace();

  const [createOpen, setCreateOpen] = useState(false);

  // Archived moves stay out of the active grid but remain restorable; owners can
  // also permanently delete them.
  const allMoves = useQuery(
    api.moves.listForHousehold,
    householdId ? { householdId, includeArchived: true } : "skip",
  );
  const archivedMoves: ManagedMove[] = (
    Array.isArray(allMoves) ? allMoves : []
  ).filter((move) => move.status === "archived");
  const canPurge =
    households?.find((entry) => entry.household._id === householdId)?.role ===
    "owner";

  const identityResolving = loadingIdentity || loadingHouseholds;
  const hasHousehold = Boolean(householdId);
  // Wait for participant moves before concluding the user has no access — a
  // participant-only user (no household of their own) gets their householdId
  // from their participant moves, which load a beat later than households.
  const needsHousehold =
    !identityResolving && !loadingParticipantMoves && !hasHousehold;

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
            Open a move to capture, plan, and document. Add people to a move and
            choose what they can do from its Participants tab.
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
            Workspace
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
            Switch to see moves in another workspace.
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
              householdId={householdId}
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

      {householdId && archivedMoves.length ? (
        <ArchivedMovesSection
          householdId={householdId}
          moves={archivedMoves}
          canPurge={canPurge}
        />
      ) : null}

      <CreateMoveSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function MoveCard({
  move,
  householdId,
  selected,
  onSelect,
}: {
  move: HomeMove;
  householdId: Id<"households"> | null;
  selected: boolean;
  onSelect: (moveId: Id<"moves">) => void;
}) {
  const route = [move.origin, move.destination].filter(Boolean).join(" → ");
  const status = moveStatusMeta[move.status] ?? {
    label: move.status.charAt(0).toUpperCase() + move.status.slice(1),
    hint: `Status: ${move.status}.`,
  };

  return (
    <Card
      role="listitem"
      className={cn(
        "relative transition-colors hover:border-primary/60",
        selected && "border-primary ring-1 ring-primary/40",
      )}
    >
      {/*
        The whole card opens the move. Opening also marks it the current move:
        the workspace derives the active move from the URL, and onSelect persists
        the choice for off-route surfaces — so no separate "Select" button is
        needed. The status badge and kebab menu sit above this link overlay via
        z-10 so they stay interactive without triggering navigation.
      */}
      <Link
        href={moveWorkspacePath(move._id)}
        onClick={() => onSelect(move._id)}
        aria-label={`Open ${move.title}`}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {selected ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="relative z-10 mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                    aria-label="Current move"
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  This is your current move — actions like Add to Queue target
                  it.
                </TooltipContent>
              </Tooltip>
            ) : null}
            <div className="min-w-0">
              <CardTitle className="truncate text-lg font-semibold sm:text-xl">
                {move.title}
              </CardTitle>
              <CardDescription className="mt-1">
                {route || "Route not set"}
              </CardDescription>
            </div>
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default">
                  <Badge variant="outline">{status.label}</Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>{status.hint}</TooltipContent>
            </Tooltip>
            {householdId ? (
              <ActiveMoveMenu householdId={householdId} move={move} />
            ) : null}
          </div>
        </div>
      </CardHeader>
    </Card>
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
