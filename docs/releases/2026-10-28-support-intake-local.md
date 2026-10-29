# Moving support-intake and development-instruction batch

**Local verification passed; not yet merged or deployed.** Branch `codex/moving-support-batch-20261028` starts from actual remote main `b585fbe249262f85a3e2f544391229b0954619a0`. It normally merges the exact original heads of #240 (`3554e2e57b218400d1669f84046fa7d462a0554f`) and #242 (`4fb2fdf974f8cddc672053ca2645036b73c74461`). Both histories and main's #241 REST-upload test-environment correction are preserved. No canonical checkout, active owner branch, backend, grant, authentication, launcher or CI configuration was changed.

## Source correction

#240 correctly qualifies About/FAQ support claims and removes the old release-note promise that every destination works. Its inherited Privacy request instruction still implied the desk could always accept requests. The Privacy paragraph now asks visitors to check current intake, permits requests when open, and explains that closed intake cannot accept or save them. The existing desk URL, no-mailbox statement, signed-in settings export/deletion guidance and product privacy boundary are retained.

The same conditional intake caveat is present in the existing Human Support sections of `public/llms.txt`, `public/llms-full.txt` and `public/ai.txt`; no tool/catalog, capability, provider or permission behavior changed. The desk remains responsible for its actual current intake status.

The existing support-path suite now covers the closed-intake contract on About, FAQ and Privacy, and checks Privacy retains its conditional request path, exact desk destination, no-email statement and account controls. The changed support-path suite passed all7tests in the full214-file/1332-test run on the exact application tree.

#242's only application-adjacent change is the generated Next instruction block in `AGENTS.md`. Its existing source review matched Next16.4.2's installed template. No Next generator or application was started during this preparation.

## Evidence and unfinished work

Independent source review cleared the pinned application tree634dda7a. Local Node24.22.1 frozen installation and all required software gates passed: state-publication safeguards, lint, fresh Convex bindings, TypeScript, contract drift, all214unit-test files/1332tests and production build. No account/provider/deploy credentials were used. The detailed immutable logs are preserved by the pipeline owner.

The first preparation screenshot was only a loading skeleton and was rejected as UI evidence. Replacement actual production before images were captured after explicit loaded-content readiness for About, the expanded FAQ support answer, Privacy and the changed Updates line. Actual final Local Live after images were captured at phone/desktop widths: all8routes returned200, correct copy and attributed support links, no horizontal overflow and no application page errors. Registered HTTPS `https://local.movingmanifest.com` was additionally checked for Privacy/FAQ with trusted TLS and normal Clerk client/environment200 responses. Numbered comparisons13–16 are retained by the pipeline owner.

Local mode intentionally refuses `/api/csp-report` with503; the browser's automatic CSP reports therefore create visible console resource errors. An initial loopback-only run also showed Clerk origin refusals, resolved on the registered HTTPS host. These are explicitly retained local-mode/provider limits, not a zero-console-error or authenticated account-lifecycle claim. No guard, identity/domain permission or application source was weakened to obtain proof. Only read-only signed-out public pages were exercised. Owned frontends/browsers stopped and temporary public mode profile removed; existing shared router remains owned by the coordinator.

The following original preparation checklist is historical; software and local public UI gates above are complete. Remaining gates are fresh final refs, ordinary required CI, merge, exact deployment and observed production readback.

Before marking ready or merging:

1. Recheck actual main, both source heads and active owners; preserve any newer code.
2. Obtain the shared local compiler/frontend slot from the pipeline owner. Do not overlap unrelated heavy jobs or start an unbound server. Install exact lockfile dependencies in this owned worktree; never symlink another checkout's `node_modules`.
3. Use the registered Local Live launcher/router and verified existing binding for read-only public `/about`, `/faq`, `/privacy` and `/updates` at phone/desktop widths. Capture actual running after images and numbered before/after comparisons, verify the FAQ support answer and privacy paragraph, links, document width and console. No real account/provider actions.
4. Run the current normal lint, fresh-Convex-binding, typecheck, contract, required unit/refusal/state checks and build. Existing historical green/skipped/ignored statuses are not a new combined pass. #234 and optional cloud-hook #239 remain separate.
5. One coherent ordinary integration PR, ready once after local gates; retain Required CI and normal main checks. Merge through normal path; the existing Vercel pipeline deploys Convex and frontend even though this batch changes no backend. No extra manual backend deployment or special preview is needed.
6. Verify exact merge/deployment source and observed public content. Check both original heads are ancestors before closing as incorporated. Preserve actual receipts and report source/check/merge/deploy/browser separately.

Nothing is waiting on Scott's approval for the routine source repair or ordinary release; real data, secrets, billing, access and domain changes remain outside this batch.
