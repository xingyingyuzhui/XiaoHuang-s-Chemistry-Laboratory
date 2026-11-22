/**
 * 旗舰 3D 舞台 #3：冰为何浮在水上（真 3D 冰 Ih 六方氢键空心笼坍塌 + 密度浮沉实时联动）
 * 适配全站 5 主题（RoomEnvironment + viewer-style + stage-theme）。
 */

import * as THREE from 'three';
import { getViewerStyle, currentThemeId } from '../../molecule/viewer-style.js';
import {
  createStudioStage, observeCrystalTheme, createGroundShadow,
  createCylinderBetween, attachOutline, disposeObjectTree,
} from '../scene/scene-helpers.js';
import { getStagePalette } from '../modules/stage-theme.js';

const CAM_HOME = new THREE.Vector3(0.4, 3.6, 5.4);
const UP_VEC = new THREE.Vector3(0, 1, 0);

function densityAt(tempC) {
  if (tempC <= 0) return 0.917 + Math.max(0, -tempC) * 0.00015;
  if (tempC <= 4) return 0.917 + 0.083 * (1 - Math.pow(1 - tempC / 4, 2.2));
  return Math.max(0.996, 1.0 - Math.pow((tempC - 4) / 16, 1.6) * 0.0022);
}

function collapseFactor(tempC) {
  return tempC <= 0 ? 0 : Math.min(1, 1 - Math.pow(1 - Math.min(1, tempC / 4.2), 2.1));
}

function buildIceCageData() {
  const nodes = [], edges = [], R = 1.56;
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const sign = layer === 0 ? 1 : -1;
      const y = (layer === 0 ? -0.78 : 0.78) + (i % 2 === 0 ? 0.22 : -0.22) * sign;
      nodes.push({ ice: new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R), ring: layer });
    }
  }
  for (let k = 0; k < 3; k++) {
    const a = ((k * 2 + 1) * Math.PI) / 3;
    nodes.push({ ice: new THREE.Vector3(Math.cos(a) * 2.42, -1.24, Math.sin(a) * 2.42), ring: 2 });
    nodes.push({ ice: new THREE.Vector3(Math.cos(a) * 2.42, 1.24, Math.sin(a) * 2.42), ring: 2 });
  }
  for (let i = 0; i < 6; i++) { edges.push([i, (i + 1) % 6], [6 + i, 6 + ((i + 1) % 6)]); }
  for (let i = 0; i < 6; i += 2) edges.push([i, 6 + i]);
  for (let k = 0; k < 3; k++) { const o = k * 2 + 1; edges.push([o, 12 + k * 2], [6 + o, 13 + k * 2]); }

  const infill = [
    new THREE.Vector3(0.32, -0.34, 0.26), new THREE.Vector3(-0.34, 0.36, -0.22),
    new THREE.Vector3(-0.24, -0.28, 0.42), new THREE.Vector3(0.28, 0.32, -0.38),
  ];
  let inf = 0;
  nodes.forEach((n, idx) => {
    const liq = n.ice.clone().multiplyScalar(n.ring === 2 ? 0.60 : 0.67);
    if (n.ring === 2 && inf < infill.length) liq.copy(infill[inf++]);
    else liq.add(new THREE.Vector3(Math.sin(idx * 4.3) * 0.16, Math.cos(idx * 3.1) * 0.16, Math.sin(idx * 2.7 + 1) * 0.16));
    n.liq = liq;
    n.phase = idx * 1.37;
    n.spinAxis = new THREE.Vector3(Math.sin(idx * 2.1), Math.cos(idx * 1.7), Math.sin(idx * 3.3)).normalize();
  });

  const bonds = edges.map(([u, v], idx) => ({
    u, v, breakTemp: idx < 12 ? 0.8 + (idx % 6) * 2.2 : 0.4 + (idx % 5) * 1.1, survives: idx % 3 === 0,
  }));
  return { nodes, bonds };
}

function buildWaterMolecule(style, oGeo, hGeo, oMat, hMat, covMat) {
  const g = new THREE.Group();
  const oMesh = new THREE.Mesh(oGeo, oMat);
  oMesh.userData.sharedGeometry = true; oMesh.userData.sharedMaterial = true;
  if (style.outline) attachOutline(oMesh, oGeo, 0.21, style);
  g.add(oMesh);

  const half = THREE.MathUtils.degToRad(52.25), seg = style.id === 'pixel' ? 4 : 10;
  for (const sgn of [1, -1]) {
    const hp = new THREE.Vector3(sgn * Math.sin(half) * 0.31, Math.cos(half) * 0.31, 0);
    const hm = new THREE.Mesh(hGeo, hMat);
    hm.position.copy(hp);
    hm.userData.sharedGeometry = true; hm.userData.sharedMaterial = true;
    if (style.outline) attachOutline(hm, hGeo, 0.125, style);
    g.add(hm);
    const cyl = createCylinderBetween(new THREE.Vector3(), hp, 0.042, covMat, seg);
    if (cyl) { cyl.userData.sharedMaterial = true; g.add(cyl); }
  }
  return g;
}

function buildIceSceneRig(data, style, isDark) {
  const root = new THREE.Group();
  const oGeo = style.atomGeometry(0.21), hGeo = style.atomGeometry(0.125);
  const dashGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.14, style.id === 'pixel' ? 4 : 8);
  const oMat = style.atomMaterial(isDark ? 0xfb7185 : 0xef4444, 'O');
  const hMat = style.atomMaterial(style.hydrogen ?? 0xf1f5f9, 'H');
  const covMat = style.bondMaterial(style.neutralBond, '');
  const hbBase = new THREE.MeshBasicMaterial({ color: isDark ? 0x38bdf8 : 0x0284c7, transparent: true, opacity: 0.85 });

  const mols = data.nodes.map((n, idx) => {
    const m = buildWaterMolecule(style, oGeo, hGeo, oMat, hMat, covMat);
    m.position.copy(n.ice);
    const baseRot = new THREE.Euler((idx % 3 - 1) * 0.65, (idx * Math.PI) / 3, idx % 2 === 0 ? 0.45 : -0.45);
    m.rotation.copy(baseRot);
    root.add(m);
    return { group: m, node: n, baseQuat: new THREE.Quaternion().setFromEuler(baseRot) };
  });

  const hBonds = data.bonds.map((b) => {
    const mat = hbBase.clone(), g = new THREE.Group();
    const segs = Array.from({ length: 4 }, () => {
      const mesh = new THREE.Mesh(dashGeo, mat);
      mesh.userData.sharedGeometry = true; mesh.userData.sharedMaterial = true;
      g.add(mesh); return mesh;
    });
    root.add(g);
    return { ...b, group: g, segs, mat };
  });

  const voidGeo = new THREE.CylinderGeometry(1.12, 1.12, 1.45, 6, 1, true);
  const voidMat = new THREE.MeshBasicMaterial({
    color: isDark ? 0x38bdf8 : 0x0ea5e9, transparent: true, opacity: isDark ? 0.14 : 0.11,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const voidMesh = new THREE.Mesh(voidGeo, voidMat);
  const voidWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(voidGeo, 15),
    new THREE.LineBasicMaterial({ color: isDark ? 0x7dd3fc : 0x0284c7, transparent: true, opacity: 0.42 }),
  );
  voidMesh.add(voidWire);
  root.add(voidMesh);

  const shadow = createGroundShadow(style, 5.2, -1.92);
  if (shadow) root.add(shadow);

  root.userData._extra = [oGeo, hGeo, dashGeo, oMat, hMat, covMat, hbBase, ...hBonds.map((b) => b.mat)];
  return { root, mols, hBonds, voidMesh, voidMat, voidWire };
}

export function mountIce3DStage(stageEl, actionbarEl, { onCaption } = {}) {
  stageEl.innerHTML = '';
  const stage = createStudioStage(stageEl);
  const { scene, camera, renderer, controls } = stage;
  camera.position.copy(CAM_HOME);
  controls.minDistance = 3.5; controls.maxDistance = 15;

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;top:10px;right:12px;z-index:5;pointer-events:none;width:186px;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--surface,#fff) 92%,transparent);border:var(--ui-stroke,1px) solid var(--border-ink,var(--border));color:var(--ink);box-shadow:var(--shadow-print-sm);font-size:11px;';
  hud.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
      <strong data-hud="phase" style="font-size:12px;">0℃ 固态冰</strong>
      <span data-hud="rho" style="font-family:var(--font-mono,monospace);font-weight:800;color:var(--accent);">0.917 g/cm³</span>
    </div>
    <div style="height:6px;border-radius:999px;background:var(--surface-2,rgba(148,163,184,0.22));overflow:hidden;margin-bottom:5px;">
      <div data-hud="bar" style="height:100%;width:22%;border-radius:999px;background:var(--accent);transition:width 0.12s ease;"></div>
    </div>
    <div data-hud="buoy" style="font-weight:700;color:var(--muted);line-height:1.3;">🧊 浮于水面 · 六方空心笼</div>
  `;
  stageEl.appendChild(hud);
  const hudPhase = hud.querySelector('[data-hud="phase"]');
  const hudRho = hud.querySelector('[data-hud="rho"]');
  const hudBar = hud.querySelector('[data-hud="bar"]');
  const hudBuoy = hud.querySelector('[data-hud="buoy"]');

  actionbarEl.innerHTML = `
    <label class="crystal-dock-group" style="font-size:0.78rem;color:var(--ink-soft,var(--muted));">
      <span>温度</span>
      <input type="range" min="-10" max="20" step="0.5" value="0" data-el="slider" style="width:128px;accent-color:var(--accent);" />
      <strong data-el="temp" style="font-family:var(--font-mono,monospace);min-width:46px;">0.0°C</strong>
    </label>
    <div class="crystal-dock-group">
      <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-preset="0">0℃ 冰</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-preset="4">4℃ 液态水</button>
    </div>
    <div class="crystal-dock-group">
      <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="hb">氢键高亮</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">复位</button>
    </div>
  `;

  const slider = actionbarEl.querySelector('[data-el="slider"]');
  const tempReadout = actionbarEl.querySelector('[data-el="temp"]');
  const presetBtns = actionbarEl.querySelectorAll('[data-preset]');
  const btnHb = actionbarEl.querySelector('[data-act="hb"]');
  const btnReset = actionbarEl.querySelector('[data-act="reset"]');

  const data = buildIceCageData();
  let rig = null, tempC = 0, highlightHb = true, clock = 0;
  let paused = false, destroyed = false, rafId = 0, lastTs = 0;

  function disposeRig() {
    if (!rig) return;
    rig.root.userData._extra?.forEach((x) => x?.dispose?.());
    disposeObjectTree(rig.root); scene.remove(rig.root); rig = null;
  }

  const tmpDir = new THREE.Vector3(), tmpPos = new THREE.Vector3(), tmpQuat = new THREE.Quaternion();
  function updateMolecules(t) {
    if (!rig) return;
    const c = collapseFactor(tempC);
    const thermExpand = tempC > 4 ? 1 + (tempC - 4) * 0.0045 : 1;
    const jitter = tempC <= 0 ? 0.015 : 0.03 + (tempC / 20) * 0.065;

    for (const m of rig.mols) {
      const n = m.node;
      m.group.position.lerpVectors(n.ice, n.liq, c).multiplyScalar(thermExpand);
      m.group.position.x += Math.sin(t * 3.4 + n.phase) * jitter;
      m.group.position.y += Math.cos(t * 2.9 + n.phase * 1.3) * jitter;
      m.group.position.z += Math.sin(t * 3.1 + n.phase * 0.7) * jitter;
      tmpQuat.setFromAxisAngle(n.spinAxis, c * (0.65 + (tempC / 20) * 0.9) * Math.sin(t * 1.4 + n.phase));
      m.group.quaternion.copy(m.baseQuat).premultiply(tmpQuat);
    }

    const pulse = highlightHb ? 0.86 + 0.14 * Math.sin(t * 4.5) : 0.65;
    for (const hb of rig.hBonds) {
      const pA = rig.mols[hb.u].group.position, pB = rig.mols[hb.v].group.position, dist = pA.distanceTo(pB);
      let intact = 1;
      if (tempC > hb.breakTemp) {
        intact = hb.survives ? Math.max(0.28, 1 - (tempC - hb.breakTemp) * 0.09) : Math.max(0, 1 - (tempC - hb.breakTemp) * 0.32);
      }
      if (dist > 2.35) intact *= 0.25;
      hb.group.visible = intact > 0.04;
      if (!hb.group.visible) continue;
      hb.mat.opacity = intact * (highlightHb ? 0.94 : 0.48) * pulse;
      tmpDir.subVectors(pB, pA).normalize();
      tmpQuat.setFromUnitVectors(UP_VEC, tmpDir);
      const rad = highlightHb ? 1.25 : 0.85;
      hb.segs.forEach((seg, s) => {
        tmpPos.lerpVectors(pA, pB, 0.24 + (s / 3) * 0.52);
        seg.position.copy(tmpPos); seg.quaternion.copy(tmpQuat);
        seg.scale.set(rad, Math.max(0.5, dist * 0.45), rad);
      });
    }

    const voidVis = (1 - c) * (highlightHb ? 1 : 0.45);
    rig.voidMesh.visible = voidVis > 0.05;
    rig.voidMesh.scale.setScalar(Math.max(0.1, 1 - c * 0.72));
    rig.voidMat.opacity = voidVis * 0.14;
    rig.voidWire.material.opacity = voidVis * 0.55;
  }

  function rebuildTheme() {
    if (destroyed) return;
    const style = getViewerStyle(currentThemeId()), p = getStagePalette();
    stage.applyStyle(style);
    disposeRig();
    rig = buildIceSceneRig(data, style, p.isDark);
    scene.add(rig.root);
    updateMolecules(clock);
  }

  function syncUi() {
    slider.value = String(tempC); tempReadout.textContent = `${tempC.toFixed(1)}°C`;
    presetBtns.forEach((b) => {
      const on = Math.abs(Number(b.dataset.preset) - tempC) < 0.25;
      b.classList.toggle('crystal-btn-primary', on); b.classList.toggle('crystal-btn-ghost', !on);
    });
    btnHb.classList.toggle('crystal-btn-primary', highlightHb);
    btnHb.classList.toggle('crystal-btn-ghost', !highlightHb);

    const rho = densityAt(tempC);
    hudRho.textContent = `${rho.toFixed(3)} g/cm³`;
    hudBar.style.width = `${Math.max(8, Math.min(100, ((rho - 0.90) / 0.105) * 100)).toFixed(1)}%`;
    if (tempC <= 0.25) {
      hudPhase.textContent = `${tempC.toFixed(0)}℃ 固态冰`;
      hudBuoy.textContent = '🧊 浮于水面 · 氢键撑出大空隙';
      onCaption?.('0℃ 固态冰 · 四面体氢键构成六方空心笼，密度仅 0.917 g/cm³');
    } else if (tempC <= 6) {
      hudPhase.textContent = tempC >= 3.5 && tempC <= 4.5 ? '4℃ 液态水（最密）' : '冰水坍缩过渡';
      hudBuoy.textContent = '💧 坍缩最密 · 4℃ 密度最大';
      onCaption?.('升温破键 · 水分子坍缩填入空心笼，4℃ 密度达峰值 1.000 g/cm³');
    } else {
      hudPhase.textContent = `${tempC.toFixed(0)}℃ 液态水`;
      hudBuoy.textContent = '💧 热运动加剧 · 体积微胀';
      onCaption?.(`${tempC.toFixed(0)}℃ 液态水 · 部分氢键断裂，水分子剧烈热运动`);
    }
  }

  slider.addEventListener('input', () => { tempC = Number(slider.value); syncUi(); });
  presetBtns.forEach((b) => b.addEventListener('click', () => { tempC = Number(b.dataset.preset); syncUi(); }));
  btnHb.addEventListener('click', () => { highlightHb = !highlightHb; syncUi(); });
  btnReset.addEventListener('click', () => { camera.position.copy(CAM_HOME); controls.target.set(0, 0, 0); controls.update(); });

  function resize() {
    const r = stageEl.getBoundingClientRect();
    const w = Math.max(300, Math.floor(r.width || 640)), h = Math.max(260, Math.floor(r.height || 420));
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(stageEl);
  const stopTheme = observeCrystalTheme(rebuildTheme);

  function frame(ts) {
    if (destroyed || paused) { rafId = 0; return; }
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts; clock += dt;
    if (rig) { rig.root.rotation.y += dt * 0.24; updateMolecules(clock); }
    controls.update(); renderer.render(scene, camera);
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
      stopTheme(); ro?.disconnect(); disposeRig();
      controls.dispose(); stage.disposeEnv(); renderer.dispose();
      stageEl.innerHTML = ''; actionbarEl.innerHTML = '';
    },
  };
}
