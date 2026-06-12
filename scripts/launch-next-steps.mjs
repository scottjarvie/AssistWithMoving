import { pathToFileURL } from "node:url";

export const launchBlockerRemediations = [
  {
    issue: "MOVE-63",
    title: "Switch Clerk to a production instance before public launch",
    why:
      "The live app must use a Clerk production instance before customers sign in with real accounts.",
    ownerAction:
      "Create or activate the Clerk production instance, then allow https://movingmanifest.com and https://www.movingmanifest.com as production origins and redirects.",
    actions: [
      "npx vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production",
      "npx vercel env add CLERK_SECRET_KEY production",
      "npx vercel env add CLERK_JWT_ISSUER_DOMAIN production",
      "npx vercel env add CLERK_FRONTEND_API_URL production",
      "npx convex env set CLERK_JWT_ISSUER_DOMAIN <production-clerk-issuer> --prod",
    ],
    verify: [
      "npm run doctor:launch",
      "npm run doctor:vercel-env",
      "npm run doctor:convex-env",
    ],
  },
  {
    issue: "MOVE-62",
    title: "Configure production admin access",
    why:
      "Production admin routes should only unlock for explicit admin emails, not by accident or local defaults.",
    ownerAction:
      "Decide the initial admin email list and set the same comma-separated value in Vercel production and Convex production.",
    actions: [
      "npx vercel env add ADMIN_EMAILS production",
      'npx convex env set ADMIN_EMAILS "admin@example.com" --prod',
    ],
    verify: [
      "npm run doctor:vercel-env",
      "npm run doctor:convex-env",
      "Sign in with an admin email and open /admin.",
    ],
  },
  {
    issue: "MOVE-68",
    title: "Configure Clerk production webhook endpoint and Convex signing secret",
    why:
      "Clerk user lifecycle events must be signed before Convex accepts them, or user records can drift from auth state.",
    ownerAction:
      "Create the Clerk webhook endpoint for the Convex HTTP action ending in /clerk-webhook, then copy the signing secret into both production environments.",
    actions: [
      "npx vercel env add CLERK_WEBHOOK_SIGNING_SECRET production",
      "npx convex env set CLERK_WEBHOOK_SIGNING_SECRET <svix-signing-secret> --prod",
    ],
    verify: [
      "npm run doctor:webhooks",
      "npm run doctor:vercel-env",
      "npm run doctor:convex-env",
    ],
  },
  {
    issue: "MOVE-106",
    title: "Configure Vercel preview environment variables",
    why:
      "Preview deployments should be usable for QA and future PR review without relying only on production branch deploys.",
    ownerAction:
      "Choose whether Preview uses the dev Convex/Clerk stack or a dedicated staging stack, then add the required app, Clerk, Convex, and storage env names to Vercel Preview.",
    actions: [
      "npx vercel env add NEXT_PUBLIC_APP_URL preview",
      "npx vercel env add NEXT_PUBLIC_CONVEX_URL preview",
      "npx vercel env add CONVEX_DEPLOYMENT preview",
      "npx vercel env add CONVEX_HTTP_ACTIONS_URL preview",
      "npx vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY preview",
      "npx vercel env add CLERK_SECRET_KEY preview",
      "npx vercel env add CLERK_JWT_ISSUER_DOMAIN preview",
      "npx vercel env add CLERK_FRONTEND_API_URL preview",
      "npx vercel env add B2_APPLICATION_KEY_ID preview",
      "npx vercel env add B2_APPLICATION_KEY preview",
      "npx vercel env add B2_BUCKET_NAME preview",
      "npx vercel env add B2_ENDPOINT preview",
      "npx vercel env add B2_REGION preview",
    ],
    verify: ["npm run doctor:vercel-preview-env", "npx vercel deploy -y"],
  },
  {
    issue: "MOVE-64",
    title: "Evaluate and enforce a Content Security Policy after production origins settle",
    why:
      "The CSP is ready in report-only mode, but enforcing it too early can break auth, upload, or Convex traffic if an origin is missing.",
    ownerAction:
      "After Clerk, Convex, Backblaze, and webhook origins are stable, set the production CSP mode to enforce and redeploy.",
    actions: ["npx vercel env add CONTENT_SECURITY_POLICY_MODE production"],
    verify: ["npm run doctor:launch -- --strict"],
  },
  {
    issue: "MOVE-67",
    title: "Remove stale legacy Vercel alias after brand rename",
    why:
      "The old pre-rename preview URL should stop serving the product once MovingManifest is the public name.",
    ownerAction:
      "After explicit approval, remove the stale alias from the Vercel project/domain settings.",
    actions: ["No automatic command is provided because this is a routing change."],
    verify: ["STALE_ALIAS_URL=<legacy-alias-url> npm run doctor:launch"],
  },
];

function renderList(label, values) {
  return [`${label}:`, ...values.map((value) => `  - ${value}`)].join("\n");
}

export function renderLaunchRemediationPlan(remediations = launchBlockerRemediations) {
  const sections = remediations.map((remediation, index) =>
    [
      `${index + 1}. ${remediation.issue} - ${remediation.title}`,
      `Why: ${remediation.why}`,
      `Owner action: ${remediation.ownerAction}`,
      renderList("Safe commands / placeholders", remediation.actions),
      renderList("Verify", remediation.verify),
    ].join("\n")
  );

  return [
    "Moving Manifest Launch Next Steps",
    "",
    "This checklist is intentionally read-only. It prints the safe order for resolving launch blockers, but it does not change Vercel, Convex, Clerk, Backblaze, DNS, aliases, or secrets.",
    "",
    ...sections.flatMap((section) => [section, ""]),
    "Recommended final pass after all blockers clear:",
    "  - npm run verify:launch",
    "  - npm run doctor:all",
    "  - npm run doctor:launch -- --strict",
  ].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  console.log(renderLaunchRemediationPlan());
}
