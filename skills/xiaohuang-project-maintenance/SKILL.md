---
name: xiaohuang-project-maintenance
description: Use when analyzing, modifying, auditing, or releasing the XiaoHuang Chemistry Laboratory repository, especially when a request may cross browser modules, Express APIs, SQLite data, Electron packaging, generated outputs, or the Element Battle layers.
---

# XiaoHuang Project Maintenance

## Overview

Treat this repository as one product with four runtime layers: browser UI, Express/SQLite API, Electron shell, and release tooling. Locate the owning layer before changing code; do not mistake generated output or user data for source.

## Start Every Non-trivial Task

1. Confirm the checkout root and inspect `git status --short --branch`.
2. Run `skills/xiaohuang-project-maintenance/scripts/project-inventory.sh` for a quick current map.
3. Read `references/architecture.md`; then read the task-specific section of `references/verification.md`.
4. Exclude `node_modules`, `dist`, `dist-electron`, `dist-exe`, `.electron-stage`, `server/public`, and logs from broad source searches unless the task explicitly concerns generated output.
5. Treat `server/data/` as user/runtime data. Do not modify, remove, or include it in commits unless the user explicitly names it.

If dependency folders were intentionally removed, report missing dependencies as an environment prerequisite. Do not diagnose a missing-module build failure as a source regression.

## Route the Request

| Request | Primary owners | Required reading |
| --- | --- | --- |
| Understand the project or a feature | entry points and the matching module group | `architecture.md` |
| Browser feature or UI defect | `src/main.js`, feature module, `src/api/client.js` when API-backed, matching CSS | `architecture.md`, change checklist |
| API, settings, persistence, AI, quiz, reactions, students | `server/index.js` → `server/routes/*` → `server/db/sqlite.js` / utilities | `architecture.md`, change checklist |
| Element Battle | `src/battle/index.js` plus the affected data/rules/state/actions/UI layer | `architecture.md`, battle rules below |
| Desktop package or release | `electron/main.cjs`, `electron-builder.yml`, root/server `package.json`, staging scripts | release checklist |
| Code quality or unused-file audit | source imports, package scripts, build config, Git tracking and ignore rules | audit checklist |

## Change Rules

- Preserve public contracts: frontend API calls in `src/api/client.js`, route prefixes mounted by `server/index.js`, settings keys, and release artifact names.
- Add a failing focused test before behavior changes. Use the project test command when dependencies are available.
- Keep browser data, behavior, and presentation separated: data in `src/data`, feature behavior in feature modules, styles in `src/styles`.
- In Element Battle, keep `ui.js` free of an `actions.js` import. `battle/index.js` injects actions into UI to prevent a static cycle. Put pure gameplay decisions in `rules.js`; put state transitions in `actions.js`; derive display flags in `view-model.js`.
- After asynchronous battle animation or timer work, guard against stale matches with `isCurrentModeB(state)`.
- For API-backed changes, follow a request from UI client → mounted route → DB/utility → JSON response before editing.

## Audit Rules

Classify every candidate as one of: **used source**, **generated/rebuildable**, **runtime user data**, **manual maintenance utility**, or **unverified**. Never label a file obsolete merely because it is not imported: package scripts, Electron staging, release assets, manual migration scripts, and docs can be intentional.

Report evidence: import/reference, package script, builder config, Git tracking status, or a command output. Do not delete anything during an audit.

## Release Rules

- Version root and server manifests/lockfiles together.
- Update the README download names and version history before publishing.
- Run `npm test` and `npm run build` after dependencies are installed.
- Build with `npm run dist:win` and `npm run dist:mac`; inspect artifact name, platform format, size, and checksum.
- Push the source commit before creating a GitHub Release. Upload assets to a draft, verify both assets and checksums, then publish.
- State whether packages are signed. Do not present an unsigned package as signed.

## Verification

Use the exact checklist in `references/verification.md`. If a check cannot run, name the missing prerequisite and retain the distinction between unverified and failed.

## Resources

- `scripts/project-inventory.sh` — read-only entry-point and layer inventory.
- `references/architecture.md` — runtime paths, owners, and protected/generated paths.
- `references/verification.md` — parse, change, audit, and release checklists.
