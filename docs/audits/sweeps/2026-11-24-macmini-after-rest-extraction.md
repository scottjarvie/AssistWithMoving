# Moving REST extraction re-sweep — 2026-11-24, macmini

Bounded read-only UI sample on the live site, using the saved default profile and one owned T3 preview tab. The signed-in shell was confirmed as a boolean. Preview reported `visible=false`; no private text, screenshots, record identifiers, media URLs, or logs were retained. The physical checkout is on the designated external drive. The driver reported PR #277 live at merge `545a9e61659bd71691504b5d04028b65077adb71` and all six REST registrations unchanged; this browser pass did not independently identify the serving deployment. The sweep branch started at `0f068a09c189fe67893f005bb599cfee9ca1bf4e`.

| Route | Settled, scoped observations |
|---|---|
| `/app/moves` | Main and heading present; an ordinary move link present; sampled error or access-refusal indicator absent. |
| `/app/moves/[moveId]` | One move reached through that link. Main, heading and ordinary navigation present; sampled error or access-refusal indicator absent. |
| `/app/items` | Main, controls, nonempty rendered content and at least one loaded image present; sampled error, access-refusal and workspace-loading indicators absent. Generic list and empty-state selectors did not establish a meaningful row or explicit empty state. |
| `/app/queue` | Main, heading, controls and nonempty rendered content present; sampled error, access-refusal and workspace-loading indicators absent. Generic list and empty-state selectors did not establish a meaningful row or explicit empty state. |

No obvious break was observed in this bounded sample. The booleans do not establish data correctness, full readiness, visual layout, or access beyond this account. No settings, forms, records, media, downloads, sharing, or write controls were exercised.

Authenticated REST remains **unverified**: an already-configured production-approved read-only key, suitable fixture, and secret-safe authorized client were not established in this thread. No credentials or configuration were inspected, and no API-key request was made. The driver's previously reported signed-out 401 and PR #277 synthetic 66-case proof are separate evidence, not results reproduced by this sweep.

The six earlier dated files were not modified. Their SHA-256 values are recorded in the matching JSON.
