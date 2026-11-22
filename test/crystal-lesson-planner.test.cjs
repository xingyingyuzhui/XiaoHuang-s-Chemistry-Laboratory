const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const { app } = require('../server');
const { initDatabase, closeDatabase } = require('../server/db/sqlite');
const { hasRoute } = require('../server/utils/route-probe');
const { normalizeCrystalLesson, VALID_STAGE_IDS } = require('../server/routes/ai/crystal-lesson');

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test('normalizeCrystalLesson allowlists 10 valid stageIds, deduplicates, and falls back safely', () => {
  assert.equal(VALID_STAGE_IDS.size, 10);

  const cleaned = normalizeCrystalLesson({
    title: '  离子晶体一课时  ',
    summary: ' 聚焦脆性与导电 ',
    steps: [
      { stageId: 'hammer-3d', title: ' 铜与食盐受力对比 ', teacherNote: ' 敲完停顿提问 ', qa: { question: '为何碎裂？', answer: '同号相斥。' } },
      { stageId: 'evil-stage', title: '非法环节', teacherNote: '应被丢弃' },
      { stageId: 'hammer-3d', title: '重复环节应去重', teacherNote: '重复' },
      { stageId: 'conduct', title: '三态导电', teacherNote: '对比固态与熔融', qa: { question: '', answer: '残缺 QA' } },
      { stageId: 'melt-race', title: '', teacherNote: '' },
    ],
  });

  assert.equal(cleaned.title, '离子晶体一课时');
  assert.equal(cleaned.usedFallback, false);
  assert.deepEqual(cleaned.steps.map((s) => s.stageId), ['hammer-3d', 'conduct', 'melt-race']);
  assert.equal(cleaned.steps[0].qa.question, '为何碎裂？');
  assert.equal(cleaned.steps[1].qa, null);
  assert.ok(cleaned.steps[2].title.length > 0 && cleaned.steps[2].teacherNote.length > 0);

  const fallback = normalizeCrystalLesson(
    { title: '', steps: [{ stageId: 'nope-1' }, { stageId: 'nope-2' }] },
    { fallbackTopic: '晶体性质复习', targetCount: 3 },
  );
  assert.equal(fallback.usedFallback, true);
  assert.equal(fallback.steps.length, 3);
  assert.match(fallback.title, /晶体性质复习/);
  for (const s of fallback.steps) assert.ok(VALID_STAGE_IDS.has(s.stageId));

  assert.throws(() => normalizeCrystalLesson(null), /无效/);
});

test('POST /api/ai/crystal-lesson is mounted and enforces 400 validation', async () => {
  assert.equal(hasRoute(app, 'POST', '/api/ai/crystal-lesson'), true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-cl-test-'));
  let server;
  try {
    await initDatabase(path.join(dir, 'test.db'));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const r1 = await fetch(`${baseUrl}/api/ai/crystal-lesson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: '   ', stepCount: 4 }),
    });
    assert.equal(r1.status, 400);

    const r2 = await fetch(`${baseUrl}/api/ai/crystal-lesson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: '高二离子晶体一课时，重点讲脆性与导电性', stepCount: 4 }),
    });
    assert.equal(r2.status, 400);
    assert.match((await r2.json()).message, /API Key/i);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('crystal-lesson-store ships 3 default lessons and supports full CRUD, reorder, persistence, and reset', async () => {
  const { createCrystalLessonStore, STORAGE_KEY } = await import(
    pathToFileURL(path.join(root, 'src/ai-classroom/crystal-lesson-store.js')).href
  );
  const storage = makeMemoryStorage();
  const store = createCrystalLessonStore({ storage });

  const defaults = store.getLessons();
  assert.equal(defaults.length, 3);
  assert.deepEqual(defaults[0].steps.map((s) => s.stageId), ['compare-3d', 'selfform', 'melting-curve', 'unitcell-3d']);
  assert.deepEqual(defaults[1].steps.map((s) => s.stageId), ['hammer-3d', 'conduct', 'melt-race']);
  assert.deepEqual(defaults[2].steps.map((s) => s.stageId), ['ice-3d', 'compare-3d', 'melt-race']);

  const custom = store.createLesson({ title: '离子晶体专题', steps: ['hammer-3d', 'conduct'], aiGenerated: true });
  assert.equal(store.getActiveLesson().id, custom.id);
  assert.equal(store.renameLesson(custom.id, '高二离子晶体精讲'), true);

  const added = store.addStep(custom.id, 'melt-race');
  assert.equal(store.reorderStep(custom.id, added.id, -1), true);
  assert.deepEqual(store.getActiveLesson().steps.map((s) => s.stageId), ['hammer-3d', 'melt-race', 'conduct']);

  store.updateStep(custom.id, added.id, { title: '热成像收尾', teacherNote: '停在 800℃ 观察 NaCl 熔化' });
  assert.equal(store.getActiveLesson().steps[1].title, '热成像收尾');

  const copy = store.duplicateLesson(custom.id);
  assert.match(copy.title, /副本/);
  assert.equal(store.removeStep(copy.id, copy.steps[0].id), true);
  assert.equal(copy.steps.length, 2);

  assert.ok(storage.getItem(STORAGE_KEY));
  const reloaded = createCrystalLessonStore({ storage });
  assert.equal(reloaded.getLessons().length, 5);
  assert.equal(reloaded.deleteLesson(copy.id), true);

  reloaded.resetDefaults();
  assert.equal(reloaded.getLessons().length, 3);
  assert.equal(reloaded.deleteLesson('builtin-intro'), true);
  assert.equal(reloaded.deleteLesson('builtin-metal-ionic'), true);
  assert.equal(reloaded.deleteLesson('builtin-ice-water'), false);
});

test('frontend client & shell wire frozen stage contract and XiaoHuang deferred leave notify', () => {
  const clientJs = fs.readFileSync(path.join(root, 'src/api/client.js'), 'utf8');
  assert.match(clientJs, /generateCrystalLesson\s*\(/);
  assert.match(clientJs, /\/ai\/crystal-lesson/);

  const shellJs = fs.readFileSync(path.join(root, 'src/ai-classroom/crystal-lesson-shell.js'), 'utf8');
  assert.match(shellJs, /import\s*\{\s*STAGE_CATALOG,\s*mountCrystalStage\s*\}\s*from\s*'\.\.\/crystal\/stages\/index\.js'/);
  assert.match(shellJs, /registerPageAssistant\('ai'/);
  assert.match(shellJs, /requestAnimationFrame\(notifyLeave\)/);
});
