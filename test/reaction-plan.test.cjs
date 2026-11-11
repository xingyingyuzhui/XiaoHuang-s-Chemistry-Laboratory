const test = require('node:test');
const assert = require('node:assert/strict');

const VALENCE = { H: 1, C: 4, O: 2, Cl: 1, Br: 1, N: 3 };

test('atom layout: formulas become valence-correct structures with multiple bonds', async () => {
  const { buildMolecule } = await import('../src/molecule/atom-layout.js');
  const multi = (m) =>
    m.bonds
      .filter((b) => b.order > 1)
      .map((b) => [m.atoms[b.a].el, m.atoms[b.b].el].sort().join(b.order === 2 ? '=' : '#'))
      .sort();
  const cases = {
    H2O: [],
    O2: ['O=O'],
    C2H4: ['C=C'],
    C2H2: ['C#C'],
    CH3CHO: ['C=O'],
    CH3COOH: ['C=O'],
    CH3COOC2H5: ['C=O'],
    CO2: ['C=O', 'C=O'],
    C6H6: ['C=C', 'C=C', 'C=C'],
    C2H4Br2: [],
  };
  for (const [f, expected] of Object.entries(cases)) {
    const m = buildMolecule(f);
    assert.ok(m, `${f} should parse`);
    const deg = m.atoms.map(() => 0);
    m.bonds.forEach((b) => {
      deg[b.a] += b.order;
      deg[b.b] += b.order;
    });
    m.atoms.forEach((a, i) => assert.equal(deg[i], VALENCE[a.el], `${f}: ${a.el}${i} valence`));
    assert.deepEqual(multi(m), expected.sort(), `${f} multiple bonds`);
  }
  // 酯的桥氧连两个碳
  const ester = buildMolecule('CH3COOC2H5');
  const bridge = ester.atoms.findIndex(
    (a, i) => a.el === 'O' && ester.bonds.filter((b) => (b.a === i || b.b === i) && ester.atoms[b.a === i ? b.b : b.a].el === 'C').length === 2,
  );
  assert.ok(bridge >= 0, 'ester has a C–O–C bridge');
  // 无法示意的式子返回 null（交给 3D 模式）
  assert.equal(buildMolecule('‑[CH2‑CH2]n‑'), null);
});

/** 把计划里的断键 / 成键转成「元素-元素」集合，便于和教材对照 */
async function fates(equation) {
  const { buildReactionPlan } = await import('../src/molecule/reaction-plan.js');
  const plan = buildReactionPlan({ equation, steps: [] }, () => 0, 10);
  assert.ok(plan, `${equation} should plan`);
  const name = (b) => [plan.nodes[b.a].el, plan.nodes[b.b].el].sort().join('-');
  const pick = (f) => plan.bonds.filter((b) => b.fate === f).map(name).sort();
  const order = plan.bonds
    .filter((b) => b.fate === 'keep' && b.from !== b.to)
    .map((b) => `${name(b)}:${b.from}>${b.to}`)
    .sort();
  return { breaks: pick('break'), forms: pick('form'), order, plan };
}

test('reaction plan: bond changes follow textbook mechanisms', async () => {
  // 加成：Br–Br 断，两根 C–Br 成，C=C 变单键
  let r = await fates('C₂H₄ + Br₂ → C₂H₄Br₂');
  assert.deepEqual(r.breaks, ['Br-Br']);
  assert.deepEqual(r.forms, ['Br-C', 'Br-C']);
  assert.deepEqual(r.order, ['C-C:2>1']);

  // 酯化：酸脱羟基、醇脱氢
  r = await fates('CH₃COOH + C₂H₅OH ⇌ CH₃COOC₂H₅ + H₂O');
  assert.deepEqual(r.breaks, ['C-O', 'H-O']);
  assert.deepEqual(r.forms, ['C-O', 'H-O']);
  const p = r.plan;
  const brokenCO = p.bonds.find((b) => b.fate === 'break' && [p.nodes[b.a].el, p.nodes[b.b].el].sort().join() === 'C,O');
  const brokenOH = p.bonds.find((b) => b.fate === 'break' && [p.nodes[b.a].el, p.nodes[b.b].el].sort().join() === 'H,O');
  assert.equal(p.nodes[brokenCO.a].rMol, 0, '断的 C–O 在乙酸里');
  assert.equal(p.nodes[brokenOH.a].rMol, 1, '断的 O–H 在乙醇里');

  // 乙醇催化氧化：C–O 保留并变成 C=O（醇脱羟基氢和 α-H）
  r = await fates('2 C₂H₅OH + O₂ → 2 CH₃CHO + 2 H₂O');
  assert.deepEqual(r.order, ['C-O:1>2', 'C-O:1>2']);
  assert.ok(!r.breaks.includes('C-O'), 'C–O should not break');

  // 燃烧 / 取代
  r = await fates('2 H₂ + O₂ → 2 H₂O');
  assert.deepEqual(r.breaks, ['H-H', 'H-H', 'O-O']);
  assert.deepEqual(r.forms, ['H-O', 'H-O', 'H-O', 'H-O']);
  r = await fates('CH₄ + Cl₂ → CH₃Cl + HCl');
  assert.deepEqual(r.breaks, ['C-H', 'Cl-Cl']);
  assert.deepEqual(r.forms, ['C-Cl', 'Cl-H']);
});

test('reaction plan: frames are finite at every phase and polymers fall back', async () => {
  const { buildReactionPlan, frameAt, parseSides } = await import('../src/molecule/reaction-plan.js');
  const steps = [
    { t: 0, focus: 'reactant' },
    { t: 4, focus: 'break' },
    { t: 6, focus: 'join' },
    { t: 8, focus: 'product' },
  ];
  const plan = buildReactionPlan({ equation: 'H₂ + Cl₂ → 2 HCl', steps }, (s) => s.t, 12);
  assert.deepEqual([plan.times.tBreak, plan.times.tJoin, plan.times.tProduct], [4, 6, 8]);
  for (const t of [0, 3.9, 4.5, 6.5, 8, 12]) {
    const f = frameAt(plan, t);
    assert.ok(f.atoms.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y)));
  }
  // 开始时断键可见，结束时生成物键全部出现、断键消失
  const start = frameAt(plan, 0);
  const end = frameAt(plan, 12);
  assert.ok(start.bonds.filter((b) => b.fate === 'break').every((b) => b.alpha === 1));
  assert.ok(end.bonds.filter((b) => b.fate === 'break').every((b) => b.alpha === 0));
  assert.ok(end.bonds.filter((b) => b.fate === 'form').every((b) => b.alpha === 1));
  assert.equal(end.phase, 'product');

  assert.equal(buildReactionPlan({ equation: 'n C₂H₄ → ‑[CH₂‑CH₂]ₙ‑', steps }, (s) => s.t, 12), null);
  assert.deepEqual(parseSides('2 H₂ + O₂ → 2 H₂O').left, [
    { formula: 'H2', coef: 2 },
    { formula: 'O2', coef: 1 },
  ]);
});
