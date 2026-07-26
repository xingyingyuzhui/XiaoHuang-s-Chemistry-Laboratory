# Task Checklists

## Parse / Onboard

1. Run `skills/xiaohuang-project-maintenance/scripts/project-inventory.sh`.
2. Read the matching feature row in `architecture.md` and trace from its browser or server entry point.
3. State the inspected files, request/data path, and paths not inspected.
4. Separate tracked source from ignored generated output.

## Change

1. Identify the owner layer and public contract before editing.
2. Add a focused failing test for changed behavior; then implement the minimum fix.
3. Run `npm test`; run `npm run build` when dependencies exist.
4. For browser work, smoke the exact UI path. For API work, exercise the mounted endpoint and expected response.
5. For battle work, exercise playability, FLIP, draw/pass, stale async work, AI handoff, and end state when affected.

## Audit / Optimize

1. Start read-only; check `git status --short --branch`.
2. Trace candidates with imports, package scripts, `electron-builder.yml`, `server/index.js`, and Git tracking/ignore status.
3. Label findings: used, generated, runtime data, manual utility, or unverified.
4. Run tests/build only if dependencies are present; otherwise report the prerequisite.
5. Do not remove files or change dependencies unless the user asks to implement a cleanup.

## Release

1. Confirm working tree scope and intended version.
2. Update root and server manifest/lockfile versions and README release references.
3. Run `npm test` and `npm run build` with installed dependencies.
4. Build Windows and macOS packages; record artifact names, sizes, and SHA-256 values.
5. Commit and push source first. Create a draft GitHub Release, upload each asset, compare server digests to local values, then publish.
6. Verify final release URL, two expected assets, release visibility, and remote `main` commit.
