# M1b: Assist With Moving public rebrand and canonical-domain cutover

Status: owner direction approved; production cutover held until this plan and
its preflight checklist are implemented and green.

Decision date: 2026-07-27

Owner decision:

- Public product name: **Assist With Moving**
- Canonical public origin: `https://assistwithmoving.com`
- Legacy origin: `https://movingmanifest.com`
- Legacy-origin policy: permanent redirect to the canonical origin indefinitely,
  preserving path and query string.

This document replaces the earlier MOVE-408 A1a/B recommendation. M1b is a full
public identity migration, not only a Vercel primary-domain change.

## Product and agent boundary

Assist With Moving owns durable household inventory, move state, destinations,
permissions, decisions, and evidence. The user's assistant owns identification,
estimation, planning, comparison, and synthesis.

The rebrand must not change tenant resolution, permissions, durable ids, move
data, API-key scopes, tool schemas, or workflow semantics.

## Non-negotiable release rules

1. Do not change the production Clerk domain, production Convex OAuth
   configuration, Vercel redirects, or the production primary domain before the
   code/configuration PR is merged and every preflight item below is green.
2. Treat the Clerk domain change and Convex OAuth configuration change as one
   maintenance-window operation. A half-migrated issuer/resource pair is a
   broken OAuth system.
3. Preserve the legacy domain and its registration indefinitely.
4. Do not promise transparent continuity for already-connected OAuth assistants.
   The OAuth resource and authorization-server issuer are exact identities.
   Existing clients must be told to disconnect the old connector and connect
   again at `https://assistwithmoving.com/mcp`.
5. Preserve machine-facing compatibility unless a public identity contract
   requires a new value.
6. Do not remove or regenerate user data, API keys, move ids, media ids, share
   tokens, or Clerk users as part of the cutover.
7. The first deployed code must be rollback-capable with either exact
   old-domain or new-domain OAuth configuration. A failed cutover restores a
   coherent issuer/resource/backend pair before exposing that origin. Do not
   improvise provider changes during an incident.

## Source-verified current state

Verified read-only on 2026-07-27:

| Surface | Current state | Required M1b state |
| --- | --- | --- |
| `assistwithmoving.com/` | `200`, same app as legacy domain | canonical `200` |
| `movingmanifest.com/` | `200`, no redirect | permanent redirect to new origin |
| Vercel project redirects | zero production redirects | old apex/www to new apex |
| protected-resource metadata on both origins | resource is `https://movingmanifest.com/mcp` | resource is `https://assistwithmoving.com/mcp` on canonical origin |
| authorization server | `https://clerk.movingmanifest.com` | `https://clerk.assistwithmoving.com` |
| Clerk primary domain | `movingmanifest.com`, verified; SSL issued | `assistwithmoving.com`, verified; SSL issued |
| `clerk.movingmanifest.com` DNS | Clerk Frontend API CNAME | retained through rollback window, then legacy treatment documented |
| `clerk.assistwithmoving.com` DNS | does not point at Clerk | Clerk-provided CNAME, verified before app flip |
| Clerk dynamic client registration | enabled | remains enabled |
| Clerk OAuth access tokens | JWT enabled | remains enabled |
| Clerk default DCR scopes | `email`, `profile` (`offline_access` automatic) | `openid`, `profile`, `email` (`offline_access` automatic) |
| registered Clerk OAuth clients | 60 registrations; the inspected first page showed Claude clients | existing registrations treated as reconnect-required |
| Vercel production `NEXT_PUBLIC_APP_URL` | present, value not emitted during audit | `https://assistwithmoving.com` |
| production Clerk BAPI credential | stored value failed read-only BAPI auth with `clerk_key_invalid` | replace with the new valid production secret/key material |
| local Clerk credential | development/test instance only | remains development-only |
| hardcoded legacy-domain references | concentrated in public docs, MCP setup, scripts, tests, and marketing copy | classified and migrated or deliberately retained |
| QR/box labels | derive URLs from the browser origin at print time | labels printed after cutover use new origin; old labels keep working through redirect |

The live duplicate-origin state must not be interpreted as dual canonical
support. Both origins currently publish the old OAuth resource identity.

## Compatibility register

Every legacy reference must be classified as `change`, `alias`, `preserve`, or
`history`.

The executable register lives in
`docs/audits/m1b-legacy-reference-register.json`. Each entry records a file or
pattern, classification, reason, owner, and an optional expiry/removal
condition. A unit test scans active source/docs surfaces and fails when an
unregistered legacy-domain reference appears. Static text/JSON, Convex, and
`.mjs` files cannot all import one TypeScript constant, so drift is controlled
by this register and test rather than an impossible shared runtime import.

### Change: public identity

- Visible product name: `MovingManifest` -> `Assist With Moving`
- Canonical domain and metadata base
- Canonical/Open Graph/site metadata, PWA name, robots host, and sitemap URLs
- Public navigation, marketing pages, auth copy, settings copy, and human MCP
  setup copy
- Public REST examples and default production base URL
- Hosted OAuth MCP endpoint and protected-resource metadata
- Clerk production issuer/domain and related environment values
- Convex gateway OAuth allowlist and configured resource
- Public AI prompts, `llms.txt`, `llms-full.txt`, OpenAPI server URLs, and
  operational doctors
- MCP `resource_name`, public connector labels, bearer realm/copy, and Clerk
  consent-screen name/logo
- New box-label QR URLs and new public-share URLs
- Public release documentation and support/reconnect instructions

### Alias: compatibility entry points

- `https://movingmanifest.com/:path*` permanently redirects to
  `https://assistwithmoving.com/:path*`, preserving the query string.
- `https://www.movingmanifest.com/:path*` follows the same rule.
- `https://www.assistwithmoving.com/:path*` redirects to the canonical apex.
- Old printed QR codes and shared links therefore continue to resolve.
- The npm/stdio MCP package may expose a new public name while retaining its old
  package/import/config identifiers until a separately versioned breaking
  release.

OAuth is the exception: an HTTP redirect is not a promise that an existing MCP
client will accept a new OAuth resource and issuer. Reconnect is the supported
path.

### Preserve: machine-facing compatibility

- Repository and GitHub slug
- Convex project/deployment identities
- Database schema/table/field names
- Existing user, household, move, item, box, photo, and share ids
- `mmk_` API-key prefix
- Existing API-key records and scopes
- Existing `MOVINGMANIFEST_*` environment-variable names
- Existing MCP tool names and argument/result schemas
- internal MCP `serverInfo.name: "movingmanifest"` until a separately tested
  compatibility migration proves clients do not key state by server name
- Existing REST paths and JSON contracts
- Existing audit event names
- Historical release version ids

Preserved identifiers may be documented as legacy compatibility names, but must
not remain the dominant public brand.

### History: do not rewrite as current truth

- Archived audit findings, old release notes, and original build decisions
  remain historically accurate.
- Add a short note where an old document could otherwise be mistaken for current
  setup instructions.
- Git history is never rewritten.

## Implementation work packages

### R1. Central public identity contract

Create one server-safe product configuration for:

- `name: "Assist With Moving"`
- `domain: "assistwithmoving.com"`
- canonical origin
- legacy origin
- OAuth MCP resource URL
- REST base URL
- Clerk issuer URL

Keep browser-exposed values build-time safe. Avoid dynamic environment-property
lookups because Next.js does not inline them.

Red-first locks:

- product identity test expects the new public name/domain
- metadata/robots/sitemap tests expect the canonical origin
- a repository-domain contract test rejects unclassified active
  `movingmanifest.com` setup references

### R2. Public UI and metadata rebrand

Update current public-facing product copy, application metadata, PWA manifest,
navigation, marketing pages, auth surfaces, settings, public shares, print
packets, and assistant setup prompts.

Preserve the existing visual language unless a replacement asset is explicitly
approved. The box icon is brand-neutral; text wordmarks change.

Accessibility requirements:

- accessible home labels say `Assist With Moving home`
- document titles and application names use the new name
- no concatenated `AssistWithMoving` display text

### R3. API, MCP, and agent documentation

Update:

- `README.md`
- `docs/api-and-mcp.md`
- `public/llms.txt`
- `public/llms-full.txt`
- `public/openapi.json`
- `/api`
- `/mcp/guide`
- `/ai` and `/ai/start`
- REST/stdio default base URLs
- setup and doctor scripts

Docs must state:

1. hosted OAuth clients connect to `https://assistwithmoving.com/mcp`;
2. existing hosted-OAuth connections must be removed and re-added;
3. API-key/stdio users should update the base URL, although the legacy redirect
   remains;
4. tool names, records, and API keys are unchanged;
5. stale tools after reconnect require a disconnect/reconnect or registry
   refresh, not repeated blind calls.

### R4. OAuth resource and issuer migration

Code changes:

- protected-resource metadata emits
  the resource selected by the production canonical-origin environment;
- the front-door `WWW-Authenticate` challenge points to canonical metadata;
- the migration version of Convex `mcpSetup` accepts only two exact, matched
  custom pairs: the legacy issuer/resource and the M1b issuer/resource. It must
  reject cross-pairs. A post-rollback-window cleanup removes the legacy pair;
- Convex token verification uses the new Clerk issuer from deployment env;
- OAuth config-lock tests reject hostile issuers/resources and mismatched
  legacy/new pairs;
- MCP doctor defaults to the canonical endpoint.

The current JWT verifier validates signature and issuer but intentionally does
not pin `aud`. Before cutover, capture the audience claim from a real Clerk MCP
token. If Clerk emits a stable resource audience, add and test an exact
canonical-resource audience check. If it does not, record the provider evidence
and obtain explicit owner acceptance of the residual same-issuer,
cross-resource-token risk.

Provider changes in the maintenance window:

1. change Clerk primary domain to `assistwithmoving.com`;
2. apply and verify Clerk-provided DNS records for
   `clerk.assistwithmoving.com`;
3. wait for Clerk SSL issuance;
4. obtain the newly generated production publishable key and confirm the
   production secret;
5. update Vercel production Clerk variables and `NEXT_PUBLIC_APP_URL`;
6. update production Convex Clerk issuer/frontend variables;
7. configure the Convex MCP gateway with the exact new issuer/resource pair;
8. refresh the MCP registry if the deployed gateway requires it.

Do not disable dynamic client registration or JWT access tokens during this
change. Before cutover, change Clerk's DCR default scopes to
`openid`, `profile`, and `email`; Clerk adds `offline_access` automatically.
This matches the scopes advertised by the protected-resource metadata and
prevents clients that omit `scope` during registration from losing OIDC.

### R5. Domain redirects and compatibility

Use provider-level domain redirects after the new canonical deployment is
healthy. Provider redirects are preferred over an app-level host conditional
because they run before Next.js/Clerk and cannot accidentally initialize the old
application origin.

Rules:

- old apex -> new apex, HTTP `308`, path/query preserved
- old www -> new apex, HTTP `308`, path/query preserved
- new www -> new apex, HTTP `308`, path/query preserved
- no redirect loop
- no redirect to a Vercel preview URL

The release test must cover `/`, `/app`, `/api`, `/api/v1/moves`, `/mcp`,
`/mcp/connect`, both protected-resource discovery paths, `/share/<synthetic>`,
`/robots.txt`, and `/sitemap.xml`.

Redirect compatibility is protocol-specific:

- `308` is the continuity contract for browser/public GET links, QR labels, and
  public shares;
- authenticated REST, stdio MCP, and API-key `/api/mcp` clients are
  **reconfiguration-required** and must change their base URL to the canonical
  origin;
- run reference-client `POST`, `PATCH`, and `DELETE` probes to record whether
  method, body, query, `Authorization`, and `Idempotency-Key` survive, but do
  not turn one client's behavior into a general compatibility promise;
- no OAuth client may treat the redirect as a replacement for reconnecting.

### R6. QR labels, public shares, media, and CSP

- Printing a new box label on the canonical origin must encode the canonical
  origin.
- Decode an actually rendered QR from a marked box fixture. A label generated
  with the old origin must follow the permanent redirect, require
  reauthentication when needed, and land on the same box id with the same
  household/move query values.
- Public share links generated after cutover use the canonical origin; existing
  tokens remain valid through the redirect.
- A real marked share fixture must render the same durable projection through
  both origins before redirect enforcement, then through the legacy redirect.
  Valid, expired, and revoked tokens must preserve current privacy,
  cache/referrer headers, and token-non-logging behavior.
- Backblaze/Cloudflare CORS, CSP, and image-delivery allowlists include both
  origins through the rollback window. The legacy origin is removed or
  explicitly reclassified only after the rollback exit criteria are met.
- CSP/reporting and storage-readiness tests use the canonical origin while
  retaining legacy-origin redirect coverage.
- No media object is copied or re-keyed.

### R6a. Clerk-dependent callback inventory

Before changing the Clerk domain, inspect and classify:

- social-connection callback/redirect URLs;
- webhook destination and signed-delivery health;
- email verification, password-reset, invitation, and magic-link URLs;
- JWT templates plus external issuer/JWKS consumers;
- passkey relying-party/domain behavior if passkeys are enabled;
- Account Portal and any hosted sign-in URLs.
- allowed origins/redirect origins and Clerk consent-screen name/logo.

Any enabled surface gets an exact update step and post-cutover proof. A disabled
surface is recorded as not applicable, not silently omitted.

### R7. Existing-assistant reconnect experience

The production Clerk instance currently contains 60 OAuth client registrations.
That count is registrations, not proof of 60 active people, but it makes the
reconnect path a first-class release requirement.

Before cutover:

- add a release notice and in-product AI Connections notice;
- state the exact new connector URL;
- explain that moves, inventory, and permissions remain unchanged;
- provide client-neutral reconnect steps;
- provide client-specific steps only for clients tested in preflight.

After cutover:

- test one newly registered OAuth client from discovery through tool listing and
  an authenticated read;
- test one existing pre-cutover client and record its actual failure/recovery
  behavior;
- reconnect that client and verify its tool list is current;
- do not delete old Clerk OAuth applications in bulk as part of the cutover.

Browser-session expectation: a cookie scoped to `movingmanifest.com` does not
transfer to `assistwithmoving.com`. Success means the same Clerk user can
reauthenticate on the new domain and resolve the same household, moves, and
permissions. Seamless cookie/session transfer is not an acceptance criterion.

## Release sequence

### Phase 0: code and provider preflight, no production mutation

- merge or explicitly order around the open MOVE-400–409 PR stack;
- do not begin rebrand implementation from `origin/main@15cf006`. First land
  the approved performance train or establish an exact, published integrated
  base containing the final MOVE-400–409 corrections, then rerun the
  domain/MCP inventory against that SHA;
- land the M1b implementation with red-first locks;
- run full repo verification;
- deploy an isolated preview using canonical env overrides where safe;
- prove metadata, redirects in a local/preview host simulation, and no
  redirect loop;
- use development/staging Clerk for ordinary previews. Never place production
  Clerk keys on a Vercel preview host;
- reserve production-domain auth, old-session, DCR, token-audience, DNS, SSL,
  and redirect proofs for the controlled maintenance window;
- confirm Vercel and Clerk dashboard access;
- recover and prove a valid production Clerk secret before any mutation. This
  is separate from the new publishable key Clerk generates after a domain
  change. Record only non-secret key fingerprints and provider receipts;
- capture current provider values and rollback receipts without exposing
  secrets;
- prepare the user-facing reconnect notice;
- select a real test assistant connection for before/after validation.
- list every client the public docs materially claim to support and capture a
  pre-cutover tool inventory for each. Current likely claims include Claude,
  ChatGPT, and Codex; the final list comes from the integrated source inventory.

Because merging `main` deploys production, "land" above means make the PR
release-ready, not merge it early. The migration code must remain coherent under
the old production env so its first maintenance-window deployment does not
change the active OAuth identity.

### Phase 1: deploy rollback-capable migration code

- start the maintenance record;
- merge/deploy the already-green migration code while the old canonical,
  Clerk, and Convex env values remain active;
- record the exact Git SHA, required CI check names/results, Vercel deployment
  id, Convex deployment/function version, and MCP tool-list snapshot;
- record separate Vercel and Convex deployment receipts;
- verify the old-origin web, auth, protected-resource metadata, MCP connection,
  and API-key REST path remain green;
- stop immediately if the old identity changes before provider work begins.

### Phase 2: Clerk domain and DNS

- change Clerk production primary domain;
- apply Clerk DNS;
- wait for `Verified` DNS and `Issued` SSL;
- obtain the new publishable key;
- do not redirect the legacy app domain yet.

Clerk documents this operation as downtime-producing and generates a new
publishable key. The dashboard does not offer a verified second-primary staging
state in the current plan. Treat the domain-confirmation click as the beginning
of the auth maintenance window: capture the exact DNS records shown after the
change, apply them immediately, and stop/roll back if DNS and SSL do not reach
the required states.

`clerk.movingmanifest.com` is retained only through the rollback window unless
Clerk explicitly supports and configures it as a monitored secondary/satellite
endpoint. Keeping its DNS record does not preserve the old issuer or old OAuth
clients. At rollback-window close, record the Clerk-supported fate, certificate
owner, DNS owner, monitoring owner, and removal date.

Rollback trigger: Clerk DNS/SSL does not become healthy within the approved
window, or the new issuer metadata is unavailable.

### Phase 3: atomic application and OAuth identity switch

- update Vercel production app URL and Clerk variables;
- update production Convex Clerk issuer/frontend variables;
- redeploy the already-green Vercel build with the new build-time public values;
- deploy/confirm the rollback-capable Convex functions;
- run the internal production OAuth configuration with the exact new issuer and
  resource;
- perform these operations as one bounded step, then verify anonymous 401
  challenge, protected-resource metadata,
  authorization-server metadata, DCR, token exchange, JWT verification, tool
  listing, and one authenticated read.
- verify sign-in, sign-up, forced reauthentication of a pre-cutover browser
  session, same-user/tenant data resolution, webhook identity, and API-key REST.

There is no acceptance checkpoint between changing the Convex issuer and
configuring the gateway resource: the pair is either switched and verified
together or rolled back together.

Rollback trigger: canonical sign-in, same-tenant resolution, discovery, or a
newly registered MCP client fails.

### Phase 4: primary domain and permanent redirects

- make `assistwithmoving.com` the Vercel primary/canonical domain;
- add permanent redirects from legacy apex/www and new www;
- verify path/query preservation and absence of loops;
- run the authenticated REST/API-MCP redirect matrix before claiming protocol
  observations; authenticated clients remain documented as
  reconfiguration-required;
- submit/refresh canonical sitemap and operational references.

Rollback trigger: canonical web/auth/API health regresses after redirects.

### Phase 5: reconnect validation and closeout

- observe one pre-cutover client;
- follow the published reconnect path;
- verify current tool count/names and an authenticated read/write-safe journey;
- repeat reconnect verification for every client whose exact setup steps are
  materially claimed in public docs;
- verify old QR/share links;
- run complete production doctors;
- record Clerk domain and non-secret key fingerprints, DNS/SSL receipts,
  redirect-matrix output, provider receipts, reconnect result, and
  rollback-window state.

## Preflight verification checklist

All boxes must be checked before the first production mutation.

### Code and content

- [ ] Public identity is centralized and locked by tests.
- [ ] No active setup/docs surface presents `movingmanifest.com` as canonical.
- [ ] Historical and compatibility references are explicitly classified.
- [ ] Machine-readable legacy-reference register is complete and its drift test
      passes.
- [ ] Metadata, canonical URLs, robots, sitemap, PWA manifest, Open Graph, and
      public prompts use Assist With Moving.
- [ ] REST/OpenAPI/MCP docs use the new canonical URLs.
- [ ] API-key prefix, env names, tool schemas, ids, and data contracts are
      unchanged.
- [ ] QR/public-share tests prove new generation plus legacy redirect behavior.
- [ ] Actual rendered QR decoding and real valid/expired/revoked share fixtures
      are prepared.
- [ ] Reconnect notice and exact setup URL are ready.

### Automated verification

- [ ] Named red-first domain/OAuth/rebrand locks pass.
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run contract:drift`
- [ ] `npm run build`
- [ ] applicable Playwright desktop/mobile flows
- [ ] unauthenticated MCP challenge proof
- [ ] protected-resource/authorization-server discovery proof
- [ ] agent journey against dev/preview
- [ ] marketing vendor/network lock from MOVE-400
- [ ] performance acceptance for MOVE-400/401/403 remains green after rebase

### Provider readiness

- [ ] Clerk production dashboard access confirmed.
- [ ] a valid production Clerk secret is proven without exposing it; its
      non-secret fingerprint is recorded separately from publishable-key
      rotation.
- [ ] Vercel production project/domain access confirmed.
- [ ] Convex production deploy/config access confirmed.
- [ ] Backblaze/Cloudflare origin allowlists are ready.
- [ ] social callbacks, webhooks, email links, JWT/JWKS consumers, passkeys, and
      Account Portal, allowed origins, and consent-screen branding are
      classified with exact verification steps.
- [ ] `clerk.assistwithmoving.com` target records captured from Clerk.
- [ ] new Clerk publishable-key rotation procedure ready.
- [ ] current production env/config receipts captured securely.
- [ ] selected pre-cutover assistant and owner test account are available.
- [ ] a real Clerk MCP token's `aud` claim is captured and either pinned in code
      or its residual risk is explicitly accepted by the owner.
- [ ] rollback operator and exact rollback order are recorded.
- [ ] release record binds exact Git SHA, CI checks, Vercel deployment id,
      Convex version, DNS/SSL receipts, redirect matrix, and MCP tool snapshot.
- [ ] rollback window is 24 hours after first full-green production proof; it
      closes only after two complete doctor runs separated by at least one hour,
      zero confirmed auth/MCP regression, and successful legacy QR/share tests.

## Post-cutover verification checklist

- [ ] `assistwithmoving.com/` returns `200`.
- [ ] canonical HTML contains only the new canonical origin.
- [ ] new www permanently redirects to canonical apex.
- [ ] old apex and www permanently redirect, preserving path/query.
- [ ] redirect status is `308`; authenticated POST/PATCH/DELETE and API-MCP
      observations are recorded; authenticated clients are explicitly
      reconfiguration-required.
- [ ] `/robots.txt` and `/sitemap.xml` use the canonical origin.
- [ ] sign-in, sign-up, forced reauthentication of a pre-cutover session,
      same-user/tenant data resolution, sign-out, and account menu work.
- [ ] Clerk issuer is exactly `https://clerk.assistwithmoving.com`.
- [ ] Clerk authorization-server metadata and JWKS are healthy.
- [ ] MCP protected resource is exactly
      `https://assistwithmoving.com/mcp`.
- [ ] anonymous MCP returns the expected OAuth challenge.
- [ ] new DCR client completes OAuth and lists expected tools.
- [ ] DCR defaults are `openid profile email` and a client that omits `scope`
      still receives the required OIDC-capable registration.
- [ ] authenticated MCP context/read succeeds.
- [ ] existing client behavior is recorded; reconnect succeeds.
- [ ] API-key REST and stdio MCP still work.
- [ ] old and new QR/share-link fixtures resolve to the same durable record.
- [ ] storage/media delivery and CSP reports are healthy.
- [ ] production doctors and error/log review are green.

## Rollback

Rollback keeps the currently redirected public origin in place until the
restored legacy identity is healthy:

1. restore or confirm the recorded rollback-capable Convex deployment. Do not
   deploy code that rejects the legacy pair;
2. change Clerk primary domain back to `movingmanifest.com`, apply/verify its DNS
   and SSL, and obtain the publishable key generated by that rollback change;
3. as one bounded operation, restore Convex Clerk issuer/frontend env and set
   the gateway to the exact old issuer/resource pair;
4. restore Vercel Clerk/app-url env with the newly generated rollback
   publishable key, then redeploy the recorded rollback-capable Vercel build;
5. verify old-origin sign-in, same-user/tenant resolution, discovery, DCR/token
   exchange, authenticated MCP, and API-key REST while public redirects still
   protect general traffic;
6. only after the old identity is healthy, remove the legacy-to-new redirects
   and restore `movingmanifest.com` as the serving primary;
7. publish rollback reconnect guidance. Clients registered/reconnected against
   the new issuer may need to disconnect and reconnect again to the restored old
   identity;
8. verify both a retained pre-cutover client cohort and a retained new-issuer
   cohort. Do not bulk-delete either cohort's Clerk registrations.
9. revert or freeze the corresponding `main` release state before normal
   automatic deployments resume. A provider rollback is incomplete if the next
   unchanged `main` deployment can silently reapply failed cutover defaults.

Keep both domain registrations, previous config receipts, and the last green
Vercel and Convex deployments available throughout the rollback window.

Hard abort threshold during forward or rollback maintenance: any verified
cross-tenant resolution, invalid JWT acceptance, missing protected-resource
issuer/resource, or failed new-client authorization triggers immediate
rollback. Availability failures trigger rollback if canonical web sign-in and
one authenticated MCP read are not both green within 20 minutes after Clerk SSL
is issued.

## First environment gate

There is no remaining owner-direction gate for the identity choice: M1b is
explicit. The first implementation-owner gate is authorization to land the
open performance PR train (or approve an exact published integrated base), since
the current `origin/main` predates the required MOVE-400–409 corrections and
merges deploy production.

The first release-environment gate is recovering and verifying a valid Clerk
production secret **before** the first provider mutation. The currently stored
Vercel `CLERK_SECRET_KEY` did not authenticate to the Clerk Backend API during
the read-only audit, although signed-in dashboard access is available. Clerk's
new publishable key is a separate artifact generated by the later domain
change. This gate does not block code/spec work; it blocks the production
maintenance window until corrected and proven.
