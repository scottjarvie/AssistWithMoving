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
import { ConvexAuthStatus } from "@/components/convex-auth-status";
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

export function MoveDashboard() {
  const { user } = useUser();
  const currentUser = useQuery(api.users.current);
  const upsertCurrentUser = useMutation(api.users.upsertCurrent);
  const households = useQuery(api.households.listMine, currentUser ? {} : "skip");
  const createHousehold = useMutation(api.households.create);
  const createMove = useMutation(api.moves.create);

  const [householdName, setHouseholdName] = useState("My household");
  const [selectedHouseholdId, setSelectedHouseholdId] =
    useState<Id<"households"> | null>(null);
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

  const selectedPacketCount = documentationProfileTypes.length;

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
      await createMove({
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
      setPcsOrdersNumber("");
      setMoveLevelWeightAllowanceLb("");
      setMessage("Move created.");
    } catch {
      setMessage("Could not create the move yet.");
    } finally {
      setSaving(false);
    }
  }

  const loadingIdentity = currentUser === undefined;
  const loadingHouseholds = currentUser && households === undefined;
  const loadingMoves = householdId && moves === undefined;

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
          value="0"
          icon={Archive}
          note="add after move setup"
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
                  ["Inventory", "awaiting item schema", "MOVE-15"],
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
