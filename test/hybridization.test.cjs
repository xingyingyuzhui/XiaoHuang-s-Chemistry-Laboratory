const test = require('node:test');
const assert = require('node:assert/strict');

// Minimal molecule fixtures matching real src/data/molecules.js structure
const FIXTURES = {
  ch4: {
    atoms: [
      { el: 'C', x: 0, y: 0, z: 0 },
      { el: 'H', x: 0.63, y: 0.63, z: 0.63 },
      { el: 'H', x: -0.63, y: -0.63, z: 0.63 },
      { el: 'H', x: -0.63, y: 0.63, z: -0.63 },
      { el: 'H', x: 0.63, y: -0.63, z: -0.63 },
    ],
    bonds: [[0, 1], [0, 2], [0, 3], [0, 4]],
  },
  c2h4: {
    atoms: [
      { el: 'C', x: -0.67, y: 0, z: 0 },
      { el: 'C', x: 0.67, y: 0, z: 0 },
      { el: 'H', x: -1.23, y: 0.93, z: 0 },
      { el: 'H', x: -1.23, y: -0.93, z: 0 },
      { el: 'H', x: 1.23, y: 0.93, z: 0 },
      { el: 'H', x: 1.23, y: -0.93, z: 0 },
    ],
    bonds: [[0, 1], [0, 1], [0, 2], [0, 3], [1, 4], [1, 5]],
  },
  c2h2: {
    atoms: [
      { el: 'C', x: -0.6, y: 0, z: 0 },
      { el: 'C', x: 0.6, y: 0, z: 0 },
      { el: 'H', x: -1.66, y: 0, z: 0 },
      { el: 'H', x: 1.66, y: 0, z: 0 },
    ],
    bonds: [[0, 1], [0, 1], [0, 1], [0, 2], [1, 3]],
  },
  h2o: {
    atoms: [
      { el: 'O', x: 0, y: 0, z: 0 },
      { el: 'H', x: 0.76, y: 0.59, z: 0 },
      { el: 'H', x: -0.76, y: 0.59, z: 0 },
    ],
    bonds: [[0, 1], [0, 2]],
  },
  nh3: {
    atoms: [
      { el: 'N', x: 0, y: 0.15, z: 0 },
      { el: 'H', x: 0.94, y: -0.3, z: 0 },
      { el: 'H', x: -0.47, y: -0.3, z: 0.81 },
      { el: 'H', x: -0.47, y: -0.3, z: -0.81 },
    ],
    bonds: [[0, 1], [0, 2], [0, 3]],
  },
  co2: {
    atoms: [
      { el: 'C', x: 0, y: 0, z: 0 },
      { el: 'O', x: 1.16, y: 0, z: 0 },
      { el: 'O', x: -1.16, y: 0, z: 0 },
    ],
    bonds: [[0, 1], [0, 1], [0, 2], [0, 2]],
  },
  hcho: {
    atoms: [
      { el: 'C', x: 0, y: 0, z: 0 },
      { el: 'O', x: 1.2, y: 0, z: 0 },
      { el: 'H', x: -0.55, y: 0.95, z: 0 },
      { el: 'H', x: -0.55, y: -0.95, z: 0 },
    ],
    bonds: [[0, 1], [0, 1], [0, 2], [0, 3]],
  },
};

let inferHybridization;

test.before(async () => {
  const mod = await import('../src/chem/hybridization.js');
  inferHybridization = mod.inferHybridization;
});

// ── Golden cases ──

test('methane C → sp³', () => {
  const r = inferHybridization(FIXTURES.ch4, 0);
  assert.equal(r.el, 'C');
  assert.equal(r.hybrid, 'sp3');
  assert.equal(r.hybridLabel, 'sp³');
  assert.equal(r.geometry, '四面体');
  assert.equal(r.sigmaDirs, 4);
  assert.equal(r.source, 'inferred');
  assert.ok(r.tip.includes('sp³'));
});

test('ethylene C → sp²', () => {
  const r = inferHybridization(FIXTURES.c2h4, 0);
  assert.equal(r.hybrid, 'sp2');
  assert.equal(r.hybridLabel, 'sp²');
  assert.equal(r.geometry, '平面三角');
  assert.equal(r.sigmaDirs, 3);
  assert.ok(r.tip.includes('sp²'));
});

test('acetylene C → sp', () => {
  const r = inferHybridization(FIXTURES.c2h2, 0);
  assert.equal(r.hybrid, 'sp');
  assert.equal(r.hybridLabel, 'sp');
  assert.equal(r.geometry, '直线');
  assert.equal(r.sigmaDirs, 2);
  assert.ok(r.tip.includes('sp'));
});

test('water O → sp³', () => {
  const r = inferHybridization(FIXTURES.h2o, 0);
  assert.equal(r.el, 'O');
  assert.equal(r.hybrid, 'sp3');
  assert.equal(r.hybridLabel, 'sp³');
  assert.equal(r.sigmaDirs, 2);
  assert.equal(r.lonePairs, 2);
  assert.equal(r.electronPairs, 4);
  assert.ok(r.tip.includes('sp³'));
});

test('ammonia N → sp³', () => {
  const r = inferHybridization(FIXTURES.nh3, 0);
  assert.equal(r.el, 'N');
  assert.equal(r.hybrid, 'sp3');
  assert.equal(r.hybridLabel, 'sp³');
  assert.equal(r.sigmaDirs, 3);
  assert.equal(r.lonePairs, 1);
  assert.equal(r.electronPairs, 4);
});

test('CO2 C → sp', () => {
  const r = inferHybridization(FIXTURES.co2, 0);
  assert.equal(r.hybrid, 'sp');
  assert.equal(r.hybridLabel, 'sp');
  assert.equal(r.sigmaDirs, 2);
});

test('formaldehyde C → sp²', () => {
  const r = inferHybridization(FIXTURES.hcho, 0);
  assert.equal(r.hybrid, 'sp2');
  assert.equal(r.hybridLabel, 'sp²');
  assert.equal(r.sigmaDirs, 3);
});

// ── H → none ──

test('hydrogen atom → none (no sp hybridization)', () => {
  const r = inferHybridization(FIXTURES.ch4, 1); // H at index 1
  assert.equal(r.el, 'H');
  assert.equal(r.hybrid, 'none');
  assert.equal(r.hybridLabel, '—');
  assert.ok(r.tip.includes('1s'));
});

// ── Edge cases ──

test('empty bonds → unknown, no throw', () => {
  const mol = { atoms: [{ el: 'C', x: 0, y: 0, z: 0 }], bonds: [] };
  const r = inferHybridization(mol, 0);
  assert.equal(r.hybrid, 'unknown');
  assert.doesNotMatch(r.tip, /sp[²³]?/);
});

test('out-of-range index → unknown, no throw', () => {
  const r = inferHybridization(FIXTURES.ch4, 99);
  assert.equal(r.hybrid, 'unknown');
});

test('null molecule → unknown, no throw', () => {
  const r = inferHybridization(null, 0);
  assert.equal(r.hybrid, 'unknown');
});

test('metal atom → na', () => {
  const mol = {
    atoms: [{ el: 'Na', x: 0, y: 0, z: 0 }, { el: 'Cl', x: 1, y: 0, z: 0 }],
    bonds: [[0, 1]],
  };
  const r = inferHybridization(mol, 0);
  assert.equal(r.hybrid, 'na');
  assert.ok(r.tip.includes('不讨论杂化'));
});

test('result has all required fields', () => {
  const r = inferHybridization(FIXTURES.ch4, 0);
  assert.ok(typeof r.atomIndex === 'number');
  assert.ok(typeof r.el === 'string');
  assert.ok(typeof r.hybrid === 'string');
  assert.ok(typeof r.hybridLabel === 'string');
  assert.ok(typeof r.geometry === 'string');
  assert.ok(typeof r.sigmaDirs === 'number');
  assert.ok(typeof r.reason === 'string');
  assert.ok(typeof r.tip === 'string');
  assert.ok(typeof r.label === 'string');
  assert.equal(r.source, 'inferred');
});

test('NH4-like N (4 bonds) → sp³ not unknown', () => {
  const mol = {
    atoms: [
      { el: 'N', x: 0, y: 0, z: 0 },
      { el: 'H', x: 1, y: 0, z: 0 },
      { el: 'H', x: -1, y: 0, z: 0 },
      { el: 'H', x: 0, y: 1, z: 0 },
      { el: 'H', x: 0, y: -1, z: 0 },
    ],
    bonds: [[0, 1], [0, 2], [0, 3], [0, 4]],
  };
  const r = inferHybridization(mol, 0);
  assert.equal(r.hybrid, 'sp3');
  assert.equal(r.sigmaDirs, 4);
  assert.equal(r.lonePairs, 0);
  assert.equal(r.electronPairs, 4);
});

test('BF3 B tip mentions sigma count and does not claim double bond', () => {
  const mol = {
    atoms: [
      { el: 'B', x: 0, y: 0, z: 0 },
      { el: 'F', x: 1, y: 0, z: 0 },
      { el: 'F', x: -0.5, y: 0.9, z: 0 },
      { el: 'F', x: -0.5, y: -0.9, z: 0 },
    ],
    bonds: [[0, 1], [0, 2], [0, 3]],
  };
  const r = inferHybridization(mol, 0);
  assert.equal(r.hybrid, 'sp2');
  assert.match(r.tip, /3 个 σ/);
  assert.doesNotMatch(r.tip, /双键/);
});

test('ethylene tip mentions actual sigma dirs and pi', () => {
  const r = inferHybridization(FIXTURES.c2h4, 0);
  assert.equal(r.hybrid, 'sp2');
  assert.match(r.tip, /3 个 σ/);
  assert.match(r.tip, /π|双键/);
});

test('molecule3d load clears selection handlers (source contract)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../src/molecule/viewer3d.js'), 'utf8');
  // load 中应在 clearRoot 之前 clearSelection，并始终通知 handler null
  const loadFn = src.match(/function load\(molecule\)\s*\{[\s\S]*?\n  function resize/);
  assert.ok(loadFn, 'load function body');
  const body = loadFn[0];
  const selAt = body.indexOf('clearSelection()');
  const rootAt = body.indexOf('clearRoot()');
  assert.ok(selAt >= 0 && rootAt >= 0 && selAt < rootAt, 'clearSelection before clearRoot');
  assert.match(body, /bondSelectHandler\?\.\(null\)/);
  assert.match(body, /atomSelectHandler\?\.\(null\)/);
});
