# Candidate T correction record

Reviewed head: `a7185089b824024195caa537683449bc8d59933e`. Author: Codex gpt-6.1-sol high. Independent judges: Codex gpt-6.1-sol high (8.4, changes requested) and Claude Opus 5.5 high (8.2, approve with followups). Both reviews are source-only. The Opus report discloses one incidental grep result from an earlier review; that disclosure is retained verbatim.

Corrections implemented:

- Capture a stable built-in view baseline after the stored or initial phone presentation is available. Presentation-only edits now compare against that baseline; Discard restores it and returns focus to a persistent control.
- Add update, rename and named deletion confirmation for actual browser-local saved views, sharing the persistence/event/session-fallback path.
- Normalize implicit visible columns before snapshot comparison so hide/show reversion does not leave a false modified dot.
- Compare editable measurement values and estimate flags rather than transient confidence state that submission does not send.
- Keep the related-history status region mounted before its text changes.
- Use one phone view strip plus a pinned all-views chooser. Built-in state selection retains current presentation, sort and columns while applying its actual filter state.
- Label the filter control and selected count explicitly; use Unassigned for a missing owner and distinguish unavailable owner records without exposing internal identifiers.

Regression coverage passed for these paths. TypeScript and focused lint passed. Seven affected suites passed 59 tests across bounded runs: the first run passed five suites; new measurement and AI test cases initially used incomplete Radix click simulation and an incorrect estimate selector. Corrected actual pointer interactions and field-specific selectors passed the two affected suites (27 tests), with the final measurement selector correction passing all 16 item tests. These results do not establish a green full suite or rendered acceptance. The next substantive tranche also introduces the decided AI settings matrix, with the existing server grant contract and person-confirmed approval/revocation intact.
