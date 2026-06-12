"use client";

import { ClaimsCenterPanel } from "@/components/claims-center-panel";
import { DocumentationPacketBuilder } from "@/components/documentation-packet-builder";
import { FeatureUnavailable } from "@/components/feature-unavailable";
import { MoveWorkspaceTabList } from "@/components/move-workspace-tab-list";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useHashTab } from "@/components/use-hash-tab";
import { flagEnabled } from "@/lib/feature-flags";

const packetTabHashes = {
  "#claims-center": "claims",
  "#documentation-packets": "builder",
} as const;

export function PacketsWorkspacePage() {
  const { householdId, moveId, selectedMove, featureFlags } =
    useMoveWorkspace();
  const documentationPacketsEnabled = flagEnabled(
    featureFlags,
    "documentationPackets",
    true
  );
  const [activeTab, setActiveTab] = useHashTab("builder", packetTabHashes);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Packets"
        description="Scoped documentation for each recipient — movers, employers, insurers, and your own full record — with privacy defaults applied."
      />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <MoveWorkspaceTabList
          tabs={[
            { value: "builder", label: "Builder" },
            { value: "claims", label: "Claims" },
          ]}
        />

        <TabsContent value="builder">
          {documentationPacketsEnabled ? (
            <DocumentationPacketBuilder
              householdId={householdId}
              moveId={moveId}
              moveType={selectedMove?.type}
              selectedProfileTypes={selectedMove?.documentationProfileTypes ?? []}
            />
          ) : (
            <FeatureUnavailable
              title="Documentation packets disabled"
              description="Recipient packets are currently hidden by rollout controls."
            />
          )}
        </TabsContent>
        <TabsContent value="claims">
          <ClaimsCenterPanel householdId={householdId} moveId={moveId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
