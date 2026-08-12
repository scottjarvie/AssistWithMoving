"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  QueueDesk,
  type QueueDeskActivity,
  type QueueDeskItem,
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
  activity: ActivityResult["activities"][number],
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
      ? { householdId, moveId, ownerUserId: selectedOwnerUserId }
      : "skip",
    { initialNumItems: 50 },
  );
  const captures = usePaginatedQuery(
    api.queue.listCaptureAdapter,
    paginationReady
      ? { householdId, moveId, ownerUserId: selectedOwnerUserId }
      : "skip",
    { initialNumItems: 50 },
  );
  const stats = useQuery(api.households.summaryStats, { householdId }) as
    | { activeApiKeyCount: number }
    | undefined;
  const activityPage = useQuery(
    api.queue.listActivity,
    selectedCanonicalId
      ? {
          householdId,
          moveId,
          queueItemId: selectedCanonicalId as Id<"queueItems">,
          limit: 50,
        }
      : "skip",
  );
  const createDirective = useMutation(api.queue.createDirective);
  const provideInput = useMutation(api.queue.provideInput);
  const cancelQueueItem = useMutation(api.queue.cancel);

  const currentHandoffs =
    handoffs.results.map((item) =>
      mapCanonicalItem(
        item,
        effectiveOwnerScope === "all"
          ? ownerLabels.get(item.ownerUserId) ?? "Move participant"
          : null,
      ),
    );
  const currentCaptures = captures.results.map((item) =>
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

  async function handleCreateDirective(directive: string) {
    try {
      await createDirective({
        householdId,
        moveId,
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
      activeApiKeyCount={stats?.activeApiKeyCount ?? null}
      loading={
        handoffs.status === "LoadingFirstPage" ||
        captures.status === "LoadingFirstPage"
      }
      hasMoreHandoffs={handoffs.status === "CanLoadMore"}
      hasMoreCaptures={captures.status === "CanLoadMore"}
      onLoadMoreHandoffs={() => handoffs.loadMore(50)}
      onLoadMoreCaptures={() => captures.loadMore(50)}
      onCreateDirective={handleCreateDirective}
      onSelectItem={(item) =>
        setSelectedCanonicalId(item?.source === "handoff" ? item.id : null)
      }
      ownerScope={effectiveOwnerScope === "all" ? "all" : effectiveOwnerScope}
      ownerOptions={ownerOptions}
      onOwnerScopeChange={(value) => {
        setOwnerScope(value);
      }}
      activities={activityPage?.activities.map(mapActivity) ?? []}
      activitiesLoading={
        selectedCanonicalId !== null && activityPage === undefined
      }
      onProvideInput={handleProvideInput}
      onCancel={handleCancel}
      captureWorkspacePath={`/app/moves/${encodeURIComponent(moveId)}/capture`}
    />
  );
}
