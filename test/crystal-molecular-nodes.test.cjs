/**
 * 分子晶体 3D 节点几何、协议识别与切片/超晶胞集成测试
 */
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const loadEsm = (rel) => import(pathToFileURL(path.join(root, rel)).href);

test('generateC60GeometryData produces exact 60 unit vertices, 90 uniform edges, and uniform degree 3', async () => {
  const { generateC60GeometryData } = await loadEsm('src/crystal/scene/molecular-nodes.js');
  const { vertices, edges, edgeLength } = generateC60GeometryData();

  assert.equal(vertices.length, 60);
  assert.equal(edges.length, 90);

  const uniq = new Set();
  for (const [x, y, z] of vertices) {
    const r = Math.hypot(x, y, z);
    assert.ok(Math.abs(r - 1) < 1e-6, `vertex radius ${r} != 1`);
    uniq.add(`${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`);
  }
  assert.equal(uniq.size, 60);

  const degrees = new Array(60).fill(0);
  const lengths = [];
  for (const [i, j] of edges) {
    assert.ok(i >= 0 && i < 60 && j >= 0 && j < 60 && i !== j);
    degrees[i] += 1;
    degrees[j] += 1;
    const [ax, ay, az] = vertices[i];
    const [bx, by, bz] = vertices[j];
    lengths.push(Math.hypot(ax - bx, ay - by, az - bz));
  }

  assert.ok(degrees.every((d) => d === 3), `every C60 vertex must have degree 3, got ${new Set(degrees)}`);
  const mean = lengths.reduce((s, v) => s + v, 0) / lengths.length;
  const variance = lengths.reduce((s, v) => s + (v - mean) ** 2, 0) / lengths.length;
  assert.ok(variance < 1e-6, `edge length variance ${variance} >= 1e-6`);
  assert.ok(Math.abs(mean - edgeLength) < 1e-6);
});

test('detectMolecularPrototype recognizes built-in and AI molecular species and ignores atomic crystals', async () => {
  const { detectMolecularPrototype } = await loadEsm('src/crystal/scene/molecular-nodes.js');
  const { getCrystalById } = await loadEsm('src/crystal/data/crystals.js');

  const c60 = getCrystalById('c60');
  const co2 = getCrystalById('co2');
  assert.equal(detectMolecularPrototype(c60.species[0], c60), 'c60');
  assert.equal(detectMolecularPrototype(co2.species[0], co2), 'co2');
  assert.equal(detectMolecularPrototype({ id: 'C', symbol: 'C' }, { id: 'c60' }), 'c60');
  assert.equal(detectMolecularPrototype({ id: 'C', symbol: 'C' }, { id: 'co2' }), 'co2');

  // AI-generated molecular crystals (Unicode subscripts & ASCII digits)
  assert.equal(detectMolecularPrototype({ id: 'C60', symbol: 'C₆₀' }), 'c60');
  assert.equal(detectMolecularPrototype({ id: 'c60', symbol: 'C60' }), 'c60');
  assert.equal(detectMolecularPrototype({ id: 'CO2', symbol: 'CO₂' }), 'co2');
  assert.equal(detectMolecularPrototype({ id: 'P4', symbol: 'P₄' }), 'p4');
  assert.equal(detectMolecularPrototype({ id: 'p4', symbol: 'P4' }), 'p4');
  assert.equal(detectMolecularPrototype({ id: 'S8', symbol: 'S₈' }), 's8');
  assert.equal(detectMolecularPrototype({ id: 's8', symbol: 'S8' }), 's8');
  assert.equal(
    detectMolecularPrototype({ id: 'C', symbol: 'C' }, { category: 'molecular', formula: 'C₆₀', species: [{ id: 'C' }] }),
    'c60',
  );

  // Atomic / ionic / covalent species return null
  assert.equal(detectMolecularPrototype({ id: 'Na', symbol: 'Na⁺' }, getCrystalById('nacl')), null);
  assert.equal(detectMolecularPrototype({ id: 'Cl', symbol: 'Cl⁻' }, getCrystalById('nacl')), null);
  assert.equal(detectMolecularPrototype({ id: 'Cu', symbol: 'Cu' }, getCrystalById('cu')), null);
  assert.equal(detectMolecularPrototype({ id: 'C', symbol: 'C' }, getCrystalById('diamond')), null);
});

test('C60 and CO2 integrate cleanly in normal, sliced, and supercell modes with P4/S8 support', async () => {
  const THREE = await import('three');
  const { getCrystalById } = await loadEsm('src/crystal/data/crystals.js');
  const { getViewerStyle } = await loadEsm('src/molecule/viewer-style.js');
  const { buildNormalCellGroup, disposeGroupWithExtras } = await loadEsm('src/crystal/scene/scene-helpers.js');
  const { buildSlicedCellGroup } = await loadEsm('src/crystal/scene/slicer-caps.js');
  const { createSupercellTiler } = await loadEsm('src/crystal/scene/supercell-tiler.js');
  const { createMolecularNodeMesh } = await loadEsm('src/crystal/scene/molecular-nodes.js');

  const style = getViewerStyle('default');
  const sphere = new THREE.SphereGeometry(1, 10, 8);
  const box = new THREE.BoxGeometry(1.3, 1.3, 1.3);

  // 1) C60 ball-stick & sliced modes
  const c60 = getCrystalById('c60');
  const c60Ball = buildNormalCellGroup(c60, { displayMode: 'ball-stick', sharedUnitSphere: sphere, sharedUnitBox: box, style });
  const c60Nodes = c60Ball.children.filter((c) => c.userData?.molecularPrototype === 'c60');
  assert.equal(c60Nodes.length, 14);
  assert.equal(c60Nodes[0].children.length, 3); // merged vertices + merged bonds + translucent core

  const badges = [];
  const c60Sliced = buildSlicedCellGroup(c60, {
    displayMode: 'ball-stick', sharedUnitSphere: sphere, style,
    addBadge: (b) => { badges.push(b); return b; }, clearBadges: () => { badges.length = 0; }, explodeProgress: 0,
  });
  assert.equal(c60Sliced.slicedEntries.length, 14);
  assert.equal(badges.filter((b) => b.text === '1/8').length, 8);
  assert.equal(badges.filter((b) => b.text === '1/2').length, 6);
  for (const entry of c60Sliced.slicedEntries) {
    const node = entry.group.children[0];
    const wire = node.children.find((c) => c.isLineSegments && c.userData?.isMolecularWire);
    assert.ok(wire, 'sliced C60 should include truncated-icosahedron wireframe shell');
    assert.equal(wire.material.clippingPlanes.length, 6);
    assert.ok(entry.group.children.length > 1, 'sliced C60 should include solid cross-section caps');
  }

  // 2) CO2 14-site FCC linear molecules along 4 distinct body diagonals + supercell tiling
  const co2 = getCrystalById('co2');
  assert.equal(co2.atoms.length, 14);
  const co2Ball = buildNormalCellGroup(co2, { displayMode: 'ball-stick', sharedUnitSphere: sphere, sharedUnitBox: box, style });
  const co2Nodes = co2Ball.children.filter((c) => c.userData?.molecularPrototype === 'co2');
  assert.equal(co2Nodes.length, 14);
  const axisSet = new Set(co2Nodes.map((n) => {
    const v = new THREE.Vector3(0, 1, 0).applyQuaternion(n.quaternion);
    return `${Math.sign(v.x)},${Math.sign(v.y)},${Math.sign(v.z)}`;
  }));
  assert.equal(axisSet.size, 4, 'CO2 molecules must orient along all 4 cube body diagonals');

  const co2Sliced = buildSlicedCellGroup(co2, {
    displayMode: 'space-filling', sharedUnitSphere: sphere, style,
    addBadge: (b) => b, clearBadges: () => {}, explodeProgress: 0.5,
  });
  assert.equal(co2Sliced.slicedEntries.length, 14);
  assert.ok(co2Sliced.slicedEntries.every((e) => e.group.children.length > 1));

  const worldRoot = new THREE.Group();
  const tiler = createSupercellTiler({ worldRoot, sharedUnitSphere: sphere, sharedUnitBox: box, addBadge: (b) => b, clearBadges: () => {} });
  assert.equal(tiler.syncTiles(co2, 4, 'ball-stick', style), 4);
  tiler.clear();

  // 3) P4 & S8 extensible prototypes
  const p4Node = createMolecularNodeMesh('p4', { radius: 0.35, style });
  const s8Node = createMolecularNodeMesh('s8', { radius: 0.35, style });
  assert.equal(p4Node.userData.molecularPrototype, 'p4');
  assert.equal(s8Node.userData.molecularPrototype, 's8');
  assert.ok(p4Node.children.every((c) => c.userData.sharedGeometry));
  assert.ok(s8Node.children.every((c) => c.userData.sharedGeometry));

  disposeGroupWithExtras(c60Ball);
  disposeGroupWithExtras(c60Sliced.group);
  disposeGroupWithExtras(co2Ball);
  disposeGroupWithExtras(co2Sliced.group);
  sphere.dispose();
  box.dispose();
});
