"use client";

import { useQuery } from "convex/react";
import { CreditCard } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { AccountPrivacyControls } from "@/components/account-privacy-controls";
import { ApiKeyManager } from "@/components/api-key-manager";
import { FeatureUnavailable } from "@/components/feature-unavailable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { flagEnabled, type EffectiveFeatureFlag } from "@/lib/feature-flags";

export function SettingsFeatureSections() {
  const flags = useQuery(api.featureFlags.effective, {}) as
    | EffectiveFeatureFlag[]
    | undefined;
  const apiMcpEnabled = flagEnabled(flags, "apiMcp", true);
  const billingGatesEnabled = flagEnabled(flags, "billingGates", false);

  return (
    <>
      <div className="mt-6">
        {apiMcpEnabled ? (
          <ApiKeyManager />
        ) : (
          <FeatureUnavailable
            title="API and MCP disabled"
            description="Scoped API keys and local agent access are currently hidden by rollout controls."
          />
        )}
      </div>
      <div className="mt-6">
        <AccountPrivacyControls />
      </div>
      <div className="mt-6">
        {billingGatesEnabled ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-4 text-primary" aria-hidden="true" />
                Billing gates
              </CardTitle>
              <CardDescription>
                Tier-like limits and upgrade messaging are enabled for this environment.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Billing adapters are intentionally isolated until pricing and provider decisions are finalized.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
