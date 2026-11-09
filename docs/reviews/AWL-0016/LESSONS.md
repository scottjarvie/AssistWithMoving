# AWL-0016 — audit lessons applied to Moving

This supplements the initial builder evidence. The PR remains draft; no merge,
deployment, production sign-in or data mutation is authorized by this update.

| Lesson                             | Moving application                                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — AI cannot clear input          | Shared work-command guard refuses flagged AI writes. REST rejects clear fields explicitly. Public browser edits require the existing person-session proof; the legacy capture adapter preserves its independent flag.                                         |
| 2 — pill/tab agree                 | Both include every flagged, non-archived item, including Answered and legacy capture review records.                                                                                                                                                          |
| 3 — no rule/count cap              | Dismissed-before checks use exact indexed keys and preserve dismissal history after reopen. Counts have no application page cap; regressions exceed 500 and 600 rows. Bounded maintenance advances across batches rather than treating one batch as complete. |
| 4 — cheap, fail-soft nav           | Nav uses a dedicated query over matching indexed flags and open suggestions, not the Queue body or review tables. A local error boundary omits an unavailable badge without breaking navigation.                                                              |
| 5 — release claim, keep state      | Asking or failing without retry drops claim identity and lease while retaining the lifecycle state. A person answer allows a fresh claim on an unclaimed Working item. Recovery drains older flagged/archived leases and skips absent leases.                 |
| 6 — filter before limits           | Open suggestions and archived work are excluded before pagination/limits in work, entity and overview reads. Owner reach is applied before the legacy list limit.                                                                                             |
| 7 — AI-addressed copy              | Server instructions and plain-text guides tell the AI that only the person accepts/dismisses and that it may withdraw its own untouched suggestion. Human-facing wording stays addressed to the person.                                                       |
| 8 — preserve AWL-0015              | No grant-policy algorithm is changed in this follow-up. Added coverage verifies that old narrowed connections receive a new power unless it was explicitly removed, and that existing removed powers stay removed.                                            |
| 9 — optional From link             | Invalid/mismatched context is omitted; deleted or moved references are rechecked when reading. The Queue item and replay remain available.                                                                                                                    |
| 10 — withdrawal history            | Withdraw already used the same Queue activity and audit service as other decisions. Added assertions verify the attributed history and audit receipt.                                                                                                         |
| 11 — no hiding a flag              | An AI archive/withdraw attempt on a flagged item is refused with “Only the person can clear Needs your input”. This includes generic REST archive fields.                                                                                                     |
| 12 — person action survives reopen | The permanent first-person-action timestamp is set by accept/edit, dismiss or reply and preserved by archive/reopen. Withdraw checks it before replay; tests cover dismiss → reopen → refused withdraw and an older accepted suggestion receiving a reply.    |
| 15 — narrowed read reach | Moving narrows by move. New suggestion lists, reasons, counts and accepted-work reads are exercised across all four suggestion lifecycles with a connection limited to one move. Legacy reads recheck that connection before reading/paginating. |
| 16 — website person session | All public Queue and capture reads/writes require the existing session-bound person proof. Direct AI-token identities are refused even with full tool grants or a session-shaped sid; actual website person identities still read and decide. See FOLLOW-UP.md for the auth configuration and runtime proof boundary. |

No row migration is introduced. Optional capture-flag fields and indexes extend
the existing read-time compatibility layer. The latest full offline suite passed
(226 files / 1,569 tests), with focused audit checks (3 files / 45 tests)
including lessons 15 and 16. Root and strict backend TypeScript, five
backend-configuration tests, lint (one existing warning), the 159-module binding
check, the 100-tool AI policy check and generated Project Philosophy check passed.
