const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBalanceScript, validateStep } = require('../server/utils/balance-script-schema');

test('rejects missing title', () => {
  const r = validateBalanceScript({
    startEquation: 'H2 + O2 = H2O',
    targetEquation: '2H2 + O2 = 2H2O',
    species: { left: [{ formula: 'H2', coef: 1 }, { formula: 'O2', coef: 1 }], right: [{ formula: 'H2O', coef: 1 }] },
    steps: [{ label: '观察', tip: '看看', action: 'explain' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /名称/);
});

test('rejects empty steps', () => {
  const r = validateBalanceScript({
    title: '测试',
    startEquation: 'H2 + O2 = H2O',
    targetEquation: '2H2 + O2 = 2H2O',
    species: { left: [{ formula: 'H2', coef: 1 }, { formula: 'O2', coef: 1 }], right: [{ formula: 'H2O', coef: 1 }] },
    steps: [],
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /步骤/);
});

test('rejects steps with empty label', () => {
  const r = validateBalanceScript({
    title: '测试',
    startEquation: 'H2 + O2 = H2O',
    targetEquation: '2H2 + O2 = 2H2O',
    species: { left: [{ formula: 'H2', coef: 1 }, { formula: 'O2', coef: 1 }], right: [{ formula: 'H2O', coef: 1 }] },
    steps: [{ label: '', tip: 'x', action: 'explain' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /标题/);
});

test('rejects set_coef step without focus', () => {
  const r = validateBalanceScript({
    title: '测试',
    startEquation: 'H2 + O2 = H2O',
    targetEquation: '2H2 + O2 = 2H2O',
    species: { left: [{ formula: 'H2', coef: 1 }, { formula: 'O2', coef: 1 }], right: [{ formula: 'H2O', coef: 1 }] },
    steps: [{ label: '配', tip: 'x', action: 'set_coef', expectedCoef: 2 }],
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /focus/);
});

test('rejects set_coef step with out-of-range focus index', () => {
  const r = validateBalanceScript({
    title: '测试',
    startEquation: 'H2 + O2 = H2O',
    targetEquation: '2H2 + O2 = 2H2O',
    species: { left: [{ formula: 'H2', coef: 1 }, { formula: 'O2', coef: 1 }], right: [{ formula: 'H2O', coef: 1 }] },
    steps: [{ label: '配', tip: 'x', action: 'set_coef', focus: { side: 'left', index: 5 }, expectedCoef: 2 }],
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /index/);
});

test('accepts valid script', () => {
  const r = validateBalanceScript({
    title: '氢氧燃烧',
    startEquation: 'H2 + O2 = H2O',
    targetEquation: '2H2 + O2 = 2H2O',
    species: { left: [{ formula: 'H2', coef: 1 }, { formula: 'O2', coef: 1 }], right: [{ formula: 'H2O', coef: 1 }] },
    steps: [
      { label: '观察', tip: '数原子', action: 'explain' },
      { label: '配氢', tip: 'H 系数取 2', action: 'set_coef', focus: { side: 'left', index: 0 }, expectedCoef: 2 },
      { label: '检查', tip: '核对', action: 'check' },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.script.title, '氢氧燃烧');
  assert.equal(r.script.steps.length, 3);
});

test('rejects more than 12 steps', () => {
  const steps = Array.from({ length: 13 }, (_, i) => ({ label: `步${i}`, tip: 'x', action: 'explain' }));
  const r = validateBalanceScript({
    title: '太多步',
    startEquation: 'H2 + O2 = H2O',
    targetEquation: '2H2 + O2 = 2H2O',
    species: { left: [{ formula: 'H2', coef: 1 }, { formula: 'O2', coef: 1 }], right: [{ formula: 'H2O', coef: 1 }] },
    steps,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /步骤/);
});

test('rejects invalid action', () => {
  const r = validateBalanceScript({
    title: '测试',
    startEquation: 'H2 + O2 = H2O',
    targetEquation: '2H2 + O2 = 2H2O',
    species: { left: [{ formula: 'H2', coef: 1 }, { formula: 'O2', coef: 1 }], right: [{ formula: 'H2O', coef: 1 }] },
    steps: [{ label: 'x', tip: 'x', action: 'invalid' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /action/);
});

test('rejects empty startEquation', () => {
  const r = validateBalanceScript({
    title: '测试',
    startEquation: '',
    targetEquation: '2H2 + O2 = 2H2O',
    species: { left: [{ formula: 'H2', coef: 1 }], right: [{ formula: 'H2O', coef: 1 }] },
    steps: [{ label: 'x', tip: 'x', action: 'explain' }],
  });
  assert.equal(r.ok, false);
});

test('rejects empty targetEquation', () => {
  const r = validateBalanceScript({
    title: '测试',
    startEquation: 'H2 + O2 = H2O',
    targetEquation: '',
    species: { left: [{ formula: 'H2', coef: 1 }], right: [{ formula: 'H2O', coef: 1 }] },
    steps: [{ label: 'x', tip: 'x', action: 'explain' }],
  });
  assert.equal(r.ok, false);
});

test('rejects unbalanced targetEquation', () => {
  const r = validateBalanceScript({
    title: '未配平目标',
    startEquation: 'H2 + O2 = H2O',
    targetEquation: 'H2 + O2 = H2O',
    species: {
      left: [{ formula: 'H2', coef: 1 }, { formula: 'O2', coef: 1 }],
      right: [{ formula: 'H2O', coef: 1 }],
    },
    steps: [{ label: 'x', tip: 'x', action: 'explain' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /守恒/);
});

test('auto-fills species from startEquation when missing', () => {
  const r = validateBalanceScript({
    title: '自动物种',
    startEquation: 'H2 + O2 = H2O',
    targetEquation: '2H2 + O2 = 2H2O',
    steps: [
      { label: '观察', tip: '数原子', action: 'explain' },
      { label: '配氢', tip: '取 2', action: 'set_coef', focus: { side: 'left', index: 0 }, expectedCoef: 2 },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.script.species.left.length, 2);
  assert.equal(r.script.species.right.length, 1);
  assert.equal(r.script.species.left[0].formula, 'H2');
});

test('auto-fills species when empty arrays', () => {
  const r = validateBalanceScript({
    title: '空 species',
    startEquation: 'Fe + O2 = Fe2O3',
    targetEquation: '4Fe + 3O2 = 2Fe2O3',
    species: { left: [], right: [] },
    steps: [{ label: '观察', tip: '先看 Fe', action: 'explain' }],
  });
  assert.equal(r.ok, true);
  assert.ok(r.script.species.left.length >= 1);
});
