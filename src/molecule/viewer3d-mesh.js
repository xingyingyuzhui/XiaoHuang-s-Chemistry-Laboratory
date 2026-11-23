import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ATOM_COLORS, ATOM_RADIUS } from '../data/molecules.js';
import { getShadowTexture } from './viewer-style.js';

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** 带回弹的缓出：原子「长出来」时略微超过再落定 */
function easeOutBack(u) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
}

/** 材质可能是数组（双色键） */
export function eachMaterial(mesh, fn) {
  const m = mesh?.material;
  if (!m) return;
  (Array.isArray(m) ? m : [m]).forEach(fn);
}

export function disposeRootContents(root, labelObjs) {
  for (const lab of labelObjs) {
    lab.element?.remove?.();
    if (lab.parent) lab.parent.remove(lab);
  }

  while (root.children.length) {
    const ch = root.children[0];
    root.remove(ch);
    ch.traverse((obj) => {
      if (obj.isCSS2DObject) {
        obj.element?.remove?.();
        return;
      }
      obj.geometry?.dispose?.();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material?.dispose?.();
    });
  }
}

function colorOf(style, el) {
  if (el === 'H' && style.hydrogen != null) return style.hydrogen;
  return ATOM_COLORS[el] ?? ATOM_COLORS.default;
}

/** 背面外扩一圈纯色网格做描边（文具墨线 / 黑板粉笔 / 像素硬边） */
function addOutline(style, mesh, geometry, sx, sy, sz) {
  if (!style.outline) return;
  const o = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: style.outline.color, side: THREE.BackSide }),
  );
  o.scale.set(sx, sy, sz);
  o.userData.isOutline = true;
  mesh.add(o);
}

function makeBond(style, a, b, orderIndex = 0, orderTotal = 1) {
  const start = new THREE.Vector3(a.x, a.y, a.z);
  const end = new THREE.Vector3(b.x, b.y, b.z);
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length() || 0.01;
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

  let bondOffset = new THREE.Vector3(0, 0, 0);
  if (orderTotal > 1) {
    const n = dir.clone().normalize();
    let perp = new THREE.Vector3(0, 1, 0);
    if (Math.abs(n.dot(perp)) > 0.9) perp = new THREE.Vector3(1, 0, 0);
    perp = perp.cross(n).normalize();
    const spread = style.bondRadius * 2.6;
    const t = orderIndex - (orderTotal - 1) / 2;
    bondOffset = perp.multiplyScalar(t * spread);
  }

  // 双色键：靠近哪个原子的那一半用哪个原子的颜色（-y 半段朝 a）
  let mesh;
  const r = orderTotal > 1 ? style.bondRadius * 0.75 : style.bondRadius;
  if (style.twoToneBonds) {
    const half = len / 2;
    const ga = style.bondGeometry(half).scale(r / style.bondRadius, 1, r / style.bondRadius).translate(0, -half / 2, 0);
    const gb = style.bondGeometry(half).scale(r / style.bondRadius, 1, r / style.bondRadius).translate(0, half / 2, 0);
    const geom = mergeGeometries([ga, gb], true);
    ga.dispose();
    gb.dispose();
    const ca = colorOf(style, a.el);
    const cb = colorOf(style, b.el);
    mesh = new THREE.Mesh(geom, [style.bondMaterial(ca, a.el), style.bondMaterial(cb, b.el)]);
  } else {
    const geom = style.bondGeometry(len).scale(r / style.bondRadius, 1, r / style.bondRadius);
    mesh = new THREE.Mesh(geom, style.bondMaterial(style.neutralBond, ''));
  }
  mesh.position.copy(mid).add(bondOffset);
  if (style.outline) {
    const k = (r + style.outline.width) / r;
    addOutline(style, mesh, mesh.geometry, k, 1, k);
  }

  const axis = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, dir.clone().normalize());
  mesh.setRotationFromQuaternion(quaternion);
  return mesh;
}

function makeAtomLabel(el, radius, labelObjs) {
  const div = document.createElement('div');
  div.className = 'atom-label';
  div.textContent = el;
  const label = new CSS2DObject(div);
  label.position.set(0, radius + 0.12, 0);
  labelObjs.push(label);
  return label;
}

export function describeBond(molecule, i, j, order) {
  const atoms = molecule?.atoms || [];
  const a = atoms[i];
  const b = atoms[j];
  const elA = a?.el || '?';
  const elB = b?.el || '?';
  const orderName = order >= 3 ? '三键' : order === 2 ? '双键' : '单键';
  const metal = new Set(['Na', 'K', 'Mg', 'Ca', 'Fe', 'Al']);
  let kind = '共价键（中学简化）';
  if (metal.has(elA) || metal.has(elB)) kind = '可能含离子/金属特性（示意）';
  let tip = `${elA}—${elB} ${orderName}。`;
  if (order === 2) tip += '双键中含 σ 与 π（示意），加成常发生在双键。';
  else if (order >= 3) tip += '三键不饱和度更高，可发生多步加成。';
  else tip += '单键以 σ 键为主，可旋转（示意）。';
  return {
    i,
    j,
    order,
    elA,
    elB,
    orderName,
    kind,
    tip,
    label: `${elA}—${elB} · ${orderName}`,
  };
}

export function buildMoleculeScene(molecule, style, root, labelsVisible) {
  const bondMeshes = [];
  const atomMeshes = [];
  const labelObjs = [];

  const pairCount = new Map();
  for (const [i, j] of molecule.bonds || []) {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    pairCount.set(key, (pairCount.get(key) || 0) + 1);
  }
  const pairSeen = new Map();

  for (const [i, j] of molecule.bonds || []) {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    const total = pairCount.get(key) || 1;
    const seen = pairSeen.get(key) || 0;
    pairSeen.set(key, seen + 1);
    const a = molecule.atoms[i];
    const b = molecule.atoms[j];
    const mesh = makeBond(style, a, b, seen, total);
    mesh.userData = { isBond: true, i, j, order: total };
    bondMeshes.push(mesh);
    root.add(mesh);
  }

  for (let ai = 0; ai < molecule.atoms.length; ai++) {
    const atom = molecule.atoms[ai];
    const color = colorOf(style, atom.el);
    const r = ATOM_RADIUS[atom.el] ?? ATOM_RADIUS.default;
    const geom = style.atomGeometry(r);
    const mesh = new THREE.Mesh(geom, style.atomMaterial(color, atom.el));
    mesh.position.set(atom.x, atom.y, atom.z);
    if (style.outline) {
      const k = (r + style.outline.width) / r;
      addOutline(style, mesh, geom, k, k, k);
    }
    mesh.userData = { isAtom: true, atomIndex: ai };
    const label = makeAtomLabel(atom.el, r, labelObjs);
    mesh.add(label);
    // 确保新标签遵循当前可见性状态
    if (!labelsVisible && label.element) {
      label.element.style.display = 'none';
    }
    atomMeshes.push(mesh);
    root.add(mesh);
  }

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()).length() || 2;
  const center = box.getCenter(new THREE.Vector3());

  // 地面软阴影：托住分子，不随视角转
  if (style.shadow) {
    const ext = box.getSize(new THREE.Vector3());
    const span = Math.max(ext.x, ext.z, 1) * 1.15;
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(span, span),
      new THREE.MeshBasicMaterial({
        map: getShadowTexture(style.shadow.hard),
        color: 0x000000,
        transparent: true,
        opacity: style.shadow.opacity,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(center.x, box.min.y - 0.45, center.z);
    shadow.userData.isShadow = true;
    shadow.renderOrder = -1;
    root.add(shadow);
  }

  return { atomMeshes, bondMeshes, labelObjs, size, center };
}

/** 原子按到中心的距离排序依次长出；键在两端都出现后沿长度伸出；标签随原子淡入 */
export function createIntroState(atomMeshes, bondMeshes, labelObjs, center, enabled) {
  if (!enabled || prefersReducedMotion() || !atomMeshes.length) return null;
  const order = atomMeshes
    .map((m, i) => ({ i, d: m.position.distanceTo(center) }))
    .sort((a, b) => a.d - b.d);
  const step = Math.min(55, 700 / Math.max(1, atomMeshes.length));
  const delay = new Array(atomMeshes.length);
  order.forEach((o, rank) => {
    delay[o.i] = rank * step;
  });
  atomMeshes.forEach((m) => m.scale.setScalar(0.001));
  bondMeshes.forEach((m) => m.scale.set(1, 0.001, 1));
  labelObjs.forEach((l) => {
    if (l.element) l.element.style.opacity = '0';
  });
  return { t0: performance.now(), delay, atomDur: 420, bondDur: 260 };
}

export function stepIntro(intro, atomMeshes, bondMeshes, labelObjs, now) {
  if (!intro) return null;
  const t = now - intro.t0;
  let done = true;
  atomMeshes.forEach((m, i) => {
    const u = Math.min(1, Math.max(0, (t - intro.delay[i]) / intro.atomDur));
    if (u < 1) done = false;
    m.scale.setScalar(Math.max(0.001, u <= 0 ? 0 : easeOutBack(u)));
    const label = m.children.find((c) => c.isCSS2DObject);
    if (label?.element) label.element.style.opacity = String(Math.min(1, Math.max(0, (u - 0.5) * 2)));
  });
  bondMeshes.forEach((m) => {
    const { i, j } = m.userData;
    const startAt = Math.max(intro.delay[i] ?? 0, intro.delay[j] ?? 0) + intro.atomDur * 0.6;
    const u = Math.min(1, Math.max(0, (t - startAt) / intro.bondDur));
    if (u < 1) done = false;
    m.scale.set(1, Math.max(0.001, 1 - Math.pow(1 - u, 3)), 1);
  });
  if (done) {
    labelObjs.forEach((l) => {
      if (l.element) l.element.style.opacity = '';
    });
    return null;
  }
  return intro;
}
