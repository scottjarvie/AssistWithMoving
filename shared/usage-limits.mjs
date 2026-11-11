// Generated from the synced usage-limits core. Do not edit.
// assist-usage-limits-core v1.4.2 sha256:3134094c922204ae2b92f97170bbdc9af53e848c8b6db80387c23482c7cb4b11
// Synced from assistwithlife shared/usage-limits/core.ts. Do not edit here; change it upstream and re-sync.
/**
 * Assist family upload and usage limits — framework-free core.
 * Design: docs/upload-limits-design.md. Canonical copy lives in assistwithlife;
 * sites receive it through scripts/sync-usage-limits.mjs and must not edit it locally.
 */
export const USAGE_LIMITS_CORE_VERSION = "1.4.2";
/** Decimal units: 1 GB = 10^9 bytes. */
export const DEFAULT_LIMITS = Object.freeze({
    storedBytesPerUser: 10_000_000_000,
    uploadsPerHour: 200,
    uploadsPerDay: 1_000,
    uploadBytesPerDay: 2_000_000_000,
    downloadBytesPerDay: 20_000_000_000,
    maxUploadsInFlight: 20,
    mcpBatchMaxItems: 25,
    mcpBatchMaxBytes: 48_000,
});
export const DEFAULT_PLAN_STORED_BYTES = Object.freeze({
    free: 1_000_000_000,
    pro: 10_000_000_000,
});
// Unknown keys must not resolve to inherited Object properties.
const tableValue = (table, key) => table && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
export const LIMIT_NAMES = Object.keys(DEFAULT_LIMITS);
/** Code defaults ← site settings row ← owner override. No settings row means enforcement off. */
export function effectiveLimits(site, override, plan) {
    const limits = { ...DEFAULT_LIMITS };
    for (const layer of [site, override]) {
        if (!layer)
            continue;
        for (const name of LIMIT_NAMES) {
            const value = layer[name];
            if (value !== undefined)
                limits[name] = value;
        }
    }
    if (plan != null) {
        limits.storedBytesPerUser = override?.storedBytesPerUser
            ?? tableValue(override?.planStoredBytes, plan)
            ?? tableValue(site?.planStoredBytes, plan)
            ?? tableValue(DEFAULT_PLAN_STORED_BYTES, plan)
            ?? limits.storedBytesPerUser;
    }
    const enforcement = override?.enforcement ?? site?.enforcement ?? "off";
    // Download limits never exceed warn until the product decision in the design doc is made.
    const requestedDownload = override?.downloadEnforcement ?? site?.downloadEnforcement ?? "warn";
    const downloadEnforcement = requestedDownload === "on" ? "warn" : requestedDownload;
    return { limits, enforcement, downloadEnforcement, plan: plan ?? null };
}
/**
 * A missing counter is ready with zero files only after the site-wide backfill.
 * Sites must never set a counter row's ready to false from a caller-supplied value;
 * only the recount may change it. Backfill completion is read from site settings, never an owner override.
 */
export function ownerReady(counter, site) {
    if (counter != null)
        return counter.ready !== false;
    return typeof site?.backfillCompletedAt === "number" && Number.isFinite(site.backfillCompletedAt);
}
/** A not-ready account is warned, never refused. */
export function ownerEnforcement(effective, ready) {
    return effective.enforcement === "on" && !ready ? "warn" : effective.enforcement;
}
export function validateLimits(value) {
    const problems = [];
    for (const name of LIMIT_NAMES) {
        const v = value[name];
        if (v === undefined)
            continue;
        if (!Number.isSafeInteger(v) || v < 0)
            problems.push(`${name} must be a whole number of 0 or more`);
    }
    return problems;
}
/** Plan and file-kind tables use short keys and nonnegative safe-integer byte caps. */
function validateByteTable(value) {
    const problems = [];
    const entries = Object.entries(value);
    if (entries.length > 16)
        problems.push("At most 16 keys are allowed");
    for (const [key, bytes] of entries) {
        if (!/^[a-z][a-z0-9_-]{0,31}$/.test(key))
            problems.push(`${key} must be a valid lowercase key of 1 to 32 characters`);
        if (!Number.isSafeInteger(bytes) || bytes < 0)
            problems.push(`${key} must be a whole number of 0 or more`);
    }
    return problems;
}
export function validatePlanStoredBytes(value) {
    return validateByteTable(value);
}
export function validateFileCaps(value) {
    return validateByteTable(value);
}
export function effectiveFileCap(kind, siteDefaults, site, override) {
    return tableValue(override?.maxFileBytes, kind) ?? tableValue(site?.maxFileBytes, kind) ?? tableValue(siteDefaults, kind) ?? null;
}
export function checkFileSize(kind, bytes, cap) {
    if (cap === null || bytes <= cap)
        return null;
    return {
        code: "FILE_TOO_LARGE", kind, max: cap, got: bytes,
        message: `This file is ${formatBytes(bytes)}; the largest ${kind} file this site takes is ${formatBytes(cap)}. Nothing was saved.`,
    };
}
// ---- UTC buckets ---------------------------------------------------------------
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
export const hourKey = (now) => new Date(now).toISOString().slice(0, 13); // 2026-10-25T03
export const dayKey = (now) => new Date(now).toISOString().slice(0, 10); // 2026-10-25
export const nextHourStart = (now) => Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS;
export const nextDayStart = (now) => Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
export function emptyCounters(now) {
    return {
        storedBytes: 0, reservedBytes: 0, inFlight: 0,
        hourKey: hourKey(now), hourUploads: 0,
        dayKey: dayKey(now), dayUploads: 0, dayUploadBytes: 0, dayDownloadBytes: 0,
    };
}
/** Lazily start a new hour/day bucket. Stored, reserved and in-flight never reset. */
export function rollBuckets(c, now) {
    const next = { ...c };
    if (next.hourKey !== hourKey(now))
        Object.assign(next, { hourKey: hourKey(now), hourUploads: 0 });
    if (next.dayKey !== dayKey(now)) {
        Object.assign(next, { dayKey: dayKey(now), dayUploads: 0, dayUploadBytes: 0, dayDownloadBytes: 0 });
    }
    return next;
}
export const roomLeft = (r) => typeof r.remaining === "number" && Number.isFinite(r.remaining) ? Math.max(0, r.remaining) : Math.max(0, r.cap - r.used);
const iso = (ms) => new Date(ms).toISOString();
/** First limit a new upload of `bytes` would break, or null. Counters must already be rolled. */
export function checkUpload(c, limits, bytes, now, opts = {}) {
    const hour = iso(nextHourStart(now));
    const day = iso(nextDayStart(now));
    const counted = opts.countUpload === false ? 0 : 1;
    const checks = [
        { limit: "maxUploadsInFlight", unit: "uploads", used: c.inFlight, cap: limits.maxUploadsInFlight, requested: 1, resetsAt: null },
        { limit: "storedBytesPerUser", unit: "bytes", used: c.storedBytes + c.reservedBytes, cap: limits.storedBytesPerUser, requested: bytes, resetsAt: null },
        { limit: "uploadsPerHour", unit: "uploads", used: c.hourUploads, cap: limits.uploadsPerHour, requested: counted, resetsAt: hour },
        { limit: "uploadsPerDay", unit: "uploads", used: c.dayUploads, cap: limits.uploadsPerDay, requested: counted, resetsAt: day },
        { limit: "uploadBytesPerDay", unit: "bytes", used: c.dayUploadBytes, cap: limits.uploadBytesPerDay, requested: bytes, resetsAt: day },
    ];
    const refusal = checks.find((r) => r.requested > 0 && r.used + r.requested > r.cap);
    return refusal ? { ...refusal, remaining: Math.max(0, refusal.cap - refusal.used) } : null;
}
export function checkDownload(c, limits, bytes, now) {
    const used = c.dayDownloadBytes;
    if (used + bytes <= limits.downloadBytesPerDay)
        return null;
    return { limit: "downloadBytesPerDay", unit: "bytes", used, cap: limits.downloadBytesPerDay, requested: bytes, remaining: Math.max(0, limits.downloadBytesPerDay - used), resetsAt: iso(nextDayStart(now)) };
}
/** Re-check the extra actual bytes at finish. Callers refuse and clean up on a non-null result. */
export function checkCommit(c, limits, reservedBytes, actualBytes) {
    if (actualBytes <= reservedBytes)
        return null;
    const requested = actualBytes - reservedBytes;
    const used = c.storedBytes + c.reservedBytes;
    const cap = limits.storedBytesPerUser;
    if (used + requested <= cap)
        return null;
    return { limit: "storedBytesPerUser", unit: "bytes", used, cap, requested, remaining: Math.max(0, cap - used), resetsAt: null };
}
export function storageSummary(c, effective, opts = {}) {
    const usedBytes = c.storedBytes + c.reservedBytes;
    const capBytes = effective.limits.storedBytesPerUser;
    return {
        storedBytes: c.storedBytes, reservedBytes: c.reservedBytes, usedBytes, capBytes,
        remainingBytes: Math.max(0, capBytes - usedBytes), plan: effective.plan,
        enforcement: effective.enforcement, ready: opts.ready ?? true,
    };
}
export function storageLine(s) {
    if (!s.ready)
        return "Storage is still being counted.";
    return `${formatBytes(s.usedBytes)} of ${formatBytes(s.capBytes)} used; ${formatBytes(s.remainingBytes)} left.`;
}
/** This is the only shape a site puts in an AI's reply or shows in a person's meter. */
export function aiStorage(s) {
    if (!s.ready)
        return { ready: false, plan: s.plan, line: storageLine(s) };
    return {
        ready: true, plan: s.plan, line: storageLine(s),
        usedBytes: s.usedBytes, capBytes: s.capBytes, remainingBytes: s.remainingBytes,
    };
}
export const AI_STORAGE_NOTE = "The reply carries `storage`: when storage.ready is true, storage.remainingBytes is the room left; when it is false the account is still being counted and no upload is refused for storage. An upload that does not fit is refused with the room left, and the connection is unaffected.";
// ---- Counter transitions (pure; the site adapter persists them) ------------------
/**
 * Hold room for one upload. `countUpload: false` re-reserves an upload that was already counted
 * (a retry that reopens an expired slot with the same idempotency key): bytes are held again,
 * the upload counts are not charged twice.
 */
export const applyReserve = (c, bytes, opts = {}) => {
    const counted = opts.countUpload === false ? 0 : 1;
    return {
        ...c,
        reservedBytes: c.reservedBytes + bytes,
        inFlight: c.inFlight + 1,
        hourUploads: c.hourUploads + counted,
        dayUploads: c.dayUploads + counted,
        dayUploadBytes: c.dayUploadBytes + bytes,
    };
};
/** Commit with the actual stored size; callers run checkCommit first. */
export const applyCommit = (c, reservedBytes, actualBytes, sameDay) => ({
    ...c,
    reservedBytes: Math.max(0, c.reservedBytes - reservedBytes),
    inFlight: Math.max(0, c.inFlight - 1),
    storedBytes: c.storedBytes + actualBytes,
    dayUploadBytes: sameDay ? Math.max(0, c.dayUploadBytes - (reservedBytes - actualBytes)) : c.dayUploadBytes,
});
/** Never committed: refund bytes (same day only); the upload count stays. */
export const applyRelease = (c, reservedBytes, sameDay) => ({
    ...c,
    reservedBytes: Math.max(0, c.reservedBytes - reservedBytes),
    inFlight: Math.max(0, c.inFlight - 1),
    dayUploadBytes: sameDay ? Math.max(0, c.dayUploadBytes - reservedBytes) : c.dayUploadBytes,
});
/**
 * Count copies made after acceptance (thumbnails, AI-read copies, generated audio).
 * They count toward storage, but never justify refusing an already accepted upload.
 */
export const applyStoredAddition = (c, bytes) => ({
    ...c,
    storedBytes: Math.max(0, c.storedBytes + Math.max(0, bytes)),
});
export const applyStoredRemoval = (c, bytes) => ({
    ...c,
    storedBytes: Math.max(0, c.storedBytes - bytes),
});
export const applyDownload = (c, bytes) => ({
    ...c,
    dayDownloadBytes: c.dayDownloadBytes + bytes,
});
/** Highest used/limit share across meters, in basis points (10000 = at the limit). */
export function pressureBp(c, limits) {
    const share = (used, cap) => (cap <= 0 ? (used > 0 ? 10_000 : 0) : Math.round((used / cap) * 10_000));
    return Math.max(share(c.storedBytes + c.reservedBytes, limits.storedBytesPerUser), share(c.hourUploads, limits.uploadsPerHour), share(c.dayUploads, limits.uploadsPerDay), share(c.dayUploadBytes, limits.uploadBytesPerDay), share(c.dayDownloadBytes, limits.downloadBytesPerDay));
}
// ---- Messages ------------------------------------------------------------------
export function formatBytes(bytes) {
    const units = [[1e9, "GB"], [1e6, "MB"], [1e3, "KB"]];
    for (const [index, [size, unit]] of units.entries()) {
        if (bytes >= size) {
            const n = bytes / size;
            if (index > 0 && Math.round(n) === 1000)
                return `1 ${units[index - 1][1]}`;
            return `${n >= 10 || Number.isInteger(n) ? Math.round(n) : n.toFixed(1)} ${unit}`;
        }
    }
    return `${bytes} bytes`;
}
const count = (n) => n.toLocaleString("en-US");
export function formatResetTime(resetsAt, timeZone) {
    return new Date(resetsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}
const LIMIT_LABELS = {
    storedBytesPerUser: "storage",
    uploadsPerHour: "uploads this hour",
    uploadsPerDay: "uploads today",
    uploadBytesPerDay: "upload size today",
    downloadBytesPerDay: "download budget today",
    maxUploadsInFlight: "uploads at once",
    mcpBatchMaxItems: "items per call",
    mcpBatchMaxBytes: "size per call",
};
const amount = (r, n) => (r.unit === "bytes" ? formatBytes(n) : count(n));
/**
 * One shape for the website and MCP. Format it where the person is: the server has no time
 * zone, so a website rebuilds the message in the browser from the structured fields
 * (`usageLimitError(error)`), and MCP replies use `mcpLimitText`.
 */
export function usageLimitError(input, opts = {}) {
    const r = { ...input, remaining: roomLeft(input) };
    const at = r.resetsAt ? formatResetTime(r.resetsAt, opts.timeZone) : null;
    const kept = "Nothing was saved; your file is still on your device.";
    const messages = {
        maxUploadsInFlight: `${count(r.cap)} uploads are already on their way. Try this one again when they finish.`,
        storedBytesPerUser: r.remaining === 0
            ? `Your storage is full: ${formatBytes(r.used)} of ${formatBytes(r.cap)} used. Nothing was lost; your file is still on your device.`
            : `Not enough storage: this needs ${formatBytes(r.requested)} and you have ${formatBytes(r.remaining)} left of ${formatBytes(r.cap)}. Nothing was lost; your file is still on your device.`,
        uploadsPerHour: `You've uploaded ${count(r.cap)} files this hour, the hourly limit. You can upload more at ${at}. ${kept}`,
        uploadsPerDay: `You've reached today's upload limit (${count(r.cap)} files). It resets at ${at}. ${kept}`,
        uploadBytesPerDay: `You've reached today's upload limit (${formatBytes(r.cap)}). It resets at ${at}. ${kept}`,
        downloadBytesPerDay: `You've reached today's download budget (${formatBytes(r.cap)}). It resets at ${at}.`,
    };
    if (opts.subject === "generated" && r.limit === "storedBytesPerUser") {
        messages.storedBytesPerUser = r.remaining === 0
            ? `Your storage is full: ${formatBytes(r.used)} of ${formatBytes(r.cap)} used. Nothing was made and nothing was charged.`
            : `Not enough storage to make this: it needs up to ${formatBytes(r.requested)} and you have ${formatBytes(r.remaining)} left of ${formatBytes(r.cap)}. Nothing was made and nothing was charged.`;
    }
    const refusal = { limit: r.limit, unit: r.unit, used: r.used, cap: r.cap, requested: r.requested, remaining: r.remaining, resetsAt: r.resetsAt };
    return { code: "USAGE_LIMIT_REACHED", ...refusal, retryable: true, nothingSaved: true, message: messages[r.limit] ?? `Limit reached: ${LIMIT_LABELS[r.limit]}.` };
}
/** One line for an AI: which limit, the numbers, and exactly how to retry. Times are UTC. */
export function mcpLimitText(e, opts = {}) {
    if (e.limit === "storedBytesPerUser") {
        if (opts.subject === "generated") {
            return `Generation refused: storage needs up to ${formatBytes(e.requested)}, with ${formatBytes(roomLeft(e))} left of ${formatBytes(e.cap)}. Nothing was made, no provider was called and this connection is unaffected. Retry the same call with the same operationId once the person has more room.`;
        }
        return `Upload refused: storage needs ${formatBytes(e.requested)}, with ${formatBytes(roomLeft(e))} left of ${formatBytes(e.cap)}. Nothing was saved and this connection is unaffected. Retry the same call with the same operationId once the person has more room.`;
    }
    const when = e.resetsAt ? ` after ${e.resetsAt}` : " once the person has more room";
    return `Upload refused: ${LIMIT_LABELS[e.limit]} limit reached (${amount(e, e.used)} of ${amount(e, e.cap)}). Nothing was saved and this connection is unaffected. Retry the same call with the same operationId${when}.`;
}
export const utf8Bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
/**
 * Check a request from its sizes alone (item count and UTF-8 bytes), so a caller can measure
 * once and pass numbers instead of content. Returns null when it fits.
 */
export function batchVerdict(size, limits) {
    const { items: n, bytes } = size;
    const overItems = n > limits.mcpBatchMaxItems;
    const overBytes = bytes > limits.mcpBatchMaxBytes;
    if (!overItems && !overBytes)
        return null;
    const byBytes = bytes > 0 ? Math.floor((n * limits.mcpBatchMaxBytes) / bytes) : n;
    const suggested = Math.max(1, Math.min(limits.mcpBatchMaxItems, byBytes));
    return {
        code: "REQUEST_TOO_LARGE",
        limit: overItems ? "mcpBatchMaxItems" : "mcpBatchMaxBytes",
        max: overItems ? limits.mcpBatchMaxItems : limits.mcpBatchMaxBytes,
        got: overItems ? n : bytes,
        items: n,
        suggestedItemsPerCall: suggested,
        message: `Too much in one call. Send at most ${count(limits.mcpBatchMaxItems)} items and ${formatBytes(limits.mcpBatchMaxBytes)} per call; try ${count(suggested)} items per call. Nothing was saved.`,
    };
}
/** Check a batch before anything is written. Returns null when it fits. */
export function checkBatchSize(items, limits) {
    return batchVerdict({ items: items.length, bytes: utf8Bytes(items) }, limits);
}
/** Sentence for tool descriptions and llms text, from the same numbers the check uses. */
export const batchLimitDescription = (limits) => `At most ${count(limits.mcpBatchMaxItems)} items and ${formatBytes(limits.mcpBatchMaxBytes)} per call; split larger batches and give each call its own operationId.`;
