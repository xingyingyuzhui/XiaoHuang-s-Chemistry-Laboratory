/**
 * 3D 晶胞交互渲染引擎（Three.js + OrbitControls）
 * 支持：
 * - 球棍模型 ↔ 填充模型一键切换
 * - 真·切开数原子（WebGL Local Clipping Planes + 实心截面封盖 + 爆炸展开/拼回去 + 2D 投影分数徽章）
 * - 渐进拼晶胞（1 ~ 8 个晶胞平滑飞入/拆出 + 镁 HCP 3 晶胞涌现正六棱柱高亮）
 * - 高考考点标注（配位数高亮 + 最短距离 3D 测量线与公式徽章）
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  fracToCartesian,
  getCellCorners,
  getCellClipPlanes,
  classifySite,
  computeBonds,
  computeSupercellOffsets,
  getHexPrismEdges,
} from '../math/lattice.js';

export const CELL_SCALE = 2.4;
const STAGE_BG = 0x0d1322;
const WIRE_COLOR = 0x7dd3fc;
const HEX_PRISM_COLOR = 0xfbbf24;
const COORD_CENTER_COLOR = 0xfbbf24;
const COORD_NEIGHBOR_COLOR = 0x38bdf8;
const DIST_COLOR = 0xf43f5e;

const UP_VEC = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function toVec3(p) {
  if (!p) return new THREE.Vector3();
  if (Array.isArray(p)) return new THREE.Vector3(p[0] || 0, p[1] || 0, p[2] || 0);
  return new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}

function buildSpeciesMap(crystal) {
  const map = new Map();
  for (const sp of crystal?.species || []) {
    if (sp.id != null) map.set(sp.id, sp);
    if (sp.symbol != null && !map.has(sp.symbol)) map.set(sp.symbol, sp);
  }
  return map;
}

function getAtomRadius(sp, displayMode, isSliced) {
  const ball = sp?.ballRadius ?? 0.28;
  const space = sp?.spaceRadius ?? 0.52;
  if (displayMode === 'space-filling') return space;
  // 切开模式下适当放大过小球体，保证截面清晰易数
  if (isSliced) return Math.max(ball * 1.18, Math.min(space * 0.68, ball + 0.08));
  return ball;
}

function parseColor(raw, fallback = 0x94a3b8) {
  if (raw == null) return new THREE.Color(fallback);
  return new THREE.Color(raw);
}

function makeNormalizedPlanes(rawPlanes) {
  return (rawPlanes || []).map((p) => {
    const n = Array.isArray(p.normal)
      ? new THREE.Vector3(p.normal[0], p.normal[1], p.normal[2])
      : toVec3(p.normal);
    const len = n.length() || 1;
    n.divideScalar(len);
    let c = (p.constant ?? 0) / len;
    // 确保晶胞中心 (0,0,0) 严格位于内侧 (n·0 + c >= 0)
    if (c < 0) {
      n.negate();
      c = -c;
    }
    return new THREE.Plane(n, c);
  });
}

function createCylinderBetween(p1, p2, radius, material, radialSegments = 14) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  if (len < 1e-5) return null;
  const geom = new THREE.CylinderGeometry(radius, radius, len, radialSegments, 1);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(p1).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP_VEC, dir.normalize());
  return mesh;
}

function disposeObjectTree(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry && !child.userData?.sharedGeometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m && !m.userData?.sharedMaterial) {
          m.dispose();
        }
      }
    }
  });
}

/**
 * 创建 3D 晶胞视图控制器
 * @param {HTMLElement} container 3D 画布挂载容器（需 position: relative）
 * @returns {object} viewer API
 */
export function createCrystalViewer(container) {
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
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  // 2D 投影标签层（分数徽章、最短距离公式、配位数、正六棱柱提示）
  const labelLayer = document.createElement('div');
  labelLayer.className = 'crystal-label-layer';
  labelLayer.setAttribute('aria-hidden', 'true');
  container.appendChild(labelLayer);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 2.0;
  controls.maxDistance = 26;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 1.1;

  // 棚拍级平衡灯光（暗底通透、高光克制不过曝）
  const hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 0.78);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
  keyLight.position.set(5.5, 8.0, 6.2);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.48);
  rimLight.position.set(-6.0, 4.2, -5.5);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0xfef3c7, 0.26);
  fillLight.position.set(0.5, -6.5, 3.5);
  scene.add(fillLight);

  // 共享基础球体几何
  const sharedUnitSphere = new THREE.SphereGeometry(1, 36, 26);
  const sharedRingGeom = new THREE.TorusGeometry(1, 0.08, 12, 36);

  // 场景根组
  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

  // ── 状态 ──
  let currentCrystal = null;
  let displayMode = 'ball-stick'; // 'ball-stick' | 'space-filling'
  let sliced = false;
  let exploded = false;
  let tileCount = 1;
  let overlay = 'none'; // 'none' | 'coordination' | 'distance'

  let explodeProgress = 0;
  let targetExplode = 0;

  // 内部场景分组
  let singleCellGroup = null;
  let supercellGroup = null;
  let overlayGroup = null;
  let hexPrismGroup = null;

  /** 切片原子条目，用于实时同步局部裁剪面与爆炸位移 */
  let slicedEntries = [];
  /** 切开时的键材质（展开时平滑淡出） */
  let slicedBondMaterials = [];
  /** 基础 6 个晶胞裁剪面 */
  let baseClipPlanes = [];

  /** 超晶胞拼块动画表：key -> { group, targetPos, startPos, progress, removing } */
  const tileMap = new Map();
  let supercellCenterTarget = new THREE.Vector3();
  let supercellCenterCurrent = new THREE.Vector3();

  /** 2D 投影徽章：{ el, worldPos: THREE.Vector3, kind, active } */
  let projectedBadges = [];

  /** 相机平滑归位目标 */
  let cameraLerp = null;
  const projVec = new THREE.Vector3();

  let rafId = 0;
  let running = false;
  let lastTime = 0;
  let pulsePhase = 0;
  let disposed = false;

  // ── 2D 徽章管理 ──
  function clearBadges(kindFilter = null) {
    projectedBadges = projectedBadges.filter((b) => {
      if (kindFilter && b.kind !== kindFilter) return true;
      b.el.remove();
      return false;
    });
  }

  function addBadge({ text, subText = '', className = '', colorHex = '', worldPos, kind = 'slice' }) {
    const el = document.createElement('div');
    el.className = `crystal-badge ${className}`.trim();
    if (colorHex) {
      el.style.setProperty('--badge-dot', colorHex);
    }
    const mainSpan = document.createElement('span');
    mainSpan.className = 'crystal-badge-main';
    mainSpan.textContent = text;
    el.appendChild(mainSpan);
    if (subText) {
      const subSpan = document.createElement('span');
      subSpan.className = 'crystal-badge-sub';
      subSpan.textContent = subText;
      el.appendChild(subSpan);
    }
    labelLayer.appendChild(el);
    const entry = { el, worldPos: worldPos.clone(), kind };
    projectedBadges.push(entry);
    return entry;
  }

  function updateProjectedBadges() {
    if (!projectedBadges.length) return;
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;

    for (const b of projectedBadges) {
      projVec.copy(b.worldPos);
      // 叠加 worldRoot 位移（如超晶胞居中偏移）
      projVec.add(worldRoot.position);
      projVec.project(camera);

      const visible = projVec.z >= -1 && projVec.z <= 1;
      if (!visible) {
        b.el.style.opacity = '0';
        continue;
      }
      const x = (projVec.x * 0.5 + 0.5) * width;
      const y = (-projVec.y * 0.5 + 0.5) * height;
      const inBounds = x >= -40 && x <= width + 40 && y >= -30 && y <= height + 30;
      if (!inBounds) {
        b.el.style.opacity = '0';
        continue;
      }

      let alpha = 1;
      if (b.kind === 'slice') {
        // 仅在切开或展开过程中平滑显现分数徽章
        alpha = sliced ? Math.min(1, 0.25 + explodeProgress * 0.95) : 0;
      }
      b.el.style.opacity = String(alpha.toFixed(2));
      b.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  }

  // ── 晶胞线框构建 ──
  function createWireframe(lattice, color = WIRE_COLOR, opacity = 0.65) {
    const { vertices, edges } = getCellCorners(lattice, CELL_SCALE);
    const pts = [];
    for (const [i, j] of edges || []) {
      const a = toVec3(vertices[i]);
      const b = toVec3(vertices[j]);
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
    });
    return new THREE.LineSegments(geom, mat);
  }

  // ── 常规（未切开）单晶胞构建 ──
  function buildNormalCellGroup(
    crystal,
    { dimAll = false, opacity = 1, atomOpacityMap = null, skipPositions = null, cellShift = null } = {},
  ) {
    const group = new THREE.Group();
    const spMap = buildSpeciesMap(crystal);

    // 线框
    group.add(createWireframe(crystal.lattice, WIRE_COLOR, opacity * 0.58));

    // 共享每种元素的材质（若没有逐原子透明度覆盖）
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

      // 超晶胞拼块时去重共享边界原子，避免 Z-fighting 闪烁
      if (skipPositions) {
        const key = `${Math.round((pos.x + sx) * 200)}_${Math.round((pos.y + sy) * 200)}_${Math.round((pos.z + sz) * 200)}`;
        if (skipPositions.has(key)) continue;
      }

      const sp = spMap.get(a.species);
      const r = getAtomRadius(sp, displayMode, false);
      const customOp = atomOpacityMap ? atomOpacityMap.get(i) : undefined;
      const mat = getNormalMat(sp, customOp);
      const mesh = new THREE.Mesh(sharedUnitSphere, mat);
      mesh.userData.sharedGeometry = true;
      mesh.userData.sharedMaterial = !atomOpacityMap;
      mesh.scale.setScalar(r);
      mesh.position.copy(pos);
      group.add(mesh);
    }

    // 球棍模式下绘制化学键
    if (displayMode === 'ball-stick') {
      const bonds = computeBonds(crystal, CELL_SCALE) || [];
      const bondRadius = 0.052;
      const bondOpacity = dimAll ? 0.15 : opacity * 0.85;
      const bondMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.42,
        metalness: 0.2,
        transparent: bondOpacity < 0.99,
        opacity: bondOpacity,
      });
      for (const b of bonds) {
        const p1 = toVec3(b.p1);
        const p2 = toVec3(b.p2);
        const cyl = createCylinderBetween(p1, p2, bondRadius, bondMat, 10);
        if (cyl) {
          cyl.userData.sharedMaterial = true;
          group.add(cyl);
        }
      }
      // 把 bondMat 挂在 group.userData 便于释放
      group.userData._extraMats = [bondMat, ...sharedMatMap.values()];
    } else {
      group.userData._extraMats = [...sharedMatMap.values()];
    }

    return group;
  }

  // ── 真·切开数原子（实心截面封盖 + 可展开/拼回）──
  function buildSlicedCellGroup(crystal) {
    const group = new THREE.Group();
    slicedEntries = [];
    slicedBondMaterials = [];
    clearBadges('slice');

    baseClipPlanes = makeNormalizedPlanes(getCellClipPlanes(crystal.lattice, CELL_SCALE));
    const spMap = buildSpeciesMap(crystal);

    // 晶胞参考线框（清晰标出原始晶胞边界）
    const frame = createWireframe(crystal.lattice, 0x38bdf8, 0.85);
    group.add(frame);

    const atoms = crystal.atoms || [];
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      const sp = spMap.get(a.species);
      const basePos = toVec3(fracToCartesian(a.u, a.v, a.w, crystal.lattice, CELL_SCALE));
      const radius = getAtomRadius(sp, displayMode, true);
      const siteInfo = classifySite(a.u, a.v, a.w, crystal.system || 'cubic');
      const atomColor = parseColor(sp?.color);
      const capColor = atomColor.clone().lerp(new THREE.Color(0xffffff), 0.22);

      // 每个原子拥有独立的 6 个可平移裁剪面，爆炸展开时随碎片刚体同步移动
      const atomPlanes = baseClipPlanes.map((bp) => bp.clone());

      const atomGroup = new THREE.Group();
      atomGroup.position.copy(basePos);

      // 1) 外球面：应用全部 6 个裁剪面，FrontSide 避免内部空壳穿帮
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
      // 对每一个切割该球体的晶胞边界面 k，在平面 k 上生成实心圆盘，并由其余 5 个平面裁剪！
      // - 面心原子（被 1 个面切）→ 完整实心圆盘
      // - 棱心原子（被 2 个面切）→ 2 个互相垂直/成角的实心半圆盘
      // - 顶点原子（被 3 个面切）→ 3 个实心 1/4 扇形（六方晶系自动为精准 60°/120° 扇形！）
      const hitNormals = [];
      for (let k = 0; k < baseClipPlanes.length; k++) {
        const bp = baseClipPlanes[k];
        const dist = bp.distanceToPoint(basePos); // n·P + c
        if (Math.abs(dist) < radius - 1e-4) {
          const capR = Math.sqrt(Math.max(0, radius * radius - dist * dist));
          if (capR < 0.015) continue;

          hitNormals.push(bp.normal);
          // 其余 5 个裁剪面（不含当前面 k，避免与自身共面导致 Z-fighting）
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
          // 微放大 0.4% 完美封住球壳接缝
          const capGeom = new THREE.CircleGeometry(capR * 1.004, 42);
          const capMesh = new THREE.Mesh(capGeom, capMat);

          // 圆盘中心位于球心在平面 k 上的垂足，并向内微移 0.0008 防浮沉
          capMesh.position.copy(bp.normal).multiplyScalar(-dist + 0.0008);
          // 法线朝向外侧（-n_k），正对观察者
          const outward = bp.normal.clone().negate();
          capMesh.quaternion.setFromUnitVectors(Z_AXIS, outward);
          atomGroup.add(capMesh);
        }
      }

      // 计算爆炸展开方向与距离
      const explodeDir = basePos.clone();
      let explodeDist = 0;
      if (explodeDir.lengthSq() > 1e-4) {
        explodeDir.normalize();
        if (siteInfo.site === 'vertex') explodeDist = 0.62;
        else if (siteInfo.site === 'edge') explodeDist = 0.46;
        else if (siteInfo.site === 'face') explodeDist = 0.36;
        else explodeDist = 0.14;
      }

      // 计算分数徽章锚点（落在被保留碎片的内侧重心，便于一眼看清归属）
      const badgeBasePos = basePos.clone();
      if (hitNormals.length > 0) {
        const inward = new THREE.Vector3();
        for (const hn of hitNormals) inward.add(hn);
        if (inward.lengthSq() > 1e-4) {
          inward.normalize();
          badgeBasePos.addScaledVector(inward, radius * 0.45);
        }
      }

      const colorHex = `#${atomColor.getHexString()}`;
      const badge = addBadge({
        text: siteInfo.fractionLabel || '1',
        className: `crystal-badge-fraction site-${siteInfo.site}`,
        colorHex,
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

    // 切开且未展开时，保留裁剪在晶胞内部的化学键；展开时平滑淡出
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

    applyExplodeTransform();
    return group;
  }

  function applyExplodeTransform() {
    if (!slicedEntries.length) return;
    const t = easeOutCubic(explodeProgress);
    const offset = new THREE.Vector3();

    for (const entry of slicedEntries) {
      offset.copy(entry.explodeDir).multiplyScalar(entry.explodeDist * t);
      entry.group.position.copy(entry.basePos).add(offset);

      // 同步平移该原子的全部 6 个局部裁剪面：n·(p - offset) + c >= 0 <=> n·p + (c - n·offset) >= 0
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

  // ── 晶胞超晶胞平铺（1 ~ 8 个晶胞平滑飞入 + 镁正六棱柱高亮）──
  function getLatticeShiftVector(du, dv, dw, lattice) {
    const o = fracToCartesian(0, 0, 0, lattice, CELL_SCALE);
    const p = fracToCartesian(du, dv, dw, lattice, CELL_SCALE);
    return new THREE.Vector3(p.x - o.x, p.y - o.y, p.z - o.z);
  }

  function clearSupercell() {
    if (supercellGroup) {
      disposeGroupWithExtras(supercellGroup);
      worldRoot.remove(supercellGroup);
      supercellGroup = null;
    }
    tileMap.clear();
    clearHexPrism();
    supercellCenterTarget.set(0, 0, 0);
  }

  function clearHexPrism() {
    if (hexPrismGroup) {
      disposeGroupWithExtras(hexPrismGroup);
      worldRoot.remove(hexPrismGroup);
      hexPrismGroup = null;
    }
    clearBadges('hex');
  }

  function buildHexPrismHighlight(crystal) {
    clearHexPrism();
    if (!crystal?.hexPrismHighlight || tileCount < 3) return;

    const hexData = getHexPrismEdges(crystal.lattice, CELL_SCALE);
    if (!hexData?.vertices?.length || !hexData?.edges?.length) return;

    const group = new THREE.Group();
    const verts = hexData.vertices.map(toVec3);

    // 发光正六棱柱棱边（3D 粗发光杆）
    const edgeMat = new THREE.MeshStandardMaterial({
      color: HEX_PRISM_COLOR,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.72,
      roughness: 0.25,
      metalness: 0.1,
    });

    for (const [i, j] of hexData.edges) {
      if (!verts[i] || !verts[j]) continue;
      const rod = createCylinderBetween(verts[i], verts[j], 0.042, edgeMat, 10);
      if (rod) {
        rod.userData.sharedMaterial = true;
        group.add(rod);
      }
    }

    // 半透明发光棱柱侧面与顶/底面（按 y 分出上下两个正六边形环）
    let minY = Infinity;
    let maxY = -Infinity;
    for (const v of verts) {
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
    const midY = (minY + maxY) * 0.5;
    const bottomRing = verts.filter((v) => v.y <= midY);
    const topRing = verts.filter((v) => v.y > midY);

    const sortRing = (ring) => {
      if (ring.length < 3) return ring;
      const cx = ring.reduce((s, v) => s + v.x, 0) / ring.length;
      const cz = ring.reduce((s, v) => s + v.z, 0) / ring.length;
      return [...ring].sort(
        (a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx),
      );
    };

    const botSorted = sortRing(bottomRing);
    const topSorted = sortRing(topRing);

    const extraMats = [edgeMat];
    if (botSorted.length >= 6 && topSorted.length >= 6) {
      const facePositions = [];
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

      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const b0 = botSorted[i];
        const b1 = botSorted[next];
        const t0 = topSorted[i];
        const t1 = topSorted[next];
        // 侧面两个三角形
        facePositions.push(
          b0.x, b0.y, b0.z, b1.x, b1.y, b1.z, t1.x, t1.y, t1.z,
          b0.x, b0.y, b0.z, t1.x, t1.y, t1.z, t0.x, t0.y, t0.z,
        );
        // 顶面与底面扇形
        facePositions.push(
          topCenter.x, topCenter.y, topCenter.z, t0.x, t0.y, t0.z, t1.x, t1.y, t1.z,
          botCenter.x, botCenter.y, botCenter.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z,
        );
      }

      const faceGeom = new THREE.BufferGeometry();
      faceGeom.setAttribute('position', new THREE.Float32BufferAttribute(facePositions, 3));
      faceGeom.computeVertexNormals();
      const faceMat = new THREE.MeshBasicMaterial({
        color: HEX_PRISM_COLOR,
        transparent: true,
        opacity: 0.11,
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

  function syncSupercellTiles(crystal) {
    if (!supercellGroup) {
      supercellGroup = new THREE.Group();
      worldRoot.add(supercellGroup);
    }

    const offsets = computeSupercellOffsets(tileCount, crystal.system || 'cubic') || [[0, 0, 0]];
    const activeKeys = new Set();

    // 统计已有单元的原子世界位置以便新单元去重共享边界原子
    const occupiedAtomKeys = new Set();
    const registerCellAtoms = (shiftVec) => {
      for (const a of crystal.atoms || []) {
        const p = toVec3(fracToCartesian(a.u, a.v, a.w, crystal.lattice, CELL_SCALE)).add(shiftVec);
        occupiedAtomKeys.add(
          `${Math.round(p.x * 200)}_${Math.round(p.y * 200)}_${Math.round(p.z * 200)}`,
        );
      }
    };

    const centroid = new THREE.Vector3();

    offsets.forEach(([du, dv, dw], idx) => {
      const key = `${du},${dv},${dw}`;
      activeKeys.add(key);
      const shift = getLatticeShiftVector(du, dv, dw, crystal.lattice);
      centroid.add(shift);

      if (!tileMap.has(key)) {
        const skipPositions = idx === 0 ? null : new Set(occupiedAtomKeys);
        const tileGroup = buildNormalCellGroup(crystal, {
          opacity: 1,
          skipPositions,
          cellShift: shift,
        });

        const isOrigin = du === 0 && dv === 0 && dw === 0;
        const startPos = isOrigin
          ? shift.clone()
          : shift.clone().multiplyScalar(1.42).add(new THREE.Vector3(0, 0.35, 0));

        tileGroup.position.copy(startPos);
        if (!isOrigin) {
          tileGroup.scale.setScalar(0.72);
        }
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

    // 移除多余晶胞
    for (const [key, entry] of tileMap.entries()) {
      if (!activeKeys.has(key)) {
        disposeGroupWithExtras(entry.group);
        supercellGroup.remove(entry.group);
        tileMap.delete(key);
      }
    }

    // 居中整个超晶胞
    if (offsets.length > 0) {
      centroid.divideScalar(offsets.length);
      supercellCenterTarget.copy(centroid).negate();
    } else {
      supercellCenterTarget.set(0, 0, 0);
    }

    buildHexPrismHighlight(crystal);
    frameCameraForTiles(offsets.length);
  }

  // ── 考点标注：配位数 / 最短距离 ──
  function clearOverlay() {
    if (overlayGroup) {
      disposeGroupWithExtras(overlayGroup);
      worldRoot.remove(overlayGroup);
      overlayGroup = null;
    }
    clearBadges('overlay');
  }

  function buildCoordinationOverlay(crystal) {
    clearOverlay();
    const coord = crystal?.coordination;
    const atoms = crystal?.atoms || [];
    if (!coord || !atoms.length) return null;

    const spMap = buildSpeciesMap(crystal);
    let centerIdx = Number.isInteger(coord.centerIndex) ? coord.centerIndex : 0;
    if (centerIdx < 0 || centerIdx >= atoms.length) {
      // 回退：找最靠近体心的原子
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

    // 搜索最近配位邻居（先找全局周期最短距离，再优先选晶胞内原位邻居，不足时补周围镜像透明邻居）
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
            const u = a.u + du;
            const v = a.v + dv;
            const w = a.w + dw;
            const pos = toVec3(fracToCartesian(u, v, w, crystal.lattice, CELL_SCALE));
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

    // 去重同空间位置邻居（周期边界重合点优先保留主晶胞内原子）
    const dedup = new Map();
    for (const c of candidates) {
      if (c.dist > tol) break;
      const key = `${Math.round(c.pos.x * 100)}_${Math.round(c.pos.y * 100)}_${Math.round(c.pos.z * 100)}`;
      const existing = dedup.get(key);
      if (!existing || (!existing.isPrimary && c.isPrimary)) {
        dedup.set(key, c);
      }
    }

    const neighbors = [...dedup.values()];
    const maxCount = coord.number || neighbors.length;
    const chosen = neighbors.slice(0, maxCount);

    const highlightedIndices = new Set([centerIdx]);
    for (const n of chosen) {
      if (n.isPrimary) highlightedIndices.add(n.index);
    }

    // 透明度映射：无关原子淡化，中心与配位邻居全亮
    const opacityMap = new Map();
    for (let i = 0; i < atoms.length; i++) {
      opacityMap.set(i, highlightedIndices.has(i) ? 1.0 : 0.2);
    }

    const group = new THREE.Group();
    const extraMats = [];

    // 中心原子发光金环
    const centerSp = spMap.get(centerAtom.species);
    const centerR = getAtomRadius(centerSp, displayMode, false);
    const centerHaloMat = new THREE.MeshBasicMaterial({
      color: COORD_CENTER_COLOR,
      transparent: true,
      opacity: 0.92,
    });
    const centerHalo = new THREE.Mesh(sharedRingGeom, centerHaloMat);
    centerHalo.userData.sharedGeometry = true;
    centerHalo.scale.setScalar(centerR * 1.38);
    centerHalo.position.copy(centerPos);
    centerHalo.userData.isBillboard = true;
    centerHalo.userData.pulseBase = centerR * 1.38;
    group.add(centerHalo);
    extraMats.push(centerHaloMat);

    // 配位连线与外围邻居提示
    const rodMat = new THREE.MeshStandardMaterial({
      color: COORD_NEIGHBOR_COLOR,
      emissive: 0x0284c7,
      emissiveIntensity: 0.65,
      roughness: 0.25,
    });
    const neighborHaloMat = new THREE.MeshBasicMaterial({
      color: COORD_NEIGHBOR_COLOR,
      transparent: true,
      opacity: 0.78,
    });
    extraMats.push(rodMat, neighborHaloMat);

    for (const n of chosen) {
      const rod = createCylinderBetween(centerPos, n.pos, 0.044, rodMat, 10);
      if (rod) {
        rod.userData.sharedMaterial = true;
        group.add(rod);
      }
      const nSp = spMap.get(n.species);
      const nR = getAtomRadius(nSp, displayMode, false);
      if (!n.isPrimary) {
        // 邻胞镜像配位原子用半透明高亮球显示，让学生直观数出全部配位数（如 FCC 的 12 配位）
        const ghostMat = new THREE.MeshStandardMaterial({
          color: parseColor(nSp?.color),
          emissive: 0x0ea5e9,
          emissiveIntensity: 0.28,
          roughness: 0.3,
          transparent: true,
          opacity: 0.78,
        });
        const ghost = new THREE.Mesh(sharedUnitSphere, ghostMat);
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
    overlayGroup = group;
    worldRoot.add(overlayGroup);
    return opacityMap;
  }

  function buildDistanceOverlay(crystal) {
    clearOverlay();
    const sd = crystal?.shortestDistance;
    const pair = sd?.pair;
    if (!sd || !Array.isArray(pair) || pair.length < 2) return null;

    const p1 = toVec3(fracToCartesian(pair[0][0], pair[0][1], pair[0][2], crystal.lattice, CELL_SCALE));
    const p2 = toVec3(fracToCartesian(pair[1][0], pair[1][1], pair[1][2], crystal.lattice, CELL_SCALE));
    const mid = p1.clone().add(p2).multiplyScalar(0.5);

    const atoms = crystal.atoms || [];
    const spMap = buildSpeciesMap(crystal);
    const opacityMap = new Map();

    // 高亮距离两端最近的原子
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

    for (let i = 0; i < atoms.length; i++) {
      opacityMap.set(i, highlightPair.has(i) ? 1.0 : 0.32);
    }

    const group = new THREE.Group();
    const extraMats = [];

    const segMat = new THREE.MeshStandardMaterial({
      color: DIST_COLOR,
      emissive: 0xe11d48,
      emissiveIntensity: 0.78,
      roughness: 0.25,
    });
    extraMats.push(segMat);

    const seg = createCylinderBetween(p1, p2, 0.056, segMat, 14);
    if (seg) {
      seg.userData.sharedMaterial = true;
      group.add(seg);
    }

    // 两端高亮定位环
    const ringMat = new THREE.MeshBasicMaterial({
      color: DIST_COLOR,
      transparent: true,
      opacity: 0.92,
    });
    extraMats.push(ringMat);

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
    const pmText = sd.valuePm ? `${sd.valuePm} pm` : '';
    addBadge({
      text: formulaLabel,
      subText: pmText,
      className: 'crystal-badge-distance',
      worldPos: mid.clone().add(new THREE.Vector3(0, 0.28, 0)),
      kind: 'overlay',
    });

    group.userData._extraMats = extraMats;
    overlayGroup = group;
    worldRoot.add(overlayGroup);
    return opacityMap;
  }

  function disposeGroupWithExtras(group) {
    if (!group) return;
    const extras = group.userData?._extraMats;
    if (Array.isArray(extras)) {
      for (const m of extras) m?.dispose?.();
    }
    disposeObjectTree(group);
  }

  // ── 重建当前场景 ──
  function rebuildScene() {
    if (!currentCrystal || disposed) return;

    // 清理旧单晶胞与标注
    if (singleCellGroup) {
      disposeGroupWithExtras(singleCellGroup);
      worldRoot.remove(singleCellGroup);
      singleCellGroup = null;
    }
    slicedEntries = [];
    slicedBondMaterials = [];
    clearBadges('slice');
    clearOverlay();

    if (tileCount > 1 && !sliced) {
      syncSupercellTiles(currentCrystal);
      return;
    }

    // 单晶胞路径：清除超晶胞
    clearSupercell();

    if (sliced) {
      singleCellGroup = buildSlicedCellGroup(currentCrystal);
      worldRoot.add(singleCellGroup);
      return;
    }

    // 常规单晶胞 + 可选考点标注
    let atomOpacityMap = null;
    if (overlay === 'coordination') {
      atomOpacityMap = buildCoordinationOverlay(currentCrystal);
    } else if (overlay === 'distance') {
      atomOpacityMap = buildDistanceOverlay(currentCrystal);
    }

    singleCellGroup = buildNormalCellGroup(currentCrystal, {
      atomOpacityMap,
    });
    worldRoot.add(singleCellGroup);
  }

  function frameCameraForTiles(count) {
    const baseDist = count <= 1 ? 6.6 : 6.6 + Math.pow(count - 1, 0.52) * 2.15;
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 0.01) dir.set(4.8, 3.6, 5.6);
    dir.normalize().multiplyScalar(baseDist);
    cameraLerp = {
      targetPos: dir,
      targetLookAt: new THREE.Vector3(0, 0, 0),
    };
  }

  // ── 渲染循环 ──
  function animate(now) {
    if (!running || disposed) return;
    rafId = requestAnimationFrame(animate);

    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
    lastTime = now;
    pulsePhase += dt * 3.2;

    // 1) 爆炸展开 / 拼回去平滑动画
    if (Math.abs(explodeProgress - targetExplode) > 0.001) {
      const k = 1 - Math.exp(-dt * 8.5);
      explodeProgress += (targetExplode - explodeProgress) * k;
      if (Math.abs(explodeProgress - targetExplode) <= 0.0015) {
        explodeProgress = targetExplode;
      }
      applyExplodeTransform();
    }

    // 2) 超晶胞飞入动画
    for (const entry of tileMap.values()) {
      if (entry.progress < 1) {
        entry.progress = Math.min(1, entry.progress + dt * 2.4);
        const e = easeOutCubic(entry.progress);
        entry.group.position.lerpVectors(entry.startPos, entry.targetPos, e);
        entry.group.scale.setScalar(0.72 + 0.28 * e);
      }
    }

    // 3) 超晶胞平滑居中
    if (supercellCenterCurrent.distanceToSquared(supercellCenterTarget) > 1e-5) {
      supercellCenterCurrent.lerp(supercellCenterTarget, 1 - Math.exp(-dt * 7));
      worldRoot.position.copy(supercellCenterCurrent);
    }

    // 4) 相机平滑缩放归位（一旦用户手动拖拽即让权）
    if (cameraLerp) {
      const k = 1 - Math.exp(-dt * 6.5);
      camera.position.lerp(cameraLerp.targetPos, k);
      controls.target.lerp(cameraLerp.targetLookAt, k);
      if (
        camera.position.distanceTo(cameraLerp.targetPos) < 0.03 &&
        controls.target.distanceTo(cameraLerp.targetLookAt) < 0.02
      ) {
        cameraLerp = null;
      }
    }

    // 5) 高亮环始终朝向相机 + 轻微呼吸脉冲
    if (overlayGroup) {
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

    controls.update();
    renderer.render(scene, camera);
    updateProjectedBadges();
  }

  // 用户手动交互时立即取消自动相机归位
  const onControlStart = () => {
    cameraLerp = null;
  };
  controls.addEventListener('start', onControlStart);

  // 响应式监听
  function resize() {
    if (disposed) return;
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (!running) {
      renderer.render(scene, camera);
      updateProjectedBadges();
    }
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(container);

  // ── 公开 API ──
  function setCrystal(crystal) {
    currentCrystal = crystal;
    sliced = false;
    exploded = false;
    explodeProgress = 0;
    targetExplode = 0;
    tileCount = 1;
    overlay = 'none';
    clearSupercell();
    supercellCenterCurrent.set(0, 0, 0);
    supercellCenterTarget.set(0, 0, 0);
    worldRoot.position.set(0, 0, 0);
    rebuildScene();
    resetCamera();
  }

  function setDisplayMode(mode) {
    const next = mode === 'space-filling' ? 'space-filling' : 'ball-stick';
    if (next === displayMode) return;
    displayMode = next;
    // 切换模型时清空已有超晶胞缓存以便重新按新半径构建
    clearSupercell();
    rebuildScene();
  }

  function setSliced(on) {
    const next = Boolean(on);
    if (next) {
      tileCount = 1;
      overlay = 'none';
    } else {
      exploded = false;
      targetExplode = 0;
      explodeProgress = 0;
    }
    sliced = next;
    rebuildScene();
  }

  function setExploded(on) {
    const next = Boolean(on);
    if (next && !sliced) {
      tileCount = 1;
      overlay = 'none';
      sliced = true;
      exploded = true;
      targetExplode = 1;
      rebuildScene();
      return;
    }
    exploded = next;
    targetExplode = next ? 1 : 0;
  }

  function setTileCount(count) {
    const clamped = Math.max(1, Math.min(8, Math.round(Number(count) || 1)));
    if (clamped > 1) {
      sliced = false;
      exploded = false;
      explodeProgress = 0;
      targetExplode = 0;
      overlay = 'none';
    }
    const prev = tileCount;
    tileCount = clamped;
    if (clamped === 1) {
      rebuildScene();
      if (prev > 1) frameCameraForTiles(1);
    } else {
      // 从单晶胞切换到多晶胞时保留流畅增量飞入
      if (singleCellGroup) {
        disposeGroupWithExtras(singleCellGroup);
        worldRoot.remove(singleCellGroup);
        singleCellGroup = null;
      }
      clearBadges('slice');
      clearOverlay();
      syncSupercellTiles(currentCrystal);
    }
  }

  function setOverlay(mode) {
    const next = mode === 'coordination' || mode === 'distance' ? mode : 'none';
    if (next !== 'none') {
      sliced = false;
      exploded = false;
      explodeProgress = 0;
      targetExplode = 0;
      if (tileCount > 1) {
        tileCount = 1;
        clearSupercell();
        frameCameraForTiles(1);
      }
    }
    overlay = next;
    rebuildScene();
  }

  function setAutoRotate(on) {
    controls.autoRotate = Boolean(on);
  }

  function resetCamera() {
    const dist = tileCount <= 1 ? 6.6 : 6.6 + Math.pow(tileCount - 1, 0.52) * 2.15;
    const pos = new THREE.Vector3(0.68, 0.52, 0.78).normalize().multiplyScalar(dist);
    cameraLerp = {
      targetPos: pos,
      targetLookAt: new THREE.Vector3(0, 0, 0),
    };
  }

  function start() {
    if (running || disposed) return;
    running = true;
    lastTime = 0;
    resize();
    rafId = requestAnimationFrame(animate);
  }

  function stop() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    ro?.disconnect();
    controls.removeEventListener('start', onControlStart);
    controls.dispose();
    if (singleCellGroup) disposeGroupWithExtras(singleCellGroup);
    clearSupercell();
    clearOverlay();
    clearBadges();
    sharedUnitSphere.dispose();
    sharedRingGeom.dispose();
    renderer.dispose();
    canvas.remove();
    labelLayer.remove();
  }

  return {
    setCrystal,
    setDisplayMode,
    setSliced,
    setExploded,
    setTileCount,
    setOverlay,
    setAutoRotate,
    resetCamera,
    start,
    stop,
    resize,
    dispose,
  };
}
