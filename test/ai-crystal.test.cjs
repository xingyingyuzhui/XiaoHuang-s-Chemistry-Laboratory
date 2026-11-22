const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../server');
const { initDatabase, closeDatabase } = require('../server/db/sqlite');
const { hasRoute } = require('../server/utils/route-probe');
const crystalRouter = require('../server/routes/ai/crystal');
const { validateCrystalPayload, normalizeCrystalGuide } = require('../server/utils/crystal-validate');

const FCC = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
const OCT = [[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5], [0.5, 0.5, 0.5]];
const TET_HALF = [[0.25, 0.25, 0.25], [0.75, 0.75, 0.25], [0.75, 0.25, 0.75], [0.25, 0.75, 0.75]];
const TET_ALL = [...TET_HALF, [0.75, 0.75, 0.75], [0.25, 0.25, 0.75], [0.25, 0.75, 0.25], [0.75, 0.25, 0.25]];
const mk = (species, fracs) => fracs.map(([u, v, w]) => ({ species, u, v, w }));

test('CaTiO3: ternary hard-sphere radii + CPK colors + CN=6 + d=191 pm + density', () => {
  const res = validateCrystalPayload({
    name: '钛酸钙（钙钛矿）', formula: 'CaTiO₃', category: 'ionic', system: 'cubic',
    lattice: { a: 382 },
    species: [
      { id: 'Ca', symbol: 'Ca²⁺', color: '#5bb85d', spaceRadius: 0.72, countPerCell: 8 },
      { id: 'Ti', symbol: 'Ti⁴⁺', color: '#3b82f6', spaceRadius: 0.45, countPerCell: 99 },
      { id: 'O', symbol: 'O²⁻', color: '#e03e3e', spaceRadius: 0.68, countPerCell: 6 },
    ],
    basisAtoms: [
      { species: 'Ca', u: 0, v: 0, w: 0 },
      { species: 'Ti', u: 0.5, v: 0.5, w: 0.5 },
      ...mk('O', [[0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]]),
    ],
    bondCutoff: 210, bondRule: 'hetero',
    coordination: { label: '体心 Ti⁴⁺ 与 6 个面心 O²⁻ 八面体配位', number: 6, neighborSpecies: 'O' },
    shortestDistance: { formula: 'd(Ti–O) = a / 2' },
    density: { Z: 1, molarMass: 135.98, valueGcm3: 99.99 },
  });

  assert.match(res.id, /^ai-catio/);
  assert.equal(res.isCustom, true);
  assert.equal(res.hexPrismHighlight, false);
  assert.equal(res.atoms.length, 15);
  const byId = Object.fromEntries(res.species.map((s) => [s.id, s]));
  assert.deepEqual([byId.Ca.countPerCell, byId.Ti.countPerCell, byId.O.countPerCell], [1, 1, 3]);
  assert.equal(byId.Ca.color, 0x5bb85d);
  assert.equal(byId.Ti.color, 0x738294);
  assert.equal(byId.O.color, 0xe03e3e);
  assert.ok(byId.Ti.spaceRadius >= 0.34 && byId.Ti.spaceRadius <= 0.4);
  assert.ok(byId.O.spaceRadius >= 0.8 && byId.O.spaceRadius <= 0.86);
  assert.ok(byId.Ca.spaceRadius >= 0.8 && byId.Ca.spaceRadius <= 0.88);
  assert.equal(res.coordination.number, 6);
  assert.equal(res.shortestDistance.valuePm, 191);
  assert.match(res.averagingFormula, /8×1\/8 = 1/);
  assert.ok(Math.abs(res.density.valueGcm3 - 4.05) < 0.03);
});

test('Cu3Au: alloy hard-sphere radii + Z=1 + 14 expanded atoms + density', () => {
  const res = validateCrystalPayload({
    name: '铜金金属间化合物', formula: 'Cu₃Au', category: 'metallic', system: 'cubic',
    lattice: { a: 374.8 },
    species: [
      { id: 'Au', symbol: 'Au', color: '0xe6b800', molarMass: 196.97 },
      { id: 'Cu', symbol: 'Cu', color: '#d97742', molarMass: 63.55 },
    ],
    basisAtoms: [...mk('Au', [[0, 0, 0]]), ...mk('Cu', FCC.slice(1))],
    density: { Z: 1 },
  });
  const byId = Object.fromEntries(res.species.map((s) => [s.id, s]));
  assert.equal(byId.Au.countPerCell, 1);
  assert.equal(byId.Cu.countPerCell, 3);
  assert.equal(res.atoms.length, 14);
  assert.equal(res.density.Z, 1);
  assert.ok(Math.abs(byId.Cu.spaceRadius - 0.8) <= 0.02);
  assert.ok(Math.abs(byId.Au.spaceRadius - 0.9) <= 0.02);
  assert.ok(Math.abs(res.density.molarMass - 387.62) < 0.05);
  assert.ok(Math.abs(res.density.valueGcm3 - 12.23) < 0.05);
});

test('Diamond: CPK overrides blue #3b82f6, spaceRadius=0.52, CN=4 overrides hallucinated 12, fake pair fixed', () => {
  const res = validateCrystalPayload({
    name: '金刚石', formula: 'C', category: 'covalent', system: 'cubic',
    lattice: { a: 356.7 },
    species: [{ id: 'C', symbol: 'C', color: '#3b82f6', spaceRadius: 0.95 }],
    basisAtoms: mk('C', [...FCC, ...TET_HALF]),
    bondRule: 'hetero',
    coordination: { number: 12, label: '错误配位数 CN = 12' },
    shortestDistance: { pair: [[0, 0, 0], [1, 1, 1]], formula: 'd = √3 a' },
  });
  assert.equal(res.species[0].color, 0x3f4654);
  assert.equal(res.species[0].spaceRadius, 0.52);
  assert.equal(res.bondRule, 'any');
  assert.equal(res.coordination.number, 4);
  assert.match(res.coordination.label, /CN = 4/);
  assert.equal(res.shortestDistance.valuePm, 154);
  assert.equal(res.shortestDistance.formula, 'd = √3/4 · a');
  assert.equal(res.density.Z, 8);
});

test('ZnS: S>Zn radii in both space and ball modes + CN=4', () => {
  const res = validateCrystalPayload({
    name: '硫化锌', formula: 'ZnS', category: 'ionic', system: 'cubic',
    lattice: { a: 540.9 },
    species: [
      { id: 'S', symbol: 'S²⁻', spaceRadius: 0.4 },
      { id: 'Zn', symbol: 'Zn²⁺', spaceRadius: 0.9 },
    ],
    basisAtoms: [...mk('S', FCC), ...mk('Zn', TET_HALF)],
  });
  const byId = Object.fromEntries(res.species.map((s) => [s.id, s]));
  assert.ok(byId.S.spaceRadius > byId.Zn.spaceRadius);
  assert.ok(byId.S.ballRadius > byId.Zn.ballRadius);
  assert.equal(res.coordination.number, 4);
  assert.equal(res.density.Z, 4);
});

test('NaCl: recovers 27-atom expanded input, derives Z=4, fixes inverted radii, clamps bondCutoff=600', () => {
  const expanded = [];
  for (const u of [0, 0.5, 1]) for (const v of [0, 0.5, 1]) for (const w of [0, 0.5, 1]) {
    const sum = Math.round((u + v + w) * 2);
    expanded.push({ species: sum % 2 === 0 ? 'Cl' : 'Na', u: u === 1 ? 0.9995 : u, v, w });
  }
  assert.equal(expanded.length, 27);
  const res = validateCrystalPayload({
    name: '氯化钠', formula: 'NaCl', category: 'ionic', system: 'cubic',
    lattice: { a: 564 },
    species: [
      { id: 'Na', symbol: 'Na⁺', spaceRadius: 0.95 },
      { id: 'Cl', symbol: 'Cl⁻', spaceRadius: 0.35 },
    ],
    basisAtoms: expanded,
    bondCutoff: 600,
    bondRule: 'hetero',
  });
  const byId = Object.fromEntries(res.species.map((s) => [s.id, s]));
  assert.equal(res.atoms.length, 27);
  assert.equal(res.density.Z, 4);
  assert.ok(Math.abs(res.density.valueGcm3 - 2.16) < 0.03);
  assert.ok(byId.Cl.spaceRadius > byId.Na.spaceRadius);
  assert.ok(Math.abs(byId.Cl.spaceRadius - 0.77) <= 0.02);
  assert.ok(Math.abs(byId.Na.spaceRadius - 0.43) <= 0.02);
  assert.ok(res.bondCutoff >= 288 && res.bondCutoff <= 340, `cutoff was ${res.bondCutoff}`);
});

test('Mg HCP: snaps 0.667/0.333 to 2/3, 1/3, CN=12, spaceRadius=0.74; shifted origin disables hexPrismHighlight', () => {
  const mg = validateCrystalPayload({
    name: '镁', formula: 'Mg', category: 'metallic', system: 'hexagonal',
    lattice: { a: 320.9, b: 320.9, c: 521.1 },
    species: [{ id: 'Mg', symbol: 'Mg' }],
    basisAtoms: [{ species: 'Mg', u: 0.9992, v: -0.0005, w: 0 }, { species: 'Mg', u: 0.667, v: 0.333, w: 0.5005 }],
  });
  assert.equal(mg.hexPrismHighlight, true);
  assert.equal(mg.species[0].countPerCell, 2);
  assert.equal(mg.species[0].spaceRadius, 0.74);
  assert.equal(mg.coordination.number, 12);

  const shifted = validateCrystalPayload({
    name: '偏移镁', formula: 'Mg', category: 'metallic', system: 'hexagonal',
    lattice: { a: 320.9, c: 521.1 },
    species: [{ id: 'Mg', symbol: 'Mg' }],
    basisAtoms: [{ species: 'Mg', u: 1 / 3, v: 2 / 3, w: 0.25 }, { species: 'Mg', u: 2 / 3, v: 1 / 3, w: 0.75 }],
  });
  assert.equal(shifted.hexPrismHighlight, false);
});

test('CaF2 picks Ca center (CN=8) not F even when coordination fields omitted', () => {
  const res = validateCrystalPayload({
    name: '氟化钙', formula: 'CaF₂', category: 'ionic', system: 'cubic',
    lattice: { a: 546.3 },
    species: [{ id: 'Ca', symbol: 'Ca²⁺' }, { id: 'F', symbol: 'F⁻' }],
    basisAtoms: [...mk('Ca', FCC), ...mk('F', TET_ALL)],
  });
  assert.equal(res.atoms[res.coordination.centerIndex].species, 'Ca');
  assert.equal(res.coordination.number, 8);
  assert.equal(res.density.Z, 4);
});

test('FeS2 pyrite: bondRule=any preserves both S-S (216 pm) and Fe-S (226 pm)', () => {
  const u = 0.385;
  const sSites = [
    [u, u, u], [1 - u, 1 - u, 1 - u],
    [0.5 + u, 0.5 - u, 1 - u], [0.5 - u, 0.5 + u, u],
    [1 - u, 0.5 + u, 0.5 - u], [u, 0.5 - u, 0.5 + u],
    [0.5 - u, 1 - u, 0.5 + u], [0.5 + u, u, 0.5 - u],
  ];
  const res = validateCrystalPayload({
    name: '黄铁矿', formula: 'FeS₂', category: 'ionic', system: 'cubic',
    lattice: { a: 541.8 },
    species: [{ id: 'Fe', symbol: 'Fe²⁺' }, { id: 'S', symbol: 'S' }],
    basisAtoms: [...mk('Fe', FCC), ...mk('S', sSites)],
    bondRule: 'any',
  });
  assert.equal(res.bondRule, 'any');
  assert.ok(res.bondCutoff >= 226 && res.bondCutoff <= 270, `FeS2 cutoff ${res.bondCutoff}`);
  assert.equal(res.density.Z, 4);
  assert.ok(Math.abs(res.density.valueGcm3 - 5.01) < 0.08);
});

test('Hexagonal Zn edge weights (1/6, 1/12, 1/3) and abstract A/B/C cell guard', () => {
  const zn = validateCrystalPayload({
    name: '锌', formula: 'Zn', category: 'metallic', system: 'hexagonal',
    lattice: { a: 266.5, b: 266.5, c: 494.7 },
    species: [{ id: 'Zn', symbol: 'Zn' }],
    basisAtoms: [{ species: 'Zn', u: 0, v: 0, w: 0 }, { species: 'Zn', u: 2 / 3, v: 1 / 3, w: 0.5 }, { species: 'Zn', u: 0, v: 0, w: 0.5 }],
  });
  assert.equal(zn.hexPrismHighlight, true);
  assert.equal(zn.species[0].countPerCell, 3);
  assert.match(zn.averagingFormula, /1\/12/);
  assert.match(zn.averagingFormula, /1\/3/);

  const absCell = validateCrystalPayload({
    name: '某立方晶胞', formula: 'AB₃C', category: 'ionic', system: 'cubic',
    lattice: { a: 420 },
    species: [
      { id: 'A', symbol: 'A', color: '#ff00aa', spaceRadius: 0.8 },
      { id: 'B', symbol: 'B', color: '#00cc88', spaceRadius: 0.6 },
      { id: 'C', symbol: 'C', color: '#ffaa00', spaceRadius: 0.5 },
    ],
    basisAtoms: [
      { species: 'A', u: 0, v: 0, w: 0 },
      { species: 'C', u: 0.5, v: 0.5, w: 0.5 },
      ...mk('B', FCC.slice(1)),
    ],
  });
  const byId = Object.fromEntries(absCell.species.map((s) => [s.id, s]));
  assert.equal(byId.B.color, 0x00cc88);
  assert.equal(byId.C.color, 0xffaa00);
  assert.deepEqual([byId.A.countPerCell, byId.B.countPerCell, byId.C.countPerCell], [1, 3, 1]);
});

test('validateCrystalPayload rejects collisions, stoichiometry mismatch, impossible density, and bad payloads', () => {
  assert.throws(() => validateCrystalPayload(null), /无效/);
  assert.throws(() => validateCrystalPayload({}), /晶系/);
  assert.throws(() => validateCrystalPayload({ system: 'triclinic', lattice: { a: 400 }, species: [{ id: 'A' }], basisAtoms: [{ species: 'A', u: 0, v: 0, w: 0 }] }), /晶系/);
  assert.throws(() => validateCrystalPayload({ system: 'cubic', lattice: { a: 50 }, species: [{ id: 'A' }], basisAtoms: [{ species: 'A', u: 0, v: 0, w: 0 }] }), /150～2500/);
  assert.throws(() => validateCrystalPayload({ system: 'cubic', lattice: { a: 400 }, species: [], basisAtoms: [{ species: 'A', u: 0, v: 0, w: 0 }] }), /1～5/);
  assert.throws(() => validateCrystalPayload({ system: 'cubic', lattice: { a: 400 }, species: [{ id: 'A' }], basisAtoms: [] }), /1～24/);
  assert.throws(() => validateCrystalPayload({ system: 'cubic', lattice: { a: 400 }, species: [{ id: 'A' }], basisAtoms: [{ species: 'B', u: 0, v: 0, w: 0 }] }), /粒子种类未知/);
  assert.throws(() => validateCrystalPayload({ system: 'cubic', lattice: { a: 400 }, species: [{ id: 'A' }], basisAtoms: [{ species: 'A', u: NaN, v: 0, w: 0 }] }), /分数坐标无效/);

  // 跨种 0 pm 重叠
  assert.throws(() => validateCrystalPayload({
    name: '重叠晶胞', formula: 'NaCl', system: 'cubic', lattice: { a: 564 },
    species: [{ id: 'Na', symbol: 'Na⁺' }, { id: 'Cl', symbol: 'Cl⁻' }],
    basisAtoms: [{ species: 'Na', u: 0, v: 0, w: 0 }, { species: 'Cl', u: 0, v: 0, w: 0 }],
  }), /重叠/);

  // < 100 pm 周期碰撞
  assert.throws(() => validateCrystalPayload({
    name: '近距碰撞', formula: 'Cu', system: 'cubic', lattice: { a: 361 },
    species: [{ id: 'Cu', symbol: 'Cu' }],
    basisAtoms: [{ species: 'Cu', u: 0, v: 0, w: 0 }, { species: 'Cu', u: 0.1, v: 0, w: 0 }],
  }), /重叠/);

  // Al2O3 化学计量失配
  assert.throws(() => validateCrystalPayload({
    name: '氧化铝', formula: 'Al₂O₃', category: 'ionic', system: 'cubic', lattice: { a: 400 },
    species: [{ id: 'Al', symbol: 'Al³⁺' }, { id: 'O', symbol: 'O²⁻' }],
    basisAtoms: [{ species: 'Al', u: 0, v: 0, w: 0 }, { species: 'O', u: 0.5, v: 0.5, w: 0 }, { species: 'O', u: 0.5, v: 0, w: 0.5 }],
  }), /计量比/);

  // 理论密度 > 26 g/cm3 异常晶格
  assert.throws(() => validateCrystalPayload({
    name: '异常金', formula: 'Au', category: 'metallic', system: 'cubic', lattice: { a: 260 },
    species: [{ id: 'Au', symbol: 'Au' }],
    basisAtoms: mk('Au', FCC),
  }), /密度/);
});

test('generateCrystalWithRetry repairs a validation error in 1 shot at temperature 0.1', async () => {
  const calls = [];
  const fakeChat = async (opts) => {
    calls.push(opts);
    if (calls.length === 1) {
      return { content: JSON.stringify({ name: '金刚石', formula: 'C', system: 'cubic', lattice: { a: 3.57 }, species: [{ id: 'C' }], basisAtoms: [{ species: 'C', u: 0, v: 0, w: 0 }] }) };
    }
    return { content: JSON.stringify({ name: '金刚石', formula: 'C', category: 'covalent', system: 'cubic', lattice: { a: 356.7 }, species: [{ id: 'C', symbol: 'C' }], basisAtoms: mk('C', [...FCC, ...TET_HALF]) }) };
  };
  const spec = await crystalRouter.generateCrystalWithRetry('金刚石', fakeChat);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].temperature, 0.1);
  assert.match(calls[1].user, /150～2500/);
  assert.equal(spec.density.Z, 8);
  assert.equal(spec.species[0].color, 0x3f4654);
});

test('normalizeCrystalGuide and AI crystal routes contract', async () => {
  const guide = normalizeCrystalGuide({
    answer: 'NaCl 晶胞含 4 个 Na⁺ 和 4 个 Cl⁻。',
    steps: [
      { title: '切开', detail: '均摊法', action: 'slice' },
      { title: '非法动作', detail: '应过滤', action: 'drop-table' },
      { title: '配位', detail: 'CN=6', action: 'coordination' },
      { title: '拼接', detail: 'tile-2', action: 'tile-2' },
      { title: '距离', detail: 'a/2', action: 'distance' },
      { title: '截断', detail: '第6步', action: 'reset' },
    ],
  });
  assert.equal(guide.steps.length, 5);
  assert.equal(guide.steps[1].action, null);
  assert.throws(() => normalizeCrystalGuide({ answer: '  ', steps: [] }), /有效结论/);

  assert.equal(hasRoute(app, 'POST', '/api/ai/crystal-generate'), true);
  assert.equal(hasRoute(app, 'POST', '/api/ai/crystal-guide'), true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-crystal-ai-test-'));
  let server;
  try {
    await initDatabase(path.join(dir, 'test.db'));
    server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/api/ai/crystal-generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: ' ' }) })).status, 400);
    const r2 = await fetch(`${base}/api/ai/crystal-generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'CaTiO3' }) });
    assert.equal(r2.status, 400);
    assert.match((await r2.json()).message, /API Key/);
    assert.equal((await fetch(`${base}/api/ai/crystal-guide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'NaCl', question: '' }) })).status, 400);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
