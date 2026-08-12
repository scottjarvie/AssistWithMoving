"use client";

import { QueueRouteError } from "@/components/queue-route-error";

export default function MoveQueueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <QueueRouteError error={error} reset={reset} />;
}
