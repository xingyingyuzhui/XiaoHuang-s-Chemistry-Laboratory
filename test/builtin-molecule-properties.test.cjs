const test = require('node:test');
const assert = require('node:assert/strict');

const { BUILTIN_MOLECULES } = require('../server/seed/builtin-molecules');
const { ATOMIC_WEIGHTS } = require('../server/utils/chem-reference');

function parseNum(str) {
  const m = String(str || '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

function molarMassOf(atoms) {
  return (atoms || []).reduce((sum, a) => sum + (ATOMIC_WEIGHTS[a.el || a.element] || 0), 0);
}

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

test('built-in molecule physical properties satisfy textbook thermodynamic sanity checks', () => {
  for (const m of BUILTIN_MOLECULES) {
    const { state, density, meltingPoint, boilingPoint } = m.physics;
    const mp = parseNum(meltingPoint);
    const bp = parseNum(boilingPoint);
    assert.ok(Number.isFinite(mp), `${m.id} meltingPoint must contain a number: ${meltingPoint}`);
    assert.ok(Number.isFinite(bp), `${m.id} boilingPoint must contain a number: ${boilingPoint}`);

    const sublimesAt1Atm = /升华/.test(meltingPoint) || /升华/.test(boilingPoint);
    if (sublimesAt1Atm) {
      // Subliming gases (CO2, C2H2) have triple point pressure > 1 atm: melting requires pressure
      assert.match(meltingPoint, /加压/, `${m.id} melts only under pressure; annotate 加压`);
      assert.match(boilingPoint, /升华/, `${m.id} sublimes at 1 atm; annotate 升华`);
    } else {
      assert.ok(mp < bp, `${m.id} must satisfy meltingPoint (${mp}) < boilingPoint (${bp})`);
    }

    // Gaseous density in g/L must match ideal-gas STP density M / 22.414 within ±15%
    if (state === '气态') {
      assert.match(density, /g\/L$/, `${m.id} gas density should use g/L, got ${density}`);
      const rho = parseNum(density);
      const expected = molarMassOf(m.atoms) / 22.414;
      const relErr = Math.abs(rho - expected) / expected;
      assert.ok(
        relErr <= 0.15,
        `${m.id} gas density ${rho} g/L deviates ${(relErr * 100).toFixed(1)}% from STP M/22.414 = ${expected.toFixed(3)} g/L`,
      );
    }
  }
});
