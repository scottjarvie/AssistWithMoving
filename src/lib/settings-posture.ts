import type { EffectiveFeatureFlag, FeatureFlagKey } from "@/lib/feature-flags";
import { flagEnabled } from "@/lib/feature-flags";

type SettingsUser = {
  email?: string;
  name?: string;
  appRole?: "member" | "admin";
  status?: "active" | "disabled";
} | null;

type SettingsHousehold = {
  role: string;
};

export type SettingsPostureItem = {
  key: "account" | "households" | "apiMcp" | "packets" | "privacy" | "billing";
  label: string;
  value: string;
  detail: string;
  tone: "ready" | "attention" | "muted";
};

function enabled(flags: EffectiveFeatureFlag[] | undefined, key: FeatureFlagKey) {
  const fallback = key === "billingGates" ? false : true;
  return flagEnabled(flags, key, fallback);
}

function roleSummary(households: SettingsHousehold[] | undefined) {
  if (!households?.length) {
    return "No households";
  }

  const counts = households.reduce<Record<string, number>>((acc, household) => {
    acc[household.role] = (acc[household.role] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort(([firstRole], [secondRole]) => firstRole.localeCompare(secondRole))
    .map(([role, count]) => `${count} ${role}`)
    .join(", ");
}

export function buildSettingsPosture({
  currentUser,
  households,
  flags,
  authReady,
}: {
  currentUser: SettingsUser | undefined;
  households: SettingsHousehold[] | undefined;
  flags: EffectiveFeatureFlag[] | undefined;
  authReady: boolean;
}): SettingsPostureItem[] {
  const signedIn = Boolean(currentUser);
  const householdCount = households?.length ?? 0;
  const apiMcpEnabled = enabled(flags, "apiMcp");
  const packetsEnabled = enabled(flags, "documentationPackets");
  const billingGatesEnabled = enabled(flags, "billingGates");

  return [
    {
      key: "account",
      label: "Account",
      value: !authReady
        ? "Checking"
        : signedIn
          ? currentUser?.appRole === "admin"
            ? "Admin"
            : "Member"
          : "Signed out",
      detail: !authReady
        ? "Waiting for Clerk and Convex identity."
        : signedIn
          ? `${currentUser?.email ?? currentUser?.name ?? "Signed-in user"} / ${
              currentUser?.status ?? "active"
            }`
          : "Sign in to manage households, keys, exports, and deletion.",
      tone: !authReady ? "muted" : signedIn ? "ready" : "attention",
    },
    {
      key: "households",
      label: "Households",
      value: !authReady ? "Checking" : String(householdCount),
      detail: !authReady
        ? "Memberships load after authentication."
        : householdCount
          ? roleSummary(households)
          : "Create or join a household before creating API keys or moves.",
      tone: !authReady ? "muted" : householdCount ? "ready" : "attention",
    },
    {
      key: "apiMcp",
      label: "API and MCP",
      value: apiMcpEnabled ? "Available" : "Disabled",
      detail: apiMcpEnabled
        ? "Scoped, hashed, revocable keys can be created per household or move."
        : "Rollout controls currently hide API key management.",
      tone: apiMcpEnabled ? "ready" : "attention",
    },
    {
      key: "packets",
      label: "Packet Privacy",
      value: packetsEnabled ? "Scoped" : "Disabled",
      detail: packetsEnabled
        ? "Mover, PCS, employer, claims, and share packets default to scoped visibility."
        : "Documentation packet surfaces are hidden by feature flag.",
      tone: packetsEnabled ? "ready" : "attention",
    },
    {
      key: "privacy",
      label: "Account Privacy",
      value: signedIn ? "Ready" : "Sign in",
      detail: signedIn
        ? "Account export and deletion controls are available below."
        : "Privacy controls require a signed-in account.",
      tone: signedIn ? "ready" : "muted",
    },
    {
      key: "billing",
      label: "Billing Gates",
      value: billingGatesEnabled ? "Enforcing" : "Prepared",
      detail: billingGatesEnabled
        ? "Tier limits actively block usage over the configured household plan."
        : "Usage limits are configured but not blocking production users.",
      tone: billingGatesEnabled ? "attention" : "muted",
    },
  ];
}
