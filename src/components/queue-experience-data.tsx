"use client";

import { useEffect, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  QueueDesk,
  type QueueDeskActivity,
  type QueueDeskItem,
  type QueueState,
} from "@/components/queue-experience";
import { describeMutationError } from "@/lib/mutation-error";
import { toastError, toastSaved } from "@/lib/toast";

type QueueListResult = FunctionReturnType<typeof api.queue.listForMove>;
type CaptureListResult = FunctionReturnType<typeof api.queue.listCaptureAdapter>;
type ActivityResult = FunctionReturnType<typeof api.queue.listActivity>;

function mapCanonicalItem(
  item: QueueListResult["page"][number],
  ownerLabel: string | null,
): QueueDeskItem {
  return {
    id: item.queueItemId,
    source: "handoff",
    ownerUserId: item.ownerUserId,
    ownerLabel,
    directive: item.directive,
    summary: item.summary,
    state: item.state,
    stateLabel: item.stateLabel,
    requiredAction: item.requiredAction,
    nextStep: item.nextStep,
    waitingReason: item.waitingReason,
    resultSummary: item.resultSummary,
    resultRefs: item.resultRefs,
    claimLabel: item.claim?.label ?? null,
    claimExpiresAt: item.claim?.expiresAt ?? null,
    terminalReason: item.terminalReason,
    failure: item.failure,
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapCaptureItem(
  item: CaptureListResult["page"][number],
  ownerLabel: string | null,
): QueueDeskItem {
  return {
    id: item.domainRef.refId,
    source: "capture",
    ownerUserId: item.ownerUserId,
    ownerLabel,
    directive: item.directive,
    summary: "Capture from the move notebook",
    state: item.state,
    stateLabel: item.stateLabel,
    requiredAction: item.requiredAction,
    nextStep: item.nextStep,
    waitingReason: item.state === "waitingForAi" ? "connectionUnknown" : null,
    resultSummary: item.resultSummary,
    resultRefs: item.resultRefs,
    claimLabel: item.claim?.label ?? null,
    claimExpiresAt: item.claim?.expiresAt ?? null,
    terminalReason: null,
    failure: null,
    version: null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapActivity(
  activity: ActivityResult["page"][number],
): QueueDeskActivity {
  return {
    id: activity.activityId,
    type: activity.type,
    actorLabel: activity.actor.label ?? activity.actor.type,
    fromState: activity.fromState,
    toState: activity.toState,
    message: activity.message,
    createdAt: activity.createdAt,
  };
}

export function QueueExperience({
  householdId,
  moveId,
}: {
  householdId: Id<"households">;
  moveId: Id<"moves">;
}) {
  const [selectedCanonicalId, setSelectedCanonicalId] = useState<string | null>(
    null,
  );
  const [ownerScope, setOwnerScope] = useState<string>("default");
  const [activeState, setActiveState] = useState<QueueState>("needsYou");

  const currentUser = useQuery(api.users.current);
  const scopes = useQuery(api.moveParticipants.queueScopes, {
    householdId,
    moveId,
  });
  const effectiveOwnerScope =
    ownerScope === "default"
      ? scopes?.canManage
        ? "all"
        : currentUser?._id ?? "loading"
      : ownerScope;
  const ownerLabels = new Map<string, string>([
    ...(currentUser ? [[currentUser._id, "My Queue"] as const] : []),
    ...(scopes?.delegatedOwners.map(
      (owner) => [owner.userId, `${owner.name}'s Queue`] as const,
    ) ?? []),
  ]);

  const selectedOwnerUserId =
    effectiveOwnerScope === "all" || effectiveOwnerScope === "loading"
      ? undefined
      : (effectiveOwnerScope as Id<"users">);
  const paginationReady = effectiveOwnerScope !== "loading";
  const handoffs = usePaginatedQuery(
    api.queue.listForMove,
    paginationReady
      ? { householdId, moveId, ownerUserId: selectedOwnerUserId, state: activeState }
      : "skip",
    { initialNumItems: 50 },
  );
  const captures = usePaginatedQuery(
    api.queue.listCaptureAdapter,
    paginationReady
      ? { householdId, moveId, ownerUserId: selectedOwnerUserId, state: activeState }
      : "skip",
    { initialNumItems: 50 },
  );
  const legacyCaptures = usePaginatedQuery(
    api.queue.listLegacyCaptureAdapter,
    paginationReady && selectedOwnerUserId
      ? {
          householdId,
          moveId,
          ownerUserId: selectedOwnerUserId,
          state: activeState,
        }
      : "skip",
    { initialNumItems: 50 },
  );
  const connectionStatus = useQuery(
    api.queue.connectionStatus,
    paginationReady
      ? { householdId, moveId, ownerUserId: selectedOwnerUserId }
      : "skip",
  );
  const activities = usePaginatedQuery(
    api.queue.listActivity,
    selectedCanonicalId
      ? {
          householdId,
          moveId,
          queueItemId: selectedCanonicalId as Id<"queueItems">,
        }
      : "skip",
    { initialNumItems: 50 },
  );
  const createDirective = useMutation(api.queue.createDirective);
  const provideInput = useMutation(api.queue.provideInput);
  const cancelQueueItem = useMutation(api.queue.cancel);

  // State projection happens after the indexed read because expired leases can
  // change the effective state without a write. Keep paging automatically only
  // while the selected state has no visible record, so “Nothing needs you” is
  // not shown merely because newer records belong to other states.
  useEffect(() => {
    const visibleCount =
      handoffs.results.length +
      captures.results.length +
      legacyCaptures.results.length;
    if (visibleCount > 0) return;
    if (handoffs.status === "CanLoadMore") handoffs.loadMore(50);
    if (captures.status === "CanLoadMore") captures.loadMore(50);
    if (legacyCaptures.status === "CanLoadMore") legacyCaptures.loadMore(50);
  }, [
    captures,
    handoffs,
    legacyCaptures,
  ]);

  const currentHandoffs =
    handoffs.results.map((item) =>
      mapCanonicalItem(
        item,
        effectiveOwnerScope === "all"
          ? ownerLabels.get(item.ownerUserId) ?? "Move participant"
          : null,
      ),
    );
  const currentCaptures = [...captures.results, ...legacyCaptures.results].map((item) =>
    mapCaptureItem(
      item,
      effectiveOwnerScope === "all"
        ? ownerLabels.get(item.ownerUserId) ?? "Move participant"
        : null,
    ),
  );
  const ownerOptions = [
    { value: currentUser?._id ?? "mine", label: "My Queue" },
    ...(scopes?.delegatedOwners.map((owner) => ({
      value: owner.userId,
      label: `${owner.name}'s Queue`,
    })) ?? []),
    ...(scopes?.canManage
      ? [{ value: "all", label: "Everyone's Queue" }]
      : []),
  ].filter(
    (option, index, all) =>
      all.findIndex((candidate) => candidate.value === option.value) === index,
  );
  const items = [...currentHandoffs, ...currentCaptures]
    .filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.source === item.source && candidate.id === item.id,
        ) === index,
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const stateDiscoveryLoading =
    items.length === 0 &&
    [handoffs.status, captures.status, legacyCaptures.status].some(
      (status) => status === "LoadingFirstPage" || status === "LoadingMore",
    );

  async function handleCreateDirective(directive: string) {
    if (!selectedOwnerUserId) {
      toastError("Choose one person's Queue before saving a handoff.");
      return false;
    }
    try {
      await createDirective({
        householdId,
        moveId,
        ownerUserId: selectedOwnerUserId,
        directive,
        idempotencyKey: crypto.randomUUID(),
      });
      toastSaved("Handoff saved for your AI");
      return true;
    } catch (error) {
      toastError(describeMutationError(error, "Could not save the handoff."));
      return false;
    }
  }

  async function handleProvideInput(item: QueueDeskItem, response: string) {
    try {
      await provideInput({
        householdId,
        moveId,
        queueItemId: item.id as Id<"queueItems">,
        response,
        expectedVersion: item.version ?? undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      toastSaved("Answer added to the handoff");
      return true;
    } catch (error) {
      toastError(describeMutationError(error, "Could not add your answer."));
      return false;
    }
  }

  async function handleCancel(item: QueueDeskItem) {
    try {
      await cancelQueueItem({
        householdId,
        moveId,
        queueItemId: item.id as Id<"queueItems">,
        reason: "Canceled by the person from the Queue screen.",
        expectedVersion: item.version ?? undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      toastSaved("Handoff canceled and kept in Done");
      return true;
    } catch (error) {
      toastError(describeMutationError(error, "Could not cancel the handoff."));
      return false;
    }
  }

  return (
    <QueueDesk
      items={items}
      selectedState={activeState}
      onStateChange={setActiveState}
      canCreateDirective={selectedOwnerUserId !== undefined}
      directiveTargetLabel={
        selectedOwnerUserId
          ? ownerLabels.get(selectedOwnerUserId) ?? "Selected person's Queue"
          : "Choose one person's Queue"
      }
      activeApiKeyCount={connectionStatus?.queueCapableApiKeyCount ?? null}
      loading={stateDiscoveryLoading}
      hasMoreHandoffs={handoffs.status === "CanLoadMore"}
      hasMoreCaptures={
        captures.status === "CanLoadMore" ||
        legacyCaptures.status === "CanLoadMore"
      }
      onLoadMoreHandoffs={() => handoffs.loadMore(50)}
      onLoadMoreCaptures={() => {
        if (captures.status === "CanLoadMore") captures.loadMore(50);
        if (legacyCaptures.status === "CanLoadMore") legacyCaptures.loadMore(50);
      }}
      onCreateDirective={handleCreateDirective}
      onSelectItem={(item) =>
        setSelectedCanonicalId(item?.source === "handoff" ? item.id : null)
      }
      ownerScope={effectiveOwnerScope === "all" ? "all" : effectiveOwnerScope}
      ownerOptions={ownerOptions}
      onOwnerScopeChange={(value) => {
        setOwnerScope(value);
      }}
      activities={activities.results.map(mapActivity)}
      activitiesLoading={
        selectedCanonicalId !== null && activities.status === "LoadingFirstPage"
      }
      hasMoreActivities={activities.status === "CanLoadMore"}
      onLoadMoreActivities={() => activities.loadMore(50)}
      onProvideInput={handleProvideInput}
      onCancel={handleCancel}
      captureWorkspacePath={`/app/moves/${encodeURIComponent(moveId)}/capture`}
    />
  );
}
