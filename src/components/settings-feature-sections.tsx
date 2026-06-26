"use client";

import { useState } from "react";
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

  const [activeSettingsTask, setActiveSettingsTask] = useState("overview");
  const tabs = [
    {
      value: "overview",
      label: "Overview",
      description:
        "Check the account posture first, then open only the setting area that needs work.",
    },
    {
      value: "household",
      label: "People",
      description:
        "Invite or review the people who can work across all your moves.",
    },
    {
      value: "ai",
      label: "AI access",
      description:
        "Create a trusted assistant key, copy the image handoff, or revoke old agent access.",
    },
    {
      value: "privacy",
      label: "Privacy",
      description:
        "Export account data, review retention, or stage account deletion without mixing those jobs.",
    },
    ...(billingGatesEnabled
      ? [
          {
            value: "billing",
            label: "Billing",
            description:
              "Review billing readiness when paid feature gates are enabled.",
          },
        ]
      : []),
  ];

  return (
    <Tabs
      value={activeSettingsTask}
      onValueChange={setActiveSettingsTask}
      className="gap-4"
    >
      <MoveWorkspaceTabList
        tabs={tabs}
        activeValue={activeSettingsTask}
        ariaLabel="Settings tasks"
      />

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
