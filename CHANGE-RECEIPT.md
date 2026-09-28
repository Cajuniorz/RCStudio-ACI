# RCStudio change receipt

The existing RCStudio page now uses the Cenviq Rc design name and the verified dark palette. It keeps the current left tools, center Three.js viewport, right results, and bottom tables. The standalone beam page remains at `beam-design.html` and is labeled as a partial flexure check under ACI 318-25.

The earlier `outputs/Cenviq-Rc-design-proposal` layout reference is superseded. The product target remains `outputs/RCStudio` on the primary local app at port 8765.

The model viewport now has a plan view with levels derived from finite existing node coordinates. Plan drawing uses a top-down orthographic camera, filters the display to the selected level, snaps both ends to existing nodes, previews the endpoints, and adds one validated beam when the pointer is released. It rejects same-node, zero-length, reversed duplicate, cross-level, and collinear-intermediate-node attempts. It does not create nodes or split members automatically. Plan view and tools are transient UI state; no project fields or storage schema were added. Model edits still pass through the existing mutation, history, autosave, and result invalidation path.

Files changed:

- `static/index.html` — Cenviq Rc design branding, scoped beam link, and plan controls.
- `static/style.css` — verified dark palette plus controls for view and drawing tools.
- `static/beam-design.html` and `static/beam-design.css` — branding, partial-check scope, and dark palette.
- `static/app.js` — plan camera, level filtering, picking, preview, cancellation, and beam commit integration.
- `static/plan.js` — pure level grouping, plan snapping, and endpoint validation helpers.
- `tests/plan.test.mjs` — regression cases for levels, snapping, endpoint rejection, and input immutability.

Validation completed on this patch:

- `node --check static/app.js` — exit 0.
- `node --check static/plan.js` — exit 0.
- `node tests/plan.test.mjs` — exit 0.
- `node tests/test_units.mjs` — exit 0.
- Python engine, project schema, and building files were not changed; their pre-patch SHA256 snapshots match. The parent task reported the existing 36-test Python regression suite passing before this patch; it was not rerun here.

The parent task owns browser acceptance on the isolated same-app origin at port 8767, preserving the primary project at port 8765. Browser acceptance for this patch is pending. In particular, confirm 3D/plan switching, level selection with overlapping XZ coordinates, successful drawing with existing endpoint IDs and the current b/h values, rejected draws without history entries, view switching with results retained, commit invalidating results, one-step Undo, and save/open roundtrip.

Backups and rollback:

- Pre-plan app and backend baseline: `H:\Codex\2026-09-28\new-chat-2\work\plan-backup\original` with hashes in `sha256-before-plan.json`.
- Post-theme HTML/CSS snapshot: `H:\Codex\2026-09-28\new-chat-2\work\plan-backup\after-theme`.
- Original theme files: `H:\Codex\2026-09-28\new-chat-2\work\rcstudio-theme-plan-backup\theme`, with original hashes in `original-sha256.json`.
- To roll back the plan patch, restore `static/app.js` from the pre-plan backup and remove `static/plan.js` and `tests/plan.test.mjs`; restore `static/index.html` and `static/style.css` from the post-theme snapshot to keep the theme. To roll back the theme too, restore the four originals from `work/rcstudio-theme-plan-backup/theme`.

No engine formulas, engineering category colors, API behavior, or project schema were changed. The plan drawing tool remains limited to the model's existing node graph, and the beam-design page remains a partial section flexure check rather than a full beam or building design check.

