/**
 * 客户端 equation-balance 与服务端 eq-sides 解析结果对齐，防止双份实现漂移
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const serverEq = require('../server/utils/eq-sides');

const FIXTURES = [
  'H2 + O2 = H2O',
  '2H2 + O2 = 2H2O',
  'Fe + O2 = Fe2O3',
  '4Fe + 3O2 = 2Fe2O3',
  'C2H5OH + O2 = CO2 + H2O',
  '2H₂ + O₂ → 2H₂O',
  '(NH4)2SO4 = NH4 + SO4', // 结构解析，不要求守恒
  'CaCO3 + 2HCl = CaCl2 + H2O + CO2↑',
  'H2(g) + O2(g) = H2O(l)',
  'Fe＋O2＝Fe2O3',
];

test('client speciesFromEquation matches server for fixtures', async () => {
  const client = await import('../src/equation-balance.js');
  for (const eq of FIXTURES) {
    const a = client.speciesFromEquation(eq);
    const b = serverEq.speciesFromEquation(eq);
    assert.deepEqual(a, b, `species mismatch for ${eq}`);
  }
});

test('trailing state marker is stripped into marker field', async () => {
  const client = await import('../src/equation-balance.js');
  const a = client.speciesFromEquation('C + O2 = CO2↑');
  const b = serverEq.speciesFromEquation('C + O2 = CO2↑');
  assert.equal(a.right[0].formula, 'CO2');
  assert.equal(a.right[0].marker, '↑');
  assert.deepEqual(a, b);
});

test('client checkConservation ok matches server isEquationConserved', async () => {
  const client = await import('../src/equation-balance.js');
  const pairs = [
    ['2H2 + O2 = 2H2O', true],
    ['H2 + O2 = H2O', false],
    ['4Fe + 3O2 = 2Fe2O3', true],
    ['Fe + O2 = Fe2O3', false],
  ];
  for (const [eq, expect] of pairs) {
    const c = client.checkConservation(eq);
    const s = serverEq.isEquationConserved(eq);
    assert.equal(c.ok, expect, `client conservation for ${eq}`);
    assert.equal(s, expect, `server conservation for ${eq}`);
  }
});
