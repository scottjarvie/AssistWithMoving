"use client";

import { ClaimsCenterPanel } from "@/components/claims-center-panel";
import { DocumentationPacketBuilder } from "@/components/documentation-packet-builder";
import { FeatureUnavailable } from "@/components/feature-unavailable";
import { MoveWorkspaceHeader } from "@/components/move-workspace-header";
import { useMoveWorkspace } from "@/components/move-workspace-context";
import { flagEnabled } from "@/lib/feature-flags";

export function PacketsWorkspacePage() {
  const { householdId, moveId, selectedMove, featureFlags } =
    useMoveWorkspace();
  const documentationPacketsEnabled = flagEnabled(
    featureFlags,
    "documentationPackets",
    true
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <MoveWorkspaceHeader
        title="Packets"
        description="Scoped documentation for each recipient — movers, employers, insurers, and your own full record — with privacy defaults applied."
      />
      {documentationPacketsEnabled ? (
        <DocumentationPacketBuilder
          householdId={householdId}
          moveId={moveId}
          selectedProfileTypes={selectedMove?.documentationProfileTypes ?? []}
        />
      ) : (
        <FeatureUnavailable
          title="Documentation packets disabled"
          description="Recipient packets are currently hidden by rollout controls."
        />
      )}
      <ClaimsCenterPanel householdId={householdId} moveId={moveId} />
    </div>
  );
}
