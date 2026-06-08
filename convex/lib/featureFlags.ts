export const featureFlagKeys = [
  "aiPhotoIntake",
  "apiMcp",
  "documentationPackets",
  "adminTools",
  "billingGates",
] as const;

export type FeatureFlagKey = (typeof featureFlagKeys)[number];
export type FeatureEnvironment = "development" | "preview" | "production";

export type FeatureFlagDefinition = {
  key: FeatureFlagKey;
  label: string;
  description: string;
  defaultEnabled: Record<FeatureEnvironment, boolean>;
};

export const featureFlagDefinitions: FeatureFlagDefinition[] = [
  {
    key: "aiPhotoIntake",
    label: "AI photo intake",
    description: "Photo-based AI suggestion creation and review workflows.",
    defaultEnabled: {
      development: true,
      preview: true,
      production: true,
    },
  },
  {
    key: "apiMcp",
    label: "API and MCP",
    description: "Scoped API keys, REST API, and local MCP agent access.",
    defaultEnabled: {
      development: true,
      preview: true,
      production: true,
    },
  },
  {
    key: "documentationPackets",
    label: "Documentation packets",
    description: "PCS, mover, employer, claims, load-plan, and sub-manifest packets.",
    defaultEnabled: {
      development: true,
      preview: true,
      production: true,
    },
  },
  {
    key: "adminTools",
    label: "Admin tools",
    description: "Internal operational dashboards and runtime controls.",
    defaultEnabled: {
      development: true,
      preview: true,
      production: true,
    },
  },
  {
    key: "billingGates",
    label: "Billing gates",
    description: "Tier-like usage gates and upgrade messaging placeholders.",
    defaultEnabled: {
      development: false,
      preview: true,
      production: false,
    },
  },
];

export function featureEnvironment(value?: string): FeatureEnvironment {
  switch ((value ?? "").toLowerCase()) {
    case "development":
    case "dev":
    case "local":
      return "development";
    case "preview":
      return "preview";
    case "production":
    case "prod":
      return "production";
    default:
      return process.env.CONVEX_DEPLOYMENT?.startsWith("dev:")
        ? "development"
        : "production";
  }
}

export function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return (featureFlagKeys as readonly string[]).includes(value);
}

export function defaultFlagEnabled(
  key: FeatureFlagKey,
  environment: FeatureEnvironment
) {
  const definition = featureFlagDefinitions.find((entry) => entry.key === key);
  if (!definition) {
    return false;
  }

  return definition.defaultEnabled[environment];
}

export function applyFlagOverrides(
  environment: FeatureEnvironment,
  overrides: Array<{
    key: string;
    enabled: boolean;
    note?: string;
    updatedAt: number;
  }>
) {
  return featureFlagDefinitions.map((definition) => {
    const override = overrides.find((entry) => entry.key === definition.key);

    return {
      ...definition,
      environment,
      enabled: override?.enabled ?? definition.defaultEnabled[environment],
      source: override ? ("override" as const) : ("default" as const),
      note: override?.note,
      updatedAt: override?.updatedAt,
    };
  });
}
