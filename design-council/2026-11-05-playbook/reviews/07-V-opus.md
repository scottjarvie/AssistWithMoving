# Blind council review: candidate V

**Disposition: conditional pass on the source changes. Not accepted on visuals.** I found no capability removed and no blocking correctness bug in the changed code. Visual approval stays withheld: the public reader pages have no rendered images, the approval form has none, and there are visible issues in the Inventory and phone surfaces.

HEAD was e39a165b7a5dba04dad3caa0026a1dcbd6bad251 with a clean tree on `design/assistwithmoving-council-2026-11-05`, at both the start and the end. No files, branch or checkout changed, and I ran no tests, builds or browsers. `git diff 7d1bc78 e39a165 -- src convex` is empty, so the captures were rendered from the same `src`/`convex` as the reviewed HEAD.

- **Author:** Codex gpt-6.1-sol high
- **Reviewer:** Claude Opus 5.5 (`claude-opus-5-5`)

## Ranked defects

1. **Medium: on phones the aside comes before the reading content.** `public-page-chrome.tsx:513-520`. The aside uses `order-first`. Below `lg`, Contents, then "About this guide", then the whole page visual (AssistantVisual, ApiVisual or McpVisual) all render above the first section.
   - On desktop the visual moves from the old hero column (about 560px) into a 17rem column (about 250px usable). Those visuals were not designed for that width.
   - The "About this guide" block repeats the eyebrow and the product name, which is the repeated-facts anti-pattern.
   - **Fix:** split the aside. Keep Contents first on phones, and put the guide context and the visual after the article (or back in the hero on desktop). Make the desktop aside `lg:sticky lg:self-start` so Contents stays visible on long pages like `/ai` and `/mcp/guide`.
2. **Medium: Contents labels are derived fragilely and some are wrong.** `public-page-chrome.tsx:47-61, 88-96`. `firstHeading` only finds `h2` elements written directly in the page's JSX, not ones inside components.
   - `/faq` band 2 becomes "Guide section 2", and `/ai`'s last band becomes "Guide section 7".
   - `/ai` band 2 is labelled with the first of its four card titles, "A grant, not a sign-in". `/mcp/guide`'s last band is labelled "Bring your AI" (one of three), and `/pcs-moving` has the same problem.
   - Every band that opens with a FeatureGrid becomes "At a glance".
   - `public-reader.test.tsx` only uses a synthetic two-band fixture.
   - **Fix:** add an optional `label` prop to `PublicBand`, set it on the ambiguous bands, and add a test over the ten real routes that rejects "Guide section N" labels.
3. **Medium: `evidence.json` overstates what was proven.** It still lists the probe "Approval draft survives sections and pinned chooser" for `ai-phone-approval-dark`, with no relabel and no limitation field. Only the markdown is honest.
   - The runner committed at HEAD (`capture-offline-components.mjs:147-148`, the new waits) is not the runner that produced the JSON, and the JSON records no runner commit.
   - The image shows Setup still selected. So Approve may never have activated, which could be a real bug in the "All 7" chooser rather than a timing problem in the probe. It is unknown until the corrected runner is rerun.
   - **Fix:** add `limitations` and `runnerHead` fields, or regenerate the evidence.
4. **Low–medium: the "Approved" glyph is overloaded.** `ai-permissions-matrix.tsx:283`. Approved and Previously approved use the `source` glyph. That same glyph is the "About" popover trigger in each column header and the Boundaries and API keys tab icon. It is visible in both AI captures.
   - **Fix:** use the new `check` glyph for approved states.
5. **Low: the phone Revoke button is an unlabelled red ✕.** `ai-permissions-matrix.tsx:287`. Next to the labelled "Review connection" button, an X reads as "dismiss card".
   - **Fix:** show a "Revoke" text label below `lg`, the same way Review uses `lg:sr-only`.
6. **Low: some public icon choices carry the wrong meaning.**
   - `public-page-chrome.tsx:579/585`: the first two How-it-works steps both use `box`, side by side.
   - `api/page.tsx`: "Layout and load planning" uses `reset`.
   - `mcp/guide`: "Canonical door first" uses `system`, which is the theme-preference glyph.
   - Claims "Claim packet export" uses `warning`, and Terms uses `warning` twice.
   - **Fix:** use `plan`, `route`, `contents` or `entry` where they fit.
7. **Low: the grant-history cap of 40 is hardcoded in the client.** `ai-connection-manager.tsx:100, 227` repeat the server's `take(40)` (`convex/aiGrants.ts:522`), and `>= 40` triggers "history may contain more" at exactly 40.
   - **Fix:** export a shared constant.
8. **Low, outside this diff (visible issues to record, not regressions):**
   - **Cut-off tab text:** on AI, Inventory and Item phone ("Bulk p", "Higl", "Measureme") and on Item desktop.
   - **Disposition strip:** on phone it only scrolls sideways and has no overflow menu.
   - **Inventory desktop rows repeat facts:** status and disposition each appear twice (badge plus select), and the "review" chip repeats the Review checkbox. Review-column text is clipped at the table edge.
   - **Heavy control stacking:** the first row starts at about y=580 on desktop and y=670 on phone.
   - **Duplicate actions:** Add and Bulk paste exist as both tabs and buttons.
   - **Inconsistent value casing:** raw lowercase values ("active", "good") sit beside capitalised ones.
   - **Item record:** the action buttons mix bordered and unbordered styles, the stream has no kind filter chips (§3.1), and timestamps show seconds.
   - **Fixture artifact:** the sticky AI strip sits at 4rem with no app header in the fixture, so content shows above it in the confirm capture. Behaviour in the authenticated shell is unverified.

## Capability and content retention

Every original capability, piece of content and action is retained in source:
- **Public pages:** only icons were swapped; all copy, links, code/copy controls, actions and supplied visuals remain. The How-it-works panel is now one labelled `<details>` step away; before, it showed on desktop only.
- **AI settings:** all seven mounted sections remain. Revoke confirmation is kept, and the safe default ("Keep it") now gets focus.
- **Review:** it now toggles closed, and the refused-request mark opens Activity. Both are additions.
- **Status messages:** the live region is always mounted.
- **Measurement source cards:** removing the local confidence state changes nothing that gets saved, because `handleSubmit` (796-806) builds the save from the estimate toggles. The cards now correctly show saved confidence instead of unsaved edits.
- **AI matrix:** it uses all five real `MOVING_SCOPES`.
- **Offline substitutions:** confined to the fixture bundle.

## Scores

**Source: 7/10.** Good corrections: the caption moved to the first position, explicit table roles on the card layout, heading levels fixed, focus moved to the safe default, scroll offset handled, the saved-confidence fix, and an honest fixture. Points off for defects 1, 2, 3 and 6.

Bounded visual scores, from synthetic client-component captures only:

| Surface | Score | Observed |
|---|---|---|
| AI | 6.5 | Clear current-versus-historical matrix and per-connection phone cards with a summary sentence. Overloaded glyph, unlabelled ✕, very long cards for expired and revoked grants. Approval form not seen. |
| Inventory | 5.5 | The full collection toolkit is present: modified dot, Discard, filter sheet with counts. Repeated facts, deep control stacking, cut-off strips, Phone Options unfinished. |
| Item | 7 | Strong record layout: image slot, compact actions, facts with an honest source note, pinned recap, Person/AI chips. No kind filter chips, inconsistent button styles. |

I opened all ten PNGs. `ai-phone-approval-dark` shows the Setup tab only, so I treated it as a Setup image and gave it no approval credit.

**Not shown:** public reader rendering, the approval form, the authenticated shell, responsive breakpoints in between, print, and whole-site completion.

```json
{"exactHead":"e39a165b7a5dba04dad3caa0026a1dcbd6bad251","base":"5da80247cd768f745b838584098d9e11c54cb772","captureSource":"7d1bc78e60eb5ec86efdc0c473891042e599ca51","srcConvexChangedSinceCapture":false,"authorModel":"Codex gpt-6.1-sol high","reviewerModel":"claude-opus-5-5 (Claude Opus 5.5)","blindLabel":"V","evidenceType":"source diff + ten synthetic offline client-component PNGs (Edge/Playwright fallback, devtools Geist)","sourceScore":7,"visualScores":{"ai":6.5,"inventory":5.5,"item":7,"publicReader":null,"approvalForm":null,"authenticatedShell":null,"responsiveIntermediate":null,"print":null,"wholeSite":null},"approvalImageTreatedAs":"Setup only","disposition":"conditional source pass; no visual acceptance","blockersForVisualAcceptance":["render ten public reader routes desktop+phone","rerun corrected runner and capture actual Approve panel","annotate or regenerate evidence.json with limitations and runner head"],"filesChanged":false}
```
