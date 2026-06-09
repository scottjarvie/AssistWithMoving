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
    issue: "MOVE-66",
    title: "Fix Backblaze B2 dev credentials and CORS for photo-upload e2e",
    why:
      "Photo evidence is core product data, so uploads need a valid scoped key and browser CORS before launch.",
    ownerAction:
      "Generate a Backblaze application key scoped to the production bucket, then allow PUT, GET, and HEAD from localhost:3827, movingmanifest.com, www.movingmanifest.com, and Vercel preview origins.",
    actions: [
      "npx vercel env add B2_APPLICATION_KEY_ID production",
      "npx vercel env add B2_APPLICATION_KEY production",
      "npx vercel env add B2_BUCKET_NAME production",
      "npx vercel env add B2_ENDPOINT production",
      "npx vercel env add B2_REGION production",
      "npx vercel env add B2_BUCKET_ID production",
      "npx convex env set B2_APPLICATION_KEY_ID <backblaze-key-id> --prod",
      "npx convex env set B2_APPLICATION_KEY <backblaze-application-key> --prod",
      "npx convex env set B2_BUCKET_NAME <bucket-name> --prod",
      "npx convex env set B2_ENDPOINT <s3-endpoint> --prod",
      "npx convex env set B2_REGION <b2-region> --prod",
    ],
    verify: [
      "npm run doctor:storage",
      "npm run doctor:vercel-env",
      "npm run doctor:convex-env",
      "npm run doctor:convex-dev-env",
    ],
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
    title: "Remove stale TheMovePlanner Vercel alias after brand rename",
    why:
      "The old preview-style brand URL should stop serving the product once Moving Manifest is the public name.",
    ownerAction:
      "After explicit approval, remove the stale alias from the Vercel project/domain settings.",
    actions: ["No automatic command is provided because this is a routing change."],
    verify: [
      "STALE_ALIAS_URL=https://themoveplanner.vercel.app npm run doctor:launch",
    ],
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
