"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Camera,
  CircleCheck,
  ClipboardList,
  FileStack,
  Home,
  Images,
  KeyRound,
  PackageCheck,
  Plus,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ConvexAuthStatus } from "@/components/convex-auth-status";
import {
  ActiveMoveMenu,
  ArchivedMovesSection,
  type ManagedMove,
} from "@/components/move-management";
import { MoveQueueSnapshot } from "@/components/move-queue-snapshot";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import {
  type MoveWorkspaceValue,
  useMoveWorkspace,
} from "@/components/move-workspace-context";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useHashTab } from "@/components/use-hash-tab";
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
type DashboardMove = MoveWorkspaceValue["activeMoves"][number];
type DashboardTask = "moves" | "create" | "household" | "ai";
type CreateMoveTask = "basics" | "pcs" | "packets";

const dashboardTaskHashes = {
  "#active-moves": "moves",
  "#ai-connection": "ai",
  "#create-move": "create",
  "#create-move-basics": "create",
  "#create-move-packets": "create",
  "#create-move-pcs": "create",
  "#household-setup": "household",
} as const;

const dashboardTaskTabs: Array<{
  value: DashboardTask;
  label: string;
  description: string;
}> = [
  {
    value: "moves",
    label: "Moves",
    description: "Open the move you are working on before setup tasks.",
  },
  {
    value: "create",
    label: "Create move",
    description: "Start a new move without hiding your active move list.",
  },
  {
    value: "household",
    label: "Household",
    description: "Manage the household permission boundary for these moves.",
  },
  {
    value: "ai",
    label: "AI connection",
    description: "Create assistant access only when an AI needs to help.",
  },
];

const createMoveTasks: Array<{ value: CreateMoveTask; label: string }> = [
  { value: "basics", label: "Basics" },
  { value: "pcs", label: "PCS details" },
  { value: "packets", label: "Packets" },
];

const createMoveTaskHashes = {
  "#create-move": "basics",
  "#create-move-basics": "basics",
  "#create-move-packets": "packets",
  "#create-move-pcs": "pcs",
} as const;

const moveQuickActions = [
  {
    label: "Capture",
    section: "capture",
    icon: Camera,
  },
  {
    label: "Inventory",
    section: "inventory",
    icon: ClipboardList,
  },
  {
    label: "Photos",
    section: "photos",
    icon: Images,
  },
  {
    label: "Boxes",
    section: "boxes",
    icon: PackageCheck,
  },
] as const;

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
  const acknowledgeCollaboratorOnboarding = useMutation(
    api.households.acknowledgeCollaboratorOnboarding,
  );
  const householdStats = useQuery(
    api.households.summaryStats,
    householdId ? { householdId } : "skip",
  ) as { activeApiKeyCount: number } | undefined;

  // Archived moves stay out of the active list but remain restorable; owners can
  // also permanently delete them.
  const allMoves = useQuery(
    api.moves.listForHousehold,
    householdId ? { householdId, includeArchived: true } : "skip",
  );
  const archivedMoves: ManagedMove[] = (
    Array.isArray(allMoves) ? allMoves : []
  ).filter((move) => move.status === "archived");
  const currentRole = households?.find(
    (entry) => entry.household._id === householdId,
  )?.role;
  const canPurge = currentRole === "owner";

  const [householdName, setHouseholdName] = useState("My household");
  const [moveTitle, setMoveTitle] = useState("");
  const [moveType, setMoveType] = useState<MoveType>(DEFAULT_MOVE_TYPE);
  const [documentationProfileTypes, setDocumentationProfileTypes] = useState<
    DocumentationProfileType[]
  >(defaultDocumentationProfilesForMoveType(DEFAULT_MOVE_TYPE));
  const [pcsBranch, setPcsBranch] = useState<PcsBranch | "">("");
  const [pcsShipmentType, setPcsShipmentType] = useState<PcsShipmentType | "">(
    "mixed",
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
  const [dismissingOnboardingId, setDismissingOnboardingId] = useState<
    Id<"householdMemberships"> | null
  >(null);
  const [activeDashboardTask, setActiveDashboardTask] =
    useHashTab<DashboardTask>("moves", dashboardTaskHashes);
  const [activeCreateTask, setActiveCreateTask] = useHashTab<CreateMoveTask>(
    "basics",
    createMoveTaskHashes
  );

  const selectedPacketCount = documentationProfileTypes.length;
  const statusMessage = moveLinkMessage ?? message;
  const showAiConnectionNudge =
    Boolean(householdId) && householdStats?.activeApiKeyCount === 0;
  const collaboratorOnboardingEntries =
    households?.filter((entry) => entry.collaboratorOnboarding) ?? [];

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
        pcsDependentStatus: moveType === "pcs" ? pcsDependentStatus : undefined,
        pcsRankPayGrade:
          moveType === "pcs" ? pcsRankPayGrade || undefined : undefined,
        pcsOrdersNumber:
          moveType === "pcs" ? pcsOrdersNumber || undefined : undefined,
        pcsAllowanceNotes:
          moveType === "pcs" ? pcsAllowanceNotes || undefined : undefined,
        proGearNotes:
          moveType === "pcs" ? proGearNotes || undefined : undefined,
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

  async function handleDismissCollaboratorOnboarding({
    householdId,
    membershipId,
  }: {
    householdId: Id<"households">;
    membershipId: Id<"householdMemberships">;
  }) {
    setDismissingOnboardingId(membershipId);
    setMessage(null);
    try {
      await acknowledgeCollaboratorOnboarding({
        householdId,
        membershipId,
      });
    } catch {
      setMessage("Could not dismiss that household access card yet.");
    } finally {
      setDismissingOnboardingId(null);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Dashboard
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open your move first — setup and AI tasks stay in the tabs.
          </p>
        </div>
        <Badge className="shrink-0">
          <ShieldCheck aria-hidden="true" />
          workspace home
        </Badge>
      </header>

      {collaboratorOnboardingEntries.length ? (
        <section
          className="grid gap-3"
          aria-label="New household access"
        >
          {collaboratorOnboardingEntries.map((entry) => {
            const onboarding = entry.collaboratorOnboarding;
            if (!onboarding) return null;
            const membershipId = onboarding.membershipId;
            const canCreateApiKey = entry.canCreateApiKeys;
            return (
              <div
                key={membershipId}
                className="rounded-md border border-primary/25 bg-primary/5 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-base font-semibold">
                      <CircleCheck
                        className="size-4 text-primary"
                        aria-hidden="true"
                      />
                      You were added to {entry.household.name}
                    </h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                      Your role is {onboarding.role}
                      {onboarding.inviterName || onboarding.inviterEmail
                        ? `, added by ${
                            onboarding.inviterName ??
                            onboarding.inviterEmail
                          }`
                        : ""}
                      . You can open the dashboard now
                      {canCreateApiKey
                        ? " or create a helper key for a trusted assistant."
                        : "; API key setup is disabled for this membership."}
                    </p>
                  </div>
                  <Badge variant={canCreateApiKey ? "outline" : "secondary"}>
                    API {canCreateApiKey ? "available" : "disabled"}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => selectHousehold(entry.household._id)}
                  >
                    <Home aria-hidden="true" />
                    Open dashboard
                  </Button>
                  {canCreateApiKey ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href="/settings/ai-connections">
                        <KeyRound aria-hidden="true" />
                        Create helper key
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href="/settings">
                        <ShieldCheck aria-hidden="true" />
                        Review access
                      </Link>
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={dismissingOnboardingId === membershipId}
                    onClick={() =>
                      void handleDismissCollaboratorOnboarding({
                        householdId: entry.household._id,
                        membershipId,
                      })
                    }
                  >
                    {dismissingOnboardingId === membershipId ? (
                      <CircleCheck
                        className="animate-pulse"
                        aria-hidden="true"
                      />
                    ) : (
                      <CircleCheck aria-hidden="true" />
                    )}
                    Got it
                  </Button>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      <Tabs
        value={activeDashboardTask}
        onValueChange={setActiveDashboardTask}
        className="gap-4"
      >
        <MoveWorkspaceTabList tabs={dashboardTaskTabs} activeValue={activeDashboardTask} />

        <TabsContent value="moves" className="space-y-4">
          {householdId && moveId ? (
            <MoveQueueSnapshot householdId={householdId} moveId={moveId} />
          ) : null}

          <section
            id="active-moves"
            className="space-y-3"
            aria-labelledby="active-moves-heading"
          >
            <div className="flex items-center justify-between gap-3">
              <h3
                id="active-moves-heading"
                className="flex items-center gap-2 text-base font-semibold"
              >
                <CalendarDays
                  className="size-4 text-accent"
                  aria-hidden="true"
                />
                Active moves
              </h3>
              {moveId ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={moveWorkspacePath(moveId)}>
                    Open move
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
            </div>

            {loadingMoves ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <Skeleton className="h-36 rounded-md" />
                <Skeleton className="h-36 rounded-md" />
              </div>
            ) : activeMoves.length ? (
              <div
                className="grid gap-3 lg:grid-cols-2"
                role="list"
                aria-label="Active moves"
              >
                {activeMoves.map((move) => (
                  <ActiveMoveCard
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
                Create the first move to unlock resources, zones, inventory, AI
                planning, and documentation packet setup.
              </div>
            )}
          </section>

          {householdId && archivedMoves.length ? (
            <ArchivedMovesSection
              householdId={householdId}
              moves={archivedMoves}
              canPurge={canPurge}
            />
          ) : null}

          {showAiConnectionNudge ? (
            <section
              className="rounded-md border border-primary/25 bg-primary/5 p-4"
              aria-label="AI helper key setup"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    <KeyRound className="size-4 text-primary" aria-hidden="true" />
                    Connecting an AI helper?
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                    Create a scoped key, test it, then paste it into Claude,
                    ChatGPT, Codex, or another assistant you trust.
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link href="/settings/ai-connections">
                    Create a key
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </section>
          ) : null}

          <section
            className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]"
            aria-labelledby="dashboard-summary-heading"
          >
            <div className="space-y-2">
              <h3
                id="dashboard-summary-heading"
                className="text-sm font-semibold text-muted-foreground"
              >
                Workspace summary
              </h3>
              <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border">
                <Metric label="Moves" value={activeMoves.length} icon={Truck} />
                <Metric
                  label="Households"
                  value={households?.length ?? 0}
                  icon={Home}
                />
                <Metric
                  label="Packets"
                  value={documentationProfileOptions.length}
                  icon={FileStack}
                />
              </div>
            </div>
            <ConvexAuthStatus />
          </section>
        </TabsContent>

        <TabsContent value="create" id="create-move">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
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
                <Tabs
                  value={activeCreateTask}
                  onValueChange={setActiveCreateTask}
                  className="gap-4"
                >
                  <div className="overflow-x-auto pb-1">
                    <TabsList
                      className="min-w-max"
                      aria-label="Create move setup sections"
                    >
                      {createMoveTasks.map((task) => (
                        <TabsTrigger key={task.value} value={task.value}>
                          {task.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  <TabsContent
                    value="basics"
                    id="create-move-basics"
                    className="space-y-3"
                  >
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
                          defaultDocumentationProfilesForMoveType(nextMoveType),
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
                      The template sets wording, suggested packets, and
                      defaults. Military options only appear with the Military
                      PCS template.
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

                  <TabsContent value="pcs" id="create-move-pcs">
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
                                event.target.value as PcsShipmentType,
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
                                event.target.value as PcsDependentStatus,
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
                          onChange={(event) =>
                            setProGearNotes(event.target.value)
                          }
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
                        Choose the Military PCS template in Basics when this
                        move needs branch, allowance, orders, transportation
                        office, or restricted item tracking.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="packets" id="create-move-packets">
                    <div className="space-y-2 rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                          Documentation profiles
                        </p>
                        <Badge variant="secondary">
                          {selectedPacketCount} selected
                        </Badge>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {documentationProfileOptions
                          .filter(
                            ([value]) =>
                              value !== "pcsMove" || moveType === "pcs",
                          )
                          .map(([value, label]) => (
                            <label
                              key={value}
                              className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs"
                            >
                              <input
                                type="checkbox"
                                className="size-3.5 accent-primary"
                                checked={documentationProfileTypes.includes(
                                  value,
                                )}
                                disabled={!householdId}
                                onChange={(event) => {
                                  setDocumentationProfileTypes((current) =>
                                    event.target.checked
                                      ? Array.from(new Set([...current, value]))
                                      : current.filter(
                                          (profile) => profile !== value,
                                        ),
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="household" id="household-setup">
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
        </TabsContent>

        <TabsContent value="ai" id="ai-connection">
          <Card className="border-primary/25 bg-primary/5">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="size-4 text-primary" aria-hidden="true" />
                    Do you need an AI connection?
                  </CardTitle>
                  <CardDescription className="mt-2 max-w-3xl leading-6">
                    If Claude, ChatGPT, Codex, or another assistant sent you
                    here, create a connection, copy the one-time key, and paste
                    it only into an assistant you trust. You can choose whether
                    it can add items, set up a move, invite collaborators, or
                    have full trusted access.
                  </CardDescription>
                </div>
                <Badge variant="outline">one-time secret</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/settings/ai-connections">
                  <KeyRound aria-hidden="true" />
                  Set up AI connection
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ActiveMoveCard({
  move,
  householdId,
  selected,
  onSelect,
}: {
  move: DashboardMove;
  householdId: Id<"households"> | null;
  selected: boolean;
  onSelect: (moveId: Id<"moves">) => void;
}) {
  const route = [move.origin, move.destination].filter(Boolean).join(" → ");
  const packetCount = move.documentationProfileTypes?.length ?? 0;

  return (
    <Card role="listitem" className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{move.title}</CardTitle>
            <CardDescription className="mt-0.5 truncate">
              {route || "Route not set"}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {selected ? (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                selected
              </Badge>
            ) : null}
            <Badge variant="outline">{move.status}</Badge>
            {householdId ? (
              <ActiveMoveMenu householdId={householdId} move={move} />
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <p className="text-xs text-muted-foreground">
          <span className="capitalize">{move.type}</span> · {packetCount} packet
          {packetCount === 1 ? "" : "s"} · {move.unitSystem}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {moveQuickActions.map(({ label, section, icon: Icon }) => (
            <Button
              key={section}
              asChild
              size="sm"
              variant="outline"
              className="h-8"
            >
              <Link href={`${moveWorkspacePath(move._id)}/${section}`}>
                <Icon aria-hidden="true" />
                {label}
              </Link>
            </Button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          {selected ? (
            <Button type="button" size="sm" variant="outline" disabled>
              <CircleCheck aria-hidden="true" />
              Selected
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onSelect(move._id)}
            >
              <CircleCheck aria-hidden="true" />
              Select
            </Button>
          )}
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

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
}) {
  return (
    <div className="bg-card/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 text-primary" aria-hidden="true" />
        <span className="text-[0.68rem] uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
