/**
 * 3D 晶体与晶胞纯数学引擎 & 21 种内置晶体数据回归测试
 */
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const loadEsm = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const EXPECTED_IDS = [
  'po', 'na', 'fe', 'cu', 'mg',
  'nacl', 'cscl', 'caf2', 'zns', 'mgo', 'tio2',
  'diamond', 'si', 'sio2', 'sic',
  'co2', 'ice', 'i2', 'c60',
  'graphite', 'hbn',
];

test('crystals barrel exports 5 categories and all 21 crystals with complete schema', async () => {
  const { CRYSTAL_CATEGORIES, CRYSTALS, getCrystalById } = await loadEsm('src/crystal/data/crystals.js');

  assert.deepEqual(
    CRYSTAL_CATEGORIES.map((c) => c.id),
    ['metallic', 'ionic', 'covalent', 'molecular', 'mixed'],
  );
  assert.equal(CRYSTALS.length, 21);
  assert.deepEqual(CRYSTALS.map((c) => c.id), EXPECTED_IDS);
  assert.equal(getCrystalById('does-not-exist'), null);

  for (const id of EXPECTED_IDS) {
    const c = getCrystalById(id);
    assert.ok(c, `missing crystal ${id}`);
    assert.ok(c.name && c.formula && c.subtitle && c.averagingFormula, `missing text fields on ${id}`);
    assert.ok(['cubic', 'tetragonal', 'orthorhombic', 'hexagonal'].includes(c.system), `bad system on ${id}`);
    assert.ok(c.lattice.a > 0 && c.lattice.b > 0 && c.lattice.c > 0, `bad lattice dims on ${id}`);
    assert.ok(Array.isArray(c.species) && c.species.length > 0, `missing species on ${id}`);
    assert.ok(Array.isArray(c.atoms) && c.atoms.length > 0, `missing atoms on ${id}`);
    assert.ok(
      Number.isInteger(c.coordination?.centerIndex) &&
      c.coordination.centerIndex >= 0 &&
      c.coordination.centerIndex < c.atoms.length,
      `invalid coordination.centerIndex on ${id}`,
    );
    assert.ok(c.shortestDistance?.pair?.length === 2, `missing shortestDistance.pair on ${id}`);
    assert.ok(c.qa?.question && c.qa?.answer, `missing qa on ${id}`);

    const speciesIds = new Set(c.species.map((s) => s.id));
    for (const a of c.atoms) {
      assert.ok(speciesIds.has(a.species), `unknown species ${a.species} in ${id}`);
    }
  }
});

test('computeAveragingBreakdown matches countPerCell within 1e-6 for all 21 crystals', async () => {
  const { CRYSTALS, getCrystalById } = await loadEsm('src/crystal/data/crystals.js');
  const { computeAveragingBreakdown } = await loadEsm('src/crystal/math/lattice.js');

  for (const c of CRYSTALS) {
    const breakdown = computeAveragingBreakdown(c);
    let expectedTotal = 0;
    for (const sp of c.species) {
      const stat = breakdown.bySpecies[sp.id];
      assert.ok(stat, `missing breakdown for ${c.id}:${sp.id}`);
      assert.ok(
        Math.abs(stat.total - sp.countPerCell) < 1e-6,
        `${c.id}:${sp.id} expected ${sp.countPerCell}, got ${stat.total}`,
      );
      expectedTotal += sp.countPerCell;
    }
    assert.ok(
      Math.abs(breakdown.totalAtoms - expectedTotal) < 1e-6,
      `${c.id} totalAtoms expected ${expectedTotal}, got ${breakdown.totalAtoms}`,
    );
  }

  // 六方晶系关键均摊验证：Mg Z=2, Graphite Z=4, h-BN B=2 & N=2
  assert.equal(computeAveragingBreakdown(getCrystalById('mg')).totalAtoms, 2);
  assert.equal(computeAveragingBreakdown(getCrystalById('graphite')).totalAtoms, 4);
  const hbn = computeAveragingBreakdown(getCrystalById('hbn'));
  assert.equal(hbn.bySpecies.B.total, 2);
  assert.equal(hbn.bySpecies.N.total, 2);
});

test('clip planes and cell corners classify interior vs exterior accurately across all crystal systems', async () => {
  const { CRYSTALS } = await loadEsm('src/crystal/data/crystals.js');
  const { fracToCartesian, getCellCorners, getCellClipPlanes } = await loadEsm('src/crystal/math/lattice.js');

  const outsideFracs = [
    [-0.2, 0.5, 0.5],
    [1.2, 0.5, 0.5],
    [0.5, -0.2, 0.5],
    [0.5, 1.2, 0.5],
    [0.5, 0.5, -0.2],
    [0.5, 0.5, 1.2],
  ];

  for (const c of CRYSTALS) {
    const center = fracToCartesian(0.5, 0.5, 0.5, c.lattice, 2.4);
    assert.ok(Math.hypot(center.x, center.y, center.z) < 1e-9, `${c.id} center not at origin`);

    const { vertices, edges } = getCellCorners(c.lattice, 2.4);
    assert.equal(vertices.length, 8);
    assert.equal(edges.length, 12);

    const planes = getCellClipPlanes(c.lattice, 2.4);
    assert.equal(planes.length, 6);
    for (const p of planes) {
      const nLen = Math.hypot(p.normal[0], p.normal[1], p.normal[2]);
      assert.ok(Math.abs(nLen - 1) < 1e-6, `${c.id} plane normal not normalized`);
      assert.ok(p.constant > 0, `${c.id} origin should be strictly inside clip plane`);
    }

    for (const a of c.atoms) {
      const pt = fracToCartesian(a.u, a.v, a.w, c.lattice, 2.4);
      for (const p of planes) {
        const signed = p.normal[0] * pt.x + p.normal[1] * pt.y + p.normal[2] * pt.z + p.constant;
        assert.ok(signed >= -1e-6, `${c.id} atom outside clip plane: ${signed}`);
      }
    }

    for (const [u, v, w] of outsideFracs) {
      const pt = fracToCartesian(u, v, w, c.lattice, 2.4);
      const allInside = planes.every(
        (p) => p.normal[0] * pt.x + p.normal[1] * pt.y + p.normal[2] * pt.z + p.constant >= -1e-4,
      );
      assert.equal(allInside, false, `${c.id} exterior point (${u},${v},${w}) classified inside`);
    }
  }
});

test('computeBonds produces finite valid bonds and respects hetero bondRule', async () => {
  const { CRYSTALS } = await loadEsm('src/crystal/data/crystals.js');
  const { computeBonds } = await loadEsm('src/crystal/math/lattice.js');

  for (const c of CRYSTALS) {
    const bonds = computeBonds(c, 2.4);
    assert.ok(Array.isArray(bonds));
    if (c.bondCutoff > 0) {
      assert.ok(bonds.length > 0, `${c.id} expected bonds with cutoff ${c.bondCutoff}`);
    }
    for (const b of bonds) {
      assert.ok(b.aIndex >= 0 && b.aIndex < c.atoms.length);
      assert.ok(b.bIndex >= 0 && b.bIndex < c.atoms.length);
      assert.ok(
        Number.isFinite(b.p1.x) && Number.isFinite(b.p1.y) && Number.isFinite(b.p1.z) &&
        Number.isFinite(b.p2.x) && Number.isFinite(b.p2.y) && Number.isFinite(b.p2.z),
        `${c.id} non-finite bond endpoint`,
      );
      if (c.bondRule === 'hetero') {
        assert.notEqual(b.speciesA, b.speciesB, `${c.id} hetero rule violated`);
      }
    }
  }
});

test('computeDensity matches tabulated physical densities for all 21 crystals', async () => {
  const { CRYSTALS } = await loadEsm('src/crystal/data/crystals.js');
  const { computeDensity } = await loadEsm('src/crystal/math/lattice.js');

  for (const c of CRYSTALS) {
    const rho = computeDensity(c.density.Z, c.density.molarMass, c.lattice);
    assert.ok(Number.isFinite(rho) && rho > 0.5 && rho < 25, `${c.id} implausible density ${rho}`);
    assert.ok(
      Math.abs(rho - c.density.valueGcm3) < 0.05,
      `${c.id} computed density ${rho.toFixed(3)} differs from valueGcm3 ${c.density.valueGcm3}`,
    );
  }
});

test('Mg hexagonal supercell (3 cells) aligns exactly with emergent regular hexagonal prism', async () => {
  const { getCrystalById } = await loadEsm('src/crystal/data/crystals.js');
  const {
    fracToCartesian,
    computeSupercellOffsets,
    getHexPrismEdges,
  } = await loadEsm('src/crystal/math/lattice.js');

  const mg = getCrystalById('mg');
  assert.equal(mg.hexPrismHighlight, true);

  for (let n = 1; n <= 8; n++) {
    assert.equal(computeSupercellOffsets(n, 'cubic').length, n);
    assert.equal(computeSupercellOffsets(n, 'hexagonal').length, n);
  }

  const { vertices, edges } = getHexPrismEdges(mg.lattice, 2.4);
  assert.equal(vertices.length, 12);
  assert.equal(edges.length, 18);

  const scaleA = 2.4 * (mg.lattice.a / mg.lattice.c);
  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    const dBot = Math.hypot(
      vertices[i].x - vertices[next].x,
      vertices[i].y - vertices[next].y,
      vertices[i].z - vertices[next].z,
    );
    const dVert = Math.hypot(
      vertices[i].x - vertices[i + 6].x,
      vertices[i].y - vertices[i + 6].y,
      vertices[i].z - vertices[i + 6].z,
    );
    assert.ok(Math.abs(dBot - scaleA) < 1e-6, `hex bottom edge ${i} length ${dBot} != ${scaleA}`);
    assert.ok(Math.abs(dVert - 2.4) < 1e-6, `hex vertical edge ${i} length ${dVert} != 2.4`);
  }

  // 验证 3 个六方晶胞的原子位置完全覆盖正六棱柱的 12 个外顶点
  const offsets3 = computeSupercellOffsets(3, 'hexagonal');
  const origin = fracToCartesian(0, 0, 0, mg.lattice, 2.4);
  const atomKeys = new Set();
  for (const [du, dv, dw] of offsets3) {
    const shift = fracToCartesian(du, dv, dw, mg.lattice, 2.4);
    const sx = shift.x - origin.x;
    const sy = shift.y - origin.y;
    const sz = shift.z - origin.z;
    for (const a of mg.atoms) {
      const p = fracToCartesian(a.u, a.v, a.w, mg.lattice, 2.4);
      atomKeys.add(`${Math.round((p.x + sx) * 1000)}_${Math.round((p.y + sy) * 1000)}_${Math.round((p.z + sz) * 1000)}`);
    }
  }
  for (const v of vertices) {
    const k = `${Math.round(v.x * 1000)}_${Math.round(v.y * 1000)}_${Math.round(v.z * 1000)}`;
    assert.ok(atomKeys.has(k), `hex prism vertex ${k} not matched by 3-cell Mg atoms`);
  }
});

test('coordination centerIndex and shortestDistance.pair match actual periodic geometry for all 21 crystals', async () => {
  const { CRYSTALS } = await loadEsm('src/crystal/data/crystals.js');
  const { fracToCartesian } = await loadEsm('src/crystal/math/lattice.js');

  for (const c of CRYSTALS) {
    const center = c.atoms[c.coordination.centerIndex];
    const cp = fracToCartesian(center.u, center.v, center.w, c.lattice, 2.4);
    const cands = [];
    for (let du = -1; du <= 1; du++) {
      for (let dv = -1; dv <= 1; dv++) {
        for (let dw = -1; dw <= 1; dw++) {
          for (const a of c.atoms) {
            if (c.coordination.neighborSpecies && a.species !== c.coordination.neighborSpecies) continue;
            const p = fracToCartesian(a.u + du, a.v + dv, a.w + dw, c.lattice, 2.4);
            const d = Math.hypot(p.x - cp.x, p.y - cp.y, p.z - cp.z);
            if (d > 1e-3) cands.push({ p, d });
          }
        }
      }
    }
    cands.sort((a, b) => a.d - b.d);
    const tol = cands[0].d * 1.08 + 1e-3;
    const dedup = new Set();
    for (const x of cands) {
      if (x.d > tol) break;
      dedup.add(`${Math.round(x.p.x * 100)}_${Math.round(x.p.y * 100)}_${Math.round(x.p.z * 100)}`);
    }
    assert.equal(dedup.size, c.coordination.number, `${c.id} periodic CN mismatch`);

    const [pA, pB] = c.shortestDistance.pair;
    const ca = fracToCartesian(pA[0], pA[1], pA[2], c.lattice, 2.4);
    const cb = fracToCartesian(pB[0], pB[1], pB[2], c.lattice, 2.4);
    const maxLen = Math.max(c.lattice.a, c.lattice.b, c.lattice.c);
    const sdPm = Math.hypot(ca.x - cb.x, ca.y - cb.y, ca.z - cb.z) * (maxLen / 2.4);
    assert.ok(
      Math.abs(sdPm - c.shortestDistance.valuePm) < 3,
      `${c.id} shortestDistance ${sdPm.toFixed(1)} pm != ${c.shortestDistance.valuePm} pm`,
    );
  }
});

test('computeCellBoundRadius and computeCrystalFraming frame all 21 crystals cleanly without clipping', async () => {
  const { CRYSTALS } = await loadEsm('src/crystal/data/crystals.js');
  const { computeCellBoundRadius } = await loadEsm('src/crystal/math/lattice.js');
  const { computeCrystalFraming } = await loadEsm('src/crystal/scene/scene-helpers.js');

  const sinHalfV = Math.sin((38 * Math.PI) / 360);
  for (const c of CRYSTALS) {
    const rBall = computeCellBoundRadius(c, { tileCount: 1, displayMode: 'ball-stick' });
    const rSpace = computeCellBoundRadius(c, { tileCount: 1, displayMode: 'space-filling' });
    const rTile8 = computeCellBoundRadius(c, { tileCount: 8, displayMode: 'space-filling' });

    assert.ok(rSpace > rBall, `${c.id} space-filling bound radius should exceed ball-stick`);
    assert.ok(rTile8 > rSpace, `${c.id} 8-cell supercell bound radius should exceed single cell`);

    for (const mode of ['ball-stick', 'space-filling']) {
      const f = computeCrystalFraming(c, { fov: 38, aspect: 1.5 }, { tileCount: 1, displayMode: mode });
      const r = mode === 'space-filling' ? rSpace : rBall;
      const sphereFill = r / (f.dist * sinHalfV);
      assert.ok(
        sphereFill >= 0.55 && sphereFill <= 0.72,
        `${c.id} (${mode}) bounding sphere fill ${sphereFill.toFixed(3)} out of comfortable range`,
      );
      assert.ok(f.minDistance < f.dist && f.dist < f.maxDistance, `${c.id} zoom bounds invalid`);
    }

    const fPortrait = computeCrystalFraming(c, { fov: 38, aspect: 0.65 }, { tileCount: 1, displayMode: 'space-filling' });
    const fLandscape = computeCrystalFraming(c, { fov: 38, aspect: 1.5 }, { tileCount: 1, displayMode: 'space-filling' });
    assert.ok(fPortrait.dist > fLandscape.dist, `${c.id} portrait aspect should pull camera back`);

    const f8 = computeCrystalFraming(c, { fov: 38, aspect: 1.5 }, { tileCount: 8, displayMode: 'space-filling' });
    assert.ok(f8.dist > fLandscape.dist && f8.maxDistance > f8.dist * 2, `${c.id} 8-cell framing invalid`);
  }
});

test('hard-sphere radius cap on Diamond keeps interior r < 0.25 * scale and skips clippingPlanes for interior', async () => {
  const THREE = await import('three');
  const { validateCrystalPayload } = require('../server/utils/crystal-validate');
  const { getCrystalById } = await loadEsm('src/crystal/data/crystals.js');
  const { getViewerStyle } = await loadEsm('src/molecule/viewer-style.js');
  const { computeSafeAtomRadii, sanitizeCrystalRadii, buildSlicedCellGroup } = await loadEsm('src/crystal/scene/slicer-caps.js');
  const { CELL_SCALE } = await loadEsm('src/crystal/scene/scene-helpers.js');

  const basisAtoms = [
    [0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5],
    [0.25, 0.25, 0.25], [0.75, 0.75, 0.25], [0.75, 0.25, 0.75], [0.25, 0.75, 0.75],
  ].map(([u, v, w]) => ({ species: 'C', u, v, w }));
  const aiDiamond = validateCrystalPayload({
    name: '金刚石', formula: 'C', category: 'covalent', system: 'cubic', lattice: { a: 356.7 },
    species: [{ id: 'C', symbol: 'C', spaceRadius: 0.95, ballRadius: 0.2 }], basisAtoms,
  });
  assert.ok(aiDiamond.species[0].spaceRadius < 0.25 * CELL_SCALE);
  assert.ok(Math.abs(aiDiamond.species[0].spaceRadius - 0.52) <= 0.02);

  const diamond = getCrystalById('diamond');
  const oversized = { ...diamond, species: [{ ...diamond.species[0], spaceRadius: 1.1 }] };
  const safe = computeSafeAtomRadii(oversized, { displayMode: 'space-filling', isSliced: true });
  assert.ok(safe.radii.every((r) => r < 0.25 * CELL_SCALE));
  assert.ok(safe.radii[0] * 2 <= safe.dMin * 1.06 + 1e-6);
  assert.ok(sanitizeCrystalRadii(oversized).species[0].spaceRadius < 0.25 * CELL_SCALE);

  const sphere = new THREE.SphereGeometry(1, 8, 6);
  const state = buildSlicedCellGroup(oversized, {
    displayMode: 'space-filling', sharedUnitSphere: sphere, style: getViewerStyle('default'),
    addBadge: (b) => b, clearBadges: () => {}, explodeProgress: 1,
  });
  const interiors = state.slicedEntries.filter((e) => e.siteInfo.site === 'interior');
  const boundaries = state.slicedEntries.filter((e) => e.siteInfo.site !== 'interior');
  assert.equal(interiors.length, 4);
  for (const e of interiors) {
    assert.equal(e.planes.length, 0);
    assert.equal(e.group.children.length, 1);
    assert.equal(e.group.children[0].material.clippingPlanes, null);
    assert.ok(e.group.children[0].scale.x < 0.25 * CELL_SCALE);
  }
  assert.ok(boundaries.every((e) => e.planes.length === 6 && e.group.children[0].material.clippingPlanes?.length === 6 && e.group.children.length > 1));
  sphere.dispose();
});
