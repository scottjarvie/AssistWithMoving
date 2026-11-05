I've finished the read-only source review of the foundation tranche, covering `53dba5d..1ec0fdf`. `git rev-parse HEAD` confirms `1ec0fdfcf140efa679ef78d2bfb8b9bfdffed5a5`. My result is **changes requested**: one high-severity capability loss and several medium defects need fixing before this tranche can be accepted. This is source-only evidence. Nothing was run in a browser, so visual acceptance and the taste verdict stay unverified.

## Findings

**1. High: choosing Top navigation removes the desktop "Add" action** (`src/components/app-shell.tsx:56-67`, `src/app/globals.css:158-163`)
- At ≥1024px the "Add" button (`MobileCaptureAction variant="sidebar"`, line 66) lives only inside `.workspace-side-navigation`.
- Top mode hides that sidebar entirely. The phone bottom bar is `lg:hidden`, so on desktop with Top selected there is no way to open the Add sheet.
- This breaks playbook §2.1 ("no cheating") and the design doc's promise that "both use identical destinations".
- **Fix:** render `<MobileCaptureAction variant="sidebar" />`, or a compact icon version, at the right end of the `.workspace-top-navigation` bar.
- **Fix:** add a test that in Top mode the "Add" button can still be found by role.

**2. Medium: sticky section tabs leave a see-through gap on pages without the move operations strip** (`src/components/move-workspace-tab-list.tsx:48`)
- The sticky offset always adds room for the operations strip (+3.25rem, or +2.75rem at `sm`).
- `inventory-page`, `overview-page`, `photos-page` and `spaces-page` pass `sticky` but never render `MoveOperationsNav`.
- On those pages the tabs stick about 44–52px below the header, and content scrolls visibly through the gap.
- **Fix:** make the extra offset opt-in (for example `sticky="below-operations"`, or a `--moving-operation-strip-height` variable set only when the strip is present). Otherwise default to `top-(--workspace-navigation-offset)`.

**3. Medium: too much fixed chrome on phones** (`move-workspace-tab-list.tsx:48` and `:103`; `move-operations-nav.tsx:101`)
- On a phone the stack is: 64px header + about 54px operations strip + about 60px tab strip + the active tab's description (it sits inside the sticky wrapper) + the 60px bottom nav.
- That is roughly 260–300px, or 40–50% of a 568–667px screen.
- §5 says "phones not shrunk desktops". The playbook asks for one sticky strip, not two plus prose.
- **Fix:** move the description `<p>` outside the sticky wrapper.
- **Fix:** below `sm`, keep only the section tab strip sticky. Let the operations strip scroll away; phone Contents and "All N" still reach every section.

**4. Medium: several section icons claim the wrong meaning, including false "AI" marks** (`move-workspace-tab-list.tsx:20-29`)
The unanchored substring matching produces these:

| Tab | Matched text | Icon shown |
|---|---|---|
| `details` (Configure) | "ai" in d-et-**ai**-ls | AI |
| `claims` (Packets) | "ai" in cl-**ai**-ms | AI |
| `overview` (Sell) | "review" | Queue |
| `upload` (Photos) | "load" | Truck |

§2.3 reserves icons for meaning such as you versus which AI, so a false AI mark is a real problem.
- **Fix:** look icons up by exact value (`Record<string, MovingSymbolName>`), or require `icon` on each tab and fall back to `note`.
- **Fix:** add a test asserting `details` and `claims` do not get the AI icon.

**5. Medium: the display controls inside the account menu can't be used from the keyboard** (`src/components/account-menu.tsx:159`)
- The radio buttons sit inside a Radix `DropdownMenuContent`. That menu blocks Tab and runs its own arrow-key and typeahead handling, and the radios are not menu items, so keyboard users can't reach them.
- This duplicates the header popover (`app-shell.tsx:50`), which does work.
- **Fix:** remove the panel from the account menu, or rebuild it with `DropdownMenuRadioGroup`/`DropdownMenuRadioItem`.

**6. Low–Medium: printing in dark mode or Top mode leaves chrome and pale colours on paper** (`globals.css:173-177`)
- The print block resets only part of the colour palette. The dark accent (`#efad73`), evidence (`#9dc5d7`), success, warning, popover, secondary, input and sidebar colours carry onto white paper.
- The `.dark` class also stays on the page, so `dark:` styles still apply.
- Several interactive parts still print: the phone bottom bar (print widths are usually under 1024px, so `lg:hidden` doesn't hide it), `.moving-operation-strip`, and the "All N" and Contents buttons.
- **Fix:** repeat the full light colour set inside the print block.
- **Fix:** add a class to the bottom bar and hide it, `.moving-operation-strip` and `[data-moving-sections] button[aria-label^="All"]` when printing.

**7. Low: the theme detection relies on React timing** (`src/components/display-preferences.tsx:43-52`)
- During hydration the manager's effect runs first with the default settings (System, Side). The bootstrap script's correct state is briefly overwritten, then put back by the follow-up render.
- It probably happens within one frame, but that is unverified.
- **Fix:** call `snapshot()` inside the effect, or skip the first effect until hydration finishes.

**8. Low: decorative illustrations are announced to screen readers** (`src/components/moving-symbol.tsx:32`, `ui/data-table.tsx:116`, `move-summary-page.tsx:210`)
- `role="img"` plus a label means every empty table announces "Packing box illustration".
- **Fix:** add a `decorative` prop that sets `aria-hidden` and use it in both places.

**9. Low: phone browser bar stays dark in light mode** (`src/app/layout.tsx:57`)
- `themeColor: "#151411"` is fixed, so the browser bar on phones stays dark in light mode.
- **Fix:** use two media-specific `themeColor` entries (light/dark).

**10. Nit:** the `settings` symbol fills its knobs with `var(--background)`, so they show as rectangles on card, popover or accent backgrounds. Use `fill="none"` or `currentColor` cut-outs.

## What holds up
- **Baseline capability retention:** every operation link (Summary, Configure, Load Plan, Plan, Move Day, Packets, Queue) and every tab is kept.
- **Section navigation:** "All N" sits outside the scrolling strip, as §3.2 asks. Choosing from Contents works with Radix's activate-on-focus tab behaviour, and focus returns properly.
- **Phone Contents:** the two-column list on the move summary page matches §3.2.
- **Stored preferences:** validated against bad values, survive storage being refused, and stay in sync across tabs.
- **SSR:** `suppressHydrationWarning` covers the bootstrap's class change. The CSP already allows inline scripts.
- **Brand mark:** `next/image` serves `.svg` without optimisation automatically. The approved `src/app/icon.svg` master is preserved.
- **Gallery:** rendered from the real colour tokens and SVG components. It is honestly labelled as a sampler, sorted newest first, and the lightbox is a modal `<dialog>`. Its source stamp (368e177) matches HEAD for `src`.

```json
{
  "exactHead": "1ec0fdfcf140efa679ef78d2bfb8b9bfdffed5a5",
  "implementationBase": "53dba5d47d8d700905aecfe1a2e559cb64cb1b73",
  "reviewerModel": "claude-opus-5-5 (Claude Opus 5.5)",
  "blindLabel": "P",
  "evidenceType": "source-only",
  "rubric": {
    "capabilityRetention": 6,
    "playbookSkeletonConformance": 7,
    "sectionNavigationAndContents": 7,
    "accessibilityAndFocus": 6,
    "preferenceStorageAndSSR": 8,
    "responsivePhoneRisk": 5,
    "printBehavior": 5,
    "iconAndMetadataSemantics": 5,
    "tokenSystemAndDarkModeSafety": 8,
    "galleryGeneratorAndHtml": 8,
    "visualHierarchy": null,
    "brandFlairAndTaste": null,
    "renderedContrastOnCompositedSurfaces": null,
    "phoneAndDesktopRenderedLayout": null
  },
  "overallSourceScore": 6.5,
  "visualVerdict": "unverified",
  "disposition": "changes-requested",
  "blockingFindings": [
    "High: Top navigation drops the desktop Add/capture action (app-shell.tsx:56-67)",
    "Medium: sticky tab offset gap on pages without MoveOperationsNav (move-workspace-tab-list.tsx:48)",
    "Medium: stacked sticky chrome on phone (move-workspace-tab-list.tsx:48,103; move-operations-nav.tsx:101)",
    "Medium: false AI/queue/truck section icons from substring regex (move-workspace-tab-list.tsx:20-29)",
    "Medium: preference radios inside Radix DropdownMenu are keyboard-unreachable (account-menu.tsx:159)"
  ],
  "notes": "Bounded foundation tranche only; every-page work intentionally in progress and not judged. No browser, Next, or full-suite checks were run by this reviewer."
}
```
