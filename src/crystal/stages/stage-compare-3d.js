/**
 * ChemStage Engine 1: dual-3d-compare
 * Cinema-grade side-by-side 3D macro & micro comparison across 8 crystal kinds:
 * quartz, glass, diamond, graphite, dryice, sio2, nacl, cscl.
 */

import * as THREE from 'three';
import { createCinemaStage, makeBondCylinder, CPK_STUDIO } from './render-kit.js';

const SIDE_X = 2.38, FLOOR_Y = -1.95;

const MICRO_HINT = {
  quartz: '周期性六元 Si–O 四面体网（长程有序）',
  glass: '5/6/7 元随机 Si–O 网（短程有序、长程无序）',
  diamond: 'sp³ 正四面体三维共价网（极高硬度）',
  graphite: 'sp² 层状六元环 + π 电子云 + 范德华层间',
  dryice: 'FCC 分子晶格 · O=C=O 分子间范德华力',
  sio2: 'SiO₂ 三维共价四面体网（Si–O–Si 桥接）',
  nacl: 'Na⁺/Cl⁻ 交替立方离子晶格（6 配位）',
  cscl: 'Cs⁺/Cl⁻ 体心立方离子晶格（8 配位）',
};

const FCC_14 = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  [0.5, 0.5, 0], [0.5, 0.5, 1], [0.5, 0, 0.5], [0.5, 1, 0.5], [0, 0.5, 0.5], [1, 0.5, 0.5],
];

const atomMat = (color, opts = {}) => new THREE.MeshPhysicalMaterial({
  color, metalness: 0.14, roughness: 0.22, clearcoat: 0.72, clearcoatRoughness: 0.14, ...opts,
});
const crystalMat = (color, atten, opts = {}) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.08, metalness: 0.03, transmission: 0.74, thickness: 1.8, ior: 1.54,
  clearcoat: 1, clearcoatRoughness: 0.06, attenuationColor: new THREE.Color(atten),
  attenuationDistance: 2.6, transparent: true, opacity: 0.94, ...opts,
});
const bondMat = (color = 0x94a3b8, opacity = 1) => new THREE.MeshStandardMaterial({
  color, roughness: 0.3, metalness: 0.28, transparent: opacity < 1, opacity,
});
const glowMat = (color, opacity = 0.24) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

function addEdges(parent, geo, color, opacity = 0.82) {
  parent.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 12), new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
}
function addAtom(parent, geo, mat, p) {
  const m = new THREE.Mesh(geo, mat);
  if (Array.isArray(p)) m.position.set(p[0], p[1], p[2]); else m.position.copy(p);
  parent.add(m);
}
function buildHexBipyramidGeo(r, bodyH, tipH) {
  const pos = [], push = (a, b, c) => pos.push(...a, ...b, ...c), half = bodyH * 0.5;
  const top = [0, half + tipH, 0], bot = [0, -half - tipH * 0.32, 0];
  const ring = (y) => Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3 + Math.PI / 6) * r, y, Math.sin((i * Math.PI) / 3 + Math.PI / 6) * r]);
  const tr = ring(half), br = ring(-half);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    push(br[i], br[j], tr[j]); push(br[i], tr[j], tr[i]); push(tr[i], tr[j], top); push(br[j], br[i], bot);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}
function buildGlassPebbleGeo(radius) {
  const geo = new THREE.IcosahedronGeometry(radius, 4), attr = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < attr.count; i++) {
    v.fromBufferAttribute(attr, i).normalize();
    const b = 1 + 0.13 * Math.sin(v.x * 3 + 0.5) * Math.cos(v.y * 2.7) + 0.09 * Math.sin(v.z * 3.4 - v.y * 2.1) + 0.05 * Math.cos(v.x * 4.8 + v.z * 4);
    attr.setXYZ(i, v.x * radius * b * 1.08, v.y * radius * b * 0.84, v.z * radius * b * 0.96);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildMacro(kind) {
  const g = new THREE.Group();
  if (kind === 'quartz' || kind === 'sio2') {
    const isSio2 = kind === 'sio2';
    const mat = crystalMat(isSio2 ? 0x38bdf8 : 0x7dd3fc, isSio2 ? 0x0369a1 : 0x0284c7);
    const mainGeo = buildHexBipyramidGeo(0.76, 1.56, 0.78);
    const main = new THREE.Mesh(mainGeo, mat);
    addEdges(main, mainGeo, 0xe0f2fe, 0.86);
    main.add(new THREE.Mesh(buildHexBipyramidGeo(0.4, 0.9, 0.44), glowMat(0xe0f2fe, 0.24)));
    g.add(main);
    const twinGeo = buildHexBipyramidGeo(0.38, 0.95, 0.45);
    const addTwin = (pos, rot, sc = 1) => {
      const t = new THREE.Mesh(twinGeo, mat);
      t.position.set(...pos); t.rotation.set(...rot); t.scale.setScalar(sc);
      addEdges(t, twinGeo, 0xe0f2fe, 0.76); g.add(t);
    };
    addTwin([0.66, -0.32, 0.34], [0.14, 0.38, -0.36]);
    if (isSio2) addTwin([-0.62, -0.42, -0.26], [-0.18, -0.5, 0.42], 0.8);
    return g;
  }
  if (kind === 'glass') {
    const mat = crystalMat(0xfbbf24, 0xd97706, { roughness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.22, transmission: 0.56, ior: 1.46 });
    const pebble = new THREE.Mesh(buildGlassPebbleGeo(1.12), mat);
    pebble.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 3), glowMat(0xfde68a, 0.22)));
    g.add(pebble); return g;
  }
  if (kind === 'diamond') {
    const geo = new THREE.OctahedronGeometry(1.18, 0);
    const body = new THREE.Mesh(geo, crystalMat(0xe0f2fe, 0x38bdf8, { roughness: 0.04, transmission: 0.84, ior: 2.417, thickness: 2.2 }));
    addEdges(body, geo, 0xf8fafc, 0.92);
    body.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), glowMat(0xffffff, 0.26)));
    g.add(body); return g;
  }
  if (kind === 'graphite') {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x334155, metalness: 0.76, roughness: 0.26, clearcoat: 0.45, clearcoatRoughness: 0.22 });
    const plateGeo = new THREE.CylinderGeometry(1.06, 1.06, 0.24, 6);
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(plateGeo, mat);
      p.position.y = (i - 1.5) * 0.36; addEdges(p, plateGeo, 0x94a3b8, 0.62); g.add(p);
    }
    return g;
  }
  const presets = { dryice: [0xe2e8f0, 0x94a3b8, 0.28, 0xbae6fd], nacl: [0xc4b5fd, 0x7c3aed, 0.1, 0xede9fe], cscl: [0xfcd34d, 0xd97706, 0.12, 0xfef3c7] };
  const [col, att, rough, edge] = presets[kind] || presets.nacl;
  const boxGeo = new THREE.BoxGeometry(1.48, 1.48, 1.48), mat = crystalMat(col, att, { roughness: rough, clearcoat: 0.85, transmission: 0.66 });
  const cube = new THREE.Mesh(boxGeo, mat);
  addEdges(cube, boxGeo, edge, 0.82);
  cube.add(new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.76, 0.76), glowMat(edge, 0.18)));
  g.add(cube);
  if (kind === 'nacl') {
    const subGeo = new THREE.BoxGeometry(0.68, 0.68, 0.68), sub = new THREE.Mesh(subGeo, mat);
    sub.position.set(0.64, -0.42, 0.56); addEdges(sub, subGeo, edge, 0.75); g.add(sub);
  }
  return g;
}

function buildSiONet(ordered) {
  const g = new THREE.Group(), siPts = [], edges = [];
  const siGeo = new THREE.SphereGeometry(0.155, 20, 16), oGeo = new THREE.SphereGeometry(0.105, 16, 12);
  const siMat = atomMat(CPK_STUDIO.Si), oMat = atomMat(CPK_STUDIO.O), bMat = bondMat(0xcbd5e1);
  if (ordered) {
    for (let layer = 0; layer < 2; layer++) {
      const yBase = layer ? 0.58 : -0.58, off = layer * 6;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        siPts.push(new THREE.Vector3(Math.cos(a) * 0.96, yBase + (i % 2 ? -0.14 : 0.14), Math.sin(a) * 0.96));
        edges.push([off + i, off + ((i + 1) % 6)]);
      }
    }
    for (let i = 0; i < 6; i += 2) edges.push([i, 6 + i]);
  } else {
    for (const rg of [{ n: 5, r: 0.72, cx: -0.36, cy: -0.42, cz: 0.18, t: 0.28 }, { n: 7, r: 0.88, cx: 0.34, cy: 0.44, cz: -0.16, t: -0.34 }]) {
      const start = siPts.length;
      for (let i = 0; i < rg.n; i++) {
        const a = (i * Math.PI * 2) / rg.n + rg.t, j = 0.82 + 0.3 * Math.sin(i * 2.4 + rg.n);
        siPts.push(new THREE.Vector3(rg.cx + Math.cos(a) * rg.r * j, rg.cy + Math.sin(a * 1.7 + rg.n) * 0.32, rg.cz + Math.sin(a) * rg.r * (1.14 - 0.2 * Math.cos(i * 1.9))));
        edges.push([start + i, start + ((i + 1) % rg.n)]);
      }
    }
    edges.push([1, 6], [3, 9], [4, 11]);
  }
  for (const p of siPts) addAtom(g, siGeo, siMat, p);
  for (const [i, j] of edges) {
    const a = siPts[i], b = siPts[j], mid = a.clone().add(b).multiplyScalar(0.5);
    mid.add(mid.clone().setY(mid.y * 0.4).normalize().multiplyScalar(ordered ? 0.14 : 0.18));
    addAtom(g, oGeo, oMat, mid);
    g.add(makeBondCylinder(a, mid, 0.036, bMat), makeBondCylinder(mid, b, 0.036, bMat));
  }
  return g;
}

function buildDiamondOrSiO2Micro(withO) {
  const g = new THREE.Group(), a = 2.04;
  const frac = [...FCC_14, [0.25, 0.25, 0.25], [0.75, 0.75, 0.25], [0.75, 0.25, 0.75], [0.25, 0.75, 0.75]];
  const pts = frac.map(([u, v, w]) => new THREE.Vector3((u - 0.5) * a, (v - 0.5) * a, (w - 0.5) * a));
  const mGeo = new THREE.SphereGeometry(withO ? 0.145 : 0.165, 20, 16), oGeo = new THREE.SphereGeometry(0.1, 14, 12);
  const mMat = atomMat(withO ? CPK_STUDIO.Si : CPK_STUDIO.C, { roughness: 0.2 }), oMat = atomMat(CPK_STUDIO.O), bMat = bondMat();
  for (const p of pts) addAtom(g, mGeo, mMat, p);
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = pts[i].distanceTo(pts[j]);
    if (d < 0.1 || d > a * 0.48) continue;
    if (withO) {
      const mid = pts[i].clone().add(pts[j]).multiplyScalar(0.5);
      addAtom(g, oGeo, oMat, mid);
      g.add(makeBondCylinder(pts[i], mid, 0.034, bMat), makeBondCylinder(mid, pts[j], 0.034, bMat));
    } else g.add(makeBondCylinder(pts[i], pts[j], 0.044, bMat));
  }
  return g;
}

function buildGraphiteMicro() {
  const g = new THREE.Group(), L = 0.4, pts2D = [];
  const centers = [[0, 0], ...[0, 1, 2].map((k) => {
    const a = (k * 2 * Math.PI) / 3 + Math.PI / 6;
    return [Math.cos(a) * Math.sqrt(3) * L, Math.sin(a) * Math.sqrt(3) * L];
  })];
  for (const [cx, cz] of centers) for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3, x = cx + Math.cos(a) * L, z = cz + Math.sin(a) * L;
    if (!pts2D.some(([px, pz]) => Math.hypot(px - x, pz - z) < 0.05)) pts2D.push([x, z]);
  }
  const cGeo = new THREE.SphereGeometry(0.11, 16, 12), cMat = atomMat(CPK_STUDIO.C, { metalness: 0.35 }), bMat = bondMat();
  const haloMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
  const dashMat = new THREE.LineDashedMaterial({ color: 0x7dd3fc, dashSize: 0.09, gapSize: 0.08, transparent: true, opacity: 0.65 });
  const layers = [-0.86, 0, 0.86].map((y, li) => {
    const sx = li === 1 ? 0.14 : 0, halo = new THREE.Mesh(new THREE.CircleGeometry(1.18, 6), haloMat);
    halo.rotation.x = -Math.PI / 2; halo.position.set(sx, y, 0); g.add(halo);
    const vecs = pts2D.map(([x, z]) => new THREE.Vector3(x + sx, y, z));
    for (const v of vecs) addAtom(g, cGeo, cMat, v);
    for (let i = 0; i < vecs.length; i++) for (let j = i + 1; j < vecs.length; j++) {
      if (vecs[i].distanceTo(vecs[j]) < L * 1.12) g.add(makeBondCylinder(vecs[i], vecs[j], 0.032, bMat));
    }
    return vecs;
  });
  for (let li = 0; li < layers.length - 1; li++) for (let i = 0; i < 6; i += 2) {
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([layers[li][i], layers[li + 1][i]]), dashMat);
    ln.computeLineDistances(); g.add(ln);
  }
  return g;
}

function buildDryIceMicro() {
  const g = new THREE.Group(), a = 1.92;
  const cGeo = new THREE.SphereGeometry(0.115, 16, 12), oGeo = new THREE.SphereGeometry(0.095, 14, 12);
  const cMat = atomMat(CPK_STUDIO.C), oMat = atomMat(CPK_STUDIO.O), bMat = bondMat(0xcbd5e1);
  const dirs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((d) => new THREE.Vector3(...d).normalize());
  FCC_14.forEach(([u, v, w], idx) => {
    const di = idx < 8 ? 0 : idx < 10 ? 1 : idx < 12 ? 2 : 3;
    const c = new THREE.Vector3((u - 0.5) * a, (v - 0.5) * a, (w - 0.5) * a);
    const off = dirs[di].clone().multiplyScalar(0.24), p1 = c.clone().sub(off), p2 = c.clone().add(off);
    addAtom(g, cGeo, cMat, c); addAtom(g, oGeo, oMat, p1); addAtom(g, oGeo, oMat, p2);
    g.add(makeBondCylinder(p1, p2, 0.032, bMat));
  });
  addEdges(g, new THREE.BoxGeometry(a, a, a), 0x7dd3fc, 0.32);
  return g;
}

function buildIonicMicro(isCsCl) {
  const g = new THREE.Group(), bMat = bondMat(0x94a3b8, 0.45);
  const clGeo = new THREE.SphereGeometry(isCsCl ? 0.195 : 0.205, 18, 14), clMat = atomMat(CPK_STUDIO.Cl);
  if (!isCsCl) {
    const step = 0.74, naGeo = new THREE.SphereGeometry(0.145, 18, 14), naMat = atomMat(CPK_STUDIO.Na);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const isNa = (x + y + z + 6) % 2 === 0, p = [x * step, y * step, z * step];
      addAtom(g, isNa ? naGeo : clGeo, isNa ? naMat : clMat, p);
      if (x < 1) g.add(makeBondCylinder(p, [p[0] + step, p[1], p[2]], 0.024, bMat));
      if (y < 1) g.add(makeBondCylinder(p, [p[0], p[1] + step, p[2]], 0.024, bMat));
      if (z < 1) g.add(makeBondCylinder(p, [p[0], p[1], p[2] + step], 0.024, bMat));
    }
    return g;
  }
  const step = 0.9, csGeo = new THREE.SphereGeometry(0.175, 18, 14), csMat = atomMat(CPK_STUDIO.Cs);
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) addAtom(g, clGeo, clMat, [x * step, y * step, z * step]);
  for (const cx of [-0.5, 0.5]) for (const cy of [-0.5, 0.5]) for (const cz of [-0.5, 0.5]) {
    const p = [cx * step, cy * step, cz * step];
    addAtom(g, csGeo, csMat, p);
    for (const dx of [-0.5, 0.5]) for (const dy of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) {
      g.add(makeBondCylinder(p, [(cx + dx) * step, (cy + dy) * step, (cz + dz) * step], 0.02, bMat));
    }
  }
  return g;
}

const buildMicro = (kind) => (
  kind === 'quartz' ? buildSiONet(true)
    : kind === 'glass' ? buildSiONet(false)
      : kind === 'diamond' ? buildDiamondOrSiO2Micro(false)
        : kind === 'sio2' ? buildDiamondOrSiO2Micro(true)
          : kind === 'graphite' ? buildGraphiteMicro()
            : kind === 'dryice' ? buildDryIceMicro()
              : buildIonicMicro(kind === 'cscl')
);

export function mountCompare3DStage(spec, stageEl, actionbarEl, { onCaption, onDualLabels } = {}) {
  const left = { label: '天然水晶', sublabel: '晶体 · SiO₂', kind: 'quartz', ...(spec?.left || {}) };
  const right = { label: '石英玻璃', sublabel: '非晶体 · SiO₂', kind: 'glass', ...(spec?.right || {}) };

  const cinema = createCinemaStage(stageEl, {
    cameraPos: [0, 2.35, 9.2], target: [0, -0.04, 0], fov: 38, minDist: 4.5, maxDist: 20, floorY: FLOOR_Y,
  });

  const leftMac = buildMacro(left.kind), rightMac = buildMacro(right.kind);
  const leftMic = buildMicro(left.kind), rightMic = buildMicro(right.kind);
  leftMac.position.set(-SIDE_X, 0.06, 0); rightMac.position.set(SIDE_X, 0.06, 0);
  leftMic.position.set(-SIDE_X, 0.06, 0); rightMic.position.set(SIDE_X, 0.06, 0);
  cinema.root.add(leftMac, rightMac, leftMic, rightMic);
  for (const x of [-SIDE_X, SIDE_X]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.18, 1.24, 64), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, FLOOR_Y + 0.01, 0); cinema.root.add(ring);
  }

  const bar = actionbarEl || document.createElement('div');
  bar.innerHTML = `<div class="crystal-dock-group crystal-seg" role="group" aria-label="观察模式"><button type="button" class="crystal-seg-btn" data-mode="macro">宏观外形</button><button type="button" class="crystal-seg-btn" data-mode="micro">微观 3D 结构</button></div><div class="crystal-dock-group"><button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="spin">慢转</button><button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">复位</button></div>`;
  const modeBtns = bar.querySelectorAll('[data-mode]');
  const btnSpin = bar.querySelector('[data-act="spin"]'), btnReset = bar.querySelector('[data-act="reset"]');
  let mode = spec?.defaultMode === 'micro' ? 'micro' : 'macro', autoSpin = true, mix = mode === 'micro' ? 1 : 0;

  const applyMix = () => {
    const sMac = Math.max(0.001, 1 - mix), sMic = Math.max(0.001, mix);
    leftMac.visible = rightMac.visible = mix < 0.98; leftMic.visible = rightMic.visible = mix > 0.02;
    leftMac.scale.setScalar(sMac); rightMac.scale.setScalar(sMac); leftMic.scale.setScalar(sMic); rightMic.scale.setScalar(sMic);
  };
  const syncUi = () => {
    modeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
    btnSpin.classList.toggle('crystal-btn-primary', autoSpin); btnSpin.classList.toggle('crystal-btn-ghost', !autoSpin);
    const isMac = mode === 'macro';
    onDualLabels?.(isMac ? `${left.label} · ${left.sublabel}` : `${left.label} · ${MICRO_HINT[left.kind] || left.sublabel}`, isMac ? `${right.label} · ${right.sublabel}` : `${right.label} · ${MICRO_HINT[right.kind] || right.sublabel}`);
    onCaption?.(isMac ? `宏观外形对比 · 拖拽 360° 观察 ${left.label} 与 ${right.label} 的晶面形态` : '微观 3D 结构 · 透视内部微粒排列与化学键差异');
  };
  modeBtns.forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; syncUi(); }));
  btnSpin.addEventListener('click', () => { autoSpin = !autoSpin; syncUi(); });
  btnReset.addEventListener('click', () => { cinema.resetView(); for (const g of [leftMac, rightMac, leftMic, rightMic]) g.rotation.set(0, 0, 0); });
  applyMix(); syncUi();
  cinema.start((dt) => {
    mix += ((mode === 'micro' ? 1 : 0) - mix) * Math.min(1, dt * 7.5);
    applyMix();
    if (autoSpin) {
      const dy = dt * 0.45;
      leftMac.rotation.y += dy; rightMac.rotation.y += dy * 0.88; leftMic.rotation.y += dy; rightMic.rotation.y += dy;
    }
  });
  return { pause: cinema.pause, resume: cinema.resume, resize: cinema.resize, destroy() { cinema.dispose(); bar.innerHTML = ''; } };
}
