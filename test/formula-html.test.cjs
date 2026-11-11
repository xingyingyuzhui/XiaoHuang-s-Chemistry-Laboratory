const test = require('node:test');
const assert = require('node:assert/strict');

test('formulaHtml subscripts atom counts but not hydrate coefficients', async () => {
  const { formulaHtml } = await import('../src/chem/formula-html.js');
  assert.equal(formulaHtml('C6H12O6'), 'C<sub>6</sub>H<sub>12</sub>O<sub>6</sub>');
  assert.equal(formulaHtml('Ca(OH)2'), 'Ca(OH)<sub>2</sub>');
  assert.equal(formulaHtml('[Fe(CN)6]'), '[Fe(CN)<sub>6</sub>]');
  assert.equal(formulaHtml('CuSO4·5H2O'), 'CuSO<sub>4</sub>·5H<sub>2</sub>O');
  assert.equal(formulaHtml('H₂O'), 'H<sub>2</sub>O');
  assert.equal(formulaHtml('NaCl'), 'NaCl');
  assert.equal(formulaHtml('<b>'), '&lt;b&gt;');
  assert.equal(formulaHtml(''), '');
});
