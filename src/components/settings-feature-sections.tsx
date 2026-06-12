"use client";

import { useQuery } from "convex/react";
import { useAuth } from "@clerk/nextjs";

import { api } from "../../convex/_generated/api";
import { AccountPrivacyControls } from "@/components/account-privacy-controls";
import { ApiKeyManager } from "@/components/api-key-manager";
import { BillingReadinessPanel } from "@/components/billing-readiness-panel";
import { FeatureUnavailable } from "@/components/feature-unavailable";
import { HouseholdMemberManager } from "@/components/household-member-manager";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { SettingsPostureOverview } from "@/components/settings-posture-overview";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { flagEnabled, type EffectiveFeatureFlag } from "@/lib/feature-flags";

export function SettingsFeatureSections() {
  const { isLoaded, isSignedIn } = useAuth();
  const authQueryReady = isLoaded && isSignedIn;
  const flags = useQuery(
    api.featureFlags.effective,
    authQueryReady ? {} : "skip"
  ) as
    | EffectiveFeatureFlag[]
    | undefined;
  const currentUser = useQuery(api.users.current, authQueryReady ? {} : "skip");
  const households = useQuery(
    api.households.listMine,
    authQueryReady ? {} : "skip"
  );
  const apiMcpEnabled = flagEnabled(flags, "apiMcp", true);
  const billingGatesEnabled = flagEnabled(flags, "billingGates", false);
  const authReady = authQueryReady && currentUser !== undefined;
  const authenticated = Boolean(currentUser);

  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "household", label: "Household" },
    { value: "ai", label: "AI access" },
    { value: "privacy", label: "Privacy" },
    ...(billingGatesEnabled ? [{ value: "billing", label: "Billing" }] : []),
  ];

  return (
    <Tabs defaultValue="overview" className="gap-4">
      <MoveWorkspaceTabList tabs={tabs} />

      <TabsContent value="overview">
        <SettingsPostureOverview
          currentUser={currentUser}
          households={households}
          flags={flags}
        />
      </TabsContent>

      <TabsContent value="household">
        <HouseholdMemberManager
          households={households}
          enabled={authReady && authenticated}
        />
      </TabsContent>

      <TabsContent value="ai">
        {apiMcpEnabled ? (
          <ApiKeyManager enabled={authReady && authenticated} />
        ) : (
          <FeatureUnavailable
            title="API and MCP disabled"
            description="Scoped API keys and local agent access are currently hidden by rollout controls."
          />
        )}
      </TabsContent>

      <TabsContent value="privacy">
        <AccountPrivacyControls enabled={authReady && authenticated} />
      </TabsContent>

      {billingGatesEnabled ? (
        <TabsContent value="billing">
          <BillingReadinessPanel />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
