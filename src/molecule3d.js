import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ATOM_COLORS, ATOM_RADIUS } from './data/molecules.js';

const STEP_AZIMUTH = 0.22; // 水平旋转步进（弧度）
const STEP_POLAR = 0.16; // 俯仰步进
const ZOOM_IN = 0.88;
const ZOOM_OUT = 1.14;
const AUTO_SPEED = 1.15; // OrbitControls autoRotateSpeed

/** 读取主题 CSS 变量 --stage-3d-bg（与黑板黑青等同步） */
function readStageBgColor() {
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--stage-3d-bg')
      .trim();
    if (raw) return new THREE.Color(raw);
  } catch {
    /* ignore */
  }
  return new THREE.Color(0xffffff);
}

export function createMoleculeViewer(container) {
  const scene = new THREE.Scene();
  scene.background = readStageBgColor();

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(5.5, 3.4, 6.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'mol-label-layer';
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.inset = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2.5;
  controls.maxDistance = 24;
  controls.autoRotate = false;
  controls.autoRotateSpeed = AUTO_SPEED;

  scene.add(new THREE.AmbientLight(0xffffff, 0.78));
  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(5, 8, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x93c5fd, 0.35);
  fill.position.set(-4, -2, -3);
  scene.add(fill);

  const root = new THREE.Group();
  scene.add(root);

  let raf = 0;
  let ro = null;
  /** @type {CSS2DObject[]} */
  let labelObjs = [];
  let labelsVisible = true; // 标签可见性状态
  /** @type {{ target: THREE.Vector3, position: THREE.Vector3 } | null} */
  let homeView = null;

  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();

  function clearRoot() {
    for (const lab of labelObjs) {
      lab.element?.remove?.();
      if (lab.parent) lab.parent.remove(lab);
    }
    labelObjs = [];

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

  function makeBond(a, b, orderIndex = 0, orderTotal = 1) {
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
      const spread = 0.12;
      const t = orderIndex - (orderTotal - 1) / 2;
      bondOffset = perp.multiplyScalar(t * spread);
    }

    const geom = new THREE.CylinderGeometry(0.06, 0.06, len, 12);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.1,
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(mid).add(bondOffset);

    const axis = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, dir.clone().normalize());
    mesh.setRotationFromQuaternion(quaternion);
    return mesh;
  }

  function makeAtomLabel(el, radius) {
    const div = document.createElement('div');
    div.className = 'atom-label';
    div.textContent = el;
    const label = new CSS2DObject(div);
    label.position.set(0, radius + 0.12, 0);
    labelObjs.push(label);
    return label;
  }

  function saveHomeView() {
    homeView = {
      target: controls.target.clone(),
      position: camera.position.clone(),
    };
  }

  /** 绕目标点旋转（方位角 / 极角） */
  function orbitBy(dTheta, dPhi) {
    offset.copy(camera.position).sub(controls.target);
    spherical.setFromVector3(offset);
    spherical.theta += dTheta;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + dPhi, 0.08, Math.PI - 0.08);
    spherical.makeSafe();
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
    controls.update();
  }

  function zoomBy(factor) {
    offset.copy(camera.position).sub(controls.target);
    let dist = offset.length() * factor;
    dist = THREE.MathUtils.clamp(dist, controls.minDistance, controls.maxDistance);
    offset.setLength(dist);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  function resetView() {
    if (!homeView) return;
    controls.target.copy(homeView.target);
    camera.position.copy(homeView.position);
    camera.lookAt(controls.target);
    controls.update();
  }

  function setAutoRotate(on) {
    controls.autoRotate = Boolean(on);
    const btn = document.querySelector('.mol-ctrl[data-act="auto"]');
    if (btn) {
      btn.classList.toggle('is-on', controls.autoRotate);
      btn.setAttribute('aria-pressed', controls.autoRotate ? 'true' : 'false');
      btn.textContent = controls.autoRotate ? '慢转·开' : '慢转';
    }
  }

  function toggleLabels() {
    labelsVisible = !labelsVisible;
    labelRenderer.domElement.style.display = labelsVisible ? '' : 'none';
  }

  function runAct(act, fine = false) {
    const k = fine ? 0.55 : 1;
    switch (act) {
      case 'left':
        orbitBy(STEP_AZIMUTH * k, 0);
        break;
      case 'right':
        orbitBy(-STEP_AZIMUTH * k, 0);
        break;
      case 'up':
        orbitBy(0, -STEP_POLAR * k);
        break;
      case 'down':
        orbitBy(0, STEP_POLAR * k);
        break;
      case 'zoom-in':
        zoomBy(fine ? 0.96 : ZOOM_IN);
        break;
      case 'zoom-out':
        zoomBy(fine ? 1.04 : ZOOM_OUT);
        break;
      case 'reset':
        resetView();
        break;
      case 'auto':
        setAutoRotate(!controls.autoRotate);
        break;
      default:
        break;
    }
  }

  function bindControls() {
    const pad = document.getElementById('molControls');
    if (!pad || pad.dataset.bound === '1') return;
    pad.dataset.bound = '1';

    const holdable = new Set(['left', 'right', 'up', 'down', 'zoom-in', 'zoom-out']);
    let holdTimer = 0;
    let holdAct = null;

    const stopHold = () => {
      holdAct = null;
      window.clearTimeout(holdTimer);
      holdTimer = 0;
    };

    const startHold = (act) => {
      stopHold();
      holdAct = act;
      const loop = () => {
        if (!holdAct) return;
        runAct(holdAct, true);
        holdTimer = window.setTimeout(loop, 48);
      };
      holdTimer = window.setTimeout(loop, 320);
    };

    pad.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      e.preventDefault();
      const act = btn.dataset.act;
      runAct(act, false);
      if (holdable.has(act)) startHold(act);
    });
    pad.addEventListener('pointerup', stopHold);
    pad.addEventListener('pointerleave', stopHold);
    pad.addEventListener('pointercancel', stopHold);
  }

  function load(molecule) {
    clearRoot();
    if (!molecule || !molecule.atoms?.length) {
      resize();
      return;
    }

    const pairCount = new Map();
    for (const [i, j] of molecule.bonds) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      pairCount.set(key, (pairCount.get(key) || 0) + 1);
    }
    const pairSeen = new Map();

    for (const [i, j] of molecule.bonds) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      const total = pairCount.get(key) || 1;
      const seen = pairSeen.get(key) || 0;
      pairSeen.set(key, seen + 1);
      const a = molecule.atoms[i];
      const b = molecule.atoms[j];
      root.add(makeBond(a, b, seen, total));
    }

    for (const atom of molecule.atoms) {
      const color = ATOM_COLORS[atom.el] ?? ATOM_COLORS.default;
      const r = ATOM_RADIUS[atom.el] ?? ATOM_RADIUS.default;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 28, 28),
        new THREE.MeshStandardMaterial({
          color,
          metalness: 0.2,
          roughness: 0.35,
        }),
      );
      mesh.position.set(atom.x, atom.y, atom.z);
      const label = makeAtomLabel(atom.el, r);
      mesh.add(label);
      // 确保新标签遵循当前可见性状态
      if (!labelsVisible && label.element) {
        label.element.style.display = 'none';
      }
      root.add(mesh);
    }

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3()).length() || 2;
    const center = box.getCenter(new THREE.Vector3());
    const dist = Math.max(size * 1.85, 4.2);
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(dist * 0.72, dist * 0.48, dist * 0.9));
    controls.minDistance = Math.max(dist * 0.35, 2);
    controls.maxDistance = Math.max(dist * 4, 20);
    controls.update();
    saveHomeView();
    resize();
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (w < 2 || h < 2) return;

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    labelRenderer.setSize(w, h);
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  function syncBackground() {
    scene.background = readStageBgColor();
  }

  function onThemeChange() {
    syncBackground();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('chem-theme-change', onThemeChange);
  }

  function start() {
    bindControls();
    syncBackground();
    resize();
    if (!ro && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => resize());
      ro.observe(container);
    }
    cancelAnimationFrame(raf);
    requestAnimationFrame(() => {
      resize();
      animate();
    });
  }

  function stop() {
    cancelAnimationFrame(raf);
    // 切走页面时关掉慢转，避免回来突然转
    setAutoRotate(false);
  }

  function dispose() {
    stop();
    if (typeof window !== 'undefined') {
      window.removeEventListener('chem-theme-change', onThemeChange);
    }
    if (ro) {
      ro.disconnect();
      ro = null;
    }
    clearRoot();
    controls.dispose();
    renderer.dispose();
    canvas.remove();
    labelRenderer.domElement.remove();
  }

  return { load, resize, start, stop, dispose, setAutoRotate, toggleLabels, syncBackground };
}
