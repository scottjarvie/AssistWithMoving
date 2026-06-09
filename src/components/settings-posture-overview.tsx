"use client";

import {
  CreditCard,
  FileLock2,
  Home,
  KeyRound,
  Shield,
  UserRound,
} from "lucide-react";

import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildSettingsPosture,
  type SettingsPostureItem,
} from "@/lib/settings-posture";
import type { EffectiveFeatureFlag } from "@/lib/feature-flags";

type HouseholdEntry = {
  household: {
    _id: Id<"households">;
    name: string;
  };
  role: string;
};

type CurrentUser = {
  email?: string;
  name?: string;
  appRole?: "member" | "admin";
  status?: "active" | "disabled";
} | null;

const postureIcons = {
  account: UserRound,
  households: Home,
  apiMcp: KeyRound,
  packets: FileLock2,
  privacy: Shield,
  billing: CreditCard,
} satisfies Record<SettingsPostureItem["key"], typeof UserRound>;

export function SettingsPostureOverview({
  currentUser,
  households,
  flags,
}: {
  currentUser: CurrentUser | undefined;
  households: HouseholdEntry[] | undefined;
  flags: EffectiveFeatureFlag[] | undefined;
}) {
  const authReady = currentUser !== undefined && households !== undefined;
  const posture = buildSettingsPosture({
    currentUser,
    households,
    flags,
    authReady,
  });

  return (
    <section className="space-y-3" aria-labelledby="settings-posture-heading">
      <div>
        <h3
          id="settings-posture-heading"
          className="text-base font-medium leading-snug"
        >
          Security posture
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Current account, household, automation, packet, privacy, and billing
          state.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {!authReady
          ? Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))
          : posture.map((item) => {
              const Icon = postureIcons[item.key];
              return (
                <div
                  key={item.key}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Icon
                          className="size-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        {item.label}
                      </p>
                      <p className="mt-2 text-xl font-semibold leading-tight">
                        {item.value}
                      </p>
                    </div>
                    <Badge variant={badgeVariant(item.tone)}>
                      {badgeLabel(item.tone)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              );
            })}
      </div>
    </section>
  );
}

function badgeVariant(tone: SettingsPostureItem["tone"]) {
  switch (tone) {
    case "ready":
      return "outline";
    case "attention":
      return "destructive";
    case "muted":
      return "secondary";
  }
}

function badgeLabel(tone: SettingsPostureItem["tone"]) {
  switch (tone) {
    case "ready":
      return "Ready";
    case "attention":
      return "Attention";
    case "muted":
      return "Prepared";
  }
}
