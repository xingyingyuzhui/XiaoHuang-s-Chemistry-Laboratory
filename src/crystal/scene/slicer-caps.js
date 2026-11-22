/**
 * 真·切开数原子（均摊法）渲染模块
 * - 6 个晶胞局部裁剪面（WebGL localClippingEnabled）
 * - 每个被切球体在交平面上生成实心封盖圆盘，并由其余 5 个裁剪面精准裁切（面心圆盘 / 棱心半圆 / 顶点扇形）
 * - 爆炸展开 / 拼回去时将每个原子的 6 个裁剪面与实体刚体同步平移，绝不穿帮或空壳
 */

import * as THREE from 'three';
import {
  fracToCartesian,
  getCellClipPlanes,
  classifySite,
  computeBonds,
} from '../math/lattice.js';
import {
  CELL_SCALE,
  toVec3,
  easeOutCubic,
  buildSpeciesMap,
  getAtomRadius,
  parseColor,
  makeNormalizedPlanes,
  createCylinderBetween,
  createWireframe,
} from './scene-helpers.js';

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * 构建可切开、可爆炸展开的单晶胞组
 */
export function buildSlicedCellGroup(
  crystal,
  { displayMode, sharedUnitSphere, addBadge, clearBadges, explodeProgress = 0 },
) {
  const group = new THREE.Group();
  const slicedEntries = [];
  const slicedBondMaterials = [];
  clearBadges('slice');

  const baseClipPlanes = makeNormalizedPlanes(
    getCellClipPlanes(crystal.lattice, CELL_SCALE),
  );
  const spMap = buildSpeciesMap(crystal);

  // 晶胞边界参考线框
  group.add(createWireframe(crystal.lattice, 0x38bdf8, 0.85));

  const atoms = crystal.atoms || [];
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const sp = spMap.get(a.species);
    const basePos = toVec3(fracToCartesian(a.u, a.v, a.w, crystal.lattice, CELL_SCALE));
    const radius = getAtomRadius(sp, displayMode, true);
    const siteInfo = classifySite(a.u, a.v, a.w, crystal.system || 'cubic');
    const atomColor = parseColor(sp?.color);
    const capColor = atomColor.clone().lerp(new THREE.Color(0xffffff), 0.22);

    // 每个原子独立的 6 个裁剪面，便于展开时刚体同步平移
    const atomPlanes = baseClipPlanes.map((bp) => bp.clone());
    const atomGroup = new THREE.Group();
    atomGroup.position.copy(basePos);

    // 1) 外球面：全部 6 个裁剪面裁剪，FrontSide 防止空壳内壁穿帮
    const sphereMat = new THREE.MeshStandardMaterial({
      color: atomColor,
      roughness: 0.28,
      metalness: crystal.category === 'metallic' ? 0.38 : 0.1,
      clippingPlanes: atomPlanes,
      clipShadows: true,
      side: THREE.FrontSide,
    });
    const sphereMesh = new THREE.Mesh(sharedUnitSphere, sphereMat);
    sphereMesh.userData.sharedGeometry = true;
    sphereMesh.scale.setScalar(radius);
    atomGroup.add(sphereMesh);

    // 2) 实心截面封盖（Solid Cross-Section Caps）
    const hitNormals = [];
    for (let k = 0; k < baseClipPlanes.length; k++) {
      const bp = baseClipPlanes[k];
      const dist = bp.distanceToPoint(basePos);
      if (Math.abs(dist) < radius - 1e-4) {
        const capR = Math.sqrt(Math.max(0, radius * radius - dist * dist));
        if (capR < 0.015) continue;

        hitNormals.push(bp.normal);
        const otherPlanes = atomPlanes.filter((_, idx) => idx !== k);
        const capMat = new THREE.MeshStandardMaterial({
          color: capColor,
          roughness: 0.48,
          metalness: 0.05,
          clippingPlanes: otherPlanes,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        const capGeom = new THREE.CircleGeometry(capR * 1.004, 42);
        const capMesh = new THREE.Mesh(capGeom, capMat);
        capMesh.position.copy(bp.normal).multiplyScalar(-dist + 0.0008);
        const outward = bp.normal.clone().negate();
        capMesh.quaternion.setFromUnitVectors(Z_AXIS, outward);
        atomGroup.add(capMesh);
      }
    }

    // 展开方向与距离
    const explodeDir = basePos.clone();
    let explodeDist = 0;
    if (explodeDir.lengthSq() > 1e-4) {
      explodeDir.normalize();
      if (siteInfo.site === 'vertex') explodeDist = 0.62;
      else if (siteInfo.site === 'edge') explodeDist = 0.46;
      else if (siteInfo.site === 'face') explodeDist = 0.36;
      else explodeDist = 0.14;
    }

    // 分数徽章锚点（落在被保留实心块内侧重心）
    const badgeBasePos = basePos.clone();
    if (hitNormals.length > 0) {
      const inward = new THREE.Vector3();
      for (const hn of hitNormals) inward.add(hn);
      if (inward.lengthSq() > 1e-4) {
        inward.normalize();
        badgeBasePos.addScaledVector(inward, radius * 0.45);
      }
    }

    const badge = addBadge({
      text: siteInfo.fractionLabel || '1',
      className: `crystal-badge-fraction site-${siteInfo.site}`,
      colorHex: `#${atomColor.getHexString()}`,
      worldPos: badgeBasePos,
      kind: 'slice',
    });

    group.add(atomGroup);
    slicedEntries.push({
      group: atomGroup,
      basePos,
      explodeDir,
      explodeDist,
      planes: atomPlanes,
      badgeBasePos,
      badge,
    });
  }

  // 球棍模式下未展开时保留晶胞内裁剪键，展开时平滑淡出
  if (displayMode === 'ball-stick') {
    const bonds = computeBonds(crystal, CELL_SCALE) || [];
    const bondMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.42,
      metalness: 0.18,
      clippingPlanes: baseClipPlanes,
      transparent: true,
      opacity: Math.max(0, 1 - explodeProgress * 1.4),
    });
    slicedBondMaterials.push(bondMat);
    for (const b of bonds) {
      const cyl = createCylinderBetween(toVec3(b.p1), toVec3(b.p2), 0.048, bondMat, 10);
      if (cyl) {
        cyl.userData.sharedMaterial = true;
        group.add(cyl);
      }
    }
    group.userData._extraMats = [bondMat];
  }

  const state = { group, baseClipPlanes, slicedEntries, slicedBondMaterials };
  applyExplodeTransform(state, explodeProgress);
  return state;
}

/**
 * 同步所有切片原子的爆炸位移、局部裁剪面常数与 2D 分数徽章锚点
 */
export function applyExplodeTransform(sliceState, explodeProgress) {
  if (!sliceState?.slicedEntries?.length) return;
  const { slicedEntries, baseClipPlanes, slicedBondMaterials } = sliceState;
  const t = easeOutCubic(explodeProgress);
  const offset = new THREE.Vector3();

  for (const entry of slicedEntries) {
    offset.copy(entry.explodeDir).multiplyScalar(entry.explodeDist * t);
    entry.group.position.copy(entry.basePos).add(offset);

    // n·(p - offset) + c >= 0  <=>  n·p + (c - n·offset) >= 0
    for (let m = 0; m < entry.planes.length; m++) {
      const bp = baseClipPlanes[m];
      entry.planes[m].normal.copy(bp.normal);
      entry.planes[m].constant = bp.constant - bp.normal.dot(offset);
    }

    if (entry.badge) {
      entry.badge.worldPos.copy(entry.badgeBasePos).add(offset);
    }
  }

  const bondOp = Math.max(0, 1 - t * 1.6);
  for (const bm of slicedBondMaterials) {
    bm.opacity = bondOp;
    bm.visible = bondOp > 0.02;
  }
}
