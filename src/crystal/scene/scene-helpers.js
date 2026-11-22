/**
 * 3D 晶胞场景共享常量、5 主题渲染样式适配与几何/材质工具函数
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getViewerStyle, getShadowTexture, currentThemeId } from '../../molecule/viewer-style.js';
import { fracToCartesian, getCellCorners, computeBonds, computeCellBoundRadius } from '../math/lattice.js';
import { detectMolecularPrototype, createMolecularNodeMesh } from './molecular-nodes.js';

export const CELL_SCALE = 2.4;
export const FRAME_MARGIN = 1.54;
const UP_VEC = new THREE.Vector3(0, 1, 0);

function readCssColor(varName, fallback) {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (raw) return new THREE.Color(raw);
  } catch { /* ignore */ }
  return new THREE.Color(fallback);
}

export function readStageBgColor() {
  return readCssColor('--stage-3d-bg', 0xffffff);
}

export function getCrystalThemeTokens(style) {
  const isDark = style?.id === 'blackboard';
  const accentHex = readCssColor('--accent', isDark ? 0xf0d060 : 0x3b82f6).getHex();
  return {
    isDark,
    wireColor: isDark ? 0xcbd5e1 : 0x64748b,
    sliceWireColor: accentHex,
    hexPrismColor: accentHex,
    coordCenterColor: isDark ? 0xf0d060 : 0xd97706,
    coordNeighborColor: isDark ? 0x7ec8c0 : 0x0284c7,
    distColor: isDark ? 0xff8a80 : 0xe11d48,
    bondColor: style?.neutralBond ?? (isDark ? 0xc4cfc3 : 0x9aa5b4),
  };
}

export function createStudioStage(container) {
  const scene = new THREE.Scene();
  scene.background = readStageBgColor();

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  camera.position.set(6.5, 5.0, 7.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;

  const canvas = renderer.domElement;
  canvas.className = 'crystal-webgl-canvas';
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  container.appendChild(canvas);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 2.2;
  controls.maxDistance = 48;
  controls.autoRotateSpeed = 1.1;

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(5.5, 8.0, 6.2);
  const fill = new THREE.DirectionalLight(0x93c5fd, 0.35);
  fill.position.set(-5.0, -2.5, -4.5);
  scene.add(ambient, key, fill);

  let envTex = null;
  function applyStyle(style) {
    scene.background = readStageBgColor();
    if (style.environment) {
      if (!envTex) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
      }
      scene.environment = envTex;
      scene.environmentIntensity = style.envIntensity ?? 0.6;
    } else {
      scene.environment = null;
    }
    const isNonEnv = !style.environment;
    ambient.intensity = style.keyIntensity != null
      ? style.ambient
      : (isNonEnv ? Math.max(style.ambient, 1.9) : style.ambient);
    key.intensity = style.keyIntensity ?? (isNonEnv ? 2.2 : 1.0);
    fill.intensity = style.fillIntensity ?? (isNonEnv ? 0.65 : 0.35);
    renderer.toneMapping = style.toneMapping ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = style.exposure ?? 1.0;
  }

  applyStyle(getViewerStyle(currentThemeId()));
  return {
    scene, camera, renderer, canvas, controls, applyStyle,
    disposeEnv() { envTex?.dispose(); envTex = null; },
  };
}

export function observeCrystalTheme(onChange) {
  const observer = typeof MutationObserver !== 'undefined' && typeof document !== 'undefined'
    ? new MutationObserver(() => onChange(false))
    : null;
  observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const onEvent = () => onChange(true);
  if (typeof window !== 'undefined') window.addEventListener('chem-theme-change', onEvent);
  return () => {
    observer?.disconnect();
    if (typeof window !== 'undefined') window.removeEventListener('chem-theme-change', onEvent);
  };
}

export function toVec3(p) {
  if (!p) return new THREE.Vector3();
  return Array.isArray(p)
    ? new THREE.Vector3(p[0] || 0, p[1] || 0, p[2] || 0)
    : new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0);
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}

export function buildSpeciesMap(crystal) {
  const map = new Map();
  for (const sp of crystal?.species || []) {
    if (sp.id != null) map.set(sp.id, sp);
    if (sp.symbol != null && !map.has(sp.symbol)) map.set(sp.symbol, sp);
  }
  return map;
}

export function getAtomRadius(sp, displayMode, isSliced) {
  const ball = sp?.ballRadius ?? 0.28;
  const space = sp?.spaceRadius ?? 0.52;
  if (displayMode === 'space-filling') return space;
  return isSliced ? Math.max(ball * 1.18, Math.min(space * 0.68, ball + 0.08)) : ball;
}

export function computeCrystalFraming(
  crystal, camera, { tileCount = 1, displayMode = 'ball-stick', margin = FRAME_MARGIN } = {},
) {
  const radius = computeCellBoundRadius(crystal, { tileCount, displayMode, scale: CELL_SCALE });
  const halfV = THREE.MathUtils.degToRad((camera?.fov || 38) * 0.5);
  const aspect = THREE.MathUtils.clamp(camera?.aspect || 1, 0.45, 4);
  const halfAngle = aspect < 1 ? Math.atan(Math.tan(halfV) * aspect) : halfV;
  const dist = (radius / Math.sin(Math.max(0.12, halfAngle))) * margin;
  return {
    radius,
    dist,
    minDistance: Math.max(2.2, radius * 0.65),
    maxDistance: Math.max(40, dist * 2.6),
  };
}

export function parseColor(raw, fallback = 0x94a3b8) {
  return new THREE.Color(raw == null ? fallback : raw);
}

export function resolveAtomColorHex(sp, style) {
  const sym = sp?.id || sp?.symbol || '';
  return sym === 'H' && style?.hydrogen != null ? style.hydrogen : (sp?.color ?? 0x94a3b8);
}

export function makeAtomMaterial(style, sp, crystal, { opacity = 1, clippingPlanes = null, side = null } = {}) {
  const sym = sp?.id || sp?.symbol || '';
  const mat = style.atomMaterial(resolveAtomColorHex(sp, style), sym);
  if (crystal?.category === 'metallic' && mat.isMeshPhysicalMaterial) {
    mat.metalness = Math.max(mat.metalness ?? 0, 0.34);
    mat.roughness = Math.min(mat.roughness ?? 0.3, 0.25);
  }
  if (opacity < 0.99) { mat.transparent = true; mat.opacity = opacity; }
  if (clippingPlanes) { mat.clippingPlanes = clippingPlanes; mat.clipShadows = true; }
  if (side != null) mat.side = side;
  return mat;
}

export function makeBondMaterial(style, { opacity = 1, clippingPlanes = null } = {}) {
  const mat = style.bondMaterial(style.neutralBond, '');
  if (opacity < 0.99) { mat.transparent = true; mat.opacity = opacity; }
  if (clippingPlanes) mat.clippingPlanes = clippingPlanes;
  return mat;
}

export function attachOutline(mesh, geometry, radius, style, isCylinder = false) {
  if (!style?.outline) return;
  const k = (radius + style.outline.width * 0.85) / Math.max(radius, 0.04);
  const o = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: style.outline.color, side: THREE.BackSide }),
  );
  o.userData.sharedGeometry = Boolean(mesh.userData.sharedGeometry);
  o.userData.isOutline = true;
  if (isCylinder) o.scale.set(k, 1, k);
  else o.scale.setScalar(k);
  mesh.add(o);
}

export function createGroundShadow(style, span = CELL_SCALE * 1.45, y = -CELL_SCALE * 0.72) {
  if (!style?.shadow) return null;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(span, span),
    new THREE.MeshBasicMaterial({
      map: getShadowTexture(style.shadow.hard),
      color: 0x000000,
      transparent: true,
      opacity: style.shadow.opacity,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, y, 0);
  mesh.renderOrder = -1;
  return mesh;
}

export function makeNormalizedPlanes(rawPlanes) {
  return (rawPlanes || []).map((p) => {
    const n = Array.isArray(p.normal) ? new THREE.Vector3(...p.normal) : toVec3(p.normal);
    const len = n.length() || 1;
    n.divideScalar(len);
    let c = (p.constant ?? 0) / len;
    if (c < 0) { n.negate(); c = -c; }
    return new THREE.Plane(n, c);
  });
}

export function createCylinderBetween(p1, p2, radius, material, radialSegments = 14) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  if (len < 1e-5) return null;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, radialSegments, 1), material);
  mesh.position.copy(p1).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP_VEC, dir.normalize());
  return mesh;
}

export function createWireframe(lattice, color, opacity = 0.7) {
  const { vertices, edges } = getCellCorners(lattice, CELL_SCALE);
  const pts = [];
  for (const [i, j] of edges || []) {
    const a = toVec3(vertices[i]);
    const b = toVec3(vertices[j]);
    pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const line = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  line.userData.isCellFrame = true;
  return line;
}

export function disposeObjectTree(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry && !child.userData?.sharedGeometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) if (m && !m.userData?.sharedMaterial) m.dispose();
    }
  });
}

export function disposeGroupWithExtras(group) {
  if (!group) return;
  const extras = group.userData?._extraMats;
  if (Array.isArray(extras)) for (const m of extras) m?.dispose?.();
  disposeObjectTree(group);
}

export function buildNormalCellGroup(
  crystal,
  {
    displayMode = 'ball-stick', sharedUnitSphere, sharedUnitBox, style = getViewerStyle(currentThemeId()),
    dimAll = false, opacity = 1, atomOpacityMap = null, skipPositions = null, cellShift = null,
  } = {},
) {
  const group = new THREE.Group();
  const tokens = getCrystalThemeTokens(style);
  const spMap = buildSpeciesMap(crystal);
  group.add(createWireframe(crystal.lattice, tokens.wireColor, opacity * (tokens.isDark ? 0.65 : 0.72)));

  const atomGeom = style.id === 'pixel' && sharedUnitBox ? sharedUnitBox : sharedUnitSphere;
  const sharedMatMap = new Map();
  const getMat = (sp, customOpacity) => {
    const op = customOpacity ?? (dimAll ? 0.22 : opacity);
    if (atomOpacityMap) return makeAtomMaterial(style, sp, crystal, { opacity: op });
    const key = `${sp?.id ?? 'default'}_${op.toFixed(2)}`;
    if (!sharedMatMap.has(key)) sharedMatMap.set(key, makeAtomMaterial(style, sp, crystal, { opacity: op }));
    return sharedMatMap.get(key);
  };

  const sx = cellShift?.x || 0, sy = cellShift?.y || 0, sz = cellShift?.z || 0;
  const atoms = crystal.atoms || [];
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const pos = toVec3(fracToCartesian(a.u, a.v, a.w, crystal.lattice, CELL_SCALE));
    if (skipPositions) {
      const key = `${Math.round((pos.x + sx) * 200)}_${Math.round((pos.y + sy) * 200)}_${Math.round((pos.z + sz) * 200)}`;
      if (skipPositions.has(key)) continue;
    }
    const sp = spMap.get(a.species);
    const r = getAtomRadius(sp, displayMode, false);
    const customOp = atomOpacityMap ? atomOpacityMap.get(i) : undefined;
    const op = customOp ?? (dimAll ? 0.22 : opacity);
    const proto = detectMolecularPrototype(sp, crystal);
    if (proto) {
      const node = createMolecularNodeMesh(proto, {
        radius: r, color: resolveAtomColorHex(sp, style), style, index: i,
        position: pos, frac: a, displayMode, opacity: op, sharedUnitSphere,
      });
      if (node) { group.add(node); continue; }
    }
    const mesh = new THREE.Mesh(atomGeom, getMat(sp, customOp));
    mesh.userData.sharedGeometry = true;
    mesh.userData.sharedMaterial = !atomOpacityMap;
    mesh.scale.setScalar(r);
    mesh.position.copy(pos);
    if (style.outline && op >= 0.99) attachOutline(mesh, atomGeom, r, style, false);
    group.add(mesh);
  }

  const extraMats = [...sharedMatMap.values()];
  if (displayMode === 'ball-stick') {
    const bonds = computeBonds(crystal, CELL_SCALE) || [];
    const bondOp = dimAll ? 0.16 : opacity * 0.9;
    const bondMat = makeBondMaterial(style, { opacity: bondOp });
    const radial = style.id === 'pixel' ? 4 : 12;
    for (const b of bonds) {
      const cyl = createCylinderBetween(toVec3(b.p1), toVec3(b.p2), 0.052, bondMat, radial);
      if (cyl) {
        cyl.userData.sharedMaterial = true;
        if (style.outline && bondOp >= 0.85) attachOutline(cyl, cyl.geometry, 0.052, style, true);
        group.add(cyl);
      }
    }
    extraMats.push(bondMat);
  }

  group.userData._extraMats = extraMats;
  return group;
}
