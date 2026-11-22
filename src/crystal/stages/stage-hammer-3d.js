/**
 * 旗舰 3D 舞台 #2：金属 Cu vs 食盐 NaCl 同时敲一下（真 3D 金属滑移 vs 离子错位爆裂）
 * 适配全站 5 主题（RoomEnvironment + viewer-style + stage-theme）。
 */

import * as THREE from 'three';
import { getViewerStyle, currentThemeId } from '../../molecule/viewer-style.js';
import {
  createStudioStage, observeCrystalTheme, createGroundShadow,
  attachOutline, disposeObjectTree, easeOutCubic,
} from '../scene/scene-helpers.js';
import { getStagePalette } from '../modules/stage-theme.js';

const SIDE_X = 2.38;
const STEP = 0.56;
const CAM_HOME = new THREE.Vector3(0, 2.55, 8.8);

function makeCopperMat(style, isDark) {
  const hex = isDark ? 0xf59e0b : 0xd97736;
  if (style.id === 'blackboard' || style.id === 'stationery') return style.atomMaterial(hex, 'Cu');
  if (style.id === 'pixel') return new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  if (style.id === 'reagent') return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.42, metalness: 0.55 });
  return new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.78, roughness: 0.22, clearcoat: 0.45, clearcoatRoughness: 0.18 });
}

function buildHammer(style, isDark) {
  const pivot = new THREE.Group();
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.065, 1.45, 12),
    style.atomMaterial(isDark ? 0xd97706 : 0xb45309, 'C'),
  );
  handle.position.set(-0.72, 0.1, 0); handle.rotation.z = Math.PI / 2;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.58, 0.42),
    style.atomMaterial(isDark ? 0xe2e8f0 : 0x475569, 'Fe'),
  );
  head.position.set(0, 0.1, 0);
  if (style.outline) attachOutline(head, head.geometry, 0.3, style);
  pivot.add(handle, head);
  return pivot;
}

function buildShockwave(isDark) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.032, 10, 32),
    new THREE.MeshBasicMaterial({ color: isDark ? 0xfef08a : 0xf59e0b, transparent: true, opacity: 0, depthWrite: false }),
  );
  mesh.rotation.y = Math.PI / 2;
  mesh.position.set(-STEP * 2.05, STEP * 0.9, 0);
  mesh.visible = false;
  return mesh;
}

function buildRig(style, isDark) {
  const root = new THREE.Group();
  const cuGeo = style.atomGeometry(0.23), naGeo = style.atomGeometry(0.185), clGeo = style.atomGeometry(0.245);
  const eGeo = new THREE.SphereGeometry(0.052, 10, 8), seaGeo = new THREE.BoxGeometry(STEP * 4.2, STEP * 2.05, STEP * 2.1);
  const repGeo = new THREE.CylinderGeometry(0.055, 0.055, STEP * 0.92, 10), sparkGeo = new THREE.OctahedronGeometry(0.12, 0);

  const cuMat = makeCopperMat(style, isDark);
  const naMat = style.atomMaterial(isDark ? 0xa78bfa : 0x7c3aed, 'Na');
  const clMat = style.atomMaterial(isDark ? 0x34d399 : 0x10b981, 'Cl');
  const eMat = new THREE.MeshBasicMaterial({ color: isDark ? 0xfde047 : 0xf59e0b, transparent: true, opacity: 0.85 });
  const seaMat = new THREE.MeshBasicMaterial({ color: isDark ? 0xfbbf24 : 0xf59e0b, transparent: true, opacity: isDark ? 0.16 : 0.13, depthWrite: false });
  const repMat = new THREE.MeshBasicMaterial({ color: isDark ? 0xff5a5f : 0xef4444, transparent: true, opacity: 0, depthWrite: false });

  const makeShared = (geo, mat, x, y, z, outR) => {
    const m = new THREE.Mesh(geo, mat);
    m.userData.sharedGeometry = true; m.userData.sharedMaterial = true;
    m.position.set(x, y, z);
    if (outR && style.outline) attachOutline(m, geo, outR, style);
    return m;
  };

  // 左：金属铜 Cu (4×4×2) + 自由电子海光晕 + 24 自由电子
  const cuRoot = new THREE.Group(); cuRoot.position.set(-SIDE_X, -0.15, 0);
  const cuBot = new THREE.Group(), cuTop = new THREE.Group();
  for (let iy = 0; iy < 4; iy++) {
    const host = iy < 2 ? cuBot : cuTop;
    for (let ix = 0; ix < 4; ix++) {
      for (let iz = 0; iz < 2; iz++) {
        host.add(makeShared(cuGeo, cuMat, (ix - 1.5) * STEP, (iy - 1.5) * STEP, (iz - 0.5) * STEP, 0.23));
      }
    }
  }
  cuBot.add(makeShared(seaGeo, seaMat, 0, -STEP, 0));
  cuTop.add(makeShared(seaGeo, seaMat, 0, STEP, 0));

  const electrons = Array.from({ length: 24 }, (_, i) => {
    const em = makeShared(eGeo, eMat, 0, 0, 0);
    cuRoot.add(em);
    return { mesh: em, phase: (i / 24) * Math.PI * 2, speed: 1.4 + (i % 5) * 0.35, rx: 0.72 + (i % 4) * 0.14, ry: (i % 6 - 2.5) * 0.36, rz: ((i % 3) - 1) * 0.34 };
  });
  const cuHammer = buildHammer(style, isDark), cuWave = buildShockwave(isDark);
  const cuShadow = createGroundShadow(style, 3.2, -STEP * 2.25);
  cuRoot.add(cuBot, cuTop, cuHammer, cuWave);
  if (cuShadow) cuRoot.add(cuShadow);
  root.add(cuRoot);

  // 右：食盐 NaCl (4×4×2) + 3 块解理碎片 + 同号静电斥力光柱
  const naclRoot = new THREE.Group(); naclRoot.position.set(SIDE_X, -0.15, 0);
  const naclBot = new THREE.Group(), naclTop = new THREE.Group();
  const shards = [
    { vel: new THREE.Vector3(1.15, 1.85, 0.55), spin: new THREE.Vector3(2.2, 1.5, -2.8) },
    { vel: new THREE.Vector3(2.15, 2.35, -0.65), spin: new THREE.Vector3(-1.8, 2.4, -3.4) },
    { vel: new THREE.Vector3(-0.35, 1.45, 0.85), spin: new THREE.Vector3(1.6, -2.1, 2.5) },
  ].map((meta) => { const g = new THREE.Group(); naclTop.add(g); return { group: g, ...meta }; });

  for (let iy = 0; iy < 4; iy++) {
    for (let ix = 0; ix < 4; ix++) {
      for (let iz = 0; iz < 2; iz++) {
        const isNa = (ix + iy + iz) % 2 === 0;
        const m = makeShared(isNa ? naGeo : clGeo, isNa ? naMat : clMat, (ix - 1.5) * STEP, (iy - 1.5) * STEP, (iz - 0.5) * STEP, isNa ? 0.185 : 0.245);
        if (iy < 2) naclBot.add(m);
        else shards[ix <= 1 ? (iz === 0 ? 0 : 2) : 1].group.add(m);
      }
    }
  }

  const repGroup = new THREE.Group();
  for (let ix = 0; ix < 3; ix++) {
    for (let iz = 0; iz < 2; iz++) {
      repGroup.add(makeShared(repGeo, repMat, (ix - 0.5) * STEP, 0, (iz - 0.5) * STEP));
      repGroup.add(makeShared(sparkGeo, repMat, (ix - 0.5) * STEP, 0, (iz - 0.5) * STEP));
    }
  }
  repGroup.visible = false;

  const naclHammer = buildHammer(style, isDark), naclWave = buildShockwave(isDark);
  const naclShadow = createGroundShadow(style, 3.2, -STEP * 2.25);
  naclRoot.add(naclBot, naclTop, repGroup, naclHammer, naclWave);
  if (naclShadow) naclRoot.add(naclShadow);
  root.add(naclRoot);

  root.userData._extra = [cuGeo, naGeo, clGeo, eGeo, seaGeo, repGeo, sparkGeo, cuMat, naMat, clMat, eMat, seaMat, repMat];
  return { root, cuTop, cuHammer, cuWave, electrons, naclBot, naclTop, shards, repGroup, repMat, naclHammer, naclWave };
}

export function mountHammer3DStage(stageEl, actionbarEl, { onCaption } = {}) {
  stageEl.innerHTML = '';
  const stage = createStudioStage(stageEl);
  const { scene, camera, renderer, controls } = stage;
  camera.position.copy(CAM_HOME);
  controls.minDistance = 4.6; controls.maxDistance = 17;

  const labelLayer = document.createElement('div');
  labelLayer.className = 'crystal-label-layer';
  labelLayer.innerHTML = '<span class="crystal-badge" data-side="left"></span><span class="crystal-badge" data-side="right"></span>';
  stageEl.appendChild(labelLayer);
  const badgeL = labelLayer.querySelector('[data-side="left"]');
  const badgeR = labelLayer.querySelector('[data-side="right"]');

  actionbarEl.innerHTML = `
    <div class="crystal-dock-group">
      <button type="button" class="crystal-btn crystal-btn-primary" data-act="hit">同时敲一下</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="slow">慢动作 0.35×</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">复原</button>
    </div>
  `;

  const btnHit = actionbarEl.querySelector('[data-act="hit"]');
  const btnSlow = actionbarEl.querySelector('[data-act="slow"]');
  const btnReset = actionbarEl.querySelector('[data-act="reset"]');

  let rig = null, playing = false, slowMo = false, prog = 0, clock = 0;
  let paused = false, destroyed = false, rafId = 0, lastTs = 0;

  function disposeRig() {
    if (!rig) return;
    rig.root.userData._extra?.forEach((x) => x?.dispose?.());
    disposeObjectTree(rig.root); scene.remove(rig.root); rig = null;
  }

  function applyPose(t) {
    if (!rig) return;
    let hAng = 0.62, hx = -STEP * 2.75, hy = STEP * 1.55;
    if (t > 0 && t < 0.22) {
      const k = t / 0.22, sw = Math.max(0, (k - 0.35) / 0.65);
      hAng = k < 0.35 ? 0.62 + (k / 0.35) * 0.35 : 0.97 - easeOutCubic(sw) * 1.05;
      hx = -STEP * (2.75 - sw * 0.62); hy = STEP * (1.55 - sw * 0.62);
    } else if (t >= 0.22) {
      const ret = easeOutCubic(Math.min(1, (t - 0.22) / 0.25));
      hAng = -0.08 + ret * 0.65; hx = -STEP * (2.13 + ret * 0.62); hy = STEP * (0.93 + ret * 0.62);
    }
    for (const hm of [rig.cuHammer, rig.naclHammer]) { hm.position.set(hx, hy, 0); hm.rotation.z = hAng; }

    const wActive = t >= 0.20 && t <= 0.44, wk = wActive ? (t - 0.20) / 0.24 : 0;
    for (const wv of [rig.cuWave, rig.naclWave]) {
      wv.visible = wActive;
      if (wActive) { wv.scale.setScalar(0.6 + wk * 2.6); wv.material.opacity = (1 - wk) * 0.85; }
    }

    const slip = t <= 0.22 ? 0 : easeOutCubic(Math.min(1, (t - 0.22) / 0.28));
    rig.cuTop.position.set(slip * STEP, 0, 0);

    const repActive = t >= 0.49 && t <= 0.72;
    rig.repGroup.visible = repActive;
    if (repActive) rig.repMat.opacity = (0.55 + 0.45 * Math.sin((t - 0.49) * 58)) * (1 - Math.max(0, (t - 0.66) / 0.06));
    const shake = t >= 0.50 && t < 0.68 ? Math.sin(t * 210) * 0.045 : 0;
    rig.naclTop.position.set(slip * STEP + shake, 0, 0);

    const b = t <= 0.68 ? 0 : (t - 0.68) / 0.32;
    rig.naclBot.position.set(-b * 0.14, -b * 0.06, 0);
    for (const sh of rig.shards) {
      sh.group.position.set(sh.vel.x * b, sh.vel.y * b - 2.4 * b * b, sh.vel.z * b);
      sh.group.rotation.set(sh.spin.x * b, sh.spin.y * b, sh.spin.z * b);
    }

    if (t < 0.22) {
      badgeL.textContent = '金属 Cu · 自由电子海（待敲击）';
      badgeR.textContent = '食盐 NaCl · Na⁺/Cl⁻ 离子晶格';
    } else if (t < 0.5) {
      badgeL.textContent = '金属 Cu · 上层沿滑移面平稳错动';
      badgeR.textContent = '食盐 NaCl · 错位 1 格，同号离子正对…';
    } else if (t < 0.68) {
      badgeL.textContent = '✓ Cu 金属键不断裂（延展形变）';
      badgeR.textContent = '⚡ Na⁺↔Na⁺ / Cl⁻↔Cl⁻ 强烈静电斥力！';
    } else {
      badgeL.textContent = '✓ Cu 发生形变不断裂（延展性）';
      badgeR.textContent = '✕ NaCl 同号相斥，瞬间沿解理面碎裂';
    }
  }

  function rebuildTheme() {
    if (destroyed) return;
    const style = getViewerStyle(currentThemeId()), p = getStagePalette();
    stage.applyStyle(style);
    disposeRig();
    rig = buildRig(style, p.isDark);
    scene.add(rig.root);
    applyPose(prog);
  }

  function resetAll() {
    playing = false; prog = 0; applyPose(0);
    btnHit.textContent = '同时敲一下';
    onCaption?.('点击「同时敲一下」，对比金属铜滑移与食盐爆裂');
  }

  btnHit.addEventListener('click', () => {
    if (prog >= 0.99) prog = 0;
    playing = true; btnHit.textContent = '冲击演示中…';
    onCaption?.('铁锤同步撞击！观察铜层滑移与 NaCl 同号斥力');
  });
  btnSlow.addEventListener('click', () => {
    slowMo = !slowMo;
    btnSlow.classList.toggle('crystal-btn-primary', slowMo);
    btnSlow.classList.toggle('crystal-btn-ghost', !slowMo);
  });
  btnReset.addEventListener('click', () => {
    resetAll(); camera.position.copy(CAM_HOME); controls.target.set(0, 0, 0); controls.update();
  });

  function resize() {
    const r = stageEl.getBoundingClientRect();
    const w = Math.max(300, Math.floor(r.width || 640)), h = Math.max(260, Math.floor(r.height || 420));
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(stageEl);
  const stopTheme = observeCrystalTheme(rebuildTheme);

  const proj = new THREE.Vector3();
  const placeBadge = (el, x) => {
    const w = stageEl.clientWidth || 640, h = stageEl.clientHeight || 420;
    proj.set(x, -1.78, 0).project(camera);
    const sx = Math.max(115, Math.min(w - 115, (proj.x * 0.5 + 0.5) * w));
    const sy = Math.max(26, Math.min(h - 24, (-proj.y * 0.5 + 0.5) * h));
    el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
  };

  function frame(ts) {
    if (destroyed || paused) { rafId = 0; return; }
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts; clock += dt;
    if (playing) {
      prog = Math.min(1, prog + dt * (slowMo ? 0.14 : 0.40));
      applyPose(prog);
      if (prog >= 1) { playing = false; btnHit.textContent = '再敲一次'; onCaption?.('结论：Cu 靠自由电子海延展不断；NaCl 同号相斥瞬间脆裂'); }
    }
    if (rig) {
      const slipShift = rig.cuTop.position.x * 0.5;
      for (const e of rig.electrons) {
        const a = clock * e.speed + e.phase, yOff = e.ry + Math.sin(a * 0.8) * 0.25;
        e.mesh.position.set(Math.cos(a) * e.rx + (yOff > 0 ? slipShift * 1.4 : 0), yOff, Math.sin(a) * 0.52 + e.rz * 0.4);
      }
    }
    controls.update(); renderer.render(scene, camera);
    placeBadge(badgeL, -SIDE_X); placeBadge(badgeR, SIDE_X);
    rafId = requestAnimationFrame(frame);
  }

  rebuildTheme(); resize(); resetAll();
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
