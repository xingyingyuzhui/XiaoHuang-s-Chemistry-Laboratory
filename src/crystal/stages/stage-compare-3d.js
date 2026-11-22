/**
 * 旗舰 3D 舞台 #1：水晶 vs 石英玻璃（真 3D 光学通透宏观外形 + 立体 3D Si-O 四面体网）
 * 适配全站 5 主题（RoomEnvironment + viewer-style + stage-theme）。
 */

import * as THREE from 'three';
import { getViewerStyle, currentThemeId } from '../../molecule/viewer-style.js';
import {
  createStudioStage, observeCrystalTheme, createGroundShadow,
  createCylinderBetween, attachOutline, disposeObjectTree,
} from '../scene/scene-helpers.js';
import { getStagePalette } from '../modules/stage-theme.js';

const SIDE_X = 2.15;
const CAM_HOME = new THREE.Vector3(0, 2.35, 8.1);

function buildQuartzGeo(r, bodyH, tipH) {
  const pos = [];
  const push = (a, b, c) => pos.push(...a, ...b, ...c);
  const half = bodyH * 0.5;
  const top = [0, half + tipH, 0];
  const bot = [0, -half - tipH * 0.28, 0];
  const ring = (y) => Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });
  const tr = ring(half), br = ring(-half);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    push(br[i], br[j], tr[j]); push(br[i], tr[j], tr[i]);
    push(tr[i], tr[j], top); push(br[j], br[i], bot);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildAmorphousGeo(radius) {
  const geo = new THREE.IcosahedronGeometry(radius, 5);
  const attr = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < attr.count; i++) {
    v.fromBufferAttribute(attr, i).normalize();
    const b = 1 + 0.14 * Math.sin(v.x * 3.1 + 0.5) * Math.cos(v.y * 2.8)
      + 0.10 * Math.sin(v.z * 3.5 - v.y * 2.2) + 0.06 * Math.cos(v.x * 5.0 + v.z * 4.2);
    attr.setXYZ(i, v.x * radius * b * 1.06, v.y * radius * b * 0.84, v.z * radius * b * 0.98);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeCrystalMat(style, isDark, isQuartz) {
  const hex = isQuartz ? (isDark ? 0x7dd3fc : 0x38bdf8) : (isDark ? 0xfbbf24 : 0xf59e0b);
  if (style.id === 'blackboard' || style.id === 'stationery') {
    const m = style.atomMaterial(hex, isQuartz ? 'Si' : 'S');
    m.transparent = true; m.opacity = isQuartz ? 0.84 : 0.88;
    return m;
  }
  if (style.id === 'pixel') {
    return new THREE.MeshLambertMaterial({ color: hex, flatShading: true, transparent: true, opacity: 0.88 });
  }
  if (style.id === 'reagent') {
    return new THREE.MeshStandardMaterial({
      color: hex, roughness: isQuartz ? 0.24 : 0.62, metalness: 0.04, transparent: true, opacity: isQuartz ? 0.78 : 0.86,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: hex, roughness: isQuartz ? 0.08 : 0.34, metalness: 0.02,
    transmission: isQuartz ? 0.74 : 0.52, thickness: isQuartz ? 1.8 : 1.5, ior: isQuartz ? 1.544 : 1.46,
    clearcoat: isQuartz ? 1.0 : 0.65, clearcoatRoughness: isQuartz ? 0.06 : 0.26,
    attenuationColor: new THREE.Color(isQuartz ? 0x0284c7 : 0xd97706),
    attenuationDistance: isQuartz ? 2.8 : 2.1, transparent: true, opacity: isQuartz ? 0.92 : 0.94,
  });
}

function buildMacroPair(style, isDark) {
  const group = new THREE.Group();

  const qGroup = new THREE.Group();
  qGroup.position.set(-SIDE_X, 0.12, 0);
  const qMat = makeCrystalMat(style, isDark, true);
  const edgeMat = new THREE.LineBasicMaterial({
    color: isDark ? 0xe0f2fe : 0x0369a1, transparent: true, opacity: isDark ? 0.82 : 0.62,
  });
  const mainGeo = buildQuartzGeo(0.76, 1.55, 0.78);
  const mainMesh = new THREE.Mesh(mainGeo, qMat);
  mainMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mainGeo, 10), edgeMat));
  mainMesh.add(new THREE.Mesh(
    buildQuartzGeo(0.42, 0.92, 0.44),
    new THREE.MeshBasicMaterial({ color: isDark ? 0xe0f2fe : 0xbae6fd, transparent: true, opacity: 0.25, depthWrite: false }),
  ));
  if (style.outline) attachOutline(mainMesh, mainGeo, 0.85, style);
  qGroup.add(mainMesh);

  const twinGeo = buildQuartzGeo(0.38, 0.95, 0.44);
  const twinMesh = new THREE.Mesh(twinGeo, qMat);
  twinMesh.userData.sharedMaterial = true;
  twinMesh.position.set(0.66, -0.34, 0.34);
  twinMesh.rotation.set(0.14, 0.4, -0.34);
  const twinEdges = new THREE.LineSegments(new THREE.EdgesGeometry(twinGeo, 10), edgeMat);
  twinEdges.userData.sharedMaterial = true;
  twinMesh.add(twinEdges);
  qGroup.add(twinMesh);
  const sL = createGroundShadow(style, 2.7, -1.52);
  if (sL) qGroup.add(sL);
  group.add(qGroup);

  const gGroup = new THREE.Group();
  gGroup.position.set(SIDE_X, -0.04, 0);
  const glassGeo = buildAmorphousGeo(1.08);
  const glassMesh = new THREE.Mesh(glassGeo, makeCrystalMat(style, isDark, false));
  if (style.outline) attachOutline(glassMesh, glassGeo, 1.08, style);
  glassMesh.add(new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.58, 3),
    new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.23, depthWrite: false }),
  ));
  gGroup.add(glassMesh);
  const sR = createGroundShadow(style, 2.7, -1.36);
  if (sR) gGroup.add(sR);
  group.add(gGroup);

  return { group, left: qGroup, right: gGroup };
}

function getSiOData(isCrystal) {
  if (!isCrystal) {
    const raw = [
      [-0.58, 0.58, 0.28], [0.12, 0.84, -0.22], [0.56, 0.24, 0.25], [0.14, -0.34, -0.26], [-0.52, -0.14, 0.16],
      [-1.26, 0.72, -0.24], [-1.36, -0.02, 0.30], [-0.94, -0.82, -0.22], [-0.18, -1.08, 0.28], [0.68, -0.92, -0.20],
      [1.26, -0.36, 0.32], [1.36, 0.44, -0.24], [0.84, 1.06, 0.26], [-0.36, 1.26, -0.18],
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 5], [5, 6], [6, 4], [4, 7], [7, 8],
      [8, 9], [9, 3], [2, 11], [11, 10], [10, 9], [1, 12], [12, 11], [0, 13], [13, 1],
    ];
    return { pts: raw.map((p) => new THREE.Vector3(...p)), edges };
  }
  const s = 0.64, dx = s * Math.sqrt(3), pts = [], edges = [], map = new Map(), edgeSet = new Set();
  const addNode = (x, y, z) => {
    const k = `${Math.round(x * 20)}_${Math.round(y * 20)}`;
    if (map.has(k)) return map.get(k);
    const id = pts.length; pts.push(new THREE.Vector3(x, y, z)); map.set(k, id); return id;
  };
  for (const [cx, cy] of [[-dx * 0.5, 0.46], [dx * 0.5, 0.46], [0, -0.49]]) {
    const ring = Array.from({ length: 6 }, (_, i) => {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      return addNode(cx + Math.cos(a) * s, cy + Math.sin(a) * s, i % 2 === 0 ? 0.2 : -0.2);
    });
    for (let i = 0; i < 6; i++) {
      const u = ring[i], v = ring[(i + 1) % 6], ek = u < v ? `${u}-${v}` : `${v}-${u}`;
      if (!edgeSet.has(ek)) { edgeSet.add(ek); edges.push([u, v]); }
    }
  }
  return { pts, edges };
}

function buildSiONetwork(isCrystal, style, isDark) {
  const group = new THREE.Group();
  const { pts, edges } = getSiOData(isCrystal);
  const siGeo = style.atomGeometry(0.165), oGeo = style.atomGeometry(0.12);
  const siMat = style.atomMaterial(isDark ? 0x60a5fa : 0x3b82f6, 'Si');
  const oMat = style.atomMaterial(isDark ? 0xfb7185 : 0xef4444, 'O');
  const bondMat = style.bondMaterial(style.neutralBond, '');
  const seg = style.id === 'pixel' ? 4 : 12;

  const addAtom = (geo, mat, pos, r) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.userData.sharedGeometry = true; m.userData.sharedMaterial = true;
    if (style.outline) attachOutline(m, geo, r, style);
    group.add(m);
  };
  const addBond = (a, b, rad) => {
    const cyl = createCylinderBetween(a, b, rad, bondMat, seg);
    if (cyl) { cyl.userData.sharedMaterial = true; group.add(cyl); }
  };

  pts.forEach((pt, i) => {
    addAtom(siGeo, siMat, pt, 0.165);
    if (i % 2 === 0) {
      const tip = pt.clone().add(new THREE.Vector3(0, 0, pt.z >= 0 ? 0.36 : -0.36));
      addAtom(oGeo, oMat, tip, 0.12);
      addBond(pt, tip, 0.044);
    }
  });
  edges.forEach(([u, v], i) => {
    const mid = pts[u].clone().add(pts[v]).multiplyScalar(0.5);
    mid.z += i % 2 === 0 ? 0.13 : -0.13;
    addAtom(oGeo, oMat, mid, 0.12);
    addBond(pts[u], mid, 0.046);
    addBond(pts[v], mid, 0.046);
  });

  group.userData._extra = [siGeo, oGeo, siMat, oMat, bondMat];
  return group;
}

export function mountCompare3DStage(stageEl, actionbarEl, { onCaption } = {}) {
  stageEl.innerHTML = '';
  const stage = createStudioStage(stageEl);
  const { scene, camera, renderer, controls } = stage;
  camera.position.copy(CAM_HOME);
  controls.minDistance = 4.2; controls.maxDistance = 16;

  const labelLayer = document.createElement('div');
  labelLayer.className = 'crystal-label-layer';
  labelLayer.innerHTML = '<span class="crystal-badge" data-side="left"></span><span class="crystal-badge" data-side="right"></span>';
  stageEl.appendChild(labelLayer);
  const badgeL = labelLayer.querySelector('[data-side="left"]');
  const badgeR = labelLayer.querySelector('[data-side="right"]');

  actionbarEl.innerHTML = `
    <div class="crystal-dock-group crystal-seg" role="group" aria-label="观察模式">
      <button type="button" class="crystal-seg-btn is-active" data-mode="macro">宏观外形</button>
      <button type="button" class="crystal-seg-btn" data-mode="micro">微观 3D Si-O 网</button>
    </div>
    <div class="crystal-dock-group">
      <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="spin">慢转</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">复位</button>
    </div>
  `;

  const modeBtns = actionbarEl.querySelectorAll('[data-mode]');
  const btnSpin = actionbarEl.querySelector('[data-act="spin"]');
  const btnReset = actionbarEl.querySelector('[data-act="reset"]');

  let mode = 'macro', autoSpin = true, mix = 0;
  let macro = null, microL = null, microR = null;
  let paused = false, destroyed = false, rafId = 0, lastTs = 0;

  function clearModels() {
    if (macro) { disposeObjectTree(macro.group); scene.remove(macro.group); macro = null; }
    for (const g of [microL, microR]) {
      if (!g) continue;
      g.userData?._extra?.forEach((x) => x?.dispose?.());
      disposeObjectTree(g);
      scene.remove(g);
    }
    microL = null; microR = null;
  }

  function applyMix() {
    if (macro) { macro.group.visible = mix < 0.98; macro.group.scale.setScalar(Math.max(0.001, 1 - mix)); }
    if (microL && microR) {
      const show = mix > 0.02, sc = Math.max(0.001, mix);
      microL.visible = show; microR.visible = show;
      microL.scale.setScalar(sc); microR.scale.setScalar(sc);
    }
  }

  function rebuildTheme() {
    if (destroyed) return;
    const style = getViewerStyle(currentThemeId()), p = getStagePalette();
    stage.applyStyle(style);
    clearModels();
    macro = buildMacroPair(style, p.isDark);
    microL = buildSiONetwork(true, style, p.isDark); microL.position.set(-SIDE_X, 0.08, 0);
    microR = buildSiONetwork(false, style, p.isDark); microR.position.set(SIDE_X, 0.08, 0);
    scene.add(macro.group, microL, microR);
    applyMix();
  }

  function syncUi() {
    modeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
    btnSpin.classList.toggle('crystal-btn-primary', autoSpin);
    btnSpin.classList.toggle('crystal-btn-ghost', !autoSpin);
    const isMacro = mode === 'macro';
    badgeL.textContent = isMacro ? '天然水晶（晶体 · SiO₂）· 六棱柱' : '水晶微观 · 周期性六元 Si-O 环（长程有序）';
    badgeR.textContent = isMacro ? '石英玻璃（非晶体 · SiO₂）· 无规则块' : '玻璃微观 · 5/6/7 元随机网（短程有序）';
    onCaption?.(isMacro ? '宏观对比 · 成分同为 SiO₂，水晶具规则晶面，石英玻璃无规则外形' : '微观 3D Si-O 网 · 拖拽旋转对比长程有序与随机网络');
  }

  modeBtns.forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; syncUi(); }));
  btnSpin.addEventListener('click', () => { autoSpin = !autoSpin; syncUi(); });
  btnReset.addEventListener('click', () => {
    camera.position.copy(CAM_HOME); controls.target.set(0, 0, 0); controls.update();
    if (macro) { macro.left.rotation.set(0, 0, 0); macro.right.rotation.set(0, 0, 0); }
    if (microL) microL.rotation.set(0, 0, 0);
    if (microR) microR.rotation.set(0, 0, 0);
  });

  function resize() {
    const r = stageEl.getBoundingClientRect();
    const w = Math.max(300, Math.floor(r.width || 640)), h = Math.max(260, Math.floor(r.height || 420));
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(stageEl);
  const stopTheme = observeCrystalTheme(rebuildTheme);

  const projVec = new THREE.Vector3();
  const placeBadge = (el, x) => {
    const w = stageEl.clientWidth || 640, h = stageEl.clientHeight || 420;
    projVec.set(x, -1.78, 0).project(camera);
    const sx = Math.max(110, Math.min(w - 110, (projVec.x * 0.5 + 0.5) * w));
    const sy = Math.max(26, Math.min(h - 24, (-projVec.y * 0.5 + 0.5) * h));
    el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
  };

  function frame(ts) {
    if (destroyed || paused) { rafId = 0; return; }
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    mix += ((mode === 'micro' ? 1 : 0) - mix) * Math.min(1, dt * 8);
    applyMix();
    if (autoSpin) {
      const dy = dt * 0.48;
      if (macro) { macro.left.rotation.y += dy; macro.right.rotation.y += dy * 0.85; }
      if (microL && microR) { microL.rotation.y += dy; microR.rotation.y += dy; }
    }
    controls.update();
    renderer.render(scene, camera);
    placeBadge(badgeL, -SIDE_X); placeBadge(badgeR, SIDE_X);
    rafId = requestAnimationFrame(frame);
  }

  rebuildTheme(); resize(); syncUi();
  rafId = requestAnimationFrame(frame);

  return {
    pause() { paused = true; if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } },
    resume() { if (destroyed || !paused) return; paused = false; lastTs = 0; rafId = requestAnimationFrame(frame); },
    resize,
    destroy() {
      if (destroyed) return;
      destroyed = true; paused = true;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      stopTheme(); ro?.disconnect(); clearModels();
      controls.dispose(); stage.disposeEnv(); renderer.dispose();
      stageEl.innerHTML = ''; actionbarEl.innerHTML = '';
    },
  };
}
