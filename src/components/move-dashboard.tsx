"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
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
  const [activeDashboardTask, setActiveDashboardTask] =
    useHashTab<DashboardTask>("moves", dashboardTaskHashes);
  const [activeCreateTask, setActiveCreateTask] = useHashTab<CreateMoveTask>(
    "basics",
    createMoveTaskHashes
  );

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

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Dashboard
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Open the active move first. Setup, household, and AI connection work
            stays in the task tabs.
          </p>
        </div>
        <Badge>
          <ShieldCheck aria-hidden="true" />
          workspace home
        </Badge>
      </header>

      <Tabs
        value={activeDashboardTask}
        onValueChange={setActiveDashboardTask}
        className="gap-4"
      >
        <MoveWorkspaceTabList tabs={dashboardTaskTabs} activeValue={activeDashboardTask} />

        <TabsContent value="moves" className="space-y-5">
          <section
            id="active-moves"
            className="space-y-3"
            aria-labelledby="active-moves-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3
                  id="active-moves-heading"
                  className="flex items-center gap-2 text-lg font-semibold"
                >
                  <CalendarDays
                    className="size-4 text-accent"
                    aria-hidden="true"
                  />
                  Active moves
                </h3>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Pick up the move workspace before setup helpers and status
                  metrics.
                </p>
              </div>
              {moveId ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={moveWorkspacePath(moveId)}>
                    Open selected move
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

          <section
            className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]"
            aria-labelledby="dashboard-summary-heading"
          >
            <div className="space-y-3">
              <div>
                <h3
                  id="dashboard-summary-heading"
                  className="text-base font-semibold"
                >
                  Workspace summary
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Secondary context stays below the active work.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
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
  selected,
  onSelect,
}: {
  move: DashboardMove;
  selected: boolean;
  onSelect: (moveId: Id<"moves">) => void;
}) {
  const route = [move.origin, move.destination].filter(Boolean).join(" -> ");

  return (
    <Card role="listitem">
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
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <DashboardMoveField label="Type" value={move.type} />
          <DashboardMoveField
            label="Packets"
            value={String(move.documentationProfileTypes?.length ?? 0)}
          />
          <DashboardMoveField label="System" value={move.unitSystem} />
        </div>
        <div className="rounded-md border border-border/70 bg-muted/25 p-2">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Jump to task
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
        </div>
        <div className="flex flex-wrap justify-end gap-2">
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
              Select move
            </Button>
          )}
          <Button asChild size="sm">
            <Link href={moveWorkspacePath(move._id)}>
              Open workspace
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardMoveField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border/70 px-2 py-1.5">
      <p className="text-[0.68rem] uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
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
