"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { RefreshCw, SlidersHorizontal, ToggleLeft, ToggleRight } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { EffectiveFeatureFlag } from "@/lib/feature-flags";

export function FeatureFlagControls() {
  const flags = useQuery(api.featureFlags.effective, {}) as
    | EffectiveFeatureFlag[]
    | undefined;
  const setOverride = useMutation(api.featureFlags.setOverride);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function toggleFlag(flag: EffectiveFeatureFlag) {
    setBusyKey(flag.key);
    setMessage(null);
    try {
      await setOverride({
        key: flag.key,
        enabled: !flag.enabled,
        environment: flag.environment,
        note: "Updated from admin runtime controls.",
      });
      setMessage(`${flag.label} ${flag.enabled ? "disabled" : "enabled"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update flag.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" />
          Feature flags
        </CardTitle>
        <CardDescription>
          Runtime rollout controls for risky product areas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {flags === undefined ? (
          <div className="grid gap-2 md:grid-cols-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {flags.map((flag) => (
              <div key={flag.key} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">{flag.label}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {flag.description}
                    </p>
                  </div>
                  <Badge variant={flag.enabled ? "default" : "outline"}>
                    {flag.enabled ? "On" : "Off"} / {flag.source}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Environment: {flag.environment}
                  </p>
                  <Button
                    type="button"
                    variant={flag.enabled ? "outline" : "default"}
                    size="sm"
                    disabled={busyKey === flag.key}
                    onClick={() => void toggleFlag(flag)}
                  >
                    {busyKey === flag.key ? (
                      <RefreshCw className="animate-spin" aria-hidden="true" />
                    ) : flag.enabled ? (
                      <ToggleLeft aria-hidden="true" />
                    ) : (
                      <ToggleRight aria-hidden="true" />
                    )}
                    {flag.enabled ? "Disable" : "Enable"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {message ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
