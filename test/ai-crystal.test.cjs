const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../server');
const { initDatabase, closeDatabase } = require('../server/db/sqlite');
const { hasRoute } = require('../server/utils/route-probe');
const {
  validateCrystalPayload,
  normalizeCrystalGuide,
} = require('../server/utils/crystal-validate');

test('validateCrystalPayload: Perovskite CaTiO3 periodic expansion + authoritative counts & density', () => {
  const res = validateCrystalPayload({
    name: '钛酸钙（钙钛矿）',
    formula: 'CaTiO₃',
    category: 'ionic',
    subtitle: '钙钛矿型立方晶胞',
    system: 'cubic',
    lattice: { a: 382, b: 382, c: 382, alpha: 90, beta: 90, gamma: 90 },
    species: [
      { id: 'Ca', symbol: 'Ca²⁺', color: '#5bb85d', ballRadius: 0.24, spaceRadius: 0.72, countPerCell: 8 },
      { id: 'Ti', symbol: 'Ti⁴⁺', color: '#3b82f6', ballRadius: 0.18, spaceRadius: 0.45, countPerCell: 99 },
      { id: 'O', symbol: 'O²⁻', color: '#e03e3e', ballRadius: 0.2, spaceRadius: 0.68, countPerCell: 6 },
    ],
    basisAtoms: [
      { species: 'Ca', u: 0, v: 0, w: 0 },
      { species: 'Ti', u: 0.5, v: 0.5, w: 0.5 },
      { species: 'O', u: 0.5, v: 0.5, w: 0 },
      { species: 'O', u: 0.5, v: 0, w: 0.5 },
      { species: 'O', u: 0, v: 0.5, w: 0.5 },
    ],
    bondCutoff: 210,
    bondRule: 'hetero',
    coordination: { label: '体心 Ti⁴⁺ 与 6 个面心 O²⁻ 八面体配位', number: 6, neighborSpecies: 'O' },
    // 故意省略 shortestDistance.pair 验证本地回退与计算
    shortestDistance: { formula: 'd(Ti–O) = a / 2' },
    density: { Z: 1, molarMass: 135.98, valueGcm3: 99.99 },
    qa: { question: '钙钛矿晶胞中 Ca:Ti:O 原子个数比是多少？', answer: '1:1:3' },
  });

  assert.match(res.id, /^ai-catio/);
  assert.equal(res.isCustom, true);
  assert.equal(res.hexPrismHighlight, false);
  // 8 个顶点 Ca + 1 个体心 Ti + 6 个面心 O = 15 个展示原子
  assert.equal(res.atoms.length, 15);

  const byId = Object.fromEntries(res.species.map((s) => [s.id, s]));
  assert.equal(byId.Ca.countPerCell, 1);
  assert.equal(byId.Ti.countPerCell, 1);
  assert.equal(byId.O.countPerCell, 3);
  assert.equal(byId.Ca.color, 0x5bb85d);
  assert.equal(byId.Ti.color, 0x3b82f6);
  assert.equal(byId.O.color, 0xe03e3e);

  assert.match(res.averagingFormula, /8×1\/8 = 1/);
  assert.match(res.averagingFormula, /1×1 = 1/);
  assert.match(res.averagingFormula, /6×1\/2 = 3/);

  // 理论密度 ρ = 135.98 / (6.02214076e23 * 382^3 * 1e-30) ≈ 4.05 g/cm³
  assert.ok(Math.abs(res.density.valueGcm3 - 4.05) < 0.03, `unexpected density ${res.density.valueGcm3}`);
  assert.equal(res.shortestDistance.pair.length, 2);
  assert.equal(res.shortestDistance.valuePm, 191);
});

test('validateCrystalPayload: Cu3Au ordered alloy gives Au=1, Cu=3 and 14 expanded atoms', () => {
  const res = validateCrystalPayload({
    name: '铜金金属间化合物',
    formula: 'Cu₃Au',
    category: 'metallic',
    system: 'cubic',
    lattice: { a: 374.8 },
    species: [
      { id: 'Au', symbol: 'Au', color: '0xe6b800', molarMass: 196.97 },
      { id: 'Cu', symbol: 'Cu', color: '#d97742', molarMass: 63.55 },
    ],
    basisAtoms: [
      { species: 'Au', u: 0, v: 0, w: 0 },
      { species: 'Cu', u: 0.5, v: 0.5, w: 0 },
      { species: 'Cu', u: 0.5, v: 0, w: 0.5 },
      { species: 'Cu', u: 0, v: 0.5, w: 0.5 },
    ],
    density: { Z: 1 },
  });

  const byId = Object.fromEntries(res.species.map((s) => [s.id, s]));
  assert.equal(byId.Au.countPerCell, 1);
  assert.equal(byId.Cu.countPerCell, 3);
  assert.equal(res.atoms.length, 14);
  // 摩尔质量按种粒子自动回推: 196.97 + 3*63.55 = 387.62 -> ρ ≈ 12.23 g/cm³
  assert.ok(Math.abs(res.density.molarMass - 387.62) < 0.05);
  assert.ok(Math.abs(res.density.valueGcm3 - 12.23) < 0.05);
});

test('validateCrystalPayload: Hexagonal HCP cell uses 1/6 & 1/12 vertex weights and enables hexPrismHighlight', () => {
  const res = validateCrystalPayload({
    name: '锌',
    formula: 'Zn',
    category: 'metallic',
    system: 'hexagonal',
    lattice: { a: 266.5, b: 266.5, c: 494.7, alpha: 90, beta: 90, gamma: 120 },
    species: [{ id: 'Zn', symbol: 'Zn', color: 0x8ea0b5, countPerCell: 99 }],
    basisAtoms: [
      { species: 'Zn', u: 0, v: 0, w: 0 },
      { species: 'Zn', u: 2 / 3, v: 1 / 3, w: 0.5 },
      // 测试六方棱上位置 (0,0,0.5) 展开到 4 条垂直棱: 2×1/3 + 2×1/6 = 1
      { species: 'Zn', u: 0, v: 0, w: 0.5 },
    ],
    density: { Z: 3, molarMass: 65.38 },
  });

  assert.equal(res.hexPrismHighlight, true);
  assert.equal(res.lattice.gamma, 120);
  // 8 顶点(4×1/6 + 4×1/12 = 1) + 4 棱(2×1/3 + 2×1/6 = 1) + 1 体内(1) = 3
  assert.equal(res.species[0].countPerCell, 3);
  assert.match(res.averagingFormula, /1\/12/);
  assert.match(res.averagingFormula, /1\/6/);
  assert.match(res.averagingFormula, /1\/3/);
  assert.ok(Number.isFinite(res.density.valueGcm3) && res.density.valueGcm3 > 5);
});

test('validateCrystalPayload rejects bad or empty payloads cleanly', () => {
  assert.throws(() => validateCrystalPayload(null), /无效/);
  assert.throws(() => validateCrystalPayload({}), /晶系/);
  assert.throws(
    () => validateCrystalPayload({ system: 'triclinic', lattice: { a: 400 }, species: [{ id: 'A' }], basisAtoms: [{ species: 'A', u: 0, v: 0, w: 0 }] }),
    /晶系/,
  );
  assert.throws(
    () => validateCrystalPayload({ system: 'cubic', lattice: { a: 50 }, species: [{ id: 'A' }], basisAtoms: [{ species: 'A', u: 0, v: 0, w: 0 }] }),
    /150～2500/,
  );
  assert.throws(
    () => validateCrystalPayload({ system: 'cubic', lattice: { a: 400 }, species: [], basisAtoms: [{ species: 'A', u: 0, v: 0, w: 0 }] }),
    /1～5/,
  );
  assert.throws(
    () => validateCrystalPayload({ system: 'cubic', lattice: { a: 400 }, species: [{ id: 'A' }], basisAtoms: [] }),
    /1～24/,
  );
  assert.throws(
    () => validateCrystalPayload({ system: 'cubic', lattice: { a: 400 }, species: [{ id: 'A' }], basisAtoms: [{ species: 'B', u: 0, v: 0, w: 0 }] }),
    /粒子种类未知/,
  );
  assert.throws(
    () => validateCrystalPayload({ system: 'cubic', lattice: { a: 400 }, species: [{ id: 'A' }], basisAtoms: [{ species: 'A', u: NaN, v: 0, w: 0 }] }),
    /分数坐标无效/,
  );
});

test('normalizeCrystalGuide enforces action allowlist and max 5 steps', () => {
  const guide = normalizeCrystalGuide({
    answer: 'NaCl 晶胞含 4 个 Na⁺ 和 4 个 Cl⁻，阴阳离子配位数均为 6。',
    steps: [
      { title: '切开数原子', detail: '用均摊法验证 8×1/8 + 6×1/2 = 4。', action: 'slice' },
      { title: '看配位数', detail: '体心 Na⁺ 周围有 6 个最近邻 Cl⁻。', action: 'coordination' },
      { title: '非法指令过滤', detail: '尝试注入未知动作。', action: 'drop-table' },
      { title: '拼两个晶胞', detail: '观察共享面。', action: 'tile-2' },
      { title: '看最短距离', detail: 'd = a/2。', action: 'distance' },
      { title: '第 6 步应截断', detail: '超过上限。', action: 'reset' },
    ],
  });

  assert.equal(guide.steps.length, 5);
  assert.equal(guide.steps[0].action, 'slice');
  assert.equal(guide.steps[1].action, 'coordination');
  assert.equal(guide.steps[2].action, null);
  assert.equal(guide.steps[3].action, 'tile-2');
  assert.equal(guide.steps[4].action, 'distance');

  assert.throws(() => normalizeCrystalGuide({ answer: '   ', steps: [] }), /有效结论/);
});

test('POST /api/ai/crystal-generate & /api/ai/crystal-guide are mounted and validate requests', async () => {
  assert.equal(hasRoute(app, 'POST', '/api/ai/crystal-generate'), true);
  assert.equal(hasRoute(app, 'POST', '/api/ai/crystal-guide'), true);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-crystal-ai-test-'));
  let server;
  try {
    await initDatabase(path.join(dir, 'test.db'));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    // 空 prompt 返回 400
    const r1 = await fetch(`${baseUrl}/api/ai/crystal-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '  ' }),
    });
    assert.equal(r1.status, 400);

    // 未配置 API Key 返回 400
    const r2 = await fetch(`${baseUrl}/api/ai/crystal-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'CaTiO3' }),
    });
    assert.equal(r2.status, 400);
    const p2 = await r2.json();
    assert.match(p2.message, /API Key/);

    // 助教空问题返回 400
    const r3 = await fetch(`${baseUrl}/api/ai/crystal-guide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'NaCl', module: 'library', question: '' }),
    });
    assert.equal(r3.status, 400);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
