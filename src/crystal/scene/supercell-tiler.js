/**
 * 渐进超晶胞拼接控制器（1 ~ 8 个晶胞平滑飞入/拆出 + 边界去重 + 镁 HCP 正六棱柱高亮）
 */

import * as THREE from 'three';
import { fracToCartesian, computeSupercellOffsets, getHexPrismEdges } from '../math/lattice.js';
import { getViewerStyle, currentThemeId } from '../../molecule/viewer-style.js';
import {
  CELL_SCALE,
  getCrystalThemeTokens,
  toVec3,
  easeOutCubic,
  createCylinderBetween,
  buildNormalCellGroup,
  disposeGroupWithExtras,
} from './scene-helpers.js';

function getLatticeShiftVector(du, dv, dw, lattice) {
  const o = fracToCartesian(0, 0, 0, lattice, CELL_SCALE);
  const p = fracToCartesian(du, dv, dw, lattice, CELL_SCALE);
  return new THREE.Vector3(p.x - o.x, p.y - o.y, p.z - o.z);
}

function sortHexRing(ring) {
  if (ring.length < 3) return ring;
  const cx = ring.reduce((s, v) => s + v.x, 0) / ring.length;
  const cz = ring.reduce((s, v) => s + v.z, 0) / ring.length;
  return [...ring].sort(
    (a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx),
  );
}

/**
 * 创建超晶胞拼接器
 */
export function createSupercellTiler({
  worldRoot,
  sharedUnitSphere,
  sharedUnitBox,
  addBadge,
  clearBadges,
}) {
  let supercellGroup = null;
  let hexPrismGroup = null;
  const tileMap = new Map();
  const centerTarget = new THREE.Vector3();
  const centerCurrent = new THREE.Vector3();

  function clearHexPrism() {
    if (hexPrismGroup) {
      disposeGroupWithExtras(hexPrismGroup);
      worldRoot.remove(hexPrismGroup);
      hexPrismGroup = null;
    }
    clearBadges('hex');
  }

  function buildHexPrismHighlight(crystal, tileCount, style) {
    clearHexPrism();
    if (!crystal?.hexPrismHighlight || tileCount < 3) return;

    const hexData = getHexPrismEdges(crystal.lattice, CELL_SCALE);
    if (!hexData?.vertices?.length || !hexData?.edges?.length) return;

    const tokens = getCrystalThemeTokens(style);
    const group = new THREE.Group();
    const verts = hexData.vertices.map(toVec3);

    const edgeMat = new THREE.MeshBasicMaterial({ color: tokens.hexPrismColor });
    for (const [i, j] of hexData.edges) {
      if (!verts[i] || !verts[j]) continue;
      const rod = createCylinderBetween(verts[i], verts[j], 0.044, edgeMat, 10);
      if (rod) {
        rod.userData.sharedMaterial = true;
        group.add(rod);
      }
    }

    let minY = Infinity;
    let maxY = -Infinity;
    for (const v of verts) {
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
    const midY = (minY + maxY) * 0.5;
    const botSorted = sortHexRing(verts.filter((v) => v.y <= midY));
    const topSorted = sortHexRing(verts.filter((v) => v.y > midY));

    const extraMats = [edgeMat];
    if (botSorted.length >= 6 && topSorted.length >= 6) {
      const n = Math.min(botSorted.length, topSorted.length);
      const botCenter = new THREE.Vector3(
        botSorted.reduce((s, v) => s + v.x, 0) / n,
        minY,
        botSorted.reduce((s, v) => s + v.z, 0) / n,
      );
      const topCenter = new THREE.Vector3(
        topSorted.reduce((s, v) => s + v.x, 0) / n,
        maxY,
        topSorted.reduce((s, v) => s + v.z, 0) / n,
      );

      const facePositions = [];
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const b0 = botSorted[i];
        const b1 = botSorted[next];
        const t0 = topSorted[i];
        const t1 = topSorted[next];
        facePositions.push(
          b0.x, b0.y, b0.z, b1.x, b1.y, b1.z, t1.x, t1.y, t1.z,
          b0.x, b0.y, b0.z, t1.x, t1.y, t1.z, t0.x, t0.y, t0.z,
          topCenter.x, topCenter.y, topCenter.z, t0.x, t0.y, t0.z, t1.x, t1.y, t1.z,
          botCenter.x, botCenter.y, botCenter.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z,
        );
      }

      const faceGeom = new THREE.BufferGeometry();
      faceGeom.setAttribute('position', new THREE.Float32BufferAttribute(facePositions, 3));
      faceGeom.computeVertexNormals();
      const faceMat = new THREE.MeshBasicMaterial({
        color: tokens.hexPrismColor,
        transparent: true,
        opacity: tokens.isDark ? 0.14 : 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      group.add(new THREE.Mesh(faceGeom, faceMat));
      extraMats.push(faceMat);

      addBadge({
        text: '正六棱柱已显现',
        subText: '3 个六方晶胞无缝拼合',
        className: 'crystal-badge-hex',
        worldPos: topCenter.clone().add(new THREE.Vector3(0, 0.35, 0)),
        kind: 'hex',
      });
    }

    group.userData._extraMats = extraMats;
    hexPrismGroup = group;
    worldRoot.add(hexPrismGroup);
  }

  function syncTiles(crystal, tileCount, displayMode, style = getViewerStyle(currentThemeId())) {
    if (!supercellGroup) {
      supercellGroup = new THREE.Group();
      worldRoot.add(supercellGroup);
    }

    const offsets = computeSupercellOffsets(tileCount, crystal.system || 'cubic') || [[0, 0, 0]];
    const activeKeys = new Set();
    const occupiedAtomKeys = new Set();
    const centroid = new THREE.Vector3();

    const registerCellAtoms = (shiftVec) => {
      for (const a of crystal.atoms || []) {
        const p = toVec3(fracToCartesian(a.u, a.v, a.w, crystal.lattice, CELL_SCALE)).add(shiftVec);
        occupiedAtomKeys.add(
          `${Math.round(p.x * 200)}_${Math.round(p.y * 200)}_${Math.round(p.z * 200)}`,
        );
      }
    };

    offsets.forEach(([du, dv, dw], idx) => {
      const key = `${du},${dv},${dw}`;
      activeKeys.add(key);
      const shift = getLatticeShiftVector(du, dv, dw, crystal.lattice);
      centroid.add(shift);

      if (!tileMap.has(key)) {
        const skipPositions = idx === 0 ? null : new Set(occupiedAtomKeys);
        const tileGroup = buildNormalCellGroup(crystal, {
          displayMode,
          sharedUnitSphere,
          sharedUnitBox,
          style,
          opacity: 1,
          skipPositions,
          cellShift: shift,
        });
        const isOrigin = du === 0 && dv === 0 && dw === 0;
        const startPos = isOrigin
          ? shift.clone()
          : shift.clone().multiplyScalar(1.42).add(new THREE.Vector3(0, 0.35, 0));

        tileGroup.position.copy(startPos);
        if (!isOrigin) tileGroup.scale.setScalar(0.72);
        supercellGroup.add(tileGroup);
        tileMap.set(key, {
          group: tileGroup,
          targetPos: shift.clone(),
          startPos,
          progress: isOrigin ? 1 : 0,
        });
      }
      registerCellAtoms(shift);
    });

    for (const [key, entry] of tileMap.entries()) {
      if (!activeKeys.has(key)) {
        disposeGroupWithExtras(entry.group);
        supercellGroup.remove(entry.group);
        tileMap.delete(key);
      }
    }

    if (offsets.length > 0) {
      centroid.divideScalar(offsets.length);
      centerTarget.copy(centroid).negate();
    } else {
      centerTarget.set(0, 0, 0);
    }

    buildHexPrismHighlight(crystal, tileCount, style);
    return offsets.length;
  }

  function update(dt) {
    for (const entry of tileMap.values()) {
      if (entry.progress < 1) {
        entry.progress = Math.min(1, entry.progress + dt * 2.4);
        const e = easeOutCubic(entry.progress);
        entry.group.position.lerpVectors(entry.startPos, entry.targetPos, e);
        entry.group.scale.setScalar(0.72 + 0.28 * e);
      }
    }
    if (centerCurrent.distanceToSquared(centerTarget) > 1e-5) {
      centerCurrent.lerp(centerTarget, 1 - Math.exp(-dt * 7));
      worldRoot.position.copy(centerCurrent);
    }
  }

  function snapToOrigin() {
    centerTarget.set(0, 0, 0);
    centerCurrent.set(0, 0, 0);
    worldRoot.position.set(0, 0, 0);
  }

  function clear() {
    if (supercellGroup) {
      disposeGroupWithExtras(supercellGroup);
      worldRoot.remove(supercellGroup);
      supercellGroup = null;
    }
    tileMap.clear();
    clearHexPrism();
    centerTarget.set(0, 0, 0);
  }

  return { syncTiles, update, snapToOrigin, clear };
}
