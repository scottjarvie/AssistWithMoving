# Local development rollout — 7 October 2026

`npm run dev:status` reports inspected bindings and blockers without credentials. `npm run dev:sandbox` uses the explicit existing development configuration from `.env.local`, binds only 127.0.0.1:3827, refuses collisions, separates Next output, and blanks all non-allowlisted dotenv/provider values. A persistent development banner identifies the save destination. Existing `dev` remains available with its previous behavior.

Inspected production: fine-crocodile-51; configured development: gregarious-goldfinch-763. Production domain: movingmanifest.com. Live reservation 3828, Sandbox reservation 3827. Reservations are not verified authentication addresses.

`npm run dev:live` fails closed: production server-side Clerk binding and authorized local origin have not been verified. No authentication policy, hosts, certificates, OS trust or provider identity is changed.

`npm run dev:backend` names the inspected development target but fails closed pending review of existing backend work and deployed provider isolation. It never falls back to production credentials and has not pushed functions/schema. Media, paid AI, remote cron behavior, intended account retrieval and synthetic-save/reload acceptance remain unverified. Local server provider secrets are blanked; remote Convex provider configuration is a separate boundary.

Sandbox blocker: Convex B2 and paid AI provider destinations have not been proved isolated. Existing development backend may invoke them.

No production export, record write, deployment, push or workflow trigger occurred. Preserve all existing dirty work. Source changes are uncommitted local setup.

Public hosted binding profiles are in `config/local-live-public.json` where verified. They contain only public endpoints and publishable keys. Installed Clerk middleware explicitly requires a server secret in Music, Finances and Moving; no existing production server secret was loaded or created. Music additionally hardcodes its production authorized party to its public domain. Memory uses browser Clerk; its remaining Live boundary is trusted local origin/runtime and API CORS, not an asserted missing server secret.
