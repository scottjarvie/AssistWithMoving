# Moving final public sweep — 2026-11-25 UTC, macmini

Read-only live check in one owned incognito T3 preview tab, closed afterward. Preview reported `visible=false`. The coordinator reported production commit `42dc655bad173e0e15b793b7c8079d99139a7007`, successful deployment 8060833782 and both domains on the matching Ready deployment. This browser pass did not independently verify deployment identity. The external-drive checkout was accessible; audit branch baseline was `b1185f8009a524783021cf2adf7174950fe02cc4`.

| Scope | Result | Baseline comparison |
|---|---|---|
| Public routes `/`, `/about`, `/ai`, `/ai/start`, `/claims-inventory`, `/faq`, `/features`, `/mcp/guide`, `/pcs-moving`, `/privacy`, `/terms`, `/updates`, `/sign-in`, `/sign-up`, `/api` | Each reached its expected route and a heading at 1280 and at verified 390; sampled application-error text absent. | Matches the earlier public heading observations. |
| `/ai/start` | At 390, document scroll width was 470. The initial phone viewport was visually sampled; sign-in checking cleared after settling. | The 470-pixel document overflow persists from both earlier sweeps. Its cause and full-page visual impact remain unverified. |
| `/` | Initial viewport visually sampled at 1280 and 390, with no obvious overlap in those views. | Earlier baseline checked document width only. |
| `/sign-in` | Heading and an input or embedded auth surface appeared after settling; no credentials entered. | Sign-in heading was present in baseline; form readiness was not timed. |
| `/app`, `/app/queue`, `/settings/ai`, `/admin` | Each redirected the incognito visitor to sign-in. | Consistent with prior sampled gates; `/app/queue` is a new gate sample. |

Phone used the iPhone 12 Pro preset with `innerWidth=390`; desktop `innerWidth=1280`. All other public layout observations are document-width checks only, not visual checks for clipping, overlap, or internal overflow. No timing, network diagnostics, hosted OAuth, or provider-free writes were tested. No fresh signed-in production workspace was loaded: no owned already-mounted approved session was available, and product mount can update account identity state. Signed-in Queue, media and cursor behavior therefore remain unverified; parity is not claimed. No user tabs, account data, forms, or write controls were touched. Earlier reports were preserved.
