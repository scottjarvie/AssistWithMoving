# Candidate P — source review fixes

Review target: `1ec0fdfcf140efa679ef78d2bfb8b9bfdffed5a5`. Author: Codex `gpt-6.1-sol` high. Independent reviewers: `gpt-6.1-sol` high and Claude `claude-opus-5-5` high. The Opus review is the different-model code review; the Sol source score is independent advice, not a substitute. Original verdicts and scores remain in `scores.json` and the two review records.

Both requested changes. Source fixes implemented locally:

1. Restore the global Add/capture action in desktop Top navigation, using the existing mounted capture component.
2. Replace native radios inside the account menu with Radix menu radio groups/items; keyboard navigation now reaches them.
3. Offset sticky section tabs below operations only on pages that actually render the operations strip.
4. On phones with task sections, the operations strip scrolls away and only task sections stay sticky. Pages without task sections retain one sticky operations strip. Description prose is outside the sticky wrapper.
5. Replace substring guessing with exact section-icon mappings; Details, Claims, Overview and Upload no longer imply AI, Queue or transport meanings by accidental spelling.
6. Print resets every semantic color role, hides phone/desktop/action chrome and temporarily removes the dark class, then restores the person's chosen appearance after printing.
7. The manager's first effect consults the initialized preference store, preserving the bootstrap choice through hydration.
8. Redundant domain illustrations are decorative; standalone gallery artwork remains labelled.
9. Phone browser theme metadata follows the device initially and the chosen appearance thereafter.
10. Settings symbol knobs no longer carry a background-colored fill onto a different surface.

Verification after these fixes: six affected component suites passed, 45 tests total; typecheck passed. Tests cover Add in Top, menu keyboard selection, original task/hash/configuration links, actual off-strip section activation, exact icon meanings, descriptive prose placement, print theme restoration, and browser metadata updates. No browser rendering or final taste acceptance is claimed. The next different-model review must cover the new exact head, including collection implementation added afterward.
