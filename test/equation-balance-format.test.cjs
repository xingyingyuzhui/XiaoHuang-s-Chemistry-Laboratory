/**
 * 配平结果：= 分隔 + 生成物状态符号标注
 */
const test = require('node:test');
const assert = require('node:assert/strict');

test('balanceEquation uses = and annotates O2↑', async () => {
  const { balanceEquation } = await import('../src/equation-balance.js');
  const r = balanceEquation(
    '2KMnO4+5H2O2+3H2SO4=2MnSO4+5O2+K2SO4+8H2O',
  );
  assert.match(r.equation, /=/);
  assert.doesNotMatch(r.equation, /→/);
  assert.match(r.equation, /O₂↑/);
  assert.equal(
    r.right.find((s) => s.formula === 'O2')?.marker,
    '↑',
  );
});

test('balanceEquation water combustion has = and no ↑ on H2O', async () => {
  const { balanceEquation } = await import('../src/equation-balance.js');
  const r = balanceEquation('H2+O2=H2O');
  assert.equal(r.equation, '2H₂ + O₂ = 2H₂O');
  assert.equal(r.right.find((s) => s.formula === 'H2O')?.marker, '');
});

test('balanceEquation annotates CO2↑ and CaCO3↓', async () => {
  const { balanceEquation } = await import('../src/equation-balance.js');
  const gas = balanceEquation('CaCO3+2HCl=CaCl2+H2O+CO2');
  assert.match(gas.equation, /CO₂↑/);
  const ppt = balanceEquation('CO2+Ca(OH)2=CaCO3+H2O');
  assert.match(ppt.equation, /CaCO₃↓/);
});

test('input CO2↑ does not double-mark', async () => {
  const { balanceEquation, speciesFromEquation } = await import(
    '../src/equation-balance.js'
  );
  const sides = speciesFromEquation('CaCO3+2HCl=CaCl2+H2O+CO2↑');
  assert.equal(sides.right.find((s) => s.formula === 'CO2')?.marker, '↑');
  assert.equal(sides.right.find((s) => s.formula === 'CO2')?.formula, 'CO2');
  const r = balanceEquation('CaCO3+2HCl=CaCl2+H2O+CO2↑');
  assert.equal((r.equation.match(/↑/g) || []).length, 1);
});

test('reactant O2 is not annotated', async () => {
  const { balanceEquation } = await import('../src/equation-balance.js');
  const r = balanceEquation('2H2+O2=2H2O');
  assert.equal(r.left.find((s) => s.formula === 'O2')?.marker, '');
  assert.doesNotMatch(r.equation.split('=')[0], /↑/);
});

test('equationsEquivalent ignores markers and arrow glyph', async () => {
  const { equationsEquivalent } = await import('../src/equation-balance.js');
  assert.equal(
    equationsEquivalent('C+O2=CO2', 'C + O2 = CO2↑'),
    true,
  );
  assert.equal(
    equationsEquivalent('2H2+O2=2H2O', '2H₂ + O₂ → 2H₂O'),
    true,
  );
});

test('mergeMarkersFromEquation prefers AI product markers', async () => {
  const {
    balanceEquation,
    mergeMarkersFromEquation,
    formatEquation,
  } = await import('../src/equation-balance.js');
  const local = balanceEquation('N2+H2=NH3');
  // strip local markers then merge from AI that marks NH3
  local.right.forEach((s) => {
    s.marker = '';
  });
  const merged = mergeMarkersFromEquation(
    'N2 + 3H2 = 2NH3↑',
    { left: local.left, right: local.right },
  );
  assert.equal(merged.right.find((s) => s.formula === 'NH3')?.marker, '↑');
  const eq = formatEquation(merged.left, merged.right, { annotate: false });
  assert.match(eq, /NH₃↑/);
  assert.match(eq, /=/);
});

test('mergeMarkersFromEquation drops reactant AI markers', async () => {
  const {
    balanceEquation,
    mergeMarkersFromEquation,
  } = await import('../src/equation-balance.js');
  const local = balanceEquation('2H2+O2=2H2O');
  const merged = mergeMarkersFromEquation('2H2↑ + O2 = 2H2O', {
    left: local.left.map((s) => ({ ...s, marker: '' })),
    right: local.right.map((s) => ({ ...s, marker: '' })),
  });
  assert.equal(merged.left.find((s) => s.formula === 'H2')?.marker, '');
});

test('annotate:false skips whitelist and AI markers', async () => {
  const {
    balanceEquation,
    mergeMarkersFromEquation,
    formatEquation,
  } = await import('../src/equation-balance.js');
  const r = balanceEquation('CaCO3+2HCl=CaCl2+H2O+CO2', { annotate: false });
  assert.doesNotMatch(r.equation, /[↑↓]/);
  assert.equal(r.right.find((s) => s.formula === 'CO2')?.marker, '');

  const local = balanceEquation('N2+H2=NH3', { annotate: false });
  const merged = mergeMarkersFromEquation(
    'N2 + 3H2 = 2NH3↑',
    { left: local.left, right: local.right },
    { annotate: false },
  );
  assert.equal(merged.right.find((s) => s.formula === 'NH3')?.marker, '');
  const eq = formatEquation(merged.left, merged.right, { annotate: false });
  assert.doesNotMatch(eq, /↑/);
});

test('annotate:false keeps user-typed product markers', async () => {
  const { balanceEquation } = await import('../src/equation-balance.js');
  const r = balanceEquation('CaCO3+2HCl=CaCl2+H2O+CO2↑', { annotate: false });
  assert.equal(r.right.find((s) => s.formula === 'CO2')?.marker, '↑');
  assert.match(r.equation, /CO₂↑/);
});

test('STATE_MARKER_LISTS is externalized and used', async () => {
  const { STATE_MARKER_LISTS } = await import('../src/data/equation-state-markers.js');
  assert.ok(STATE_MARKER_LISTS.gas.includes('O2'));
  assert.ok(STATE_MARKER_LISTS.ppt.includes('CaCO3'));
  assert.ok(!STATE_MARKER_LISTS.gas.includes('H2O'));
});

test('toAscii strips phase labels (g)/(aq) and fullwidth ops', async () => {
  const { speciesFromEquation, balanceEquation } = await import(
    '../src/equation-balance.js'
  );
  const sp = speciesFromEquation('H2(g) + O2(g) = H2O(l)');
  assert.ok(sp);
  assert.equal(sp.left[0].formula, 'H2');
  assert.equal(sp.right[0].formula, 'H2O');
  const r = balanceEquation('H2(g)+O2(g)=H2O(l)');
  assert.match(r.equation, /=/);
  assert.ok(speciesFromEquation('Fe＋O2＝Fe2O3'));
});

test('startEquationFromSides resets coefs for practice start', async () => {
  const { startEquationFromSides } = await import(
    '../src/ai-classroom/balance-model.js'
  );
  const { balanceEquation, speciesFromEquation } = await import(
    '../src/equation-balance.js'
  );
  const bal = balanceEquation('Fe+O2=Fe2O3');
  const start = startEquationFromSides({ left: bal.left, right: bal.right });
  const sp = speciesFromEquation(start);
  assert.ok(sp);
  assert.ok(sp.left.every((s) => s.coef === 1));
  assert.ok(sp.right.every((s) => s.coef === 1));
  assert.doesNotMatch(start, /[↑↓]/);
});
