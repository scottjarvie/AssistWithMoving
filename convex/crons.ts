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

crons.interval("clean abandoned upload objects", { minutes: 30 }, internal.photos.cleanupExpiredInternal, {});

export default crons;
