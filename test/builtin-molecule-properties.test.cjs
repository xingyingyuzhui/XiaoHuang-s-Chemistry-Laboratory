const test = require('node:test');
const assert = require('node:assert/strict');

const { BUILTIN_MOLECULES } = require('../server/seed/builtin-molecules');

test('every built-in molecule includes physical and chemical property data', () => {
  for (const molecule of BUILTIN_MOLECULES) {
    assert.deepEqual(
      Object.keys(molecule.physics || {}).sort(),
      ['boilingPoint', 'density', 'meltingPoint', 'state'],
      `${molecule.id} is missing physical properties`,
    );
    assert.deepEqual(
      Object.keys(molecule.chemistry || {}).sort(),
      ['acidity', 'reactivity', 'solubility'],
      `${molecule.id} is missing chemical properties`,
    );
  }
});
