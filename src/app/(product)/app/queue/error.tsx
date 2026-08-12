"use client";

import { QueueRouteError } from "@/components/queue-route-error";

export default function QueueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <QueueRouteError error={error} reset={reset} />;
}
