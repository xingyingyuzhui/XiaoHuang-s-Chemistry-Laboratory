/**
 * 分子晶体 3D 节点几何与渲染协议（C₆₀ 足球烯笼、CO₂ 线性干冰分子、P₄ 正四面体、S₈ 皇冠状环）
 * - 纯数学截角二十面体 60 顶点 / 90 等长棱生成器（无 WebGL 依赖，可在 Node 中直接测试）
 * - 单位几何体缓存复用于单晶胞、切片与 1–8 超晶胞，自动适配内置与 AI 分子晶体及 5 套画风
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getViewerStyle, currentThemeId } from '../../molecule/viewer-style.js';

const PHI = (1 + Math.sqrt(5)) / 2;
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const CO2_DIAGONALS = [
  new THREE.Vector3(1, 1, 1).normalize(),
  new THREE.Vector3(1, -1, -1).normalize(),
  new THREE.Vector3(-1, 1, -1).normalize(),
  new THREE.Vector3(-1, -1, 1).normalize(),
];
const PROTO_RULES = [
  ['c60', /^C[₆6][₀0]$/i],
  ['co2', /^CO[₂2]$/i],
  ['p4', /^P[₄4]$/i],
  ['s8', /^S[₈8]$/i],
];

let cachedC60Data = null;
const geomCache = new Map();

/** 生成标准 C₆₀（截角二十面体）单位球面 60 顶点与 90 等长近邻棱 */
export function generateC60GeometryData() {
  if (cachedC60Data) return cachedC60Data;
  const raw = [];
  const seen = new Set();
  const pushEven = (a, b, c) => {
    for (const p of [[a, b, c], [b, c, a], [c, a, b]]) {
      const k = `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)},${Math.round(p[2] * 1e5)}`;
      if (!seen.has(k)) { seen.add(k); raw.push(p); }
    }
  };
  for (const s1 of [-1, 1]) {
    for (const s2 of [-1, 1]) {
      pushEven(0, s1, s2 * 3 * PHI);
      for (const s3 of [-1, 1]) {
        pushEven(s1 * 2, s2 * (1 + 2 * PHI), s3 * PHI);
        pushEven(s1, s2 * (2 + PHI), s3 * 2 * PHI);
      }
    }
  }
  const vertices = raw.map(([x, y, z]) => {
    const inv = 1 / (Math.hypot(x, y, z) || 1);
    return [x * inv, y * inv, z * inv];
  });
  const targetEdge = 2 / Math.sqrt(10 + 9 * PHI);
  const edges = [];
  let sumLen = 0;
  for (let i = 0; i < vertices.length; i++) {
    const [ax, ay, az] = vertices[i];
    for (let j = i + 1; j < vertices.length; j++) {
      const [bx, by, bz] = vertices[j];
      const d = Math.hypot(ax - bx, ay - by, az - bz);
      if (Math.abs(d - targetEdge) < 1e-4) { edges.push([i, j]); sumLen += d; }
    }
  }
  cachedC60Data = { vertices, edges, edgeLength: edges.length ? sumLen / edges.length : targetEdge };
  return cachedC60Data;
}

/** 自动检测分子晶体节点原型（内置与 AI 生成晶体通用） */
export function detectMolecularPrototype(species, crystal = null) {
  const sym = String(species?.symbol || (typeof species === 'string' ? species : '')).trim();
  const spId = String(species?.id || '').trim();
  for (const [proto, re] of PROTO_RULES) {
    if (re.test(sym) || re.test(spId)) return proto;
  }
  const cid = String(crystal?.id || '').trim().toLowerCase();
  if (cid === 'c60' || cid === 'co2') return cid;
  if (crystal?.category === 'molecular' && (crystal.species?.length || 0) === 1) {
    const formula = String(crystal.formula || '').trim();
    for (const [proto, re] of PROTO_RULES) if (re.test(formula)) return proto;
  }
  return null;
}

/** 切开均摊模式下分子节点对应的实心截面封盖基准半径 */
export function getMolecularSliceCapRadius(proto, radius) {
  if (proto === 'c60') return radius;
  if (proto === 'co2') return radius * 0.42;
  return 0;
}

function getCachedGeom(key, builder) {
  if (!geomCache.has(key)) geomCache.set(key, builder());
  return geomCache.get(key);
}

function buildMergedSpheres(points, beadR, segW, segH) {
  const base = new THREE.SphereGeometry(beadR, segW, segH);
  const parts = points.map(([x, y, z]) => base.clone().translate(x, y, z));
  const merged = mergeGeometries(parts, false);
  base.dispose();
  parts.forEach((p) => p.dispose());
  return merged;
}

function buildMergedBonds(points, edges, rodR, radialSegs) {
  const parts = [];
  const p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  const dir = new THREE.Vector3(), mid = new THREE.Vector3();
  const quat = new THREE.Quaternion(), mat = new THREE.Matrix4(), unit = new THREE.Vector3(1, 1, 1);
  for (const [i, j] of edges) {
    p1.set(...points[i]); p2.set(...points[j]);
    dir.subVectors(p2, p1);
    const len = dir.length();
    if (len < 1e-5) continue;
    const cyl = new THREE.CylinderGeometry(rodR, rodR, len, radialSegs, 1, true);
    mid.addVectors(p1, p2).multiplyScalar(0.5);
    quat.setFromUnitVectors(UP_AXIS, dir.normalize());
    cyl.applyMatrix4(mat.compose(mid, quat, unit));
    parts.push(cyl);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function getC60WireGeom() {
  return getCachedGeom('c60_wire', () => {
    const { vertices, edges } = generateC60GeometryData();
    const pos = [];
    for (const [i, j] of edges) pos.push(...vertices[i], ...vertices[j]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  });
}

function getClusterData(proto) {
  if (proto === 'p4') {
    const s = 0.62 / Math.sqrt(3);
    return {
      vertices: [[s, s, s], [s, -s, -s], [-s, s, -s], [-s, -s, s]],
      edges: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]],
    };
  }
  const vertices = [], edges = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    vertices.push([0.84 * Math.cos(a), (k % 2 === 0 ? 1 : -1) * 0.28, 0.84 * Math.sin(a)]);
    edges.push([k, (k + 1) % 8]);
  }
  return { vertices, edges };
}

function getCO2Diagonal(frac, index = 0) {
  const isHalf = (v) => Math.abs((v - Math.floor(v)) - 0.5) < 0.25;
  if (frac && Number.isFinite(frac.u) && Number.isFinite(frac.v) && Number.isFinite(frac.w)) {
    const hu = isHalf(frac.u), hv = isHalf(frac.v), hw = isHalf(frac.w);
    if (!hu && !hv && !hw) return CO2_DIAGONALS[0];
    if (hu && hv && !hw) return CO2_DIAGONALS[1];
    if (hu && !hv && hw) return CO2_DIAGONALS[2];
    if (!hu && hv && hw) return CO2_DIAGONALS[3];
  }
  return CO2_DIAGONALS[Math.abs(Math.floor(index || 0)) % 4];
}

function configureMat(mat, { opacity = 1, clippingPlanes = null, side = null } = {}) {
  if (opacity < 0.99) { mat.transparent = true; mat.opacity = opacity; }
  if (clippingPlanes?.length) { mat.clippingPlanes = clippingPlanes; mat.clipShadows = true; }
  if (side != null) mat.side = side;
  return mat;
}

function addSharedMesh(parent, geometry, material, scale = 1) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.sharedGeometry = true;
  mesh.scale.setScalar(scale);
  parent.add(mesh);
  return mesh;
}

function buildC60Node({ radius, color, style, clippingPlanes, displayMode, isSliced, opacity, sharedUnitSphere }) {
  const group = new THREE.Group();
  const atomHex = color ?? 0x3f4654;
  const isDark = style.id === 'blackboard';
  if (isSliced || displayMode === 'space-filling' || Boolean(clippingPlanes?.length)) {
    const sphereGeom = sharedUnitSphere || getCachedGeom('unit_sphere', () => new THREE.SphereGeometry(1, 28, 20));
    const sphereMat = configureMat(style.atomMaterial(atomHex, 'C'), {
      opacity, clippingPlanes, side: isSliced ? THREE.FrontSide : null,
    });
    addSharedMesh(group, sphereGeom, sphereMat, radius);
    const wireMat = new THREE.LineBasicMaterial({
      color: isDark ? 0x1e293b : 0xe2e8f0,
      transparent: true,
      opacity: (isDark ? 0.82 : 0.78) * opacity,
      ...(clippingPlanes?.length ? { clippingPlanes } : {}),
    });
    const wire = new THREE.LineSegments(getC60WireGeom(), wireMat);
    wire.scale.setScalar(radius * 1.015);
    wire.userData.sharedGeometry = true;
    wire.userData.isMolecularWire = true;
    group.add(wire);
    return group;
  }

  const { vertices, edges } = generateC60GeometryData();
  const vertGeom = getCachedGeom('c60_verts', () => buildMergedSpheres(vertices, 0.105, 7, 5));
  const bondGeom = getCachedGeom('c60_bonds', () => buildMergedBonds(vertices, edges, 0.044, 6));
  const coreGeom = getCachedGeom('c60_core', () => new THREE.SphereGeometry(0.78, 18, 14));
  addSharedMesh(group, vertGeom, configureMat(style.atomMaterial(atomHex, 'C'), { opacity }), radius);
  addSharedMesh(group, bondGeom, configureMat(style.bondMaterial(style.neutralBond, ''), { opacity }), radius);
  addSharedMesh(group, coreGeom, new THREE.MeshBasicMaterial({
    color: isDark ? 0x0f172a : 0x1e293b, transparent: true,
    opacity: (isDark ? 0.42 : 0.34) * opacity, depthWrite: false,
  }), radius);
  return group;
}

function buildCO2Node({ radius, style, index, frac, clippingPlanes, displayMode, isSliced, opacity, sharedUnitSphere }) {
  const group = new THREE.Group();
  const space = displayMode === 'space-filling';
  const sphereGeom = sharedUnitSphere || getCachedGeom('unit_sphere', () => new THREE.SphereGeometry(1, 24, 18));
  const matOpts = { opacity, clippingPlanes, side: isSliced ? THREE.FrontSide : null };
  const cMat = configureMat(style.atomMaterial(0x3f4654, 'C'), matOpts);
  const oMat = configureMat(style.atomMaterial(0xe03e3e, 'O'), matOpts);
  const oR = (space ? 0.36 : 0.37) * radius;
  const bondLen = (space ? 0.66 : 1.18) * radius;

  addSharedMesh(group, sphereGeom, cMat, 0.42 * radius);
  for (const dir of [-1, 1]) {
    addSharedMesh(group, sphereGeom, oMat, oR).position.set(0, dir * bondLen, 0);
  }
  if (!space) {
    const rodGeom = getCachedGeom('co2_rod', () => new THREE.CylinderGeometry(0.068, 0.068, 2.36, 10, 1));
    const bMat = configureMat(style.bondMaterial(style.neutralBond, ''), { opacity, clippingPlanes });
    for (const off of [-0.11, 0.11]) {
      addSharedMesh(group, rodGeom, bMat, radius).position.set(off * radius, 0, 0);
    }
  }
  group.quaternion.setFromUnitVectors(UP_AXIS, getCO2Diagonal(frac, index));
  return group;
}

function buildClusterNode(proto, { radius, color, style, index, clippingPlanes, displayMode, isSliced, opacity }) {
  const group = new THREE.Group();
  const space = displayMode === 'space-filling';
  const isP4 = proto === 'p4';
  const data = getClusterData(proto);
  const atomGeom = getCachedGeom(`${proto}_${space ? 'space' : 'ball'}`, () => buildMergedSpheres(
    data.vertices, isP4 ? (space ? 0.52 : 0.34) : (space ? 0.4 : 0.25), 12, 10,
  ));
  const matOpts = { opacity, clippingPlanes, side: isSliced ? THREE.FrontSide : null };
  addSharedMesh(group, atomGeom, configureMat(style.atomMaterial(color ?? (isP4 ? 0xf59e0b : 0xeab308), isP4 ? 'P' : 'S'), matOpts), radius);
  if (!space) {
    const bondGeom = getCachedGeom(`${proto}_bonds`, () => buildMergedBonds(data.vertices, data.edges, isP4 ? 0.105 : 0.09, 8));
    addSharedMesh(group, bondGeom, configureMat(style.bondMaterial(style.neutralBond, ''), { opacity, clippingPlanes }), radius);
  }
  if (index) group.rotation.set((index % 4) * 0.42, (index % 3) * 0.65, 0);
  return group;
}

/** 构建分子晶体 3D 节点（支持 C₆₀ / CO₂ / P₄ / S₈） */
export function createMolecularNodeMesh(
  proto,
  {
    radius = 0.36, color = null, style = getViewerStyle(currentThemeId()),
    index = 0, position = null, frac = null, clippingPlanes = null,
    displayMode = 'ball-stick', isSliced = false, opacity = 1, sharedUnitSphere = null,
  } = {},
) {
  const opts = { radius, color, style, index, frac, clippingPlanes, displayMode, isSliced, opacity, sharedUnitSphere };
  const node = proto === 'c60' ? buildC60Node(opts)
    : proto === 'co2' ? buildCO2Node(opts)
      : (proto === 'p4' || proto === 's8') ? buildClusterNode(proto, opts) : null;
  if (!node) return null;
  node.userData.molecularPrototype = proto;
  if (position) node.position.copy(position);
  return node;
}
