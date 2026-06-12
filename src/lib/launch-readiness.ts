export type LaunchReadinessOwner =
  | "auth"
  | "operations"
  | "auth-sync"
  | "storage"
  | "deployment"
  | "security"
  | "routing";

export type LaunchReadinessBlocker = {
  issue: string;
  title: string;
  owner: LaunchReadinessOwner;
  why: string;
  ownerAction: string;
  verify: string[];
};

export type LaunchReadinessOptionalCheck = {
  issue: string;
  title: string;
  owner: LaunchReadinessOwner;
  currentPosture: string;
  why: string;
  verify: string[];
};

export const launchReadinessBlockers = [
  {
    issue: "MOVE-63",
    title: "Switch Clerk to a production instance before public launch",
    owner: "auth",
    why:
      "The live app must use a Clerk production instance before customers sign in with real accounts.",
    ownerAction:
      "Activate the production Clerk instance, then allow movingmanifest.com and www.movingmanifest.com as production origins and redirects.",
    verify: [
      "npm run doctor:launch",
      "npm run doctor:vercel-env",
      "npm run doctor:convex-env",
    ],
  },
  {
    issue: "MOVE-62",
    title: "Configure production admin access",
    owner: "operations",
    why:
      "Production admin routes should only unlock for explicit admin emails, not by accident or local defaults.",
    ownerAction:
      "Set the initial admin email list in Vercel production and Convex production.",
    verify: [
      "npm run doctor:vercel-env",
      "npm run doctor:convex-env",
      "Sign in with an admin email and open /admin.",
    ],
  },
  {
    issue: "MOVE-68",
    title: "Configure Clerk production webhook endpoint and Convex signing secret",
    owner: "auth-sync",
    why:
      "Clerk user lifecycle events must be signed before Convex accepts them, or user records can drift from auth state.",
    ownerAction:
      "Create the Clerk webhook endpoint for /clerk-webhook, then copy the signing secret into both production environments.",
    verify: [
      "npm run doctor:webhooks",
      "npm run doctor:vercel-env",
      "npm run doctor:convex-env",
    ],
  },
  {
    issue: "MOVE-106",
    title: "Configure Vercel preview environment variables",
    owner: "deployment",
    why:
      "Preview deployments should be usable for QA and future PR review without relying only on production branch deploys.",
    ownerAction:
      "Choose dev-stack or dedicated staging-stack previews, then add the required app, Clerk, Convex, and storage env names to Vercel Preview.",
    verify: ["npm run doctor:vercel-preview-env", "npx vercel deploy -y"],
  },
  {
    issue: "MOVE-64",
    title: "Evaluate and enforce a Content Security Policy after production origins settle",
    owner: "security",
    why:
      "The CSP is ready in report-only mode, but enforcing it too early can break auth, upload, or Convex traffic if an origin is missing.",
    ownerAction:
      "After production origins are stable, set CSP mode to enforce and redeploy.",
    verify: ["npm run doctor:launch -- --strict"],
  },
  {
    issue: "MOVE-67",
    title: "Remove stale legacy Vercel alias after brand rename",
    owner: "routing",
    why:
      "The old pre-rename preview URL should stop serving the product once MovingManifest is the public name.",
    ownerAction:
      "After explicit approval, remove the stale alias from Vercel project/domain settings.",
    verify: ["STALE_ALIAS_URL=<legacy-alias-url> npm run doctor:launch"],
  },
] satisfies LaunchReadinessBlocker[];

export const launchReadinessOptionalChecks = [
  {
    issue: "MOVE-140",
    title: "Cloudflare image delivery readiness is optional",
    owner: "storage",
    currentPosture:
      "Cloudflare Images delivery is inactive until Convex delivery env names are configured; signed Backblaze derivative URLs remain the runtime fallback.",
    why:
      "The product is wired for Cloudflare image delivery, but the Convex photo display action safely falls back to B2 derivatives while media delivery setup is phased in.",
    verify: [
      "npm run doctor:convex-env",
      "npm run doctor:convex-dev-env",
      "npm run doctor:vercel-env",
      "npm run doctor:vercel-preview-env",
    ],
  },
] satisfies LaunchReadinessOptionalCheck[];

export function launchReadinessSummary(
  blockers: readonly LaunchReadinessBlocker[] = launchReadinessBlockers,
  optionalChecks: readonly LaunchReadinessOptionalCheck[] =
    launchReadinessOptionalChecks
) {
  return {
    blockerCount: blockers.length,
    optionalCheckCount: optionalChecks.length,
    ownerAreas: Array.from(new Set(blockers.map((blocker) => blocker.owner))),
    nextIssue: blockers[0]?.issue,
    finalIssue: blockers.at(-1)?.issue,
  };
}
