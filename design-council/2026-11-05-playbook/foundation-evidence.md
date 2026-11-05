# Foundation tranche evidence

Scope: shared appearance/navigation, semantic tokens, original SVG symbols/image slots, approved brand mark, section fallback and phone Contents. This is the first implementation tranche; it is not an every-page completion claim.

- Full lint passed, with the same existing image-worker warning as baseline.
- Typecheck passed.
- Targeted component run: 40 tests passed after preference and navigation fixes; one new section-contents test still exposed Radix activation behavior. That issue was then fixed and its focused recheck passed. Together the checks cover the six affected suites (41 tests); this is not a new full-suite pass.
- The new preference tests exercise device-following appearance, user override, independent navigation choice, live storage events, denied storage writes, and unchanged identity/value of an unfinished Queue input.
- The new contents test chooses an off-strip section through `All N`, verifies the selected panel, closes the chooser and checks for duplicate element IDs. Selection focuses the real tab after closing rather than dispatching a synthetic click that Radix ignores.
- Existing summary/navigation/page-tab tests preserve configure links, move lifecycle wording, source facts, recovery skeletons and task/hash routing. The summary mock was extended for the new Contents export; existing assertions were retained.
- Low-priority single-worker test processes were used sequentially. No Next/browser slot has been started in this tranche.
- `node --check design-council/tools/build-gallery.mjs` passed. The generator renders the actual React SVG component, reads actual app theme tokens and produces a self-contained gallery with numbered images, lightbox controls, theme selection, newest-first round sections and a last-updated stamp. Its foundation entry is explicitly a sampler, not authenticated screenshots.
- Baseline application source remains the authority for route preservation. No backend, permissions, authentication or production data changes are included.

Still required: rendered phone/desktop checks in both themes/navigation layouts; browser capability probes; full-suite/build acceptance after all work; blind design scores; exact-head different-model review; remaining page/family implementation and uncovered-family exploration. Do not treat source checks as visual acceptance.
