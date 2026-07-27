const test = require('node:test');
const assert = require('node:assert/strict');

test('balance-model: draftToPayload fills species from startEquation', async () => {
  const { draftToPayload, isPracticeFinished, buildEquation } = await import(
    '../src/ai-classroom/balance-model.js'
  );

  const built = draftToPayload({
    title: '新建',
    grade: '',
    difficulty: '',
    startEquation: 'H2 + O2 = H2O',
    targetEquation: '2H2 + O2 = 2H2O',
    species: { left: [], right: [] },
    steps: [{ label: '观察', tip: 'tip', action: 'explain', focus: null, expectedCoef: null }],
  });
  assert.equal(built.ok, true);
  assert.equal(built.payload.species.left.length, 2);
  assert.equal(built.payload.species.right[0].formula, 'H2O');
});

test('balance-model: isPracticeFinished uses equivalence not raw string', async () => {
  const { isPracticeFinished } = await import('../src/ai-classroom/balance-model.js');
  const species = {
    left: [{ formula: 'H2', coef: 1 }, { formula: 'O2', coef: 1 }],
    right: [{ formula: 'H2O', coef: 1 }],
  };
  const coefs = { left: [2, 1], right: [2] };
  assert.equal(isPracticeFinished(species, coefs, '2H2 + O2 = 2H2O'), true);
  assert.equal(isPracticeFinished(species, coefs, '2H₂ + O₂ → 2H₂O'), true);
  assert.equal(isPracticeFinished(species, coefs, 'H2 + O2 = H2O'), false);
  assert.equal(isPracticeFinished(species, { left: [1, 1], right: [1] }, '2H2 + O2 = 2H2O'), false);
});

test('balance-model: buildEquation format accepted by check', async () => {
  const { buildEquation, isPracticeFinished } = await import('../src/ai-classroom/balance-model.js');
  const species = {
    left: [{ formula: 'Fe' }, { formula: 'O2' }],
    right: [{ formula: 'Fe2O3' }],
  };
  const coefs = { left: [4, 3], right: [2] };
  const eq = buildEquation(species, coefs);
  assert.match(eq, /Fe/);
  assert.equal(isPracticeFinished(species, coefs, '4Fe + 3O2 = 2Fe2O3'), true);
});

test('balance-model: buildPracticeStepsFromEquations adds set_coef for target coefs', async () => {
  const { buildPracticeStepsFromEquations } = await import('../src/ai-classroom/balance-model.js');
  const steps = buildPracticeStepsFromEquations('H2 + O2 = H2O', '2H2 + O2 = 2H2O', ['先配氢']);
  assert.ok(steps.some((s) => s.action === 'explain'));
  assert.ok(steps.some((s) => s.action === 'check'));
  const coefSteps = steps.filter((s) => s.action === 'set_coef');
  assert.ok(coefSteps.length >= 1);
  assert.ok(coefSteps.every((s) => s.focus && s.expectedCoef >= 2));
  assert.ok(steps.some((s) => /思路/.test(s.label)));
});
