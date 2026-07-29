# Architecture Map

## Runtime Paths

| Layer | Entry | Responsibility |
| --- | --- | --- |
| Browser | `index.html` → `src/main.js` | Tab shell, initialization, active-panel lifecycle |
| Browser API client | `src/api/client.js` | Calls `/api/*` from browser features |
| Express | `server/index.js` | Static files, CORS, API mounts, server startup |
| Persistence | `server/db/sqlite.js`, `server/db/init.sql` | sql.js initialization and SQLite access |
| Desktop | `electron/main.cjs` | Embedded Express lifecycle, desktop window, userData directory |
| Release | root/server `package.json`, `electron-builder.yml`, `scripts/stage-electron-server.js` | Vite build, server staging, Electron packages |

## Browser Feature Ownership

| Feature | Main modules | Data / presentation |
| --- | --- | --- |
| Periodic table | `periodic-table.js` | `data/elements.js`, `data/electronConfigs.js`, periodic/detail styles |
| Molecules and reactions | `src/molecule/` package (`list.js`, `viewer3d.js`, `ai.js`, `reactions.js` + `index.js` façade); flat `molecule-*.js` / `molecule3d.js` are deprecated re-exports | `data/molecules.js`, `data/substance-cards.js`, molecule styles |
| Calculation | `molar-ui.js`, `molar.js`, `equation-balance.js` | molar styles |
| Electron arrangement | `electron-list.js`, `electron-renderer.js` | `data/electron-configs.js`, electron styles |
| Classroom | `ai-classroom.js` shell + `ai-classroom/*` (quiz-model / quiz-views / quiz-shell, lab-shell, balance-shell, …), `classroom-rollcall.js` | `data/chem-topics.js`, `data/lab-scripts.js`, classroom styles (`_ai-classroom.css`, `_classroom-extra.css`, `_balance-script.css`) |
| Settings/theme | `settings.js`, `theme/catalog.js`, `theme/apply.js` | theme tokens and skins |
| Element Battle | `element-battle.js` → `battle/index.js` | `data/battle-cards.js`, `styles/_element-battle.css` → `_element-battle/*.css` |

`src/main.js` owns feature initialization and tab transitions. Do not create a second tab orchestrator inside a feature module.

## Panel HTML growth

New feature panels default to an empty (or near-empty) `#panel-*` shell in `index.html`, with markup filled at runtime (Element Battle pattern: `#panel-battle` + `battle/html.js` / UI render). Do not add multi-hundred-line static trees to `index.html` for new features; keep large section HTML in module templates or render helpers.

## Element Battle Layers

| Layer | Files | Responsibility |
| --- | --- | --- |
| Data/constants | `data/battle-cards.js`, `battle/constants.js` | Element cards, dimensions, limits |
| Pure rules | `battle/rules.js` | Deck, comparison, draw/reshape, AI choice helpers |
| State | `battle/state.js` | Current match singleton and timer handles |
| Actions | `battle/actions.js` | Player/AI transitions, effects orchestration |
| View model | `battle/view-model.js` | State-derived UI flags |
| Templates/UI | `battle/html.js`, `battle/ui.js` | HTML, DOM binding, partial patching |
| Feedback | `battle/feedback.js`, `battle/fx.js`, `battle/sfx.js` | Toast, animation, audio |

`battle/index.js` calls `setBattleActionHandlers(...)`. Do not restore a direct `ui.js` → `actions.js` import. A new match replaces `ui.modeB`; async action work must check `isCurrentModeB(state)` before later writes.

## Backend Boundaries

`server/index.js` mounts `/api/molecules`, `/api/settings`, `/api/ai`, `/api/quiz`, `/api/offline-quiz`, `/api/reactions`, `/api/students`, `/api/mastery`, `/api/lesson-packs`, `/api/labs`, and `/api/balance-scripts`. Route modules use `server/db/sqlite.js` and domain utilities. Built-in data enters through `seed/import-builtin.js` and `seed/import-reactions.js` during startup.

Services live under `server/services/`:

| Area | Path | Role |
| --- | --- | --- |
| AI | `server/services/ai/*` | Chat, quiz generation, chemistry helpers (`chat-service`, `quiz-service`, `chemistry-service`, …) |
| Quiz | `server/services/quiz/*` | Session lifecycle and wrong-book (`sessions`, `wrong-book`) |

Quiz table DDL is owned by `server/db/ensure-quiz-schema.js`.

`server/public/` is a generated copy of root `dist/`, made by `server/scripts/copy-frontend.js`. It is served by Express and packaged for Electron, but it is not the source frontend.

## Protected and Generated Paths

| Path | Classification | Rule |
| --- | --- | --- |
| `server/data/` | Runtime/user SQLite data | Never alter without explicit user approval and backup plan |
| `dist/`, `server/public/` | Frontend output | Rebuild, do not hand-edit |
| `.electron-stage/` | Packaging staging | Rebuild, do not commit |
| `dist-electron/`, `dist-exe/` | Release output | Publish or retain externally; do not commit |
| `node_modules/`, `server/node_modules/` | Dependencies | Reinstall, do not audit as source |
| `public/` | Source assets | Trace references before removal |

## Desktop and Release Flow

`npm run dist:win` / `npm run dist:mac` → server `build:frontend` → Vite `dist/` → copy to `server/public/` → `stage-electron-server.js` → `electron-builder.yml` → `dist-electron/`. Electron starts the staged server and loads its local URL.
