// Budget and honesty rules for delivering private move photos to a connected
// AI as inline bytes.
//
// Two things go wrong when a product hands real photos to a model and hopes for
// the best. First, the bytes are unbounded: eight `full` derivatives of a
// modern phone photo can be several megabytes before base64 inflates them by a
// third, which fails the whole call and leaves the AI with nothing instead of
// with most of the pictures. Second, a photo that cannot be delivered
// disappears silently, so an AI looking at a half-empty inventory cannot tell
// whether the belonging has no photo, whether the photo is still being
// processed, or whether it asked for too much.
//
// So delivery is budgeted and every omission carries a reason. The budgets are
// server constants, never tool arguments — a connected AI must not be able to
// raise the product's own ceiling.

import type { PhotoDerivativeDisplayVariant } from "./photoDelivery";

/** Never more than this many images in one tool result, whatever the filter. */
export const INLINE_IMAGE_LIMIT = 8;

/**
 * Per-image ceiling on raw bytes. A `card` (600px) webp is tens of kilobytes;
 * a `full` (2400px) one is a few hundred. 1.5 MB is generous for a single
 * legitimate derivative and small enough that one oversized object cannot eat
 * the whole batch.
 */
export const PER_IMAGE_BYTE_BUDGET = 1_500_000;

/**
 * Whole-batch ceiling on raw bytes, chosen to stay comfortably inside the
 * Convex function result limit once base64 has added roughly a third.
 */
export const TOTAL_BYTE_BUDGET = 4_000_000;

/** Why a photo the person can see did not reach the AI. */
export type EvidenceSkipReason =
  | "derivative_not_ready"
  | "too_large"
  | "budget_exhausted"
  | "delivery_unavailable"
  | "not_an_image"
  | "fetch_failed";

/**
 * Size ladder, largest first. When a photo is too big at the requested size we
 * step down rather than dropping it — a smaller picture the AI can actually see
 * beats a perfect one it never receives.
 */
const VARIANT_LADDER: readonly PhotoDerivativeDisplayVariant[] = [
  "full",
  "detail",
  "card",
  "thumb",
];

/** The next smaller display size, or null at the bottom of the ladder. */
export function smallerVariant(
  variant: PhotoDerivativeDisplayVariant,
): PhotoDerivativeDisplayVariant | null {
  const index = VARIANT_LADDER.indexOf(variant);
  if (index < 0 || index === VARIANT_LADDER.length - 1) return null;
  return VARIANT_LADDER[index + 1];
}

/** Every size from the requested one down, in the order we should try them. */
export function variantAttemptOrder(
  variant: PhotoDerivativeDisplayVariant,
): PhotoDerivativeDisplayVariant[] {
  const order: PhotoDerivativeDisplayVariant[] = [];
  let current: PhotoDerivativeDisplayVariant | null = variant;
  while (current) {
    order.push(current);
    current = smallerVariant(current);
  }
  return order;
}

/**
 * Turn a delivery failure into a reason the AI can act on, plus whether trying
 * a smaller size could still succeed. A missing derivative often exists at a
 * smaller size; a missing bucket configuration never does.
 */
export function classifyDeliveryFailure(error: unknown): {
  reason: EvidenceSkipReason;
  retrySmaller: boolean;
} {
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { data?: unknown })?.data === "string"
        ? ((error as { data: string }).data)
        : String(error ?? "");

  // Order matters: the non-image refusal also says "derivatives", and a
  // non-image never becomes an image at a smaller size.
  if (/only available for image evidence/i.test(message)) {
    return { reason: "not_an_image", retrySmaller: false };
  }
  if (/not available yet|derivative/i.test(message)) {
    return { reason: "derivative_not_ready", retrySmaller: true };
  }
  return { reason: "delivery_unavailable", retrySmaller: false };
}

/**
 * When a photo fails at several sizes, report the reason the AI can most
 * usefully act on. "The batch was full" says narrow the filter and try again;
 * "still processing" says wait. Losing the first to the second because a
 * smaller derivative happened to be missing would send it looking in the wrong
 * place, so reasons are ranked rather than last-write-wins.
 */
const REASON_PRECEDENCE: readonly EvidenceSkipReason[] = [
  "budget_exhausted",
  "too_large",
  "derivative_not_ready",
  "fetch_failed",
  "delivery_unavailable",
  "not_an_image",
];

export function moreActionableReason(
  a: EvidenceSkipReason,
  b: EvidenceSkipReason,
): EvidenceSkipReason {
  return REASON_PRECEDENCE.indexOf(a) <= REASON_PRECEDENCE.indexOf(b) ? a : b;
}

/**
 * One plain sentence per reason. These reach a model, so they say what happened
 * and what to do about it — and they never name a bucket, key, or storage URL.
 */
export function explainSkip(reason: EvidenceSkipReason): string {
  switch (reason) {
    case "derivative_not_ready":
      return "This photo is still being processed. Ask again shortly.";
    case "too_large":
      return "This photo is too large to send inline, even at the smallest size.";
    case "budget_exhausted":
      return "The batch reached its size limit. Ask for fewer photos, or a smaller variant such as thumb or card.";
    case "delivery_unavailable":
      return "This photo could not be delivered right now. It is unchanged in the move.";
    case "not_an_image":
      return "This evidence is not an image, so it cannot be shown inline.";
    case "fetch_failed":
      return "This photo could not be read from storage. It is unchanged in the move.";
  }
}

/** Guidance for the whole batch, written for the AI reading the text block. */
export function batchNote({
  returned,
  skipped,
  budgetExhausted,
}: {
  returned: number;
  skipped: number;
  budgetExhausted: boolean;
}): string {
  if (returned === 0 && skipped === 0) {
    return "No photos matched this filter.";
  }
  if (returned === 0) {
    return "No photo could be sent. Each omission and its reason is listed under skipped.";
  }
  if (budgetExhausted) {
    return "Photos are attached below. The batch hit its size limit, so some were left out — narrow the filter or request a smaller variant to see the rest.";
  }
  if (skipped > 0) {
    return "Photos are attached below. Some were left out; each omission and its reason is listed under skipped.";
  }
  return "Photos are attached below as inline images.";
}
