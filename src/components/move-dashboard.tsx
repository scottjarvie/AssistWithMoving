"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  CalendarDays,
  ClipboardList,
  FileStack,
  Home,
  Plus,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AiJobMonitor } from "@/components/ai-job-monitor";
import { AiPhotoIntake } from "@/components/ai-photo-intake";
import { AiPlanningSuggestions } from "@/components/ai-planning-suggestions";
import { AiReviewQueue } from "@/components/ai-review-queue";
import { AiTextIntake } from "@/components/ai-text-intake";
import { BoxManager } from "@/components/box-manager";
import { ConvexAuthStatus } from "@/components/convex-auth-status";
import { DocumentationPacketBuilder } from "@/components/documentation-packet-builder";
import { EstimateSummary } from "@/components/estimate-summary";
import { FeatureUnavailable } from "@/components/feature-unavailable";
import { InventoryTable } from "@/components/inventory-table";
import { LoadPlannerBoard } from "@/components/load-planner-board";
import { MoveDayView } from "@/components/move-day-view";
import { PhotoReviewWorkspace } from "@/components/photo-review-workspace";
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
import {
  transportResourcePresetOptions,
  type TransportResourcePresetKey,
} from "@/lib/transport-presets";
import { flagEnabled, type EffectiveFeatureFlag } from "@/lib/feature-flags";

export function MoveDashboard() {
  const { user } = useUser();
  const currentUser = useQuery(api.users.current);
  const upsertCurrentUser = useMutation(api.users.upsertCurrent);
  const households = useQuery(api.households.listMine, currentUser ? {} : "skip");
  const createHousehold = useMutation(api.households.create);
  const featureFlags = useQuery(api.featureFlags.effective, {}) as
    | EffectiveFeatureFlag[]
    | undefined;
  const createMove = useMutation(api.moves.create);
  const createTransportResourceFromPreset = useMutation(
    api.transportResources.createFromPreset
  );
  const ensurePlanningDefaults = useMutation(
    api.movePlanningDefaults.ensureForMove
  );

  const [householdName, setHouseholdName] = useState("My household");
  const [selectedHouseholdId, setSelectedHouseholdId] =
    useState<Id<"households"> | null>(null);
  const [selectedMoveId, setSelectedMoveId] = useState<Id<"moves"> | null>(
    null
  );
  const [moveTitle, setMoveTitle] = useState("");
  const [moveType, setMoveType] = useState<MoveType>("pcs");
  const [documentationProfileTypes, setDocumentationProfileTypes] = useState<
    DocumentationProfileType[]
  >(defaultDocumentationProfilesForMoveType("pcs"));
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
  const [addingPreset, setAddingPreset] =
    useState<TransportResourcePresetKey | null>(null);
  const [ensuringDefaults, setEnsuringDefaults] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser || !user) {
      return;
    }

    void upsertCurrentUser({
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName ?? user.username ?? undefined,
      imageUrl: user.imageUrl,
    });
  }, [currentUser, upsertCurrentUser, user]);

  const firstHousehold = households?.[0]?.household;
  const householdId = selectedHouseholdId ?? firstHousehold?._id ?? null;
  const moves = useQuery(
    api.moves.listForHousehold,
    householdId ? { householdId } : "skip"
  );

  const activeMoves = useMemo(
    () => moves?.filter((move) => move.status !== "archived") ?? [],
    [moves]
  );

  const firstMove = activeMoves[0];
  const moveId = selectedMoveId ?? firstMove?._id ?? null;
  const selectedMove = activeMoves.find((move) => move._id === moveId);
  const resourcesWithZones = useQuery(
    api.transportResources.listForMoveWithZones,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const planningDefaults = useQuery(
    api.movePlanningDefaults.listForMove,
    householdId && moveId ? { householdId, moveId } : "skip"
  );
  const selectedPacketCount = documentationProfileTypes.length;
  const documentationPacketsEnabled = flagEnabled(
    featureFlags,
    "documentationPackets",
    true
  );
  const aiPhotoIntakeEnabled = flagEnabled(featureFlags, "aiPhotoIntake", true);

  async function handleCreateHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const id = await createHousehold({ name: householdName });
      setSelectedHouseholdId(id);
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
      setSelectedMoveId(id);
      setPcsOrdersNumber("");
      setMoveLevelWeightAllowanceLb("");
      setMessage("Move created.");
    } catch {
      setMessage("Could not create the move yet.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddResourcePreset(presetKey: TransportResourcePresetKey) {
    if (!householdId || !moveId) {
      return;
    }

    setAddingPreset(presetKey);
    setMessage(null);

    try {
      await createTransportResourceFromPreset({
        householdId,
        moveId,
        presetKey,
      });
      setMessage("Resource preset added.");
    } catch {
      setMessage("Could not add that resource preset yet.");
    } finally {
      setAddingPreset(null);
    }
  }

  async function handleEnsurePlanningDefaults() {
    if (!householdId || !moveId) {
      return;
    }

    setEnsuringDefaults(true);
    setMessage(null);

    try {
      const insertedIds = await ensurePlanningDefaults({ householdId, moveId });
      setMessage(
        insertedIds.length
          ? "Planning defaults added."
          : "Planning defaults already exist."
      );
    } catch {
      setMessage("Could not add planning defaults yet.");
    } finally {
      setEnsuringDefaults(false);
    }
  }

  const loadingIdentity = currentUser === undefined;
  const loadingHouseholds = currentUser && households === undefined;
  const loadingMoves = householdId && moves === undefined;
  const loadingResources = moveId && resourcesWithZones === undefined;
  const loadingPlanningDefaults = moveId && planningDefaults === undefined;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge variant="secondary">Phase 2 setup</Badge>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                Move command center
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                Start a real move record, define the household context, then add
                resources, zones, inventory, photos, and documentation packets
                from the same permission-checked backend.
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
          label="Resources"
          value={resourcesWithZones?.length ?? 0}
          icon={Archive}
          note="selected move"
        />
        <Metric
          label="Packets"
          value={documentationProfileOptions.length}
          icon={FileStack}
          note="profile types"
        />
      </section>

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
            <CardContent>
              {loadingIdentity || loadingHouseholds ? (
                <div className="space-y-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-2/3" />
                </div>
              ) : households?.length ? (
                <div className="space-y-3">
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={householdId ?? ""}
                    onChange={(event) =>
                      setSelectedHouseholdId(
                        event.target.value as Id<"households">
                      )
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
                </div>
              ) : (
                <form className="space-y-3" onSubmit={handleCreateHousehold}>
                  <Input
                    value={householdName}
                    onChange={(event) => setHouseholdName(event.target.value)}
                    placeholder="Household name"
                  />
                  <Button type="submit" size="sm" disabled={saving}>
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
              <form className="space-y-3" onSubmit={handleCreateMove}>
                <Input
                  value={moveTitle}
                  onChange={(event) => setMoveTitle(event.target.value)}
                  placeholder="Move title"
                  disabled={!householdId}
                />
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={moveType}
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={origin}
                    onChange={(event) => setOrigin(event.target.value)}
                    placeholder="Origin"
                    disabled={!householdId}
                  />
                  <Input
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    placeholder="Destination"
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
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={pcsBranch}
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
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={pcsShipmentType}
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
                        disabled={!householdId}
                      />
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={pcsDependentStatus}
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
                        disabled={!householdId}
                      />
                      <Input
                        inputMode="numeric"
                        value={moveLevelWeightAllowanceLb}
                        onChange={(event) =>
                          setMoveLevelWeightAllowanceLb(event.target.value)
                        }
                        placeholder="Official allowance lb"
                        disabled={!householdId}
                      />
                    </div>
                    <Textarea
                      value={pcsAllowanceNotes}
                      onChange={(event) =>
                        setPcsAllowanceNotes(event.target.value)
                      }
                      placeholder="Allowance notes"
                      disabled={!householdId}
                    />
                    <Textarea
                      value={proGearNotes}
                      onChange={(event) => setProGearNotes(event.target.value)}
                      placeholder="Pro gear / PBP&E notes"
                      disabled={!householdId}
                    />
                    <Textarea
                      value={pcsTransportationOfficeNotes}
                      onChange={(event) =>
                        setPcsTransportationOfficeNotes(event.target.value)
                      }
                      placeholder="Transportation office notes"
                      disabled={!householdId}
                    />
                    <Textarea
                      value={pcsRestrictedItemsNotes}
                      onChange={(event) =>
                        setPcsRestrictedItemsNotes(event.target.value)
                      }
                      placeholder="Restricted item notes"
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
                    {documentationProfileOptions.map(([value, label]) => (
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
                {message ? (
                  <p className="text-xs text-muted-foreground">{message}</p>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4 text-accent" aria-hidden="true" />
              Active moves
            </CardTitle>
            <CardDescription>
              Real Convex records from the selected household.
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
              <div className="space-y-3">
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={moveId ?? ""}
                  onChange={(event) =>
                    setSelectedMoveId(event.target.value as Id<"moves">)
                  }
                >
                  {activeMoves.map((move) => (
                    <option key={move._id} value={move._id}>
                      {move.title}
                    </option>
                  ))}
                </select>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Move</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Profiles</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Route</TableHead>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                Create the first move to unlock resources, zones, inventory, AI
                planning, and documentation packet setup.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Transport resources</CardTitle>
            <CardDescription>
              Presets create useful default zones for{" "}
              {selectedMove?.title ?? "the selected move"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {transportResourcePresetOptions.map(([key, label, detail]) => (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start whitespace-normal p-3 text-left"
                  disabled={!moveId || addingPreset !== null}
                  onClick={() => void handleAddResourcePreset(key)}
                >
                  <span>
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {detail}
                    </span>
                  </span>
                </Button>
              ))}
            </div>

            {loadingResources ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-4/5" />
              </div>
            ) : resourcesWithZones?.length ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {resourcesWithZones.map(({ resource, zones }) => (
                  <div
                    key={resource._id}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{resource.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {resource.description ?? resource.type}
                        </p>
                      </div>
                      <Badge variant="outline">{resource.type}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {zones.map((zone) => (
                        <Badge key={zone._id} variant="secondary">
                          {zone.name}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {resource.rules.length
                        ? resource.rules.join(" · ")
                        : "No resource rules yet"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                Add trucks, trailers, movers, storage, sell/donate/dump/free,
                or unknown resources to start the load plan.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capacity posture</CardTitle>
            <CardDescription>
              Resource caps are planning limits, while PCS allowances stay on
              the move.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Trucks and trailers get weight/volume defaults. Mover, storage,
              sell, donate, dump, free, and unknown buckets can be unlimited for
              app planning.
            </p>
            <p>
              Capacity warnings become meaningful after inventory, boxes, and
              assignments land.
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <InventoryTable householdId={householdId} moveId={moveId} />
      </section>

      <EstimateSummary householdId={householdId} moveId={moveId} />

      <AiPlanningSuggestions householdId={householdId} moveId={moveId} />

      <LoadPlannerBoard householdId={householdId} moveId={moveId} />

      <MoveDayView householdId={householdId} moveId={moveId} />

      {documentationPacketsEnabled ? (
        <DocumentationPacketBuilder
          householdId={householdId}
          moveId={moveId}
          selectedProfileTypes={selectedMove?.documentationProfileTypes ?? []}
        />
      ) : (
        <FeatureUnavailable
          title="Documentation packets disabled"
          description="PCS, mover, employer, claim, load-plan, and sub-manifest packets are currently hidden by rollout controls."
        />
      )}

      <section>
        <BoxManager householdId={householdId} moveId={moveId} />
      </section>

      <PhotoReviewWorkspace householdId={householdId} moveId={moveId} />

      <AiReviewQueue householdId={householdId} moveId={moveId} />

      {aiPhotoIntakeEnabled ? (
        <AiPhotoIntake householdId={householdId} moveId={moveId} />
      ) : (
        <FeatureUnavailable
          title="AI photo intake disabled"
          description="Photo-based AI suggestions are currently hidden by rollout controls. Existing photo review remains available."
        />
      )}

      <AiTextIntake householdId={householdId} moveId={moveId} />

      <AiJobMonitor householdId={householdId} moveId={moveId} />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Planning defaults</CardTitle>
                <CardDescription>
                  These tags steer personal transport, evidence, packet
                  visibility, and later AI/load suggestions.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!moveId || ensuringDefaults}
                onClick={() => void handleEnsurePlanningDefaults()}
              >
                <Plus aria-hidden="true" />
                Ensure
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingPlanningDefaults ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-5/6" />
              </div>
            ) : planningDefaults?.length ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {planningDefaults.map((defaultRecord) => (
                  <div
                    key={defaultRecord._id}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {defaultRecord.label}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {defaultRecord.description}
                        </p>
                      </div>
                      <Badge
                        variant={
                          defaultRecord.sensitiveByDefault
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {defaultRecord.handling}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {defaultRecord.recommendedResourceTypes.map((type) => (
                        <Badge key={type} variant="outline">
                          {type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                Add first-night, personal transport, high-value, document,
                medication, electronics, fragile, sensitive, and restricted
                review defaults for the selected move.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy posture</CardTitle>
            <CardDescription>
              Sensitive defaults hide fields from helper and mover-safe views.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Values, serials, private notes, and sensitive photos stay out of
              helper/mover packets unless an owner explicitly changes the
              packet.
            </p>
            <p>
              AI suggestions should use these defaults as hints, not automatic
              trusted decisions.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Setup pipeline</CardTitle>
            <CardDescription>
              The next records are resources, zones, inventory, photos, and
              packets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Surface</TableHead>
                  <TableHead>Backend status</TableHead>
                  <TableHead className="text-right">Next issue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ["Moves", "schema and basic create/list are live", "MOVE-11"],
                  ["PCS presets", "structured fields and profiles", "MOVE-12"],
                  ["Resources", "schema and create/list are live", "MOVE-13"],
                  ["Inventory", "item schema/functions are live", "MOVE-16"],
                  ["Packets", "audit/visibility foundation ready", "MOVE-37"],
                ].map(([surface, status, issue]) => (
                  <TableRow key={surface}>
                    <TableCell className="font-medium">{surface}</TableCell>
                    <TableCell className="text-muted-foreground">{status}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{issue}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Packet profiles</CardTitle>
            <CardDescription>
              Common recipient modes remain explicit and redacted by default.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {documentationProfileOptions.map(([, packet]) => (
              <div
                key={packet}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>{packet}</span>
                <Badge variant="outline">planned</Badge>
              </div>
            ))}
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
