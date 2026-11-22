/**
 * 真 3D 晶体自范性与溶液自修复舞台（NaCl 4×4×4 立方晶格 + 卤水游离离子云）
 * 使用 render-kit.js 暗色科研影院管线，彻底替代旧 2D 扁平方块。
 */

import * as THREE from 'three';
import { createCinemaStage, CPK_STUDIO } from './render-kit.js';

const S = 0.84;
const easeBack = (t) => 1 + 2.35 * Math.pow(t - 1, 3) + 1.35 * Math.pow(t - 1, 2);
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function arcPos(out, from, to, u, swirl) {
  out.lerpVectors(from, to, easeIO(u));
  const arc = Math.sin(u * Math.PI);
  out.x += -from.z * 0.24 * swirl * arc;
  out.y += (0.55 + 0.28 * swirl) * arc;
  out.z += from.x * 0.24 * swirl * arc;
  return out;
}

function buildLattice(naGeo, clGeo, naMat, clMat) {
  const entries = [];
  for (let ix = 0; ix < 4; ix++) {
    for (let iy = 0; iy < 4; iy++) {
      for (let iz = 0; iz < 4; iz++) {
        const isNa = (ix + iy + iz) % 2 === 0;
        const isSeed = ix >= 1 && ix <= 2 && iy >= 1 && iy <= 2 && iz >= 1 && iz <= 2;
        const isCorner = ix >= 2 && iy >= 2 && iz >= 2;
        const home = new THREE.Vector3((ix - 1.5) * S, (iy - 1.5) * S, (iz - 1.5) * S);
        const spawn = home.clone().normalize().multiplyScalar(4.1 + ((ix * 7 + iy * 13 + iz * 5) % 9) * 0.16);
        spawn.y += (iy - 1.5) * 0.45;
        const base = isNa ? naMat : clMat;
        const mat = isCorner ? base.clone() : base;
        const mesh = new THREE.Mesh(isNa ? naGeo : clGeo, mat);
        mesh.position.copy(home);
        entries.push({
          ix, iy, iz, isNa, isSeed, isCorner, home, spawn, mesh, mat,
          attached: isSeed, delay: 0, snapAge: 9,
          swirl: isNa ? 1 : -1, fallVel: new THREE.Vector3(), dist: home.length(),
        });
      }
    }
  }
  const byKey = new Map(entries.map((e) => [`${e.ix},${e.iy},${e.iz}`, e]));
  const pairs = [];
  for (const e of entries) {
    for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const nb = byKey.get(`${e.ix + dx},${e.iy + dy},${e.iz + dz}`);
      if (nb) pairs.push([e, nb]);
    }
  }
  return { entries, pairs };
}

function buildBrineCloud(root) {
  const geo = new THREE.SphereGeometry(0.068, 10, 8);
  const naGlow = new THREE.MeshBasicMaterial({ color: CPK_STUDIO.Na, transparent: true, opacity: 0.62 });
  const clGlow = new THREE.MeshBasicMaterial({ color: CPK_STUDIO.Cl, transparent: true, opacity: 0.62 });
  const particles = [];
  for (let i = 0; i < 64; i++) {
    const isNa = i % 2 === 0;
    const mesh = new THREE.Mesh(geo, isNa ? naGlow : clGlow);
    const phi = Math.acos(1 - (2 * (i + 0.5)) / 64);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const radius = 3.15 + (i % 7) * 0.34;
    mesh.position.set(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi) * 0.78, radius * Math.sin(phi) * Math.sin(theta));
    root.add(mesh);
    particles.push({ mesh, radius, phi, theta, speed: (isNa ? 0.16 : -0.14) * (0.7 + (i % 5) * 0.14), bob: i * 0.73 });
  }
  return particles;
}

export function mountGrowth3DStage(spec, stageEl, actionbarEl, { onCaption } = {}) {
  const stage = createCinemaStage(stageEl, {
    cameraPos: [5.6, 4.4, 7.2], target: [0, 0, 0], fov: 38, minDist: 4.4, maxDist: 16, autoRotate: true, floorY: -2.4,
  });

  const naGeo = new THREE.SphereGeometry(0.22, 24, 18);
  const clGeo = new THREE.SphereGeometry(0.295, 24, 18);
  const naMat = new THREE.MeshPhysicalMaterial({
    color: CPK_STUDIO.Na, metalness: 0.14, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x4c1d95, emissiveIntensity: 0.22,
  });
  const clMat = new THREE.MeshPhysicalMaterial({
    color: CPK_STUDIO.Cl, metalness: 0.1, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.06, emissive: 0x065f46, emissiveIntensity: 0.18,
  });

  const crystalGroup = new THREE.Group();
  stage.root.add(crystalGroup);
  const { entries, pairs } = buildLattice(naGeo, clGeo, naMat, clMat);
  entries.forEach((e) => { e.mesh.visible = e.attached; crystalGroup.add(e.mesh); });

  const bondPos = new Float32Array(pairs.length * 6);
  const bondGeo = new THREE.BufferGeometry();
  bondGeo.setAttribute('position', new THREE.BufferAttribute(bondPos, 3));
  crystalGroup.add(new THREE.LineSegments(bondGeo, new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.24 })));

  const outerBox = new THREE.BoxGeometry(3.22, 3.22, 3.22);
  const outerAuraMat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.12 });
  const outerGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8, transparent: true, opacity: 0, roughness: 0.08, metalness: 0.05, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
  });
  crystalGroup.add(
    new THREE.LineSegments(new THREE.EdgesGeometry(outerBox), outerAuraMat),
    new THREE.Mesh(outerBox, outerGlassMat),
    new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.52, 1.52, 1.52)), new THREE.LineBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.26 })),
  );

  const cavityBox = new THREE.BoxGeometry(1.66, 1.66, 1.66);
  const cavityWireMat = new THREE.LineBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0 });
  const cavityFillMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const cavityGroup = new THREE.Group();
  cavityGroup.position.set(S, S, S);
  cavityGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(cavityBox), cavityWireMat), new THREE.Mesh(cavityBox, cavityFillMat));
  cavityGroup.visible = false;
  crystalGroup.add(cavityGroup);

  const brine = buildBrineCloud(stage.root);

  actionbarEl.innerHTML = `
    <div class="crystal-dock-group">
      <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="grow">自发生长</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="chip">敲掉一角</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="heal">溶液自修复</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">重置晶核</button>
    </div>
  `;
  const [btnGrow, btnChip, btnHeal, btnReset] = ['grow', 'chip', 'heal', 'reset'].map((a) => actionbarEl.querySelector(`[data-act="${a}"]`));

  let mode = 'seed', phaseTime = 0, elapsed = 0;
  const tmpVec = new THREE.Vector3();
  const setOp = (e, op) => { e.mat.transparent = op < 0.99; e.mat.opacity = op; };

  function syncBtns() {
    [[btnGrow, mode === 'growing' || mode === 'grown'], [btnChip, mode === 'chipped'], [btnHeal, mode === 'healing'], [btnReset, mode === 'seed']]
      .forEach(([b, on]) => { b.classList.toggle('crystal-btn-primary', on); b.classList.toggle('crystal-btn-ghost', !on); });
  }

  function resetSeed() {
    mode = 'seed'; phaseTime = 0; cavityGroup.visible = false;
    for (const e of entries) {
      e.attached = e.isSeed; e.snapAge = 9; e.mesh.visible = e.isSeed;
      e.mesh.position.copy(e.home); e.mesh.scale.setScalar(1);
      if (e.isCorner) { setOp(e, 1); e.mat.emissiveIntensity = e.isNa ? 0.22 : 0.18; }
    }
    syncBtns();
    onCaption?.(`${spec?.label || 'NaCl 晶核'} · 2×2×2 立方晶核悬浮在饱和食盐水自由离子云中`);
  }

  function startGrowth() {
    mode = 'growing'; phaseTime = 0; cavityGroup.visible = false;
    const outer = entries.filter((e) => !e.isSeed).sort((a, b) => a.dist - b.dist || a.iy - b.iy || a.ix - b.ix);
    for (const e of entries) {
      if (e.isCorner) { setOp(e, 1); e.mat.emissiveIntensity = e.isNa ? 0.22 : 0.18; }
      e.attached = e.isSeed; e.snapAge = 9; e.mesh.visible = e.isSeed;
      e.mesh.position.copy(e.home); e.mesh.scale.setScalar(1);
    }
    outer.forEach((e, i) => { e.delay = i * 0.052; });
    syncBtns();
    onCaption?.('自发生长 · Na⁺ 与 Cl⁻ 从溶液中按正负交替规律逐层堆砌成规则立方体');
  }

  function chipCorner() {
    mode = 'chipped'; phaseTime = 0; cavityGroup.visible = true;
    for (const e of entries) {
      e.mesh.position.copy(e.home); e.mesh.scale.setScalar(1); e.mesh.visible = true;
      if (!e.isCorner) { e.attached = true; } else {
        e.attached = false; setOp(e, 1);
        e.fallVel.set(1.4 + (e.ix - 1.5) * 0.85, 1.35 + (e.iy - 1.5) * 0.65, 1.4 + (e.iz - 1.5) * 0.85);
      }
    }
    syncBtns();
    onCaption?.('敲掉一角 · 顶角 8 个离子剥落脱落，晶体露出高能缺角空腔');
  }

  function startHeal() {
    mode = 'healing'; phaseTime = 0; cavityGroup.visible = true;
    const corner = entries.filter((e) => e.isCorner).sort((a, b) => a.dist - b.dist);
    for (const e of entries) {
      if (!e.isCorner) { e.attached = true; e.mesh.visible = true; e.mesh.position.copy(e.home); e.mesh.scale.setScalar(1); } else {
        e.attached = false; e.snapAge = 9; e.mesh.visible = true; setOp(e, 0.25);
        e.spawn.copy(e.home).add(new THREE.Vector3(2.8 + (e.ix - 2) * 0.7, 2.2 + (e.iy - 2) * 0.7, 2.7 + (e.iz - 2) * 0.7));
        e.mesh.position.copy(e.spawn);
      }
    }
    corner.forEach((e, i) => { e.delay = i * 0.16; });
    syncBtns();
    onCaption?.('溶液自修复 · 溶液中自由离子优先迁入缺角凹坑，逐步恢复完整对称立方体');
  }

  btnGrow.addEventListener('click', startGrowth);
  btnChip.addEventListener('click', chipCorner);
  btnHeal.addEventListener('click', startHeal);
  btnReset.addEventListener('click', resetSeed);

  function updateBonds() {
    let k = 0;
    for (const [a, b] of pairs) {
      if (a.attached && b.attached) {
        bondPos[k++] = a.mesh.position.x; bondPos[k++] = a.mesh.position.y; bondPos[k++] = a.mesh.position.z;
        bondPos[k++] = b.mesh.position.x; bondPos[k++] = b.mesh.position.y; bondPos[k++] = b.mesh.position.z;
      } else {
        bondPos[k++] = 0; bondPos[k++] = 0; bondPos[k++] = 0; bondPos[k++] = 0; bondPos[k++] = 0; bondPos[k++] = 0;
      }
    }
    bondGeo.attributes.position.needsUpdate = true;
  }

  resetSeed();
  updateBonds();

  stage.start((rawDt) => {
    const dt = typeof rawDt === 'number' && rawDt > 0 && rawDt < 0.1 ? rawDt : 0.016;
    elapsed += dt; phaseTime += dt;

    for (const p of brine) {
      p.theta += p.speed * dt;
      const r = p.radius + Math.sin(elapsed * 1.1 + p.bob) * 0.14;
      p.mesh.position.set(r * Math.sin(p.phi) * Math.cos(p.theta), r * Math.cos(p.phi) * 0.78 + Math.sin(elapsed * 1.5 + p.bob) * 0.12, r * Math.sin(p.phi) * Math.sin(p.theta));
    }

    if (mode === 'growing') {
      let done = 0;
      for (const e of entries) {
        if (e.isSeed) { done++; continue; }
        const t = (phaseTime - e.delay) / 0.62;
        if (t <= 0) { e.mesh.visible = false; continue; }
        e.mesh.visible = true;
        const u = Math.min(1, t);
        e.mesh.position.copy(arcPos(tmpVec, e.spawn, e.home, u, e.swirl));
        if (u >= 1) {
          if (!e.attached) { e.attached = true; e.snapAge = 0; }
          e.snapAge += dt;
          e.mesh.scale.setScalar(e.snapAge < 0.28 ? 1 + 0.26 * Math.sin((e.snapAge / 0.28) * Math.PI) : 1);
          done++;
        } else { e.mesh.scale.setScalar(0.35 + 0.65 * easeBack(u)); }
      }
      if (done === entries.length) {
        mode = 'grown'; syncBtns();
        onCaption?.('4×4×4 完整 NaCl 立方晶体 · 自发形成规则封闭多面体，展现晶体自范性');
      }
    } else if (mode === 'chipped') {
      const pulse = 0.55 + 0.45 * Math.sin(elapsed * 4.2);
      cavityWireMat.opacity = 0.45 + pulse * 0.45;
      cavityFillMat.opacity = 0.05 + pulse * 0.07;
      for (const e of entries) {
        if (!e.isCorner) continue;
        if (phaseTime < 1.35) {
          e.fallVel.y -= 5.4 * dt;
          e.mesh.position.addScaledVector(e.fallVel, dt);
          const fade = Math.max(0, 1 - phaseTime / 1.25);
          setOp(e, fade); e.mesh.scale.setScalar(0.55 + 0.45 * fade); e.mesh.visible = fade > 0.02;
        } else { e.mesh.visible = false; }
      }
    } else if (mode === 'healing') {
      let healed = 0;
      for (const e of entries) {
        if (!e.isCorner) continue;
        const t = (phaseTime - e.delay) / 0.72;
        if (t <= 0) { e.mesh.visible = true; setOp(e, 0.22); e.mesh.scale.setScalar(0.45); continue; }
        const u = Math.min(1, t);
        e.mesh.position.copy(arcPos(tmpVec, e.spawn, e.home, u, e.swirl));
        setOp(e, 0.35 + 0.65 * u);
        if (u >= 1) {
          if (!e.attached) { e.attached = true; e.snapAge = 0; }
          e.snapAge += dt;
          e.mesh.scale.setScalar(e.snapAge < 0.34 ? 1 + 0.32 * Math.sin((e.snapAge / 0.34) * Math.PI) : 1);
          e.mat.emissiveIntensity = e.snapAge < 0.45 ? 0.85 * (1 - e.snapAge / 0.45) + 0.2 : 0.2;
          healed++;
        } else { e.mesh.scale.setScalar(0.45 + 0.55 * easeBack(u)); e.mat.emissiveIntensity = 0.55; }
      }
      const rem = 1 - healed / 8;
      cavityWireMat.opacity = rem * 0.75; cavityFillMat.opacity = rem * 0.09;
      if (healed === 8) {
        cavityGroup.visible = false; mode = 'grown'; syncBtns();
        onCaption?.('缺角完全自修复 · 溶解—结晶动态平衡优先填补高能凹口，重塑完美立方晶形');
      }
    }

    const fullness = Math.max(0, (entries.reduce((n, e) => n + (e.attached ? 1 : 0), 0) - 8) / 56);
    outerAuraMat.opacity = 0.1 + fullness * 0.34;
    outerGlassMat.opacity = fullness * 0.055;
    updateBonds();
  });

  return {
    pause: () => stage.pause(),
    resume: () => stage.resume(),
    resize: () => stage.resize(),
    destroy() { stage.dispose(); stageEl.innerHTML = ''; actionbarEl.innerHTML = ''; },
  };
}
