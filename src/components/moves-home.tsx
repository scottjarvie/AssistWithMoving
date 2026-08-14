"use client";

import { type FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Check, Home, Info, Plus } from "lucide-react";

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
import { describeMutationError } from "@/lib/mutation-error";
import { cn } from "@/lib/utils";

const DEFAULT_MOVE_TYPE: MoveType = "local";
type HomeMove = MoveWorkspaceValue["activeMoves"][number];
type MoveStatusFilter = "all" | "planning" | "active" | "completed";
type MoveSort = "updated" | "name";

const moveTitleCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

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
  const [moveSearch, setMoveSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<MoveStatusFilter>("all");
  const [moveSort, setMoveSort] = useState<MoveSort>("updated");

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
  const visibleMoves = useMemo(() => {
    const search = moveSearch.trim().toLocaleLowerCase("en-US");

    return activeMoves
      .filter((move) => {
        if (statusFilter !== "all" && move.status !== statusFilter) {
          return false;
        }
        if (!search) {
          return true;
        }

        return [
          move.title,
          move.origin,
          move.destination,
          moveStatusMeta[move.status]?.label ?? move.status,
        ]
          .filter(Boolean)
          .some((value) =>
            value?.toLocaleLowerCase("en-US").includes(search),
          );
      })
      .sort((left, right) => {
        const titleOrder = moveTitleCollator.compare(left.title, right.title);
        if (moveSort === "name") {
          return titleOrder || moveTitleCollator.compare(left._id, right._id);
        }

        return (
          (right.updatedAt ?? 0) - (left.updatedAt ?? 0) ||
          titleOrder ||
          moveTitleCollator.compare(left._id, right._id)
        );
      });
  }, [activeMoves, moveSearch, moveSort, statusFilter]);
  const moveListFiltered = Boolean(moveSearch.trim()) || statusFilter !== "all";

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

      {activeMoves.length > 1 ? (
        <section
          aria-label="Move list controls"
          className="rounded-xl border border-border bg-card/40 p-3"
        >
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_11rem] md:items-end">
            <label className="grid gap-1.5 text-sm font-medium">
              Search moves
              <Input
                type="search"
                value={moveSearch}
                onChange={(event) => setMoveSearch(event.target.value)}
                placeholder="Name, origin, or destination"
                aria-label="Search moves"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Status
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as MoveStatusFilter)
                }
                aria-label="Filter moves by status"
                className="h-8 min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="all">All statuses</option>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Sort
              <select
                value={moveSort}
                onChange={(event) => setMoveSort(event.target.value as MoveSort)}
                aria-label="Sort moves"
                className="h-8 min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="updated">Recently updated</option>
                <option value="name">Move name</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-xs text-muted-foreground">
              {moveListFiltered
                ? `${visibleMoves.length} of ${activeMoves.length} moves`
                : `${activeMoves.length} moves`}
            </p>
            {moveListFiltered && visibleMoves.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMoveSearch("");
                  setStatusFilter("all");
                }}
              >
                Clear search and filters
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {needsHousehold ? (
        <FirstMoveSetupCard />
      ) : loadingMoves ? (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44 rounded-md" />
          <Skeleton className="h-44 rounded-md" />
          <Skeleton className="h-44 rounded-md" />
        </div>
      ) : activeMoves.length ? (
        visibleMoves.length ? (
          <div
            className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3"
            role="list"
            aria-label="Moves"
          >
            {visibleMoves.map((move) => (
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
            <p>No moves match this search and status.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setMoveSearch("");
                setStatusFilter("all");
              }}
            >
              Clear search and filters
            </Button>
          </div>
        )
      ) : (
        <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Start with one private move.</p>
          <p className="mt-1 max-w-2xl leading-6">
            A name and whatever you know about the route are enough. Rooms,
            belongings, people, evidence, and advanced planning can wait.
          </p>
          <Button
            type="button"
            size="touch"
            className="mt-3"
            onClick={() => setCreateOpen(true)}
          >
            <Plus aria-hidden="true" />
            Create your first move
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
              <CardTitle className="break-words text-xl font-semibold sm:text-2xl">
                {move.title}
              </CardTitle>
              <CardDescription className="mt-1">
                {route || "Route not set"}
              </CardDescription>
              {/* Status lives in the title block (not the cramped action row) so
                  it never fights the title for width on a phone. */}
              <Badge variant="outline" className="mt-2" title={status.hint}>
                {status.label}
              </Badge>
            </div>
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-1.5">
            <MoveIdTooltip moveId={move._id} />
            {householdId ? (
              <ActiveMoveMenu householdId={householdId} move={move} />
            ) : null}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

// A small info affordance on each move card: hover to see the move's id, click
// to copy it. Handy for testing and for quoting an exact move to support. Sits
// in the card's z-10 control row so clicking it copies without opening the move.
function MoveIdTooltip({ moveId }: { moveId: Id<"moves"> }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Move ID ${moveId} — click to copy`}
          // Testing/support affordance with hover-only feedback — hidden on
          // touch where it can't show its tooltip and only eats header width.
          className="hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void navigator.clipboard?.writeText(moveId).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          <Info className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="flex flex-col gap-0.5">
        <span className="font-mono text-xs select-all">{moveId}</span>
        <span className="text-[11px] text-muted-foreground">
          {copied ? "Copied!" : "Move ID — click to copy"}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

// A first-time person should not need to understand the internal household
// boundary before the move exists. This creates that private boundary and the
// first move in one short product flow, then lands in the durable move.
function FirstMoveSetupCard() {
  const router = useRouter();
  const { selectHousehold, selectMove } = useMoveWorkspace();
  const createHousehold = useMutation(api.households.create);
  const createMove = useMutation(api.moves.create);
  const [moveTitle, setMoveTitle] = useState("My move");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCreateFirstMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextMoveTitle = moveTitle.trim();
    if (!nextMoveTitle) {
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const householdId = await createHousehold({ name: "My moving workspace" });
      try {
        const moveId = await createMove({
          householdId,
          title: nextMoveTitle,
          type: DEFAULT_MOVE_TYPE,
          origin: origin.trim() || undefined,
          destination: destination.trim() || undefined,
          unitSystem: "imperial",
        });
        selectHousehold(householdId);
        selectMove(moveId);
        router.push(moveWorkspacePath(moveId));
      } catch (error) {
        setMessage(
          describeMutationError(
            error,
            "Your private workspace was created, but the move was not. Try again from New move.",
          ),
        );
        selectHousehold(householdId);
      }
    } catch (error) {
      setMessage(
        describeMutationError(
          error,
          "Couldn't start the private workspace. Check the move name and try again.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden border-primary/30 bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary),transparent_94%),transparent_62%)]">
      <CardHeader className="border-b border-border/70">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <Home className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Private first step
            </p>
            <CardTitle className="mt-1 text-xl">Start your move</CardTitle>
            <CardDescription className="mt-2 max-w-2xl leading-6">
              Give the move a name and add any route details you already know.
              Nothing is shared when you create it; you can invite people or
              connect your chosen AI later.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        <form className="space-y-4" onSubmit={handleCreateFirstMove}>
          <label className="grid gap-1.5 text-sm font-medium">
            Move name
            <Input
              value={moveTitle}
              onChange={(event) => setMoveTitle(event.target.value)}
              className="h-11"
              placeholder="My move"
              autoFocus
              required
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              Moving from <span className="sr-only">(optional)</span>
              <Input
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
                className="h-11"
                placeholder="City, neighborhood, or home"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Moving to <span className="sr-only">(optional)</span>
              <Input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                className="h-11"
                placeholder="Known destination or area"
              />
            </label>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Route fields are optional. Start now and fill in dates, rooms,
            belongings, transport, or evidence only when they help.
          </p>
          <Button type="submit" size="touch" disabled={saving || !moveTitle.trim()}>
            <Plus aria-hidden="true" />
            {saving ? "Starting your move…" : "Create private move"}
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
    } catch (error) {
      setMessage(
        describeMutationError(
          error,
          "Couldn't create the move. Check the required fields and try again.",
        ),
      );
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
            A name and route are enough. Templates and packet defaults are
            optional and can change later.
          </SheetDescription>
        </SheetHeader>
        <form className="space-y-3 px-4 pb-4" onSubmit={handleCreateMove}>
          <Tabs
            defaultValue="basics"
            className="gap-4"
          >
            <div className="overflow-x-auto pb-1">
              <TabsList className="min-w-max" aria-label="Create move sections">
                <TabsTrigger value="basics" className="min-h-11">Start</TabsTrigger>
                <TabsTrigger value="pcs" className="min-h-11">Optional PCS</TabsTrigger>
                <TabsTrigger value="packets" className="min-h-11">Optional packets</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="basics" className="space-y-3">
              <Input
                value={moveTitle}
                onChange={(event) => setMoveTitle(event.target.value)}
                placeholder="Move title"
                aria-label="Move title"
                disabled={!householdId}
                className="h-11"
              />
              <select
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="h-11"
                />
                <Input
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="Destination"
                  aria-label="Move destination"
                  disabled={!householdId}
                  className="h-11"
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
            size="touch"
            disabled={
              !householdId ||
              !moveTitle.trim() ||
              !documentationProfileTypes.length ||
              saving
            }
          >
            <Plus aria-hidden="true" />
            Create private move
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
