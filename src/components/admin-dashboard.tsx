"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  Activity,
  Bot,
  Database,
  FileArchive,
  Home,
  Image,
  KeyRound,
  Link2,
  RefreshCw,
  Search,
  ShieldAlert,
  Truck,
  Users,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { FeatureFlagControls } from "@/components/feature-flag-controls";
import { LaunchReadinessPanel } from "@/components/launch-readiness-panel";
import { OperationalSignalsPanel } from "@/components/operational-signals-panel";
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
import { flagEnabled, type EffectiveFeatureFlag } from "@/lib/feature-flags";

type CountMap = Record<string, number>;

type SafeUser = {
  id: Id<"users">;
  email?: string;
  name?: string;
  appRole: "member" | "admin";
  status: "active" | "disabled";
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
};

type SafeHousehold = {
  id: Id<"households">;
  name: string;
  slug?: string;
  ownerUserId: Id<"users">;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
};

type SafeMove = {
  id: Id<"moves">;
  householdId: Id<"households">;
  title: string;
  type: string;
  status: string;
  origin?: string;
  destination?: string;
  dateStart?: string;
  dateEnd?: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
};

type SafeAudit = {
  id: Id<"auditLogs">;
  householdId?: Id<"households">;
  moveId?: Id<"moves">;
  actorType: string;
  actorUserId?: Id<"users">;
  category: string;
  action: string;
  objectTable?: string;
  objectId?: string;
  createdAt: number;
};

type Overview = {
  generatedAt: number;
  currentAdmin: SafeUser;
  totals: Record<string, number>;
  distributions: Record<string, CountMap>;
  recentAudit: SafeAudit[];
};

type SearchResults = {
  query: string;
  users: SafeUser[];
  households: SafeHousehold[];
  moves: SafeMove[];
};

type MembershipSummary = {
  id: string;
  householdId?: Id<"households">;
  householdName?: string;
  userId?: Id<"users">;
  userEmail?: string;
  userName?: string;
  role: string;
  status: string;
  updatedAt: number;
};

type UserDetail = {
  kind: "user";
  user: SafeUser;
  counts: Record<string, number>;
  memberships: MembershipSummary[];
  ownedHouseholds: SafeHousehold[];
  createdMoves: SafeMove[];
  recentAudit: SafeAudit[];
};

type HouseholdDetail = {
  kind: "household";
  household: SafeHousehold;
  counts: Record<string, number>;
  distributions: Record<string, CountMap>;
  members: MembershipSummary[];
  moves: SafeMove[];
  recentAudit: SafeAudit[];
};

type MoveDetail = {
  kind: "move";
  move: SafeMove;
  household: SafeHousehold | null;
  counts: Record<string, number>;
  distributions: Record<string, CountMap>;
  recentAudit: SafeAudit[];
};

type Detail = UserDetail | HouseholdDetail | MoveDetail;

type SelectedEntity =
  | { kind: "user"; id: Id<"users">; label: string }
  | { kind: "household"; id: Id<"households">; label: string }
  | { kind: "move"; id: Id<"moves">; label: string };

const coreMetrics = [
  ["activeUsers", "Active users", Users],
  ["activeHouseholds", "Households", Home],
  ["activeMoves", "Active moves", Truck],
  ["items", "Items", Database],
  ["boxes", "Boxes", Database],
  ["photos", "Photos", Image],
  ["exportJobs", "Exports", FileArchive],
  ["aiJobs", "AI jobs", Bot],
  ["activeApiKeys", "API keys", KeyRound],
  ["activeShareLinks", "Share links", Link2],
] as const;

export function AdminDashboard() {
  const auth = useConvexAuth();
  const loadOverviewMutation = useMutation(api.admin.overview);
  const flags = useQuery(api.featureFlags.effective, {}) as
    | EffectiveFeatureFlag[]
    | undefined;
  const currentUser = useQuery(
    api.users.current,
    auth.isAuthenticated ? {} : "skip",
  );
  const searchMutation = useMutation(api.admin.search);
  const getUser = useMutation(api.admin.getUser);
  const getHousehold = useMutation(api.admin.getHousehold);
  const getMove = useMutation(api.admin.getMove);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [selected, setSelected] = useState<SelectedEntity | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState<"overview" | "search" | "detail" | null>(
    "overview"
  );
  const [message, setMessage] = useState<string | null>(null);
  const currentUserIsLoading = auth.isAuthenticated && currentUser === undefined;
  const canLoadAdmin = auth.isAuthenticated && currentUser?.appRole === "admin";

  const refreshOverview = useCallback(async () => {
    if (!canLoadAdmin) {
      setMessage("Sign in before opening the admin dashboard.");
      return;
    }
    setLoading("overview");
    setMessage(null);
    try {
      const nextOverview = (await loadOverviewMutation({})) as Overview;
      setOverview(nextOverview);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(null);
    }
  }, [canLoadAdmin, loadOverviewMutation]);

  useEffect(() => {
    let cancelled = false;
    if (auth.isLoading || currentUserIsLoading) {
      return () => {
        cancelled = true;
      };
    }
    if (!canLoadAdmin) {
      return () => {
        cancelled = true;
      };
    }

    async function loadInitialOverview() {
      try {
        const nextOverview = (await loadOverviewMutation({})) as Overview;
        if (!cancelled) {
          setOverview(nextOverview);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(errorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(null);
        }
      }
    }

    void loadInitialOverview();

    return () => {
      cancelled = true;
    };
  }, [auth.isLoading, canLoadAdmin, currentUserIsLoading, loadOverviewMutation]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("search");
    setMessage(null);
    try {
      const nextResults = (await searchMutation({
        query,
        limit: 8,
      })) as SearchResults;
      setResults(nextResults);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(null);
    }
  }

  async function openEntity(entity: SelectedEntity) {
    setSelected(entity);
    setDetail(null);
    setLoading("detail");
    setMessage(null);
    try {
      const nextDetail =
        entity.kind === "user"
          ? await getUser({ userId: entity.id })
          : entity.kind === "household"
            ? await getHousehold({ householdId: entity.id })
            : await getMove({ moveId: entity.id });
      setDetail(nextDetail as Detail | null);
      if (!nextDetail) {
        setMessage("That record no longer exists.");
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(null);
    }
  }

  const riskSignals = useMemo(() => {
    if (!overview) {
      return [];
    }

    return [
      ["AI estimate", formatCents(overview.totals.aiEstimatedCents)],
      ["Photo storage", formatBytes(overview.totals.photoBytes)],
      ["Export storage", formatBytes(overview.totals.exportBytes)],
      ["Admin users", overview.totals.adminUsers.toLocaleString()],
    ];
  }, [overview]);
  const adminToolsEnabled = flagEnabled(flags, "adminTools", true);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-semibold tracking-tight">Admin</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Account, usage, audit, and support visibility without private
            inventory browsing.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={loading === "overview"}
          onClick={() => void refreshOverview()}
        >
          <RefreshCw
            className={loading === "overview" ? "animate-spin" : undefined}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

      {message ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {message}
        </div>
      ) : null}

      {auth.isLoading || currentUserIsLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {coreMetrics.slice(0, 5).map(([, label]) => (
            <Skeleton key={label} className="h-28 w-full" />
          ))}
        </div>
      ) : !auth.isAuthenticated ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
              Sign in required
            </CardTitle>
            <CardDescription>
              Sign in before opening the admin dashboard.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : currentUser?.appRole !== "admin" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
              Admin access required
            </CardTitle>
            <CardDescription>
              This dashboard is available only to MovingManifest admins.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : !adminToolsEnabled ? (
        <div className="space-y-4">
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Admin operational dashboards are disabled by feature flag. Runtime
            flag controls remain available so an app admin can re-enable them.
          </div>
          <FeatureFlagControls />
        </div>
      ) : overview ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {coreMetrics.map(([key, label, Icon]) => (
              <MetricTile
                key={key}
                icon={Icon}
                label={label}
                value={overview.totals[key]?.toLocaleString() ?? "0"}
              />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="size-4 text-primary" aria-hidden="true" />
                  Support search
                </CardTitle>
                <CardDescription>
                  Search users, households, and moves by safe identifiers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]"
                  onSubmit={(event) => void handleSearch(event)}
                >
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Email, household, move, or ID"
                    aria-label="Admin support search"
                  />
                  <Button
                    type="submit"
                    disabled={loading === "search" || query.trim().length < 2}
                  >
                    {loading === "search" ? (
                      <RefreshCw className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Search aria-hidden="true" />
                    )}
                    Search
                  </Button>
                </form>

                <SearchResultsPanel
                  results={results}
                  selected={selected}
                  onOpen={(entity) => void openEntity(entity)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  Usage signals
                </CardTitle>
                <CardDescription>
                  Cost, storage, access, and admin footprint.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {riskSignals.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-medium">{value}</span>
                  </div>
                ))}
                <DistributionBlock
                  title="Move status"
                  counts={overview.distributions.movesByStatus}
                />
                <DistributionBlock
                  title="AI status"
                  counts={overview.distributions.aiJobsByStatus}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <DetailPanel detail={detail} loading={loading === "detail"} />
            <AuditTable title="Recent operational audit" rows={overview.recentAudit} />
          </div>
          <OperationalSignalsPanel />
          <LaunchReadinessPanel />
          <FeatureFlagControls />
        </>
      ) : loading === "overview" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SearchResultsPanel({
  results,
  selected,
  onOpen,
}: {
  results: SearchResults | null;
  selected: SelectedEntity | null;
  onOpen: (entity: SelectedEntity) => void;
}) {
  if (!results) {
    return (
      <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
        No search run yet.
      </p>
    );
  }

  const total =
    results.users.length + results.households.length + results.moves.length;

  if (!total) {
    return (
      <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
        No safe matches for &quot;{results.query}&quot;.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ResultGroup
        title="Users"
        empty="No matching users"
        rows={results.users.map((user) => ({
          id: user.id,
          kind: "user" as const,
          label: user.email ?? user.name ?? String(user.id),
          meta: `${user.status} / ${user.appRole}`,
        }))}
        selected={selected}
        onOpen={onOpen}
      />
      <ResultGroup
        title="Households"
        empty="No matching households"
        rows={results.households.map((household) => ({
          id: household.id,
          kind: "household" as const,
          label: household.name,
          meta: household.archivedAt ? "archived" : "active",
        }))}
        selected={selected}
        onOpen={onOpen}
      />
      <ResultGroup
        title="Moves"
        empty="No matching moves"
        rows={results.moves.map((move) => ({
          id: move.id,
          kind: "move" as const,
          label: move.title,
          meta: `${move.type} / ${move.status}`,
        }))}
        selected={selected}
        onOpen={onOpen}
      />
    </div>
  );
}

function ResultGroup({
  title,
  empty,
  rows,
  selected,
  onOpen,
}: {
  title: string;
  empty: string;
  rows: SelectedEntityWithMeta[];
  selected: SelectedEntity | null;
  onOpen: (entity: SelectedEntity) => void;
}) {
  return (
    <div className="rounded-md border border-border">
      <div className="border-b border-border px-3 py-2 text-sm font-medium">
        {title}
      </div>
      {rows.length ? (
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <button
              key={`${row.kind}-${row.id}`}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
              onClick={() =>
                onOpen({ kind: row.kind, id: row.id, label: row.label } as SelectedEntity)
              }
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{row.label}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {String(row.id)}
                </span>
              </span>
              <Badge
                variant={
                  selected?.kind === row.kind && selected.id === row.id
                    ? "default"
                    : "outline"
                }
              >
                {row.meta}
              </Badge>
            </button>
          ))}
        </div>
      ) : (
        <p className="px-3 py-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

type SelectedEntityWithMeta =
  | (Extract<SelectedEntity, { kind: "user" }> & { meta: string })
  | (Extract<SelectedEntity, { kind: "household" }> & { meta: string })
  | (Extract<SelectedEntity, { kind: "move" }> & { meta: string });

function DetailPanel({
  detail,
  loading,
}: {
  detail: Detail | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Selected record</CardTitle>
          <CardDescription>
            Search and select a user, household, or move.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (detail.kind === "user") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{detail.user.email ?? detail.user.name ?? "User"}</CardTitle>
          <CardDescription>
            {detail.user.status} / {detail.user.appRole} / last seen{" "}
            {formatDate(detail.user.lastSeenAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MetricRow counts={detail.counts} />
          <MembershipTable rows={detail.memberships} />
          <MoveSummaryTable rows={detail.createdMoves.slice(0, 8)} />
          <AuditTable title="User audit" rows={detail.recentAudit} compact />
        </CardContent>
      </Card>
    );
  }

  if (detail.kind === "household") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{detail.household.name}</CardTitle>
          <CardDescription>
            {detail.household.archivedAt ? "archived" : "active"} / owner{" "}
            {String(detail.household.ownerUserId)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MetricRow counts={detail.counts} />
          <DistributionBlock
            title="Membership roles"
            counts={detail.distributions.membershipsByRole}
          />
          <MembershipTable rows={detail.members} />
          <MoveSummaryTable rows={detail.moves.slice(0, 10)} />
          <AuditTable title="Household audit" rows={detail.recentAudit} compact />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{detail.move.title}</CardTitle>
        <CardDescription>
          {detail.move.type} / {detail.move.status}
          {detail.household ? ` / ${detail.household.name}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MetricRow counts={detail.counts} />
        <DistributionBlock
          title="Item status"
          counts={detail.distributions.itemsByStatus}
        />
        <DistributionBlock
          title="Photo privacy"
          counts={detail.distributions.photosByPrivacy}
        />
        <AuditTable title="Move audit" rows={detail.recentAudit} compact />
      </CardContent>
    </Card>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
    </div>
  );
}

function MetricRow({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
      {Object.entries(counts).map(([key, value]) => (
        <div key={key} className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">{labelize(key)}</p>
          <p className="mt-1 font-mono text-xl font-semibold">
            {key.toLowerCase().includes("bytes")
              ? formatBytes(value)
              : key.toLowerCase().includes("cents")
                ? formatCents(value)
                : value.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

function DistributionBlock({
  title,
  counts,
}: {
  title: string;
  counts?: CountMap;
}) {
  const entries = Object.entries(counts ?? {});

  if (!entries.length) {
    return null;
  }

  return (
    <div className="rounded-md border border-border p-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {entries.map(([key, value]) => (
          <Badge key={key} variant="outline">
            {labelize(key)}: {value.toLocaleString()}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function MembershipTable({ rows }: { rows: MembershipSummary[] }) {
  if (!rows.length) {
    return null;
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">Memberships</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 10).map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.householdName ?? row.userEmail ?? row.userName}</TableCell>
              <TableCell>{row.role}</TableCell>
              <TableCell>{row.status}</TableCell>
              <TableCell>{formatDate(row.updatedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MoveSummaryTable({ rows }: { rows: SafeMove[] }) {
  if (!rows.length) {
    return null;
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">Moves</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Move</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((move) => (
            <TableRow key={move.id}>
              <TableCell>{move.title}</TableCell>
              <TableCell>{move.type}</TableCell>
              <TableCell>{move.status}</TableCell>
              <TableCell>{formatDate(move.updatedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AuditTable({
  title,
  rows,
  compact = false,
}: {
  title: string;
  rows: SafeAudit[];
  compact?: boolean;
}) {
  return (
    <Card className={compact ? "rounded-md" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        {!compact ? (
          <CardDescription>
            Recent admin, API, export, and AI events with redacted metadata.
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Object</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.category}
                    </div>
                  </TableCell>
                  <TableCell>{row.actorType}</TableCell>
                  <TableCell>
                    {row.objectTable ? `${row.objectTable}:${row.objectId}` : "-"}
                  </TableCell>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No recent audit rows.</p>
        )}
      </CardContent>
    </Card>
  );
}

function formatBytes(value = 0) {
  if (value < 1024) {
    return `${value.toLocaleString()} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatCents(value = 0) {
  return `$${(value / 100).toFixed(2)}`;
}

function formatDate(value?: number) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function labelize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Admin request failed.";
}
