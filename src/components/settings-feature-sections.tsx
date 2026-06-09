"use client";

import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { AccountPrivacyControls } from "@/components/account-privacy-controls";
import { ApiKeyManager } from "@/components/api-key-manager";
import { BillingReadinessPanel } from "@/components/billing-readiness-panel";
import { FeatureUnavailable } from "@/components/feature-unavailable";
import { SettingsPostureOverview } from "@/components/settings-posture-overview";
import { flagEnabled, type EffectiveFeatureFlag } from "@/lib/feature-flags";

export function SettingsFeatureSections() {
  const flags = useQuery(api.featureFlags.effective, {}) as
    | EffectiveFeatureFlag[]
    | undefined;
  const currentUser = useQuery(api.users.current);
  const households = useQuery(api.households.listMine);
  const apiMcpEnabled = flagEnabled(flags, "apiMcp", true);
  const billingGatesEnabled = flagEnabled(flags, "billingGates", false);
  const authReady = currentUser !== undefined;
  const authenticated = Boolean(currentUser);

  return (
    <>
      <SettingsPostureOverview
        currentUser={currentUser}
        households={households}
        flags={flags}
      />
      <div className="mt-6">
        {apiMcpEnabled ? (
          <ApiKeyManager enabled={authReady && authenticated} />
        ) : (
          <FeatureUnavailable
            title="API and MCP disabled"
            description="Scoped API keys and local agent access are currently hidden by rollout controls."
          />
        )}
      </div>
      <div className="mt-6">
        <AccountPrivacyControls enabled={authReady && authenticated} />
      </div>
      <div className="mt-6">
        {billingGatesEnabled ? <BillingReadinessPanel /> : null}
      </div>
    </>
  );
}
