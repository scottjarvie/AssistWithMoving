import type { Doc } from "../_generated/dataModel";

export const photoDisplayVariants = [
  "thumb",
  "card",
  "detail",
  "full",
  "original",
] as const;

export type PhotoDisplayVariant = (typeof photoDisplayVariants)[number];
export type PhotoDerivativeDisplayVariant = Exclude<
  PhotoDisplayVariant,
  "original"
>;
export type PhotoDeliveryProvider = "cloudflareImages" | "b2SignedUrl";

type DerivativeRefs = Doc<"itemPhotos">["derivativeRefs"];

const derivativeFallbacks = {
  thumb: ["thumb", "card", "detail", "full"],
  card: ["card", "detail", "full", "thumb"],
  detail: ["detail", "full", "card", "thumb"],
  full: ["full", "detail", "card", "thumb"],
  original: [],
} satisfies Record<PhotoDisplayVariant, (keyof DerivativeRefs)[]>;

type CloudflareImageDeliveryConfig = {
  accountHash?: string;
  deliveryBaseUrl?: string;
  deliveryDomain?: string;
};

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

function normalizeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return null;
    }
    return url.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function normalizeDeliveryDomain(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const withProtocol = /^https:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimSlashes(trimmed)}`;
  const normalized = normalizeHttpsUrl(withProtocol);
  if (!normalized) {
    return null;
  }
  return new URL(normalized).origin;
}

function encodeCloudflarePath(value: string) {
  const trimmed = trimSlashes(value.trim());
  if (!trimmed) {
    return null;
  }
  return trimmed
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function cloudflareImageDeliveryBaseUrl({
  accountHash,
  deliveryBaseUrl,
  deliveryDomain,
}: CloudflareImageDeliveryConfig) {
  const configuredBase = deliveryBaseUrl?.trim();
  if (configuredBase) {
    return normalizeHttpsUrl(configuredBase);
  }

  const encodedAccountHash = accountHash
    ? encodeCloudflarePath(accountHash)
    : null;
  if (!encodedAccountHash) {
    return null;
  }

  const customDomain = deliveryDomain
    ? normalizeDeliveryDomain(deliveryDomain)
    : null;
  if (customDomain) {
    return `${customDomain}/cdn-cgi/imagedelivery/${encodedAccountHash}`;
  }

  return `https://imagedelivery.net/${encodedAccountHash}`;
}

export function cloudflareImageDeliveryUrl({
  accountHash,
  deliveryBaseUrl,
  deliveryDomain,
  imageId,
  variant,
}: CloudflareImageDeliveryConfig & {
  imageId?: string;
  variant: PhotoDerivativeDisplayVariant;
}) {
  const baseUrl = cloudflareImageDeliveryBaseUrl({
    accountHash,
    deliveryBaseUrl,
    deliveryDomain,
  });
  const encodedImageId = imageId ? encodeCloudflarePath(imageId) : null;
  const encodedVariant = encodeCloudflarePath(variant);

  if (!baseUrl || !encodedImageId || !encodedVariant) {
    return null;
  }

  return `${baseUrl}/${encodedImageId}/${encodedVariant}`;
}

export function selectDerivativeRef(
  derivativeRefs: DerivativeRefs,
  preferredVariant: PhotoDerivativeDisplayVariant
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
