# Structure Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce structural debt in classroom, API routes, molecule, and megastyle/HTML shells without changing product behavior — ship each phase as an independently mergeable refactor.

**Architecture:** Reuse proven islands already in-tree: `src/battle/` (layered feature package + dependency injection), `src/ai-classroom/{lab,balance}-{model,views,shell}.js` (model/views/shell), and `server/services/ai/*` (route → service). Do not invent a second tab orchestrator; keep `src/main.js` as the only tab shell. Prefer move/extract over rewrite; lock seams with `test/module-boundaries.test.cjs` and focused contract tests.

**Tech Stack:** Vanilla ES modules (Vite), Express + sql.js, Node test runner (`npm test`), existing CSS token/skin pipeline.

**Source review:** Structure quality canvas + explore of `src/` and `server/` on `main` @ v3.0.6.

**Out of scope:** New product features; Electron packaging changes; hand-editing `dist/` / `server/public/` / `server/data/`; deleting mega seed content (may relocate later, not this plan).

**Phase map (ship independently):**

| Phase | Theme | Exit gate |
| --- | --- | --- |
| P0 | Classroom quiz extraction | `ai-classroom.js` is nav host only; quiz in `quiz-*` modules |
| P1 | Backend layering | DDL centralized; AI/quiz routes thin; `architecture.md` mounts match `index.js` |
| P2 | Molecule island | `src/molecule/` package; `main.js` still dynamic-imports the façade |
| P3 | Presentation shells | CSS split for battle/classroom; stop growing `index.html` for new panels |

---

## File map (target end state)

### P0 — Classroom quiz

| Path | Role |
| --- | --- |
| `src/ai-classroom.js` | Sub-nav host only: `AI_SECTIONS`, `selectSection`, wire controllers |
| `src/ai-classroom/quiz-model.js` | Create: paper/session state, generate/submit/summary orchestration (no DOM) |
| `src/ai-classroom/quiz-views.js` | Create: `renderPaper` / `renderResultList` HTML builders |
| `src/ai-classroom/quiz-shell.js` | Create: DOM bind, hint/explain handlers, view switching |
| `src/ai-classroom/quiz-config.js` | Keep: config UI controller |
| `test/module-boundaries.test.cjs` | Assert quiz internals imported from package, not inlined in entry |

### P1 — Backend

| Path | Role |
| --- | --- |
| `server/db/schema-quiz.js` (or extend `init.sql` + `ensureQuizSchema()`) | Create: single owner for quiz_sessions / quiz_items / quiz_wrong_book DDL+ALTER |
| `server/services/quiz/` | Create: session / wrong-book domain ops used by `routes/quiz.js` & offline paths |
| `server/services/ai/quiz-service.js` | Create: prompts + generate/hint/explain/score/summary logic |
| `server/services/ai/chemistry-service.js` | Create: tip/reaction/stoich/lab/balance prompt+parse |
| `server/routes/quiz.js`, `offline-quiz.js`, `ai/quiz.js`, `mastery.js` | Call shared `ensureQuizSchema()` (quiz tables + `source_type` only) |
| `server/routes/ai/chemistry.js` | Thin HTTP → chemistry-service (no quiz DDL) |
| `server/routes/lesson-packs.js` | Leave own `lesson_packs` DDL in place this plan (not quiz duplication) |
| `skills/xiaohuang-project-maintenance/references/architecture.md` | Sync `/api/*` mount list |

### P2 — Molecule island

| Path | Role |
| --- | --- |
| `src/molecule/index.js` | Create: façade (`initMoleculeList`, AI, reactions exports) |
| `src/molecule/list.js` | Move from `molecule-list.js` |
| `src/molecule/viewer3d.js` | Move from `molecule3d.js` |
| `src/molecule/ai.js` | Move from `molecule-ai.js` |
| `src/molecule/reactions.js` | Move from `molecule-reactions.js` |
| `src/main.js` | `import('./molecule/index.js')` (or keep thin root re-exports temporarily) |
| Root `src/molecule-*.js` | Thin re-exports for one release, then delete |

### P3 — CSS / HTML

| Path | Role |
| --- | --- |
| `src/styles/_element-battle.css` | Split into `_element-battle/{base,hand,board,fx}.css` or partials imported from one entry |
| `src/styles/_ai-classroom.css`, `_classroom-extra.css`, `_balance-script.css` | Ownership map matching `ai-classroom/*` modules |
| New panels | Prefer runtime HTML like battle (`#panel-*` empty + inject); do not grow `index.html` |

---

## Guardrails (every phase)

1. Behavior-neutral: no intentional UX/API contract changes. If a bugfix is interleaved, call it out in the commit message separately.
2. Run `npm test` before each phase commit; run `npm run build` at phase end.
3. Smoke with running Vite (`http://localhost:5173`) + Express (`:3000`): affected tabs only.
4. Do not modify `server/data/`, `dist/`, `server/public/` by hand.
5. Keep battle cycle rule: never restore `ui.js` → `actions.js` static import.

---

### Task 1: Phase lock-in tests (P0 prelude)

**Files:**
- Modify: `test/module-boundaries.test.cjs`
- (Later tasks make these pass)

- [ ] **Step 1: Add failing boundary expectations for quiz extraction**

Append tests that encode the P0 end state (will fail until Task 3–4 land):

```js
test('AI classroom quiz engine lives under ai-classroom/quiz-* modules', () => {
  const entry = source('src/ai-classroom.js');
  assert.match(entry, /from '\.\/ai-classroom\/quiz-shell\.js'/);
  assert.ok(fs.existsSync(path.join(root, 'src/ai-classroom/quiz-shell.js')));
  assert.ok(fs.existsSync(path.join(root, 'src/ai-classroom/quiz-model.js')));
  assert.ok(fs.existsSync(path.join(root, 'src/ai-classroom/quiz-views.js')));
  // Entry must not still define the paper renderer inline
  assert.equal(/function renderPaper\(/.test(entry), false);
  assert.equal(/function renderResultList\(/.test(entry), false);
  assert.equal(/async function generateQuiz\(/.test(entry), false);
});
```

- [ ] **Step 2: Run focused test — expect FAIL**

Run: `node --test test/module-boundaries.test.cjs`

Expected: FAIL on new quiz-engine assertions; existing tests still PASS.

- [ ] **Step 3: Do not commit red on `main`.** Keep the new assertions in the working tree until Task 4 turns them green, then commit test + extraction together (or a single P0 PR).

---

### Task 2: Extract quiz-views (pure HTML builders)

**Files:**
- Create: `src/ai-classroom/quiz-views.js`
- Modify: `src/ai-classroom.js` (temporarily import views; delete local HTML fns after)

- [ ] **Step 1: Copy `escapeHtml`, `renderPaper`, `renderResultList` (and any pure helpers they need) into `quiz-views.js` as named exports**

Keep signatures equivalent. Export:

```js
export function escapeHtml(s) { /* same */ }
export function renderPaper(/* same args as today */) { /* same body */ }
export function renderResultList(/* same args */) { /* same body */ }
```

Read current functions from `src/ai-classroom.js` (~468–797) for exact bodies — do not invent new markup.

- [ ] **Step 2: Switch `ai-classroom.js` to import those exports; delete local duplicates**

- [ ] **Step 3: Smoke** — open Classroom → 课堂测验 → generate paper (or open existing config). Paper HTML must match previous structure (class names, data attributes).

- [ ] **Step 4: Commit**

```bash
git add src/ai-classroom/quiz-views.js src/ai-classroom.js
git commit -m "$(cat <<'EOF'
refactor(classroom): extract quiz HTML builders to quiz-views

EOF
)"
```

---

### Task 3: Extract quiz-model (API + state, no DOM)

**Files:**
- Create: `src/ai-classroom/quiz-model.js`
- Modify: `src/ai-classroom.js`

- [ ] **Step 1: Move non-DOM quiz logic into `quiz-model.js`**

Belong here: paper/session fields, `generateQuiz` fetch orchestration, `submitPaper`, `runSummary`, hint/explain fetch helpers, rate-limit detection, markdown export data shaping (`exportQuizMarkdown` body without DOM).

Inject what the entry currently closes over: at minimum `aiApi` / `quizApi` from `./api/client.js`, plus config getters from `quiz-config` and status/toast callbacks (`setStatus`, `showAppBubble`, `appAlert` as needed). Do not import DOM controllers into the model.

Preferred shape (adapt to existing state names):

```js
export function createQuizModel({ aiApi, quizApi, getConfig, onStatus }) {
  let paper = null;
  // generate / submit / summary / hint / explain as methods
  return { getPaper, generate, submit, summary, fetchHint, fetchExplain, exportMarkdown };
}
```

- [ ] **Step 2: Wire model from `ai-classroom.js`; keep DOM handlers calling model**

- [ ] **Step 3: Run `npm test` — existing classroom/API tests must PASS**

- [ ] **Step 4: Commit**

```bash
git add src/ai-classroom/quiz-model.js src/ai-classroom.js
git commit -m "$(cat <<'EOF'
refactor(classroom): extract quiz domain logic to quiz-model

EOF
)"
```

---

### Task 4: Extract quiz-shell; slim entry to nav host

**Files:**
- Create: `src/ai-classroom/quiz-shell.js`
- Modify: `src/ai-classroom.js`
- Modify: `test/module-boundaries.test.cjs` (already red from Task 1)

- [ ] **Step 1: Move quiz DOM lifecycle into `createQuizShellController({ root, model, ... })`**

Belong here: `showView`, hint/explain button handlers, paper event binding, result list actions, back-to-config. Follow patterns in `lab-shell.js` / `quiz-config.js`.

- [ ] **Step 2: `ai-classroom.js` only: sections nav + `selectSection` + constructing controllers (quiz/lab/balance/…)**

Target: entry well under ~350 LOC; no `function renderPaper` / `generateQuiz`.

- [ ] **Step 3: Run boundary test — expect PASS**

Run: `node --test test/module-boundaries.test.cjs`

- [ ] **Step 4: Full `npm test` + smoke Classroom quiz full path (config → generate → hint → submit → summary)**

- [ ] **Step 5: Commit**

```bash
git add src/ai-classroom/quiz-shell.js src/ai-classroom.js test/module-boundaries.test.cjs
git commit -m "$(cat <<'EOF'
refactor(classroom): move quiz UI lifecycle into quiz-shell

EOF
)"
```

**P0 exit:** `ai-classroom.js` is composition/nav only. Do **not** further split `balance-shell.js` / `lab-shell.js` in P0 (stop feeding them; schedule later if needed).

---

### Task 5: Centralize quiz schema (P1 start)

**Files:**
- Create: `server/db/ensure-quiz-schema.js` (name may vary; one module)
- Modify: `server/routes/quiz.js`, `server/routes/offline-quiz.js`, `server/routes/ai/quiz.js`, `server/routes/mastery.js` (ALTER path only)
- Modify: `server/db/init.sql` if columns are missing from canonical schema
- Test: `test/server-api-contracts.test.cjs` (extend) or new `test/quiz-schema.test.cjs`

- [ ] **Step 1: Write failing test that loads ensure-schema twice and asserts tables exist idempotently**

```js
// sketch — adapt to how tests boot sqlite today
test('ensureQuizSchema is idempotent', () => {
  ensureQuizSchema();
  ensureQuizSchema();
  // assert quiz_sessions / quiz_items / quiz_wrong_book present
});
```

- [ ] **Step 2: Implement `ensureQuizSchema()` with the UNION of CREATE/ALTER currently copied across routes (including `source_type`)**

- [ ] **Step 3: Replace inline DDL in routes with a single `ensureQuizSchema()` call (module load or first request — match existing “call at top” style)**

- [ ] **Step 4: `npm test` + smoke: online quiz session create, offline quiz submit, wrong-book list

- [ ] **Step 5: Commit**

```bash
git add server/db server/routes test
git commit -m "$(cat <<'EOF'
refactor(server): centralize quiz DDL ownership in db layer

EOF
)"
```

---

### Task 6: Thin AI quiz + chemistry routes via services

**Files:**
- Create: `server/services/ai/quiz-service.js`
- Create: `server/services/ai/chemistry-service.js`
- Modify: `server/routes/ai/quiz.js`, `server/routes/ai/chemistry.js`
- Keep: `server/services/ai/chat-service.js`, `response-parser.js` as transport/parse only

- [ ] **Step 1: Move system prompts + scoring/normalization from `routes/ai/quiz.js` into `quiz-service.js`; route handlers become validate → service → `success/error`**

Preserve HTTP status codes (especially 429 + `data.resetLabel` shape expected by `src/api/client.js`).

- [ ] **Step 2: Same for `chemistry.js` → `chemistry-service.js` (tip/reaction/stoich/lab/balance)**

- [ ] **Step 3: Add/extend API contract tests if present; else smoke each AI endpoint that CI already covers via `server-api-contracts`

- [ ] **Step 4: Commit**

```bash
git add server/services/ai server/routes/ai
git commit -m "$(cat <<'EOF'
refactor(server): extract AI quiz/chemistry logic into services

EOF
)"
```

---

### Task 7: Thin `routes/quiz.js` domain SQL (optional within P1)

**Files:**
- Create: `server/services/quiz/sessions.js` (and wrong-book helper if needed)
- Modify: `server/routes/quiz.js`

- [ ] **Step 1: Move session create / stats / wrong-book mutations into service functions that take `db` run/get helpers**

- [ ] **Step 2: Route file should be Express wiring + status mapping only**

- [ ] **Step 3: `npm test` + smoke wrong-book attempt path

- [ ] **Step 4: Commit**

```bash
git add server/services/quiz server/routes/quiz.js
git commit -m "$(cat <<'EOF'
refactor(server): move quiz session SQL behind services

EOF
)"
```

---

### Task 8: Sync architecture reference (P1 docs)

**Files:**
- Modify: `skills/xiaohuang-project-maintenance/references/architecture.md`

- [ ] **Step 1: Update Backend Boundaries mount list to match `server/index.js` today:**

`/api/molecules`, `/api/settings`, `/api/ai`, `/api/quiz`, `/api/offline-quiz`, `/api/reactions`, `/api/students`, `/api/mastery`, `/api/lesson-packs`, `/api/labs`, `/api/balance-scripts`

- [ ] **Step 2: Note services now include AI + quiz (not AI-only)**

- [ ] **Step 3: Commit**

```bash
git add skills/xiaohuang-project-maintenance/references/architecture.md
git commit -m "$(cat <<'EOF'
docs: sync architecture map with API mounts and services

EOF
)"
```

**P1 exit:** No CREATE/ALTER for quiz tables outside `server/db/`; AI routes mostly HTTP; architecture doc accurate.

---

### Task 9: Molecule package move (P2)

**Files:**
- Create: `src/molecule/index.js`, `list.js`, `viewer3d.js`, `ai.js`, `reactions.js`
- Modify: `src/main.js` dynamic import path
- Modify: any cross-imports (`molecule-list` ← reactions/ai, `molar-ui` refresh)
- Modify: `test/module-boundaries.test.cjs`
- Temporary: root `src/molecule-*.js` re-export shims

- [ ] **Step 1: Add failing test**

```js
test('molecule feature is packaged under src/molecule/', () => {
  const entry = source('src/main.js');
  assert.match(entry, /import\(['"]\.\/molecule\//);
  assert.ok(fs.existsSync(path.join(root, 'src/molecule/index.js')));
});
```

- [ ] **Step 2: Move files with git mv; fix relative imports (`../data`, `../api/client.js`, `../app-dialog.js`, etc.)**

- [ ] **Step 3: Façade `src/molecule/index.js` re-exports init functions `main.js` needs

- [ ] **Step 4: Update `main.js` `ensureMoleculeModules` to load façade once

- [ ] **Step 5: Keep root shims one cycle if other docs/tools reference old paths; delete when grep clean

- [ ] **Step 6: `npm test` + smoke molecule list, 3D, reactions playback, AI generate

- [ ] **Step 7: Commit**

```bash
git add src/molecule src/molecule-*.js src/main.js test/module-boundaries.test.cjs
git commit -m "$(cat <<'EOF'
refactor(molecule): package list/viewer/ai/reactions under src/molecule

EOF
)"
```

**P2 exit:** No new logic in flat `src/molecule-*.js` siblings; coupling stays inside the package.

---

### Task 10: Split battle CSS entry (P3)

**Files:**
- Create: e.g. `src/styles/_element-battle/` partials OR `src/styles/_element-battle-*.css`
- Modify: `src/styles/index.css` or a single `_element-battle.css` that only `@import`s partials

- [ ] **Step 1: Split by screen region without renaming selectors** (mechanically cut sections: layout/hand/board/fx/responsive)

- [ ] **Step 2: Visual smoke Element Battle — hand, flip, draw, end state**

- [ ] **Step 3: Commit**

```bash
git add src/styles
git commit -m "$(cat <<'EOF'
refactor(styles): split element-battle CSS into partials

EOF
)"
```

---

### Task 11: Classroom CSS ownership map (P3)

**Files:**
- Modify/split: `_ai-classroom.css`, `_classroom-extra.css`, `_balance-script.css`
- Optionally add file headers: `/* owned by ai-classroom/lab-shell.js */`

- [ ] **Step 1: Document ownership in comments + move clearly misplaced rules next to owner partial**

- [ ] **Step 2: Smoke lab + balance + quiz sections for obvious style regressions

- [ ] **Step 3: Commit**

```bash
git add src/styles
git commit -m "$(cat <<'EOF'
refactor(styles): align classroom CSS partials with feature owners

EOF
)"
```

---

### Task 12: HTML growth rule + optional section extraction note (P3 policy)

**Files:**
- Modify: `skills/xiaohuang-project-maintenance/references/architecture.md` (convention)
- Optional later PR: extract one existing modal from `index.html` into runtime template (only if a feature already owns it)

- [ ] **Step 1: Write convention:** new feature panels default to empty `#panel-*` + runtime render (battle pattern); do not add multi-hundred-line static trees to `index.html`

- [ ] **Step 2: Do **not** rewrite entire `index.html` in this plan (high risk / low urgency)

- [ ] **Step 3: Commit docs-only if Step 1 is the only change

**P3 exit:** Battle CSS modular; classroom CSS owns mapped; policy recorded. Full `index.html` demolition deferred.

---

### Task 13: Freeze follow-ups (explicit non-goals for this plan)

Record in a short `docs/superpowers/specs/2026-07-29-structure-optimization-backlog.md` (optional) or leave unchecked here:

- [ ] Further split `balance-shell.js` / `lab-shell.js` along model/views (already partial)
- [ ] Generic “editable builtin pack” for `labs` ≈ `balance-scripts`
- [ ] Relocate `server/seed/offline-quiz-bank.js` to JSON data asset
- [ ] Shared OpenAPI / typed client for API contracts

These are **not** required to close this plan.

---

## Verification checklist (end of each phase)

1. `git status --short --branch` clean aside from intentional WIP
2. `npm test`
3. `npm run build` (phase end)
4. Manual smoke for touched tabs only
5. No generated/user-data paths in the diff

## Execution notes

- Prefer one phase per PR.
- Order: **P0 → P1 → P2 → P3**. P2 may start after P0 if backend owner is busy (paths are independent); avoid parallel edits to `main.js` + classroom entry without coordination.
- Sample island to copy: `src/battle/index.js` + `src/ai-classroom/lab-model.js` / `lab-views.js` / `lab-shell.js`.
