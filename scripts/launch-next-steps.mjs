import { pathToFileURL } from "node:url";

export const launchBlockerRemediations = [
  {
    issue: "MOVE-63",
    title: "Switch Clerk to a production instance before public launch",
    why:
      "The live app uses the production Clerk domain, so Clerk, Google OAuth, Vercel, and Convex production identity settings must stay aligned before public launch.",
    ownerAction:
      "Keep the MovingManifest Google OAuth credentials pointed at Clerk's redirect URI, keep the Clerk production values in Vercel/Convex, verify production Dynamic client registration after the Claude failure ofid_a7fc26bd131d0216, deploy the current identity-context changes, then complete the MOVE-238 real-account MCP OAuth proof.",
    actions: [
      "Verify Clerk production OAuth applications have Dynamic client registration enabled; Claude reported registration failure reference ofid_a7fc26bd131d0216",
      "If DCR cannot be enabled immediately, create a production OAuth client for Claude and add that Client ID in the Claude connector settings as a temporary fallback",
      "Verify Clerk production OAuth access tokens are still generated as JWTs",
      "Configure Clerk production Google OAuth custom credentials for https://clerk.movingmanifest.com/v1/oauth_callback",
      "Verify Vercel/Convex production Clerk env values still point at clerk.movingmanifest.com",
      "Sign in on movingmanifest.com as scott@thejarvie.com and confirm the app uses the production Clerk domain",
      "Deploy the current repo to production before the strict MCP OAuth smoke, so /api/v1/me and get_api_context return connection.user.email for the intended-account check",
    ],
    verify: [
      "node --env-file=.env.local scripts/mcp-oauth-smoke.mjs --authorize --open-browser --box-intake-smoke --write-smoke --expect-trusted-helper-toolset --expected-email scott@thejarvie.com --endpoint https://movingmanifest.com/api/mcp",
      "npm run doctor:oauth-cutover -- --strict --vercel-scope jarvies-projects",
      "npm run doctor:launch",
      "npm run doctor:vercel-env",
      "npm run doctor:convex-env",
    ],
  },
  {
    issue: "MOVE-240",
    title: "Decide and enable trusted-helper OAuth MCP toolset before publish",
    why:
      "Hosted/mobile OAuth clients should launch with the narrower trusted-helper MCP surface, not the full API-key toolbelt, so users can safely authorize setup, capture queue, researched item, photo, packing, and transport help.",
    ownerAction:
      "After explicit production approval, set MOVINGMANIFEST_MCP_OAUTH_TOOLSET=trusted-helper in Vercel production, deploy the current MCP/OAuth changes, then prove the production OAuth session with the strict authorized smoke.",
    actions: [
      "npx vercel env add MOVINGMANIFEST_MCP_OAUTH_TOOLSET production",
      "Deploy the current repo after the env value is present",
      "Do not publish the hosted OAuth connector broadly until the authorized smoke proof includes trustedHelperToolsetVerified: true",
    ],
    verify: [
      "npm run doctor:oauth-cutover -- --strict --vercel-scope jarvies-projects",
      "node --env-file=.env.local scripts/mcp-oauth-smoke.mjs --authorize --open-browser --box-intake-smoke --write-smoke --expect-trusted-helper-toolset --expected-email scott@thejarvie.com --endpoint https://movingmanifest.com/api/mcp",
    ],
  },
  {
    issue: "MOVE-62",
    title: "Configure production admin access",
    why:
      "Production admin routes should only unlock for explicit admin emails, not by accident or local defaults.",
    ownerAction:
      "After production sign-in works, verify the configured admin email can sign in and open /admin.",
    actions: [
      "Verify ADMIN_EMAILS is present in Vercel production and Convex production",
      "Sign in with the intended admin account",
      "Open /admin and confirm the dashboard audit event is written",
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
      "Send a Clerk production test event to the already-created Convex webhook endpoint.",
    actions: [
      "Verify Clerk production endpoint targets https://fine-crocodile-51.convex.site/clerk-webhook",
      "Verify Convex production has CLERK_WEBHOOK_SIGNING_SECRET",
      "Send a Clerk test event and confirm Convex accepts it",
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
