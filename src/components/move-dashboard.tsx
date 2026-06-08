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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const moveTypeOptions = [
  ["pcs", "Military PCS"],
  ["local", "Local move"],
  ["longDistance", "Long-distance"],
  ["storage", "Storage inventory"],
  ["estate", "Estate / cleanout"],
  ["decluttering", "Decluttering"],
  ["claimsInventory", "Claims inventory"],
  ["other", "Other"],
] as const;

const packetTypes = [
  "PCS / PPM support",
  "Moving company load list",
  "Employer relocation",
  "Claims evidence",
  "Storage manifest",
];

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
  const [moveType, setMoveType] = useState<(typeof moveTypeOptions)[number][0]>(
    "pcs"
  );
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
      await createMove({
        householdId,
        title: moveTitle,
        type: moveType,
        origin: origin || undefined,
        destination: destination || undefined,
        unitSystem: "imperial",
      });
      setMoveTitle("");
      setOrigin("");
      setDestination("");
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
        <Metric label="Moves" value={activeMoves.length} icon={Truck} note="active records" />
        <Metric label="Households" value={households?.length ?? 0} icon={Home} note="you can access" />
        <Metric label="Resources" value="0" icon={Archive} note="add after move setup" />
        <Metric label="Packets" value={packetTypes.length} icon={FileStack} note="planned profiles" />
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
                Choose the workflow now; detailed presets come next.
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
                  onChange={(event) =>
                    setMoveType(event.target.value as typeof moveType)
                  }
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
                <Button
                  type="submit"
                  size="sm"
                  disabled={!householdId || !moveTitle.trim() || saving}
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
                      <TableCell>{move.status}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {[move.origin, move.destination].filter(Boolean).join(" -> ") || "not set"}
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
                  ["PCS presets", "mode fields exist; preset rules next", "MOVE-12"],
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
            {packetTypes.map((packet) => (
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
