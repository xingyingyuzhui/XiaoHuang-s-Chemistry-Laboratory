/**
 * ChemStage Engine 2: lattice-stress
 * Cinema-grade side-by-side 3D 5x4x3 crystal shear-stress engine.
 * Sleek glowing cyan shear-force plane + 3D arrow (ZERO cartoon toys).
 * Supports metallic (ductile slip), ionic (like-charge repulsion cleavage), and covalent (brittle fracture).
 */

import * as THREE from 'three';
import { createCinemaStage, makeBondCylinder, CPK_STUDIO } from './render-kit.js';

const SIDE_X = 3.1, FLOOR_Y = -2.05;
const NX = 5, NY = 4, NZ = 3, STEP = 0.56;

const easeOut = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const easeInOut = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

function toHex(val, fallback) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try { return new THREE.Color(val.trim()).getHex(); } catch { /* fallback */ }
  }
  return fallback;
}

function buildShearIndicator() {
  const group = new THREE.Group();
  const planeGeo = new THREE.BoxGeometry(0.045, STEP * 2.1, STEP * 2.68);
  const planeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.24, depthWrite: false });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.9 });
  plane.add(new THREE.LineSegments(new THREE.EdgesGeometry(planeGeo), edgeMat));

  const arrowMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.75,
    roughness: 0.2, metalness: 0.25, clearcoat: 0.8, transparent: true, opacity: 0.94,
  });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.78, 16), arrowMat);
  shaft.rotation.z = -Math.PI / 2; shaft.position.set(-0.56, 0, 0);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 18), arrowMat);
  head.rotation.z = -Math.PI / 2; head.position.set(-0.08, 0, 0);

  group.add(plane, shaft, head);
  group.position.set(-STEP * 2.75, STEP, 0);
  return { group, planeMat, edgeMat, arrowMat };
}

function buildCrystalBlock(cfg) {
  const root = new THREE.Group(), bondType = cfg.bondType || 'metallic';
  const bot = new THREE.Group(), top = new THREE.Group(), crossBonds = new THREE.Group(), repGroup = new THREE.Group();
  root.add(bot, top, crossBonds, repGroup);

  const slipMat = new THREE.MeshBasicMaterial({
    color: bondType === 'metallic' ? 0x38bdf8 : 0xf43f5e,
    transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false,
  });
  const slipSheet = new THREE.Mesh(new THREE.PlaneGeometry(STEP * 5.6, STEP * 2.9), slipMat);
  slipSheet.rotation.x = -Math.PI / 2;
  root.add(slipSheet);

  const colA = toHex(cfg.colorA, bondType === 'ionic' ? CPK_STUDIO.Na : bondType === 'covalent' ? CPK_STUDIO.C : CPK_STUDIO.Cu);
  const colB = toHex(cfg.colorB, bondType === 'ionic' ? CPK_STUDIO.Cl : 0xfbbf24);

  const matA = bondType === 'metallic'
    ? new THREE.MeshPhysicalMaterial({ color: colA, metalness: 0.78, roughness: 0.22, clearcoat: 0.35, clearcoatRoughness: 0.18 })
    : bondType === 'ionic'
      ? new THREE.MeshPhysicalMaterial({ color: colA, metalness: 0.08, roughness: 0.18, clearcoat: 0.7, clearcoatRoughness: 0.12 })
      : new THREE.MeshPhysicalMaterial({ color: colA, metalness: 0.18, roughness: 0.24, clearcoat: 0.62, clearcoatRoughness: 0.16 });
  const matB = new THREE.MeshPhysicalMaterial({ color: colB, metalness: 0.08, roughness: 0.18, clearcoat: 0.7, clearcoatRoughness: 0.12 });
  const strutMat = bondType === 'covalent'
    ? new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x0c4a6e, emissiveIntensity: 0.4, roughness: 0.28, metalness: 0.35 })
    : new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.2, transparent: true, opacity: 0.42 });
  const crossMat = strutMat.clone();
  crossMat.transparent = true;

  const geoA = new THREE.SphereGeometry(bondType === 'metallic' ? 0.24 : bondType === 'ionic' ? 0.195 : 0.215, 22, 16);
  const geoB = new THREE.SphereGeometry(0.248, 22, 16);

  const shards = bondType === 'metallic' ? null : [
    { group: new THREE.Group(), vel: new THREE.Vector3(0.55, 1.05, 0.38), spin: new THREE.Vector3(0.32, 0.24, -0.45) },
    { group: new THREE.Group(), vel: new THREE.Vector3(1.45, 1.38, -0.32), spin: new THREE.Vector3(-0.26, 0.36, -0.58) },
  ];
  if (shards) shards.forEach((s) => top.add(s.group));

  const posOf = (ix, iy, iz) => [(ix - 2) * STEP + (bondType === 'covalent' && iy % 2 ? 0.14 : 0), (iy - 1.5) * STEP, (iz - 1) * STEP];
  const hostFor = (ix, iy) => (iy < 2 ? bot : (shards ? shards[ix < 2 ? 0 : 1].group : top));

  for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NZ; iz++) {
    const p = posOf(ix, iy, iz), isA = bondType !== 'ionic' || (ix + iy + iz) % 2 === 0;
    const m = new THREE.Mesh(isA ? geoA : geoB, isA ? matA : matB);
    m.position.set(p[0], p[1], p[2]);
    hostFor(ix, iy).add(m);
    if (bondType !== 'metallic') {
      const r = bondType === 'covalent' ? 0.044 : 0.025;
      if (ix < NX - 1 && (iy < 2 || !shards || ix !== 1)) hostFor(ix, iy).add(makeBondCylinder(p, posOf(ix + 1, iy, iz), r, strutMat));
      if (iz < NZ - 1) hostFor(ix, iy).add(makeBondCylinder(p, posOf(ix, iy, iz + 1), r, strutMat));
      if (iy === 0 || iy === 2) hostFor(ix, iy).add(makeBondCylinder(p, posOf(ix, iy + 1, iz), r, strutMat));
      if (iy === 1) crossBonds.add(makeBondCylinder(p, posOf(ix, iy + 1, iz), r, crossMat));
    }
  }

  let electrons = [];
  if (bondType === 'metallic') {
    const seaGeo = new THREE.BoxGeometry(STEP * 4.85, STEP * 1.95, STEP * 2.75);
    const seaMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.1, depthWrite: false });
    const sBot = new THREE.Mesh(seaGeo, seaMat); sBot.position.y = -STEP; bot.add(sBot);
    const sTop = new THREE.Mesh(seaGeo, seaMat); sTop.position.y = STEP; top.add(sTop);

    const eGeo = new THREE.SphereGeometry(0.046, 10, 8);
    const eMat = new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.92 });
    electrons = Array.from({ length: 34 }, (_, i) => {
      const mesh = new THREE.Mesh(eGeo, eMat);
      root.add(mesh);
      return {
        mesh, phase: (i / 34) * Math.PI * 2, speed: 1.25 + (i % 5) * 0.32,
        rx: 0.95 + (i % 4) * 0.18, ry: ((i % 7) - 3) * 0.32, rz: ((i % 3) - 1) * 0.56,
      };
    });
  }

  const repRings = [];
  const repRingMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0, depthWrite: false });
  const repArcMat = new THREE.MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0, depthWrite: false });
  if (bondType !== 'metallic') {
    const ringGeo = new THREE.TorusGeometry(0.22, 0.024, 8, 24);
    const arcGeo = new THREE.CylinderGeometry(0.038, 0.038, STEP * 0.88, 10);
    for (let ix = 0; ix < NX - 1; ix++) for (let iz = 0; iz < NZ; iz++) {
      const x = (ix - 1) * STEP, z = (iz - 1) * STEP;
      const ring = new THREE.Mesh(ringGeo, repRingMat);
      ring.rotation.x = Math.PI / 2; ring.position.set(x, 0, z); repGroup.add(ring); repRings.push(ring);
      const arc = new THREE.Mesh(arcGeo, repArcMat);
      arc.position.set(x, 0, z); repGroup.add(arc);
    }
  }

  const shear = buildShearIndicator();
  root.add(shear.group);
  return {
    cfg, bondType, root, bot, top, crossBonds, crossMat, shards,
    electrons, repRings, repRingMat, repArcMat, slipMat, shear,
  };
}

function statusFor(block, t) {
  const { label, sublabel } = block.cfg;
  if (t < 0.06) return `${label} · ${sublabel}`;
  if (block.bondType === 'metallic') {
    return t < 0.48 ? `${label} · 上层沿滑移面平稳错动 1 格…` : `✓ ${label} · 自由电子海维系金属键，延展不断裂`;
  }
  if (block.bondType === 'ionic') {
    if (t < 0.44) return `${label} · 错位 1 格，同号离子正对…`;
    if (t < 0.68) return `⚡ ${label} · 同号离子正对，强烈静电排斥！`;
    return `✕ ${label} · 同号相斥，沿解理面瞬间脆裂`;
  }
  if (t < 0.48) return `${label} · 强方向性共价键承受高剪切应力…`;
  return t < 0.68 ? `⚡ ${label} · 达到断裂极限，共价键断裂！` : `✕ ${label} · 刚性共价键断裂，呈脆性解理`;
}

export function mountStress3DStage(spec, stageEl, actionbarEl, { onCaption, onDualLabels } = {}) {
  const leftCfg = { label: '金属铜 Cu', sublabel: '金属键 · 自由电子海', bondType: 'metallic', colorA: CPK_STUDIO.Cu, colorB: 0xfbbf24, ...(spec?.left || {}) };
  const rightCfg = { label: '氯化钠 NaCl', sublabel: '离子键 · 正负交替', bondType: 'ionic', colorA: CPK_STUDIO.Na, colorB: CPK_STUDIO.Cl, ...(spec?.right || {}) };

  const cinema = createCinemaStage(stageEl, {
    cameraPos: [0, 3.05, 11.4], target: [0, -0.06, 0], fov: 38, minDist: 5, maxDist: 24, floorY: FLOOR_Y,
  });

  const leftBlock = buildCrystalBlock(leftCfg), rightBlock = buildCrystalBlock(rightCfg);
  leftBlock.root.position.set(-SIDE_X, -0.08, 0);
  rightBlock.root.position.set(SIDE_X, -0.08, 0);
  cinema.root.add(leftBlock.root, rightBlock.root);

  for (const x of [-SIDE_X, SIDE_X]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.52, 1.58, 64),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, FLOOR_Y + 0.01, 0); cinema.root.add(ring);
  }

  const bar = actionbarEl || document.createElement('div');
  bar.innerHTML = `<div class="crystal-dock-group"><button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="shear">施加剪切力</button><button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="slow">慢动作 0.35×</button><button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">复原</button></div>`;
  const btnShear = bar.querySelector('[data-act="shear"]');
  const btnSlow = bar.querySelector('[data-act="slow"]');
  const btnReset = bar.querySelector('[data-act="reset"]');

  let playing = false, slowMo = false, prog = 0;

  function applyBlockPose(b, t, time) {
    const contact = easeOut(t / 0.15);
    const slipFrac = easeInOut((t - 0.14) / 0.36);
    const shiftX = slipFrac * STEP * (b.bondType === 'covalent' ? 0.32 : 1.0);
    const shearFade = t < 0.72 ? 1 : Math.max(0.18, 1 - (t - 0.72) / 0.28);

    b.shear.group.position.x = -STEP * 2.85 + contact * STEP * 0.42 + shiftX;
    b.shear.planeMat.opacity = (0.16 + 0.24 * Math.sin(Math.min(1, t / 0.65) * Math.PI)) * shearFade;
    b.shear.edgeMat.opacity = 0.9 * shearFade;
    b.shear.arrowMat.opacity = 0.92 * shearFade;
    b.shear.arrowMat.emissiveIntensity = 0.45 + (playing ? 0.85 : 0.25);
    b.slipMat.opacity = t > 0.12 && t < 0.82 ? 0.2 : 0.07;

    if (b.bondType === 'metallic') {
      b.top.position.set(shiftX, 0, 0); b.bot.position.set(0, 0, 0); return;
    }

    const repPhase = t < 0.42 ? 0 : t < 0.72 ? Math.sin(((t - 0.42) / 0.3) * Math.PI) : 0;
    const pulse = 0.85 + 0.35 * Math.sin(time * 24);
    b.repRingMat.opacity = repPhase * 0.95; b.repArcMat.opacity = repPhase * 0.92;
    for (const r of b.repRings) r.scale.setScalar(0.85 + repPhase * 0.45 * pulse);

    const shake = t > 0.44 && t < 0.68 ? Math.sin(t * 140) * 0.032 : 0;
    b.top.position.set(shiftX + shake, 0, 0);

    const cleave = t <= 0.68 ? 0 : easeOut((t - 0.68) / 0.32);
    const crossFade = b.bondType === 'ionic' ? Math.max(0, 1 - slipFrac * 2.4) : (cleave < 0.04 ? 1 : 0);
    b.crossBonds.visible = crossFade > 0.02;
    b.crossMat.opacity = crossFade * (b.bondType === 'covalent' ? 1 : 0.42);
    if (b.bondType === 'covalent') b.crossMat.emissive.setHex(t > 0.35 ? 0xf43f5e : 0x0c4a6e);

    b.bot.position.set(-cleave * 0.12, -cleave * 0.05, 0);
    if (b.shards) {
      for (const sh of b.shards) {
        sh.group.position.set(sh.vel.x * cleave, sh.vel.y * cleave - 0.55 * cleave * cleave, sh.vel.z * cleave);
        sh.group.rotation.set(sh.spin.x * cleave, sh.spin.y * cleave, sh.spin.z * cleave);
      }
    }
  }

  function applyPose(t, time = 0) {
    applyBlockPose(leftBlock, t, time);
    applyBlockPose(rightBlock, t, time);
    onDualLabels?.(statusFor(leftBlock, t), statusFor(rightBlock, t));
  }

  function resetAll() {
    playing = false; prog = 0; applyPose(0, 0);
    btnShear.textContent = '施加剪切力';
    onCaption?.('点击「施加剪切力」，同步观察金属滑移延展与离子/共价晶格解理');
  }

  btnShear.addEventListener('click', () => {
    if (prog >= 0.99) prog = 0;
    playing = true; btnShear.textContent = '剪切演示中…';
    onCaption?.('同步施加横向剪切力 · 观察上层晶面滑移与排斥解理差异');
  });
  btnSlow.addEventListener('click', () => {
    slowMo = !slowMo;
    btnSlow.classList.toggle('crystal-btn-primary', slowMo);
    btnSlow.classList.toggle('crystal-btn-ghost', !slowMo);
  });
  btnReset.addEventListener('click', () => { resetAll(); cinema.resetView(); });

  resetAll();
  cinema.start((dt, elapsed) => {
    if (playing) {
      prog = Math.min(1, prog + dt * (slowMo ? 0.12 : 0.34));
      applyPose(prog, elapsed);
      if (prog >= 1) {
        playing = false; btnShear.textContent = '再次施加剪切力';
        onCaption?.(`对比结论：${leftCfg.label} 与 ${rightCfg.label} 键型差异决定延展性与脆性`);
      }
    } else if (prog > 0.42 && prog < 0.72) {
      applyPose(prog, elapsed);
    }
    for (const b of [leftBlock, rightBlock]) {
      if (!b.electrons.length) continue;
      const topX = b.top.position.x;
      for (const e of b.electrons) {
        const a = elapsed * e.speed + e.phase, yOff = e.ry + Math.sin(a * 0.85) * 0.22;
        e.mesh.position.set(Math.cos(a) * e.rx + (yOff > 0 ? topX : 0), yOff, Math.sin(a) * 0.52 + e.rz * 0.45);
      }
    }
  });

  return {
    pause: cinema.pause, resume: cinema.resume, resize: cinema.resize,
    destroy() { cinema.dispose(); bar.innerHTML = ''; },
  };
}
