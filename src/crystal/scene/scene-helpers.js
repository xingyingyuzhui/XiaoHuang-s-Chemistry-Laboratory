/**
 * 3D 晶胞场景共享常量与几何/材质工具函数
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  fracToCartesian,
  getCellCorners,
  computeBonds,
} from '../math/lattice.js';

export const CELL_SCALE = 2.4;
export const STAGE_BG = 0x0d1322;
export const WIRE_COLOR = 0x7dd3fc;
export const HEX_PRISM_COLOR = 0xfbbf24;
export const COORD_CENTER_COLOR = 0xfbbf24;
export const COORD_NEIGHBOR_COLOR = 0x38bdf8;
export const DIST_COLOR = 0xf43f5e;

const UP_VEC = new THREE.Vector3(0, 1, 0);

export function createStudioStage(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STAGE_BG);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  camera.position.set(4.8, 3.6, 5.6);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true;

  const canvas = renderer.domElement;
  canvas.className = 'crystal-webgl-canvas';
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  container.appendChild(canvas);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 2.0;
  controls.maxDistance = 26;
  controls.autoRotateSpeed = 1.1;

  scene.add(new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 0.78));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(5.5, 8.0, 6.2);
  const rim = new THREE.DirectionalLight(0x93c5fd, 0.48);
  rim.position.set(-6.0, 4.2, -5.5);
  const fill = new THREE.DirectionalLight(0xfef3c7, 0.26);
  fill.position.set(0.5, -6.5, 3.5);
  scene.add(key, rim, fill);

  return { scene, camera, renderer, canvas, controls };
}

export function toVec3(p) {
  if (!p) return new THREE.Vector3();
  if (Array.isArray(p)) return new THREE.Vector3(p[0] || 0, p[1] || 0, p[2] || 0);
  return new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0);
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
  if (isSliced) return Math.max(ball * 1.18, Math.min(space * 0.68, ball + 0.08));
  return ball;
}

export function parseColor(raw, fallback = 0x94a3b8) {
  if (raw == null) return new THREE.Color(fallback);
  return new THREE.Color(raw);
}

export function makeNormalizedPlanes(rawPlanes) {
  return (rawPlanes || []).map((p) => {
    const n = Array.isArray(p.normal)
      ? new THREE.Vector3(p.normal[0], p.normal[1], p.normal[2])
      : toVec3(p.normal);
    const len = n.length() || 1;
    n.divideScalar(len);
    let c = (p.constant ?? 0) / len;
    if (c < 0) {
      n.negate();
      c = -c;
    }
    return new THREE.Plane(n, c);
  });
}

export function createCylinderBetween(p1, p2, radius, material, radialSegments = 14) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  if (len < 1e-5) return null;
  const geom = new THREE.CylinderGeometry(radius, radius, len, radialSegments, 1);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(p1).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP_VEC, dir.normalize());
  return mesh;
}

export function createWireframe(lattice, color = WIRE_COLOR, opacity = 0.65) {
  const { vertices, edges } = getCellCorners(lattice, CELL_SCALE);
  const pts = [];
  for (const [i, j] of edges || []) {
    const a = toVec3(vertices[i]);
    const b = toVec3(vertices[j]);
    pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.LineSegments(geom, mat);
}

export function disposeObjectTree(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry && !child.userData?.sharedGeometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m && !m.userData?.sharedMaterial) m.dispose();
      }
    }
  });
}

export function disposeGroupWithExtras(group) {
  if (!group) return;
  const extras = group.userData?._extraMats;
  if (Array.isArray(extras)) {
    for (const m of extras) m?.dispose?.();
  }
  disposeObjectTree(group);
}

export function buildNormalCellGroup(
  crystal,
  {
    displayMode = 'ball-stick',
    sharedUnitSphere,
    dimAll = false,
    opacity = 1,
    atomOpacityMap = null,
    skipPositions = null,
    cellShift = null,
  } = {},
) {
  const group = new THREE.Group();
  const spMap = buildSpeciesMap(crystal);
  group.add(createWireframe(crystal.lattice, WIRE_COLOR, opacity * 0.58));

  const sharedMatMap = new Map();
  const getNormalMat = (sp, customOpacity) => {
    const op = customOpacity ?? (dimAll ? 0.22 : opacity);
    if (atomOpacityMap) {
      return new THREE.MeshStandardMaterial({
        color: parseColor(sp?.color),
        roughness: 0.3,
        metalness: crystal.category === 'metallic' ? 0.42 : 0.12,
        transparent: op < 0.99,
        opacity: op,
      });
    }
    const key = `${sp?.id ?? 'default'}_${op.toFixed(2)}`;
    if (!sharedMatMap.has(key)) {
      sharedMatMap.set(
        key,
        new THREE.MeshStandardMaterial({
          color: parseColor(sp?.color),
          roughness: 0.3,
          metalness: crystal.category === 'metallic' ? 0.42 : 0.12,
          transparent: op < 0.99,
          opacity: op,
        }),
      );
    }
    return sharedMatMap.get(key);
  };

  const atoms = crystal.atoms || [];
  const sx = cellShift?.x || 0;
  const sy = cellShift?.y || 0;
  const sz = cellShift?.z || 0;

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
    const mesh = new THREE.Mesh(sharedUnitSphere, getNormalMat(sp, customOp));
    mesh.userData.sharedGeometry = true;
    mesh.userData.sharedMaterial = !atomOpacityMap;
    mesh.scale.setScalar(r);
    mesh.position.copy(pos);
    group.add(mesh);
  }

  const extraMats = [...sharedMatMap.values()];
  if (displayMode === 'ball-stick') {
    const bonds = computeBonds(crystal, CELL_SCALE) || [];
    const bondOpacity = dimAll ? 0.15 : opacity * 0.85;
    const bondMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.42,
      metalness: 0.2,
      transparent: bondOpacity < 0.99,
      opacity: bondOpacity,
    });
    for (const b of bonds) {
      const cyl = createCylinderBetween(toVec3(b.p1), toVec3(b.p2), 0.052, bondMat, 10);
      if (cyl) {
        cyl.userData.sharedMaterial = true;
        group.add(cyl);
      }
    }
    extraMats.push(bondMat);
  }

  group.userData._extraMats = extraMats;
  return group;
}
