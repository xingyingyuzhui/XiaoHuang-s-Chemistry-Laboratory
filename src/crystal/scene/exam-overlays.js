/**
 * 高考考点 3D 标注模块：配位数高亮 + 最短距离 3D 测量线与投影公式徽章
 */

import * as THREE from 'three';
import { fracToCartesian } from '../math/lattice.js';
import { getViewerStyle, currentThemeId } from '../../molecule/viewer-style.js';
import {
  CELL_SCALE,
  getCrystalThemeTokens,
  toVec3,
  buildSpeciesMap,
  getAtomRadius,
  makeAtomMaterial,
  createCylinderBetween,
} from './scene-helpers.js';

/**
 * 构建配位数高亮覆盖层与原子透明度映射
 */
export function buildCoordinationOverlay(
  crystal,
  {
    displayMode,
    sharedUnitSphere,
    sharedUnitBox,
    sharedRingGeom,
    style = getViewerStyle(currentThemeId()),
    addBadge,
  },
) {
  const coord = crystal?.coordination;
  const atoms = crystal?.atoms || [];
  if (!coord || !atoms.length) return { group: null, opacityMap: null };

  const tokens = getCrystalThemeTokens(style);
  const spMap = buildSpeciesMap(crystal);
  let centerIdx = Number.isInteger(coord.centerIndex) ? coord.centerIndex : 0;
  if (centerIdx < 0 || centerIdx >= atoms.length) {
    let bestDist = Infinity;
    atoms.forEach((a, i) => {
      const d = (a.u - 0.5) ** 2 + (a.v - 0.5) ** 2 + (a.w - 0.5) ** 2;
      if (d < bestDist) {
        bestDist = d;
        centerIdx = i;
      }
    });
  }

  const centerAtom = atoms[centerIdx];
  const centerPos = toVec3(
    fracToCartesian(centerAtom.u, centerAtom.v, centerAtom.w, crystal.lattice, CELL_SCALE),
  );

  const matchesSpecies = (spId) => {
    if (!coord.neighborSpecies) return true;
    const sp = spMap.get(spId);
    return spId === coord.neighborSpecies || sp?.symbol === coord.neighborSpecies;
  };

  const candidates = [];
  for (let du = -1; du <= 1; du++) {
    for (let dv = -1; dv <= 1; dv++) {
      for (let dw = -1; dw <= 1; dw++) {
        const isPrimary = du === 0 && dv === 0 && dw === 0;
        for (let i = 0; i < atoms.length; i++) {
          const a = atoms[i];
          if (!matchesSpecies(a.species)) continue;
          const pos = toVec3(
            fracToCartesian(a.u + du, a.v + dv, a.w + dw, crystal.lattice, CELL_SCALE),
          );
          const dist = pos.distanceTo(centerPos);
          if (dist < 1e-3) continue;
          candidates.push({ index: i, pos, dist, isPrimary, species: a.species });
        }
      }
    }
  }

  candidates.sort((a, b) => a.dist - b.dist);
  const minDist = candidates[0]?.dist ?? 0;
  const tol = minDist * 1.08 + 1e-3;

  const dedup = new Map();
  for (const c of candidates) {
    if (c.dist > tol) break;
    const key = `${Math.round(c.pos.x * 100)}_${Math.round(c.pos.y * 100)}_${Math.round(c.pos.z * 100)}`;
    const existing = dedup.get(key);
    if (!existing || (!existing.isPrimary && c.isPrimary)) dedup.set(key, c);
  }

  const chosen = [...dedup.values()].slice(0, coord.number || dedup.size);
  const highlightedIndices = new Set([centerIdx]);
  for (const n of chosen) {
    if (n.isPrimary) highlightedIndices.add(n.index);
  }

  const opacityMap = new Map();
  for (let i = 0; i < atoms.length; i++) {
    opacityMap.set(i, highlightedIndices.has(i) ? 1.0 : 0.22);
  }

  const group = new THREE.Group();
  const extraMats = [];

  const centerSp = spMap.get(centerAtom.species);
  const centerR = getAtomRadius(centerSp, displayMode, false);
  const centerHaloMat = new THREE.MeshBasicMaterial({
    color: tokens.coordCenterColor,
    transparent: true,
    opacity: 0.94,
  });
  const centerHalo = new THREE.Mesh(sharedRingGeom, centerHaloMat);
  centerHalo.userData.sharedGeometry = true;
  centerHalo.userData.isBillboard = true;
  centerHalo.userData.pulseBase = centerR * 1.38;
  centerHalo.scale.setScalar(centerR * 1.38);
  centerHalo.position.copy(centerPos);
  group.add(centerHalo);
  extraMats.push(centerHaloMat);

  const rodMat = new THREE.MeshBasicMaterial({ color: tokens.coordNeighborColor });
  const neighborHaloMat = new THREE.MeshBasicMaterial({
    color: tokens.coordNeighborColor,
    transparent: true,
    opacity: 0.84,
  });
  extraMats.push(rodMat, neighborHaloMat);

  const ghostGeom = style.id === 'pixel' && sharedUnitBox ? sharedUnitBox : sharedUnitSphere;
  for (const n of chosen) {
    const rod = createCylinderBetween(centerPos, n.pos, 0.044, rodMat, 10);
    if (rod) {
      rod.userData.sharedMaterial = true;
      group.add(rod);
    }
    const nSp = spMap.get(n.species);
    const nR = getAtomRadius(nSp, displayMode, false);
    if (!n.isPrimary) {
      const ghostMat = makeAtomMaterial(style, nSp, crystal, { opacity: 0.78 });
      const ghost = new THREE.Mesh(ghostGeom, ghostMat);
      ghost.userData.sharedGeometry = true;
      ghost.scale.setScalar(nR * 0.96);
      ghost.position.copy(n.pos);
      group.add(ghost);
      extraMats.push(ghostMat);
    }

    const ring = new THREE.Mesh(sharedRingGeom, neighborHaloMat);
    ring.userData.sharedGeometry = true;
    ring.userData.sharedMaterial = true;
    ring.userData.isBillboard = true;
    ring.scale.setScalar(nR * 1.24);
    ring.position.copy(n.pos);
    group.add(ring);
  }

  addBadge({
    text: `配位数 = ${coord.number}`,
    subText: coord.label || '',
    className: 'crystal-badge-coord',
    worldPos: centerPos.clone().add(new THREE.Vector3(0, centerR + 0.42, 0)),
    kind: 'overlay',
  });

  group.userData._extraMats = extraMats;
  return { group, opacityMap };
}

/**
 * 构建最短距离 3D 测量线段、端点环与投影公式徽章
 */
export function buildDistanceOverlay(
  crystal,
  { displayMode, sharedRingGeom, style = getViewerStyle(currentThemeId()), addBadge },
) {
  const sd = crystal?.shortestDistance;
  const pair = sd?.pair;
  if (!sd || !Array.isArray(pair) || pair.length < 2) {
    return { group: null, opacityMap: null };
  }

  const tokens = getCrystalThemeTokens(style);
  const p1 = toVec3(fracToCartesian(pair[0][0], pair[0][1], pair[0][2], crystal.lattice, CELL_SCALE));
  const p2 = toVec3(fracToCartesian(pair[1][0], pair[1][1], pair[1][2], crystal.lattice, CELL_SCALE));
  const mid = p1.clone().add(p2).multiplyScalar(0.5);

  const atoms = crystal.atoms || [];
  const spMap = buildSpeciesMap(crystal);
  const highlightPair = new Set();

  [p1, p2].forEach((pt) => {
    let bestI = -1;
    let bestD = Infinity;
    atoms.forEach((a, i) => {
      const pos = toVec3(fracToCartesian(a.u, a.v, a.w, crystal.lattice, CELL_SCALE));
      const d = pos.distanceTo(pt);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    if (bestI >= 0 && bestD < 0.35) highlightPair.add(bestI);
  });

  const opacityMap = new Map();
  for (let i = 0; i < atoms.length; i++) {
    opacityMap.set(i, highlightPair.has(i) ? 1.0 : 0.3);
  }

  const group = new THREE.Group();
  const segMat = new THREE.MeshBasicMaterial({ color: tokens.distColor });
  const ringMat = new THREE.MeshBasicMaterial({
    color: tokens.distColor,
    transparent: true,
    opacity: 0.94,
  });

  const seg = createCylinderBetween(p1, p2, 0.056, segMat, 14);
  if (seg) {
    seg.userData.sharedMaterial = true;
    group.add(seg);
  }

  [p1, p2].forEach((pt, idx) => {
    const atomIdx = [...highlightPair][idx];
    const sp = atomIdx != null ? spMap.get(atoms[atomIdx]?.species) : null;
    const r = getAtomRadius(sp, displayMode, false);
    const ring = new THREE.Mesh(sharedRingGeom, ringMat);
    ring.userData.sharedGeometry = true;
    ring.userData.sharedMaterial = true;
    ring.userData.isBillboard = true;
    ring.userData.pulseBase = r * 1.32;
    ring.scale.setScalar(r * 1.32);
    ring.position.copy(pt);
    group.add(ring);
  });

  const formulaLabel = sd.formula?.startsWith('d') ? sd.formula : `d = ${sd.formula || ''}`;
  addBadge({
    text: formulaLabel,
    subText: sd.valuePm ? `${sd.valuePm} pm` : '',
    className: 'crystal-badge-distance',
    worldPos: mid.clone().add(new THREE.Vector3(0, 0.28, 0)),
    kind: 'overlay',
  });

  group.userData._extraMats = [segMat, ringMat];
  return { group, opacityMap };
}

/**
 * 每帧让标注光环朝向相机并轻微脉冲
 */
export function updateOverlayBillboards(overlayGroup, camera, pulsePhase) {
  if (!overlayGroup) return;
  const pulse = 1 + Math.sin(pulsePhase) * 0.06;
  overlayGroup.traverse((child) => {
    if (child.userData?.isBillboard) {
      child.quaternion.copy(camera.quaternion);
      if (child.userData.pulseBase) {
        child.scale.setScalar(child.userData.pulseBase * pulse);
      }
    }
  });
}
