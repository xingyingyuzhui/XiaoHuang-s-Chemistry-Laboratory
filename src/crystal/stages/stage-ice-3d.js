/**
 * 影院级 3D 冰 Ih 六方氢键空心笼坍塌舞台（18 个 H₂O 球棍分子 + 发光青色虚线氢键 + 六方空腔光环）
 * 使用统一 render-kit.js 暗色科研影院管线，右上角安全区暗色玻璃浮窗实时联动密度与浮沉状态。
 */

import * as THREE from 'three';
import { createCinemaStage, makeBondCylinder, CPK_STUDIO } from './render-kit.js';

const UP_VEC = new THREE.Vector3(0, 1, 0);

function densityAt(tempC) {
  if (tempC <= 0) return 0.917 + Math.max(0, -tempC) * 0.00014;
  if (tempC <= 4) return 0.917 + 0.083 * (1 - Math.pow(1 - tempC / 4, 2.2));
  return Math.max(0.996, 1.0 - Math.pow((tempC - 4) / 16, 1.55) * 0.0024);
}

const collapseAt = (t) => (t <= 0 ? 0 : Math.min(1, 1 - Math.pow(1 - Math.min(1, t / 4.2), 2.15)));

function buildIceCageData() {
  const nodes = [], edges = [], R = 1.86;
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3, sign = layer === 0 ? 1 : -1;
      const y = (layer === 0 ? -0.92 : 0.92) + (i % 2 === 0 ? 0.26 : -0.26) * sign;
      nodes.push({ ice: new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R), ring: layer });
    }
  }
  for (let k = 0; k < 3; k++) {
    const a = ((k * 2 + 1) * Math.PI) / 3;
    nodes.push({ ice: new THREE.Vector3(Math.cos(a) * 2.86, -1.42, Math.sin(a) * 2.86), ring: 2 });
    nodes.push({ ice: new THREE.Vector3(Math.cos(a) * 2.86, 1.42, Math.sin(a) * 2.86), ring: 2 });
  }
  for (let i = 0; i < 6; i++) edges.push([i, (i + 1) % 6], [6 + i, 6 + ((i + 1) % 6)]);
  for (let i = 0; i < 6; i += 2) edges.push([i, 6 + i]);
  for (let k = 0; k < 3; k++) { const o = k * 2 + 1; edges.push([o, 12 + k * 2], [6 + o, 13 + k * 2]); }

  const infill = [
    new THREE.Vector3(0.36, -0.38, 0.30), new THREE.Vector3(-0.38, 0.40, -0.26),
    new THREE.Vector3(-0.28, -0.32, 0.46), new THREE.Vector3(0.32, 0.36, -0.42),
  ];
  let inf = 0;
  nodes.forEach((n, idx) => {
    const liq = n.ice.clone().multiplyScalar(n.ring === 2 ? 0.56 : 0.64);
    if (n.ring === 2 && inf < infill.length) liq.copy(infill[inf++]);
    else liq.add(new THREE.Vector3(Math.sin(idx * 4.3) * 0.2, Math.cos(idx * 3.1) * 0.18, Math.sin(idx * 2.7 + 1) * 0.2));
    n.liq = liq; n.phase = idx * 1.37;
    n.spinAxis = new THREE.Vector3(Math.sin(idx * 2.1), Math.cos(idx * 1.7), Math.sin(idx * 3.3)).normalize();
  });

  const bonds = edges.map(([u, v], idx) => ({
    u, v, breakTemp: idx < 12 ? 0.7 + (idx % 6) * 2.1 : 0.35 + (idx % 5) * 1.05, survives: idx % 3 === 0,
  }));
  return { nodes, bonds };
}

function buildWaterMol(oGeo, hGeo, oMat, hMat, covMat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(oGeo, oMat));
  const half = THREE.MathUtils.degToRad(52.25), origin = new THREE.Vector3();
  for (const sgn of [1, -1]) {
    const hp = new THREE.Vector3(sgn * Math.sin(half) * 0.36, Math.cos(half) * 0.36, 0);
    const hm = new THREE.Mesh(hGeo, hMat);
    hm.position.copy(hp); g.add(hm);
    const cyl = makeBondCylinder(origin, hp, 0.048, covMat);
    if (cyl) g.add(cyl);
  }
  return g;
}

function buildHexVoidRings() {
  const group = new THREE.Group();
  const sleeveMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.11, side: THREE.DoubleSide, depthWrite: false });
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(1.34, 1.34, 1.72, 6, 1, true), sleeveMat));
  const ringMats = [-0.82, 0, 0.82].map((ry) => {
    const r = ry === 0 ? 1.36 : 1.24;
    const pts = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(Math.cos((i * Math.PI) / 3) * r, ry, Math.sin((i * Math.PI) / 3) * r));
    const mat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: ry === 0 ? 0.65 : 0.42 });
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat));
    return mat;
  });
  return { group, sleeveMat, ringMats };
}

function createTelemetryHud() {
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;top:14px;right:16px;z-index:5;pointer-events:none;width:214px;padding:11px 13px;border-radius:12px;background:rgba(9,15,29,0.78);backdrop-filter:blur(12px);border:1px solid rgba(125,211,252,0.24);color:#e2e8f0;box-shadow:0 12px 32px rgba(2,6,23,0.45);font-size:11.5px;';
  hud.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
      <span data-hud="temp" style="font-family:ui-monospace,monospace;font-size:14px;font-weight:800;color:#7dd3fc;">0.0 ℃</span>
      <span data-hud="rho" style="font-family:ui-monospace,monospace;font-size:12px;font-weight:700;color:#f8fafc;">0.917 g/cm³</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-bottom:3px;">
      <span>0.917</span><span>密度对比</span><span>1.000</span>
    </div>
    <div style="height:6px;border-radius:999px;background:rgba(148,163,184,0.18);overflow:hidden;margin-bottom:8px;">
      <div data-hud="bar" style="height:100%;width:16%;border-radius:999px;background:linear-gradient(90deg,#38bdf8,#22d3ee,#34d399);transition:width 0.14s ease;"></div>
    </div>
    <div data-hud="pill" style="padding:4px 8px;border-radius:999px;text-align:center;font-size:10.5px;font-weight:700;background:rgba(56,189,248,0.16);border:1px solid rgba(56,189,248,0.34);color:#bae6fd;">
      冰密度更小 · 浮于水面
    </div>
  `;
  return hud;
}

export function mountIce3DStage(spec, stageEl, actionbarEl, { onCaption } = {}) {
  const stage = createCinemaStage(stageEl, {
    cameraPos: [0, 3.6, 9.2], target: [0, 0, 0], fov: 38, minDist: 4.5, maxDist: 18, autoRotate: true, floorY: -2.5,
  });

  const hud = createTelemetryHud();
  stageEl.appendChild(hud);
  const [hudTemp, hudRho, hudBar, hudPill] = ['temp', 'rho', 'bar', 'pill'].map((k) => hud.querySelector(`[data-hud="${k}"]`));

  actionbarEl.innerHTML = `
    <label class="crystal-dock-group" style="font-size:0.78rem;color:#cbd5e1;gap:0.45rem;">
      <span>温度</span>
      <input type="range" min="-10" max="20" step="0.5" value="0" data-el="slider" style="width:132px;accent-color:#38bdf8;" />
      <strong data-el="temp" style="font-family:ui-monospace,monospace;min-width:46px;color:#7dd3fc;">0.0℃</strong>
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
  const oGeo = new THREE.SphereGeometry(0.24, 24, 18);
  const hGeo = new THREE.SphereGeometry(0.145, 18, 14);
  const dashGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.16, 10);
  const oMat = new THREE.MeshPhysicalMaterial({ color: CPK_STUDIO.O, metalness: 0.08, roughness: 0.18, clearcoat: 0.95, clearcoatRoughness: 0.08, emissive: 0x881337, emissiveIntensity: 0.16 });
  const hMat = new THREE.MeshPhysicalMaterial({ color: CPK_STUDIO.H, metalness: 0.04, roughness: 0.22, clearcoat: 0.75 });
  const covMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.25, roughness: 0.35 });

  const mols = data.nodes.map((n, idx) => {
    const m = buildWaterMol(oGeo, hGeo, oMat, hMat, covMat);
    m.position.copy(n.ice);
    const baseRot = new THREE.Euler((idx % 3 - 1) * 0.62, (idx * Math.PI) / 3, idx % 2 === 0 ? 0.45 : -0.45);
    m.rotation.copy(baseRot);
    stage.root.add(m);
    return { group: m, node: n, baseQuat: new THREE.Quaternion().setFromEuler(baseRot) };
  });

  const hBonds = data.bonds.map((b) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 });
    const g = new THREE.Group();
    const segs = Array.from({ length: 4 }, () => { const s = new THREE.Mesh(dashGeo, mat); g.add(s); return s; });
    stage.root.add(g);
    return { ...b, group: g, segs, mat };
  });

  const voidRig = buildHexVoidRings();
  stage.root.add(voidRig.group);

  let tempC = 0, highlightHb = true, elapsed = 0;
  const tmpDir = new THREE.Vector3(), tmpPos = new THREE.Vector3(), tmpQuat = new THREE.Quaternion();

  function syncUi() {
    slider.value = String(tempC);
    tempReadout.textContent = `${tempC.toFixed(1)}℃`;
    presetBtns.forEach((b) => {
      const on = Math.abs(Number(b.dataset.preset) - tempC) < 0.25;
      b.classList.toggle('crystal-btn-primary', on); b.classList.toggle('crystal-btn-ghost', !on);
    });
    btnHb.classList.toggle('crystal-btn-primary', highlightHb);
    btnHb.classList.toggle('crystal-btn-ghost', !highlightHb);

    const rho = densityAt(tempC);
    hudTemp.textContent = `${tempC.toFixed(1)} ℃`;
    hudRho.textContent = `${rho.toFixed(3)} g/cm³`;
    hudBar.style.width = `${Math.max(8, Math.min(100, ((rho - 0.905) / 0.098) * 100)).toFixed(1)}%`;

    if (tempC <= 0.5) {
      hudPill.textContent = '冰密度更小 · 浮于水面';
      Object.assign(hudPill.style, { background: 'rgba(56,189,248,0.16)', borderColor: 'rgba(56,189,248,0.36)', color: '#bae6fd' });
      onCaption?.(`${spec?.label || '冰 Ih 氢键笼'} · 0℃ 固态冰由定向氢键撑开六方大空隙，ρ = ${rho.toFixed(3)} g/cm³`);
    } else if (tempC <= 6) {
      hudPill.textContent = '空隙坍塌 · 液态水更致密';
      Object.assign(hudPill.style, { background: 'rgba(52,211,153,0.16)', borderColor: 'rgba(52,211,153,0.38)', color: '#a7f3d0' });
      onCaption?.('升温破键 · 氢键逐步断裂，水分子向内坍缩填满空隙，4℃ 时密度达最大 1.000 g/cm³');
    } else {
      hudPill.textContent = '空隙坍塌 · 液态水更致密';
      Object.assign(hudPill.style, { background: 'rgba(251,146,60,0.16)', borderColor: 'rgba(251,146,60,0.36)', color: '#fed7aa' });
      onCaption?.(`${tempC.toFixed(1)}℃ 液态水 · 多数氢键断裂且分子热运动加剧，密度随温度略微下降`);
    }
  }

  slider.addEventListener('input', () => { tempC = Number(slider.value); syncUi(); });
  presetBtns.forEach((b) => b.addEventListener('click', () => { tempC = Number(b.dataset.preset); syncUi(); }));
  btnHb.addEventListener('click', () => { highlightHb = !highlightHb; syncUi(); });
  btnReset.addEventListener('click', () => stage.resetView());
  syncUi();

  stage.start((rawDt) => {
    const dt = typeof rawDt === 'number' && rawDt > 0 && rawDt < 0.1 ? rawDt : 0.016;
    elapsed += dt;
    const c = collapseAt(tempC), expand = tempC > 4 ? 1 + (tempC - 4) * 0.0045 : 1;
    const jitter = tempC <= 0 ? 0.016 : 0.032 + (tempC / 20) * 0.075;

    for (const m of mols) {
      const n = m.node;
      m.group.position.lerpVectors(n.ice, n.liq, c).multiplyScalar(expand);
      m.group.position.x += Math.sin(elapsed * 3.4 + n.phase) * jitter;
      m.group.position.y += Math.cos(elapsed * 2.9 + n.phase * 1.3) * jitter;
      m.group.position.z += Math.sin(elapsed * 3.1 + n.phase * 0.7) * jitter;
      tmpQuat.setFromAxisAngle(n.spinAxis, c * (0.7 + (tempC / 20) * 1.0) * Math.sin(elapsed * 1.45 + n.phase));
      m.group.quaternion.copy(m.baseQuat).premultiply(tmpQuat);
    }

    const pulse = highlightHb ? 0.84 + 0.16 * Math.sin(elapsed * 4.5) : 0.55;
    for (const hb of hBonds) {
      const pA = mols[hb.u].group.position, pB = mols[hb.v].group.position, dist = pA.distanceTo(pB);
      let intact = tempC > hb.breakTemp
        ? (hb.survives ? Math.max(0.24, 1 - (tempC - hb.breakTemp) * 0.085) : Math.max(0, 1 - (tempC - hb.breakTemp) * 0.34))
        : 1;
      if (dist > 2.7) intact *= 0.25;
      hb.group.visible = intact > 0.04;
      if (!hb.group.visible) continue;
      hb.mat.opacity = intact * (highlightHb ? 0.96 : 0.44) * pulse;
      tmpQuat.setFromUnitVectors(UP_VEC, tmpDir.subVectors(pB, pA).normalize());
      const rad = highlightHb ? 1.28 : 0.82;
      hb.segs.forEach((seg, s) => {
        seg.position.copy(tmpPos.lerpVectors(pA, pB, 0.23 + (s / 3) * 0.54));
        seg.quaternion.copy(tmpQuat);
        seg.scale.set(rad, Math.max(0.55, dist * 0.42), rad);
      });
    }

    const voidVis = (1 - c) * (highlightHb ? 1 : 0.42);
    voidRig.group.visible = voidVis > 0.04;
    voidRig.group.scale.setScalar(Math.max(0.12, 1 - c * 0.74));
    voidRig.sleeveMat.opacity = voidVis * 0.12;
    voidRig.ringMats.forEach((mat, i) => { mat.opacity = voidVis * (i === 1 ? 0.68 : 0.42); });
  });

  return {
    pause: () => stage.pause(),
    resume: () => stage.resume(),
    resize: () => stage.resize(),
    destroy() { stage.dispose(); hud.remove(); stageEl.innerHTML = ''; actionbarEl.innerHTML = ''; },
  };
}
