const requiredEnvGroups = [
  {
    label: "Layout Studio mutation QA target",
    keys: ["CONVEX_DEPLOYMENT", "NEXT_PUBLIC_CONVEX_URL"],
    validate: nonProductionConvexReady,
  },
  {
    label: "Authenticated browser QA user",
    keys: ["E2E_CLERK_USER_EMAIL"],
  },
  {
    label: "Clerk auth for local authenticated QA",
    keys: [
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
      "CLERK_JWT_ISSUER_DOMAIN",
      "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
      "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
    ],
  },
  {
    label: "Blueprint upload storage",
    keys: [
      "B2_APPLICATION_KEY_ID",
      "B2_APPLICATION_KEY",
      "B2_BUCKET_NAME",
      "B2_ENDPOINT",
      "B2_REGION",
    ],
  },
];

const knownProductionConvexHosts = new Set(["fine-crocodile-51.convex.cloud"]);

export function layoutStudioQaReadinessResults(env = process.env) {
  return requiredEnvGroups.map((group) => {
    const missing = group.keys.filter((key) => !hasValue(env[key]));
    if (missing.length) {
      return {
        status: "blocked",
        label: group.label,
        detail: `missing ${missing.join(", ")}; tracked by MOVE-190`,
      };
    }

    if (group.validate) {
      return group.validate(env);
    }

    return {
      status: "pass",
      label: group.label,
      detail: `${group.keys.join(", ")} present without printing values`,
    };
  });
}

export function isProductionConvexDeployment(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.startsWith("prod:");
}

export function isMissingConvexUrl(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length === 0;
}

export function isKnownProductionConvexUrl(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return false;
  try {
    return knownProductionConvexHosts.has(new URL(normalized).hostname);
  } catch {
    return false;
  }
}

export function isCurrentDbQaApproved(env) {
  return (
    env.LAYOUT_STUDIO_ALLOW_CURRENT_DB_QA === "true" &&
    env.CONVEX_E2E_CLEANUP_ENABLED === "true"
  );
}

function nonProductionConvexReady(env) {
  if (isMissingConvexUrl(env.NEXT_PUBLIC_CONVEX_URL)) {
    return {
      status: "blocked",
      label: "Layout Studio mutation QA target",
      detail: "NEXT_PUBLIC_CONVEX_URL is missing; tracked by MOVE-190",
    };
  }

  const productionDeployment = isProductionConvexDeployment(env.CONVEX_DEPLOYMENT);
  const productionUrl = isKnownProductionConvexUrl(env.NEXT_PUBLIC_CONVEX_URL);
  if (productionDeployment || productionUrl) {
    if (isCurrentDbQaApproved(env)) {
      if (env.NEXT_PUBLIC_LAYOUT_STUDIO_CURRENT_DB_QA !== "true") {
        return {
          status: "blocked",
          label: "Layout Studio mutation QA target",
          detail:
            "Current DB QA also requires NEXT_PUBLIC_LAYOUT_STUDIO_CURRENT_DB_QA=true so the local production build exposes Layout Studio",
        };
      }

      return {
        status: "pass",
        label: "Layout Studio mutation QA target",
        detail:
          "Current DB QA explicitly approved with cleanup enabled; E2E data must stay prefixed and cleaned up",
      };
    }

    return {
      status: "blocked",
      label: "Layout Studio mutation QA target",
      detail:
        "Convex target appears production-backed; set LAYOUT_STUDIO_ALLOW_CURRENT_DB_QA=true and CONVEX_E2E_CLEANUP_ENABLED=true only while the current DB is an approved working sandbox; tracked by MOVE-190",
    };
  }

  if (
    !String(env.CONVEX_DEPLOYMENT ?? "").trim().startsWith("dev:") &&
    env.CONVEX_E2E_CLEANUP_ENABLED !== "true"
  ) {
    return {
      status: "blocked",
      label: "Layout Studio mutation QA target",
      detail:
        "CONVEX_DEPLOYMENT must start with dev: or CONVEX_E2E_CLEANUP_ENABLED must be true for mutation QA; tracked by MOVE-190",
    };
  }

  return {
    status: "pass",
    label: "Layout Studio mutation QA target",
    detail:
      "Convex target passes the Layout Studio mutation-QA safety gate",
  };
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function renderLayoutStudioQaReadiness(results) {
  const lines = ["Layout Studio QA readiness"];
  for (const result of results) {
    const marker = result.status === "pass" ? "PASS" : "BLOCKED";
    lines.push(`[${marker}] ${result.label}: ${result.detail}`);
  }
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = layoutStudioQaReadinessResults();
  console.log(renderLayoutStudioQaReadiness(results));
  if (results.some((result) => result.status === "blocked")) {
    process.exitCode = 1;
  }
}
