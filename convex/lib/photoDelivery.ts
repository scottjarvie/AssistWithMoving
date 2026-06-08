import type { Doc } from "../_generated/dataModel";

export const photoDisplayVariants = [
  "thumb",
  "card",
  "detail",
  "full",
  "original",
] as const;

export type PhotoDisplayVariant = (typeof photoDisplayVariants)[number];

type DerivativeRefs = Doc<"itemPhotos">["derivativeRefs"];

const derivativeFallbacks = {
  thumb: ["thumb", "card", "detail", "full"],
  card: ["card", "detail", "full", "thumb"],
  detail: ["detail", "full", "card", "thumb"],
  full: ["full", "detail", "card", "thumb"],
  original: [],
} satisfies Record<PhotoDisplayVariant, (keyof DerivativeRefs)[]>;

export function selectDerivativeRef(
  derivativeRefs: DerivativeRefs,
  preferredVariant: Exclude<PhotoDisplayVariant, "original">
) {
  for (const variant of derivativeFallbacks[preferredVariant]) {
    const ref = derivativeRefs[variant];
    if (ref) {
      return { ref, variant };
    }
  }
  return null;
}

export function shouldUseOriginalFallback({
  canViewOriginal,
}: {
  canViewOriginal: boolean;
}) {
  return canViewOriginal;
}
