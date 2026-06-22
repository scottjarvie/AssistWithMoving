"use client";

// Capture moved into the always-visible "Add to Queue" Sheet, so the old
// capture page now resolves to the queue surface. This thin re-export keeps the
// historical /app/moves/[moveId]/capture route (and any deep links to it)
// landing on the queue instead of a removed tab.
export { QueueWorkspacePage as CaptureWorkspacePage } from "@/components/move-pages/queue-page";
