/**
 * ChemRenderKit — Unified Cinema-Grade 3D Rendering Kit for ChemStage.
 * Deep-obsidian studio lighting, RoomEnvironment PMREM, floor reference disc,
 * OrbitControls damping, DPR<=2 ResizeObserver, and strict resource disposal.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const CPK_STUDIO = Object.freeze({
  C: 0x475569, O: 0xf43f5e, Si: 0x38bdf8, H: 0xf1f5f9,
  Cu: 0xe0824a, Na: 0xa78bfa, Cl: 0x34d399, Cs: 0xf59e0b,
  Fe: 0x94a3b8, Al: 0xcbd5e1,
});

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const TEX_KEYS = ['map', 'alphaMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'normalMap', 'bumpMap'];

function toVec3(p) {
  if (p instanceof THREE.Vector3) return p.clone();
  return Array.isArray(p)
    ? new THREE.Vector3(p[0] || 0, p[1] || 0, p[2] || 0)
    : new THREE.Vector3(p?.x || 0, p?.y || 0, p?.z || 0);
}

export function makeBondCylinder(p1, p2, radius = 0.045, mat = null) {
  const v1 = toVec3(p1), v2 = toVec3(p2);
  const dir = v2.clone().sub(v1);
  const len = Math.max(dir.length(), 1e-4);
  const geo = new THREE.CylinderGeometry(radius, radius, len, 12, 1);
  const material = mat || new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.25 });
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(v1).add(v2).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP_AXIS, dir.normalize());
  return mesh;
}

function buildFloorDisc(floorY) {
  const group = new THREE.Group();
  group.position.y = floorY;

  const size = 256;
  const cvs = document.createElement('canvas');
  cvs.width = size; cvs.height = size;
  const ctx = cvs.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(125, 211, 252, 0.95)');
    grad.addColorStop(0.38, 'rgba(56, 189, 248, 0.42)');
    grad.addColorStop(0.75, 'rgba(30, 58, 138, 0.14)');
    grad.addColorStop(1, 'rgba(11, 18, 34, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(6.8, 64),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cvs), transparent: true, opacity: 0.16, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  group.add(disc);

  for (const [inner, outer, op] of [[2.85, 2.885, 0.16], [5.15, 5.18, 0.1]]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 96),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    group.add(ring);
  }
  return group;
}

export function createCinemaStage(containerEl, opts = {}) {
  const {
    cameraPos = [0, 3.2, 10.5], target = [0, 0, 0], fov = 38,
    minDist = 4, maxDist = 24, autoRotate = false, floorY = -2.2,
  } = opts;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 140);
  camera.position.set(cameraPos[0], cameraPos[1], cameraPos[2]);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const canvas = renderer.domElement;
  canvas.className = 'crystal-webgl-canvas';
  canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none;';
  containerEl.appendChild(canvas);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = 0.85;

  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  const key = new THREE.DirectionalLight(0xfff7ed, 1.8);
  key.position.set(6, 9, 7);
  const rim = new THREE.DirectionalLight(0x7dd3fc, 0.95);
  rim.position.set(-7, 4, -6);
  const under = new THREE.DirectionalLight(0x93c5fd, 0.45);
  under.position.set(0, -6, 3);
  scene.add(ambient, key, rim, under, buildFloorDisc(floorY));

  const root = new THREE.Group();
  scene.add(root);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = minDist;
  controls.maxDistance = maxDist;
  controls.autoRotate = Boolean(autoRotate);
  controls.autoRotateSpeed = 0.85;
  controls.target.set(target[0], target[1], target[2]);
  controls.update();

  let rafId = 0, running = false, paused = false, destroyed = false;
  let lastTs = 0, elapsed = 0, tickFn = null;

  function resize() {
    if (destroyed || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const w = Math.max(240, Math.floor(rect.width || containerEl.clientWidth || 640));
    const h = Math.max(200, Math.floor(rect.height || containerEl.clientHeight || 420));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro && containerEl) ro.observe(containerEl);
  resize();

  function frame(ts) {
    if (destroyed || paused || !running) { rafId = 0; return; }
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts; elapsed += dt;
    if (tickFn) tickFn(dt, elapsed);
    controls.update();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }

  function start(onTick) {
    if (destroyed) return;
    tickFn = typeof onTick === 'function' ? onTick : null;
    running = true; paused = false; lastTs = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false; tickFn = null;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  function pause() {
    paused = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  function resume() {
    if (destroyed || !paused) return;
    paused = false;
    if (running && !rafId) { lastTs = 0; rafId = requestAnimationFrame(frame); }
  }

  function resetView() {
    if (destroyed) return;
    camera.position.set(cameraPos[0], cameraPos[1], cameraPos[2]);
    controls.target.set(target[0], target[1], target[2]);
    controls.update();
  }

  function dispose() {
    if (destroyed) return;
    destroyed = true;
    stop();
    ro?.disconnect();

    const geos = new Set(), mats = new Set(), texs = new Set();
    scene.traverse((obj) => {
      if (obj.geometry) geos.add(obj.geometry);
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of list) {
        if (!m) continue;
        mats.add(m);
        for (const k of TEX_KEYS) if (m[k]) texs.add(m[k]);
      }
    });
    texs.forEach((t) => t.dispose());
    mats.forEach((m) => m.dispose());
    geos.forEach((g) => g.dispose());

    scene.environment = null;
    envTex.dispose();
    controls.dispose();
    renderer.dispose();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  return { scene, camera, renderer, controls, root, start, stop, pause, resume, resize, resetView, dispose };
}
