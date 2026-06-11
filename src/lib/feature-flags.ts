export type FeatureFlagKey =
  | "aiPhotoIntake"
  | "apiMcp"
  | "documentationPackets"
  | "adminTools"
  | "billingGates"
  | "layoutStudio";

export type EffectiveFeatureFlag = {
  key: FeatureFlagKey;
  label: string;
  description: string;
  environment: "development" | "preview" | "production";
  enabled: boolean;
  source: "default" | "override";
  note?: string;
  updatedAt?: number;
};

export function flagEnabled(
  flags: EffectiveFeatureFlag[] | undefined,
  key: FeatureFlagKey,
  fallback = true
) {
  return flags?.find((flag) => flag.key === key)?.enabled ?? fallback;
}
