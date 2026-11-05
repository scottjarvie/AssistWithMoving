# Uncovered families ? capability contracts and composition briefs

Prepared by Codex gpt-6.1-sol high while another project owns the host slot. These are source-grounded exploration briefs, not rendered takes, council picks or completed implementations. The existing page must be captured as **now** beside three genuinely different takes for each family. All concepts use the same existing data and capabilities. Actual SVG studies, baseline captures, blind scores and Scott's picks are still required.

## Spatial planning

Source: src/components/layout-studio/plan-workspace-page.tsx. Current workspace: 72px tool palette, canvas, 260px side rail; side sections Inspect, Place, Review and Blueprint. Levels and plan identity remain separate from entity/placement selection.

Keep: Select, wall, room rectangle/polygon, openings and their kinds, features, annotation, outdoor-zone kinds, snap, keyboard shortcuts, pan/zoom/reset, units, levels, plan name/north/grid, entity and placement selection, placement X/Y/rotation/z-order, template-to-inventory links, containment and nesting, fit reports, proposal preview and selected/all acceptable operations, rejection, reviewed proposals, attributable agent batches and revert, undo/delete, example loading, and blueprint upload/position/calibration/rotation/opacity. Keep source errors, disabled/busy/read-only behavior, and all source-specific fields.

Three compositions to draw:

1. **Canvas workbench:** a wide canvas with one compact top tool strip; selected-entity Inspector is a named drawer. Place, Review and Blueprint stay one labelled step away; levels stay visible. Phone gets the canvas plus one active tool surface at a time.
2. **Survey sheet:** a dimensioned plan above a dense, explicitly linked entity/placement ledger. Selecting either highlights the same object. Inspector/Place/Review/Blueprint use the decided tabs; the workbench is organized around comparing the drawing with its factual schedule.
3. **Inspector studio:** a stable contextual editing column beside the canvas, with the chosen tool and selected record leading. Placement tray and proposal review occupy distinct tabs in that column. Phone opens the selected object's editor first and offers a named Return to plan action. This changes composition, not the edit model.

No invented automatic routing, photo-generated geometry, collaboration cursor, CAD export, cost estimate or unsupported AI operation.

## Load planning

Source: src/components/load-planner-board.tsx. Current sections: Movable units, Board, Assign and Loose items. The board shows Unassigned then resources and zones. Existing unit work includes rough-list parsing, estimates, bulk assignment, follow-up gaps and measurement routes.

Keep: every movable-unit kind, real search and all/unassigned/warnings/fragile/high-value/first-night/not-packed filters; row selection and visible-selection counts; unit/box contents; weight/dimensions/volume fields and confidence; resource and zone assignments; resource reports and capacity warnings; locked assignments, explicit include-locked control and override reason; bulk splits and selected zones; drag/drop where it exists; unassign; loose items; rough list parsing, draft selection and creation; measurement follow-ups/routes; crew and owner packets; all queries, limits, errors and busy states. Do not reclassify unknown measurements as zero.

Three compositions to draw:

1. **Manifest ledger:** the shared collection table is primary. Resource/zone capacity appears as a narrow instrument strip and opens matching records. Assignment is an in-place selection action; Board and Loose items remain named sections.
2. **Loading dock:** resources and their zones form the primary board, with a separate Unassigned intake lane. Each resource has one truthful capacity summary and its current units. A focused assignment sheet retains locks, splits and override reasons. Phone chooses one resource lane at a time.
3. **Measurement desk:** start from a grouped movable-unit list, with gaps and selected-unit measurements in a contextual pane. Resource assignment and capacity remain in a persistent destination strip. This foregrounds the existing measurement route rather than adding a new workflow; Board and bulk Assign remain one labelled step away.

No invented truck simulation, load optimization, guaranteed fit, new capacity calculation, route scheduling or automatic assignment.

## Move Day

Source: src/components/move-day-view.tsx. Current sections: Checklist, Exceptions, Progress and Offline. Existing box lookup accepts code, room, destination or status. The current live/cached list limit is 80 and discloses additional matches; preserve that truth and search access.

Keep: safe-view fields and content rules; online/offline distinction; scan/type lookup and clear; All/Ready/Staged/Loaded/Exceptions filters with truthful counts; box identity, label, contents disclosure and assignment context; Sealed, Staged, Loaded and Delivered transitions; Missing/Damaged exceptions and notes; explicit other-status correction; real-time updates; disabled offline writes; failed-action retry; cached checklist and its limits/refresh; progress counts and completion basis. Cached read-only records must never look writable or queued for sync.

Three compositions to draw:

1. **Crew checklist:** lookup and status filter above a clean vertical list. Each row has one next status action and a compact exception control; contents and corrections remain named detail surfaces. Phone emphasizes the looked-up box.
2. **Load manifest:** records group by the existing resource/zone assignment, with truthful per-group status counts. The same status and exception actions stay in-row. Unassigned remains its own visible group; phone has a resource switcher and the same checklist.
3. **Field log:** the currently selected box is the focused action surface, with its status, contents and exception note together; the searchable checklist stays adjacent on desktop and one named step away on phone. Progress, Exceptions and Offline remain the decided section strip. No fabricated event timeline.

No invented scanning hardware support, geolocation, route stops, offline mutation queue, automatic delivery or messaging to movers.

## Judging and preservation rules

Use blind labels that do not describe the intended winner. Include the current page marked now and all three synthetic takes in each family reveal. Judges score desktop and phone separately and explain capability-preservation concerns before taste. Target and cap remain the run brief's assumed 8/10 and three scored rounds per uncovered family. Opus breaks AI taste ties; Scott overrides. A preferred composition is not authorization to change access, calculations or data contracts.
