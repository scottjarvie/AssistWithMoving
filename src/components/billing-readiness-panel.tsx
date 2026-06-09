"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { CreditCard, Gauge, ShieldCheck } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type HouseholdEntry = {
  household: {
    _id: Id<"households">;
    name: string;
  };
  role: string;
};

type BillingDimension = {
  dimension: string;
  used: number;
  limit: number;
  evaluation: {
    allowed: boolean;
    used: number;
    next: number;
    limit: number;
    percent: number;
    reason?: string;
  };
};

type BillingStatus = {
  profile: {
    tier: string;
    provider: string;
    status: string;
    note?: string;
    updatedAt: number;
  } | null;
  effectiveTier: string;
  definition: {
    label: string;
    description: string;
  };
  gatesEnabled: boolean;
  providerDecision: {
    activeProvider: string;
    candidates: readonly string[];
    note: string;
  };
  dimensions: BillingDimension[];
  upgradeMessage: string;
};

export function BillingReadinessPanel() {
  const households = useQuery(api.households.listMine) as
    | HouseholdEntry[]
    | undefined;
  const [selectedHouseholdId, setSelectedHouseholdId] =
    useState<Id<"households"> | null>(null);
  const householdId =
    selectedHouseholdId ?? households?.[0]?.household._id ?? null;
  const status = useQuery(
    api.billing.statusForHousehold,
    householdId ? { householdId } : "skip"
  ) as BillingStatus | undefined;

  const selectedHousehold = useMemo(
    () =>
      households?.find((entry) => entry.household._id === householdId)?.household,
    [households, householdId]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-4 text-primary" aria-hidden="true" />
          Billing readiness
        </CardTitle>
        <CardDescription>
          Usage dimensions, tier gates, and inactive payment-provider status.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {households === undefined ? (
          <Skeleton className="h-10 w-full" />
        ) : households.length ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={householdId ?? ""}
              onChange={(event) =>
                setSelectedHouseholdId(event.target.value as Id<"households">)
              }
              aria-label="Household for billing readiness"
            >
              {households.map((entry) => (
                <option key={entry.household._id} value={entry.household._id}>
                  {entry.household.name}
                </option>
              ))}
            </select>
            <Badge variant="outline">
              {selectedHousehold ? selectedHousehold.name : "No household"}
            </Badge>
          </div>
        ) : (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            Create a household before reviewing billing readiness.
          </p>
        )}

        {householdId && status === undefined ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : status ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border p-3">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Gauge className="size-3.5" aria-hidden="true" />
                  Effective tier
                </p>
                <p className="mt-1 text-lg font-semibold">{status.definition.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {status.definition.description}
                </p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  Gates
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {status.gatesEnabled ? "Enforcing" : "Prepared"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {status.gatesEnabled
                    ? "Tier limits are actively enforced."
                    : "Limits are visible but not blocking while the billing flag is off."}
                </p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="mt-1 text-lg font-semibold">
                  {status.providerDecision.activeProvider}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {status.providerDecision.note}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {status.dimensions.map((dimension) => (
                <div
                  key={dimension.dimension}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      {labelize(dimension.dimension)}
                    </p>
                    <Badge
                      variant={dimension.evaluation.allowed ? "outline" : "destructive"}
                    >
                      {formatUsage(dimension.used, dimension.limit)}
                    </Badge>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{
                        width: `${Math.min(dimension.evaluation.percent, 100)}%`,
                      }}
                    />
                  </div>
                  {dimension.evaluation.reason ? (
                    <p className="mt-2 text-xs text-destructive">
                      {dimension.evaluation.reason}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
              {status.upgradeMessage}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatUsage(used: number, limit: number) {
  if (!Number.isFinite(limit)) {
    return `${formatNumber(used)} / unlimited`;
  }
  return `${formatNumber(used)} / ${formatNumber(limit)}`;
}

function formatNumber(value: number) {
  if (Math.abs(value) >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (Math.abs(value) >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString();
  }
  return String(value);
}

function labelize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
