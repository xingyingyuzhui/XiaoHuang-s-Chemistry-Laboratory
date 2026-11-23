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
const cjsSchema = require('../server/utils/chem-stage-schema');
const { normalizeCrystalLesson, STAGE_TYPES: ROUTE_STAGE_TYPES } = require('../server/routes/ai/crystal-lesson');

async function loadEsmSchema() {
  return import(pathToFileURL(path.join(root, 'src/crystal/stage-spec/schema.js')).href);
}

test('ESM schema exports 5 STAGE_TYPES, 9 valid STAGE_PRESETS, and strict/safe validation', async () => {
  const esm = await loadEsmSchema();
  assert.deepEqual([...esm.STAGE_TYPES], [
    'dual-3d-compare', 'lattice-stress', 'particle-field', 'thermal-phase', 'cell-extract',
  ]);
  assert.deepEqual([...ROUTE_STAGE_TYPES], [...esm.STAGE_TYPES]);

  const expectedPresets = [
    'quartz-vs-glass', 'diamond-vs-graphite', 'nacl-growth', 'cu-vs-nacl-stress',
    'nacl-conduct', 'ice-hbond', 'melting-curve', 'melt-race-16', 'cu-cell-extract',
  ];
  assert.deepEqual(esm.STAGE_PRESETS.map((p) => p.presetId), expectedPresets);

  for (const p of esm.STAGE_PRESETS) {
    assert.ok(['basics', 'properties'].includes(p.category));
    assert.ok(p.title && p.badge && p.summary);
    assert.ok(p.qa?.question && p.qa?.answer);
    assert.ok(Array.isArray(p.quickQuestions) && p.quickQuestions.length >= 2);
    assert.deepEqual(esm.validateChemStage(p.stage, { strict: true }), p.stage);
  }

  const race16 = esm.STAGE_PRESETS.find((p) => p.presetId === 'melt-race-16');
  assert.equal(race16.stage.substances.length, 16);
  const curve = esm.STAGE_PRESETS.find((p) => p.presetId === 'melting-curve');
  assert.equal(curve.stage.view, 'curve');
  assert.equal(curve.stage.substances.length, 2);
  assert.equal(curve.stage.substances[0].mpC, 48);

  assert.equal(esm.validateChemStage(null).type, 'dual-3d-compare');
  assert.equal(esm.validateChemStage({ type: 'unknown' }).type, 'dual-3d-compare');
  assert.throws(() => esm.validateChemStage(null, { strict: true }));
  assert.throws(() => esm.validateChemStage({ type: 'evil' }, { strict: true }));
  assert.throws(() => esm.validateChemStage({ type: 'dual-3d-compare', left: { kind: 'bad' }, right: { kind: 'glass' } }, { strict: true }));
  assert.throws(() => esm.validateChemStage({ type: 'thermal-phase', view: 'race', substances: [{ formula: 'NaCl', name: '盐', category: 'ionic', mpC: 9999 }, { formula: 'KCl', name: '钾盐', category: 'ionic', mpC: 770 }] }, { strict: true }));
});

test('ESM schema.js and CJS chem-stage-schema.js maintain strict validation parity across all 5 engines', async () => {
  const esm = await loadEsmSchema();
  assert.deepEqual([...cjsSchema.STAGE_TYPES], [...esm.STAGE_TYPES]);
  assert.deepEqual([...cjsSchema.COMPARE_KINDS], [...esm.COMPARE_KINDS]);
  assert.deepEqual([...cjsSchema.BOND_TYPES], [...esm.BOND_TYPES]);
  assert.deepEqual([...cjsSchema.PARTICLE_MODES], [...esm.PARTICLE_MODES]);
  assert.deepEqual([...cjsSchema.CELL_CRYSTAL_IDS], [...esm.CELL_CRYSTAL_IDS]);

  const samples = [
    { type: 'dual-3d-compare', left: { kind: 'diamond' }, right: { kind: 'graphite', label: '石墨' }, defaultMode: 'micro' },
    { type: 'lattice-stress', left: { bondType: 'metallic', colorA: '#abc', colorB: 0xe0824a }, right: { bondType: 'covalent', colorA: 'javascript:bad' } },
    { type: 'particle-field', mode: 'hbond-collapse', substance: 'H₂O' },
    {
      type: 'thermal-phase', view: 'race',
      substances: [
        { formula: 'NaCl', name: '氯化钠', category: 'ionic', mpC: 801 },
        { formula: 'KCl', name: '氯化钾', category: 'ionic', mpC: 770 },
        { formula: 'MgO', name: '氧化镁', category: 'ionic', mpC: 5500 },
        { formula: 'He', name: '极寒测试', category: 'molecular', mpC: -500 },
      ],
    },
    { type: 'thermal-phase', view: 'curve', substances: [{ formula: 'A', name: '单物质触发兜底', category: 'ionic', mpC: 50 }] },
    { type: 'cell-extract', crystalId: 'diamond' },
    { type: 'cell-extract', crystalId: 'bad-id' },
  ];

  for (const s of samples) {
    assert.deepEqual(cjsSchema.validateChemStage(s), esm.validateChemStage(s));
  }

  const clamped = cjsSchema.validateChemStage(samples[3]);
  assert.equal(clamped.substances[2].mpC, 4000);
  assert.equal(clamped.substances[3].mpC, -270);
  assert.equal(clamped.tempRange[0] < clamped.tempRange[1], true);

  const planIn = { id: 'p-1', title: '测试课例', subtitle: '简介', isAi: true, slides: [{ id: 's-1', title: '环节1', cue: '提词', stage: samples[0] }] };
  assert.deepEqual(cjsSchema.normalizeLessonPlan(planIn), esm.normalizeLessonPlan(planIn));
});

test('normalizeCrystalLesson supports all 5 engines, custom AI substance races, sanitization, and fallback', () => {
  const custom = normalizeCrystalLesson({
    title: '  碳单质与四晶体熔点对比  ',
    subtitle: '  从微观键型到热学熔点  ',
    slides: [
      {
        title: '金刚石 vs 石墨',
        cue: '切换微观模式观察 sp³ 四面体与层状六方网',
        stage: { type: 'dual-3d-compare', left: { kind: 'diamond' }, right: { kind: 'graphite' }, defaultMode: 'micro' },
        qa: { question: '为何金刚石极硬而石墨质软？', answer: '三维共价网与层间范德华力差异。' },
        quickQuestions: ['两者杂化方式？', '石墨为何导电？'],
      },
      {
        title: '自定义四晶体熔点大比拼',
        cue: '重点观察 MgO 与 NaCl 晶格能差异',
        stage: {
          type: 'thermal-phase',
          view: 'race',
          substances: [
            { formula: 'NaCl', name: '氯化钠', category: 'ionic', mpC: 801 },
            { formula: 'KCl', name: '氯化钾', category: 'ionic', mpC: 770 },
            { formula: 'MgO', name: '氧化镁', category: 'ionic', mpC: 2852 },
            { formula: 'SiO₂', name: '二氧化硅', category: 'covalent', mpC: 1713 },
          ],
        },
      },
      { title: '金属与离子受力', stage: { type: 'lattice-stress', left: { bondType: 'metallic' }, right: { bondType: 'ionic' } } },
      { title: '食盐生长', stage: { type: 'particle-field', mode: 'crystal-growth', substance: 'NaCl' } },
      { title: '晶胞提取', stage: { type: 'cell-extract', crystalId: 'nacl' } },
      { title: '非法舞台应丢弃', stage: { type: 'evil-stage' } },
      { title: '非法材质应丢弃', stage: { type: 'dual-3d-compare', left: { kind: 'kryptonite' }, right: { kind: 'glass' } } },
      { title: '重复舞台应去重', stage: { type: 'cell-extract', crystalId: 'nacl' } },
    ],
  });

  assert.equal(custom.title, '碳单质与四晶体熔点对比');
  assert.equal(custom.isAi, true);
  assert.equal(custom.usedFallback, false);
  assert.deepEqual(custom.slides.map((s) => s.stage.type), [
    'dual-3d-compare', 'thermal-phase', 'lattice-stress', 'particle-field', 'cell-extract',
  ]);
  assert.equal(custom.slides[0].stage.left.kind, 'diamond');
  assert.equal(custom.slides[0].stage.right.kind, 'graphite');
  assert.deepEqual(
    custom.slides[1].stage.substances.map((x) => [x.formula, x.mpC]),
    [['NaCl', 801], ['KCl', 770], ['MgO', 2852], ['SiO₂', 1713]],
  );
  assert.ok(custom.slides[2].qa.question && custom.slides[2].qa.answer);

  const fallback = normalizeCrystalLesson(
    { title: '<script>x</script>', slides: [{ stage: { type: 'bad' } }, { stage: { type: 'particle-field', mode: 'bad' } }] },
    { fallbackTopic: '晶体复习', targetCount: 3 },
  );
  assert.equal(fallback.usedFallback, true);
  assert.equal(fallback.slides.length, 3);
  assert.equal(fallback.title.includes('<script>'), false);
  for (const s of fallback.slides) assert.ok(cjsSchema.STAGE_TYPES.includes(s.stage.type));

  assert.throws(() => normalizeCrystalLesson(null), /无效/);
});

test('POST /api/ai/crystal-lesson is mounted, enforces 400 validation, and docs/client contracts exist', async () => {
  assert.equal(hasRoute(app, 'POST', '/api/ai/crystal-lesson'), true);
  const specDoc = fs.readFileSync(path.join(root, 'docs/chem-stage-spec.md'), 'utf8');
  for (const kw of ['ChemStageJSON', 'LessonPlanJSON', 'dual-3d-compare', 'lattice-stress', 'particle-field', 'thermal-phase', 'cell-extract', 'ChemRenderKit']) {
    assert.match(specDoc, new RegExp(kw));
  }
  const clientJs = fs.readFileSync(path.join(root, 'src/api/client.js'), 'utf8');
  assert.match(clientJs, /generateCrystalLesson\s*\(/);
  assert.match(clientJs, /\/ai\/crystal-lesson/);

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
      body: JSON.stringify({ topic: '对比金刚石和石墨，再对比 NaCl、KCl、MgO、SiO₂ 熔点', stepCount: 4 }),
    });
    assert.equal(r2.status, 400);
    assert.match((await r2.json()).message, /API Key/i);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dry ice sublimation accuracy: schema subl parity, iw-3 copy & cache migration, and thermal header counter', async () => {
  const esmSchema = await loadEsmSchema();
  const storeMod = await import(pathToFileURL(path.join(root, 'src/ai-classroom/crystal-lesson-store.js')).href);
  const thermalMod = await import(pathToFileURL(path.join(root, 'src/crystal/stages/stage-thermal.js')).href);

  // 1. Schema parity for dry ice (-78.5°C, subl: true)
  const dryIceStage = {
    type: 'thermal-phase',
    view: 'race',
    substances: [
      { formula: 'CO₂', name: '干冰', category: 'molecular', mpC: -78.5 },
      { formula: 'H₂O', name: '冰', category: 'molecular', mpC: 0 },
    ],
  };
  const normEsm = esmSchema.validateChemStage(dryIceStage, { strict: true });
  const normCjs = cjsSchema.validateChemStage(dryIceStage, { strict: true });
  assert.deepEqual(normCjs, normEsm);
  assert.equal(normEsm.substances[0].mpC, -78.5);
  assert.equal(normEsm.substances[0].subl, true);
  assert.equal(normEsm.substances[1].subl, undefined);

  const race16Co2 = esmSchema.CLASSIC_RACE_16.find((x) => x.formula === 'CO₂');
  assert.equal(race16Co2.mpC, -78.5);
  assert.equal(race16Co2.subl, true);

  // 2. Built-in Lesson 3 Slide 3 (iw-3) copy & CO₂ subl flag
  const defaults = storeMod.createDefaultLessons();
  const iw = defaults.find((l) => l.id === 'builtin-ice-water');
  const iw3 = iw.slides.find((s) => s.id === 'iw-3');
  assert.match(iw3.qa.question, /干冰的升华点（-78\.5℃）/);
  assert.match(iw3.qa.answer, /直接升华/);
  assert.equal(iw3.stage.substances[0].subl, true);

  // 3. Auto-migrate stale v3.2.0 cached iw-3 while preserving user-edited questions
  const mem = new Map();
  const mockStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
  };
  const stale = storeMod.createDefaultLessons();
  stale.find((l) => l.id === 'builtin-ice-water').slides.find((s) => s.id === 'iw-3').qa.question =
    '同属分子晶体，为何冰（0℃）的熔点远高于干冰（-78.5℃），又远低于 NaCl（801℃）？';
  mockStorage.setItem(storeMod.STORAGE_KEY, JSON.stringify({ lessons: stale, activeLessonId: 'builtin-ice-water' }));

  const migratedStore = storeMod.createCrystalLessonStore({ storage: mockStorage });
  const migratedIw3 = migratedStore.getActiveLesson().slides.find((s) => s.id === 'iw-3');
  assert.match(migratedIw3.qa.question, /干冰的升华点（-78\.5℃）/);

  // User-customized question must NOT be overwritten
  const customMem = new Map();
  const customStorage = {
    getItem: (k) => (customMem.has(k) ? customMem.get(k) : null),
    setItem: (k, v) => customMem.set(k, String(v)),
  };
  const customLessons = storeMod.createDefaultLessons();
  customLessons.find((l) => l.id === 'builtin-ice-water').slides.find((s) => s.id === 'iw-3').qa.question = '老师自定义思考题';
  customStorage.setItem(storeMod.STORAGE_KEY, JSON.stringify({ lessons: customLessons, activeLessonId: 'builtin-ice-water' }));
  const customStore = storeMod.createCrystalLessonStore({ storage: customStorage });
  assert.equal(customStore.getActiveLesson().slides.find((s) => s.id === 'iw-3').qa.question, '老师自定义思考题');

  // 4. Thermal header summary never counts sublimated dry ice into 已熔
  const fmt = thermalMod.formatThermalSummary;
  assert.equal(fmt(0, 0, 4, true), '0/4 已相变');
  assert.equal(fmt(0, 1, 4, true), '1 已升华 / 4');
  assert.equal(fmt(1, 1, 4, true), '1 已熔 · 1 已升华 / 4');
  assert.equal(fmt(3, 1, 4, true), '3 已熔 · 1 已升华 / 4');
  assert.equal(fmt(1, 0, 16, true), '1/16 已熔');
  assert.equal(fmt(0, 0, 4, false), '0/4 已熔');
  assert.equal(fmt(2, 0, 4, false), '2/4 已熔');
});
