import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Recover captures stranded mid-upload. A tab that reloads/closes/loses network
// while a queue photo is uploading leaves the entry stuck mediaUploadState
// "uploading" with no client job to finish it — which makes it permanently
// un-claimable by the user's AI agent. This sweep ages those out (to "complete"
// if the photos actually landed, else "failed", which is claimable) so a lost
// upload never strands the capture. Runs often + cheaply (bounded index scan).
crons.interval(
  "age out stuck-uploading queue captures",
  { minutes: 10 },
  internal.ingestionQueue.ageOutStuckUploadingEntries,
  {},
);

crons.interval(
  "release or expire canonical Queue handoffs",
  { minutes: 5 },
  internal.queue.maintainLeasesAndExpiry,
  {},
);

crons.interval("expire upload reservations", { minutes: 5 }, internal.usageLimits.expireReservations, {});

crons.interval("dry run abandoned upload objects", { minutes: 30 }, internal.photos.cleanupExpiredInternal, {});

crons.interval("recover generated object intents", { minutes: 30 }, internal.storageDeletion.recoverGenerated, {});

crons.interval("expire temporary data exports", { hours: 1 }, internal.exportCleanup.expireArtifacts, {});

crons.interval("process retained photo deletions (dry run until enabled)", { minutes: 30 }, internal.storageDeletion.sweep, {});
crons.interval("process abandoned sessions (dry run until enabled)", { minutes: 30 }, internal.storageDeletion.sweepSessions, {});

crons.weekly("read-only storage reconciliation", { dayOfWeek: "sunday", hourUTC: 4, minuteUTC: 0 }, internal.usageRecount.start, { dryRun: true });

export default crons;
