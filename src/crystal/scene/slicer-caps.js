/**
 * 真·切开数原子（均摊法）渲染模块
 * - 6 个晶胞局部裁剪面（WebGL localClippingEnabled）
 * - 每个被切球体在交平面上生成高对比度实心封盖圆盘，并由其余 5 个裁剪面精准裁切
 * - 爆炸展开 / 拼回去时将每个原子的 6 个裁剪面与实体刚体同步平移，绝不穿帮或空壳
 */

import * as THREE from 'three';
import {
  fracToCartesian,
  getCellClipPlanes,
  classifySite,
  computeBonds,
} from '../math/lattice.js';
import { getViewerStyle, currentThemeId } from '../../molecule/viewer-style.js';
import {
  CELL_SCALE,
  getCrystalThemeTokens,
  toVec3,
  easeOutCubic,
  buildSpeciesMap,
  getAtomRadius,
  parseColor,
  resolveAtomColorHex,
  makeAtomMaterial,
  makeBondMaterial,
  makeNormalizedPlanes,
  createCylinderBetween,
  createWireframe,
} from './scene-helpers.js';
import {
  detectMolecularPrototype,
  createMolecularNodeMesh,
  getMolecularSliceCapRadius,
} from './molecular-nodes.js';

const Z_AXIS = new THREE.Vector3(0, 0, 1);

const isInteriorSite = (siteInfo) => siteInfo?.site === 'interior' || (siteInfo?.weight ?? 0) >= 0.999;

/**
 * 计算考虑硬球物理接触与晶胞内壁约束后的安全原子半径
 * - 填充 / 切开模式：任意成对粒子若 rA + rB > d * 1.06，按比例等比缩放避免互相吞噬
 * - 切开模式下的体内粒子（site === 'interior' / weight === 1）：额外限制 r <= minDistToCellPlanes * 0.98
 */
export function computeSafeAtomRadii(
  crystal,
  { displayMode = 'space-filling', isSliced = false, clipPlanes = null } = {},
) {
  const atoms = crystal?.atoms || [];
  const spMap = buildSpeciesMap(crystal);
  const positions = atoms.map((a) => toVec3(fracToCartesian(a.u, a.v, a.w, crystal.lattice, CELL_SCALE)));
  const rawRadii = atoms.map((a) => getAtomRadius(spMap.get(a.species), displayMode, isSliced));

  let dMin = Infinity;
  let scale = 1;
  const applyHardCap = displayMode === 'space-filling' || isSliced;
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const d = positions[i].distanceTo(positions[j]);
      if (d <= 1e-4) continue;
      if (d < dMin) dMin = d;
      if (applyHardCap) {
        const rSum = rawRadii[i] + rawRadii[j];
        if (rSum > d * 1.06) scale = Math.min(scale, (d * 1.06) / rSum);
      }
    }
  }

  const planes = isSliced
    ? (clipPlanes || makeNormalizedPlanes(getCellClipPlanes(crystal.lattice, CELL_SCALE)))
    : null;
  const system = crystal?.system || 'cubic';
  const radii = rawRadii.map((raw, i) => {
    let r = raw * scale;
    if (isSliced && planes?.length) {
      const siteInfo = classifySite(atoms[i].u, atoms[i].v, atoms[i].w, system);
      if (isInteriorSite(siteInfo)) {
        let minPlaneDist = Infinity;
        for (const bp of planes) minPlaneDist = Math.min(minPlaneDist, bp.distanceToPoint(positions[i]));
        if (Number.isFinite(minPlaneDist) && minPlaneDist > 0) {
          r = Math.min(r, minPlaneDist * 0.98);
        }
      }
    }
    return r;
  });

  return { dMin, scale, radii, positions };
}

/**
 * 为展示晶胞生成硬球半径受控副本（防止历史缓存/AI 晶胞的超大 spaceRadius 互相吞噬）
 */
export function sanitizeCrystalRadii(crystal) {
  if (!crystal?.atoms?.length || !crystal?.species?.length) return crystal;
  const { scale } = computeSafeAtomRadii(crystal, { displayMode: 'space-filling', isSliced: false });
  if (scale >= 0.9999) return crystal;
  return {
    ...crystal,
    species: crystal.species.map((sp) => {
      const nextSpace = Number(((sp.spaceRadius ?? 0.52) * scale).toFixed(3));
      const nextBall = sp.ballRadius != null
        ? Math.min(sp.ballRadius, Number((nextSpace * 0.9).toFixed(3)))
        : sp.ballRadius;
      return { ...sp, spaceRadius: nextSpace, ...(nextBall != null ? { ballRadius: nextBall } : {}) };
    }),
  };
}

function makeCapMaterial(style, atomColor, otherPlanes, isDark) {
  const capColor = isDark
    ? atomColor.clone().lerp(new THREE.Color(0xffffff), 0.34)
    : atomColor.clone().lerp(new THREE.Color(0xfffbeb), 0.36);

  if (style.id === 'stationery' || style.id === 'blackboard') {
    return new THREE.MeshToonMaterial({
      color: capColor,
      clippingPlanes: otherPlanes,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: capColor,
    roughness: 0.56,
    metalness: 0.04,
    clippingPlanes: otherPlanes,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

/**
 * 构建可切开、可爆炸展开的单晶胞组
 */
export function buildSlicedCellGroup(
  crystal,
  {
    displayMode,
    sharedUnitSphere,
    style = getViewerStyle(currentThemeId()),
    addBadge,
    clearBadges,
    explodeProgress = 0,
  },
) {
  const group = new THREE.Group();
  const slicedEntries = [];
  const slicedBondMaterials = [];
  const tokens = getCrystalThemeTokens(style);
  clearBadges('slice');

  const baseClipPlanes = makeNormalizedPlanes(getCellClipPlanes(crystal.lattice, CELL_SCALE));
  const spMap = buildSpeciesMap(crystal);

  // 晶胞边界参考线框（使用主题主强调色，明暗主题均清晰）
  group.add(createWireframe(crystal.lattice, tokens.sliceWireColor, 0.86));

  const atoms = crystal.atoms || [];
  const { radii, positions } = computeSafeAtomRadii(crystal, {
    displayMode,
    isSliced: true,
    clipPlanes: baseClipPlanes,
  });

  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const sp = spMap.get(a.species);
    const basePos = positions[i];
    const radius = radii[i];
    const siteInfo = classifySite(a.u, a.v, a.w, crystal.system || 'cubic');
    const interior = isInteriorSite(siteInfo);
    const atomColor = parseColor(resolveAtomColorHex(sp, style));

    // 体内粒子（weight === 1）绝不裁剪、绝不生成切面封盖，始终保持完整整球
    const atomPlanes = interior ? [] : baseClipPlanes.map((bp) => bp.clone());
    const atomGroup = new THREE.Group();
    atomGroup.position.copy(basePos);

    // 1) 外球面 / 分子节点：边界原子挂 6 个局部裁剪面；体内原子不挂裁剪面
    const proto = detectMolecularPrototype(sp, crystal);
    if (proto) {
      const node = createMolecularNodeMesh(proto, {
        radius,
        color: resolveAtomColorHex(sp, style),
        style,
        index: i,
        frac: a,
        clippingPlanes: atomPlanes,
        displayMode,
        isSliced: true,
        sharedUnitSphere,
      });
      if (node) atomGroup.add(node);
    } else {
      const sphereMat = makeAtomMaterial(
        style,
        sp,
        crystal,
        interior ? { side: THREE.FrontSide } : { clippingPlanes: atomPlanes, side: THREE.FrontSide },
      );
      const sphereMesh = new THREE.Mesh(sharedUnitSphere, sphereMat);
      sphereMesh.userData.sharedGeometry = true;
      sphereMesh.scale.setScalar(radius);
      atomGroup.add(sphereMesh);
    }

    // 2) 实心截面封盖（Solid Cross-Section Caps，仅边界原子生成）
    const hitNormals = [];
    const capBaseR = proto ? getMolecularSliceCapRadius(proto, radius, displayMode) : radius;
    if (!interior) {
      for (let k = 0; k < baseClipPlanes.length; k++) {
        const bp = baseClipPlanes[k];
        const dist = bp.distanceToPoint(basePos);
        if (Math.abs(dist) < radius - 1e-4) hitNormals.push(bp.normal);
        if (capBaseR > 0 && Math.abs(dist) < capBaseR - 1e-4) {
          const capR = Math.sqrt(Math.max(0, capBaseR * capBaseR - dist * dist));
          if (capR < 0.015) continue;

          const otherPlanes = atomPlanes.filter((_, idx) => idx !== k);
          const capMat = makeCapMaterial(style, atomColor, otherPlanes, tokens.isDark);
          const capGeom = new THREE.CircleGeometry(capR * 1.004, 42);
          const capMesh = new THREE.Mesh(capGeom, capMat);
          capMesh.position.copy(bp.normal).multiplyScalar(-dist + 0.0008);
          const outward = bp.normal.clone().negate();
          capMesh.quaternion.setFromUnitVectors(Z_AXIS, outward);
          atomGroup.add(capMesh);
        }
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
      siteInfo,
      radius,
    });
  }

  // 球棍模式下未展开时保留晶胞内裁剪键，展开时平滑淡出
  if (displayMode === 'ball-stick') {
    const bonds = computeBonds(crystal, CELL_SCALE) || [];
    const bondMat = makeBondMaterial(style, {
      opacity: Math.max(0, 1 - explodeProgress * 1.4),
      clippingPlanes: baseClipPlanes,
    });
    bondMat.transparent = true;
    slicedBondMaterials.push(bondMat);
    const radial = style.id === 'pixel' ? 4 : 10;
    for (const b of bonds) {
      const cyl = createCylinderBetween(toVec3(b.p1), toVec3(b.p2), 0.048, bondMat, radial);
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
