/**
 * 电子排布 - 3D 渲染器
 * 原子核 + 壳层轨道环 + 沿环运动的电子（共面）
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SHELL_NAMES } from './data/electron-configs.js';

const STEP_AZIMUTH = 0.22;
const STEP_POLAR = 0.16;
const ZOOM_IN = 0.88;
const ZOOM_OUT = 1.14;
const AUTO_SPEED = 1.15;

/** 各壳层固定倾角（弧度），避免每次加载随机 */
const SHELL_TILTS = [
  { x: 0.0, z: 0.0 },
  { x: 0.38, z: 0.12 },
  { x: -0.28, z: 0.42 },
  { x: 0.22, z: -0.35 },
  { x: -0.4, z: 0.18 },
  { x: 0.15, z: 0.48 },
  { x: -0.18, z: -0.3 },
];

const SHELL_COLORS = [
  0xef4444, // K
  0x3b82f6, // L
  0x10b981, // M
  0xf59e0b, // N
  0x8b5cf6, // O
  0xec4899, // P
  0x06b6d4, // Q
];

const SHELL_RADIUS = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5];

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

export function createElectronViewer(container) {
  const scene = new THREE.Scene();
  scene.background = readStageBgColor();

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(8, 5, 10);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 3;
  controls.maxDistance = 30;
  controls.autoRotate = false;
  controls.autoRotateSpeed = AUTO_SPEED;

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(5, 8, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x93c5fd, 0.4);
  fill.position.set(-4, -2, -3);
  scene.add(fill);

  const root = new THREE.Group();
  scene.add(root);

  let raf = 0;
  let ro = null;
  let homeView = null;
  /** @type {THREE.Mesh[]} */
  let electrons = [];
  let currentElement = null;

  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();

  function disposeObject(obj) {
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
  }

  function clearRoot() {
    while (root.children.length) {
      const ch = root.children[0];
      root.remove(ch);
      disposeObject(ch);
    }
    electrons = [];
  }

  /**
   * 透明文字贴图：画布保持透明，避免 Sprite 出现白底方块
   */
  function makeTextTexture(text, { size = 128, fontPx = 64, fill = '#ffffff', stroke = 'rgba(0,0,0,0.35)' } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.font = `bold ${fontPx}px Arial, "Noto Sans SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (stroke) {
      ctx.lineWidth = Math.max(2, Math.round(fontPx / 14));
      ctx.strokeStyle = stroke;
      ctx.strokeText(text, size / 2, size / 2);
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, size / 2, size / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.premultiplyAlpha = true;
    texture.needsUpdate = true;
    return texture;
  }

  function createNucleus(z) {
    const group = new THREE.Group();

    const nucleusGeom = new THREE.SphereGeometry(0.5, 32, 32);
    const nucleusMat = new THREE.MeshStandardMaterial({
      color: 0xff6b6b,
      metalness: 0.3,
      roughness: 0.4,
      emissive: 0xff0000,
      emissiveIntensity: 0.1,
    });
    const nucleusMesh = new THREE.Mesh(nucleusGeom, nucleusMat);
    // 核本体正常写深度，环在核后方被球体遮挡是合理的
    group.add(nucleusMesh);

    // +Z 标签：透明底 + 不写深度，避免「白方块」挡住身后轨道
    const texture = makeTextTexture(`+${z}`, {
      size: 128,
      fontPx: 68,
      fill: '#ffffff',
      stroke: 'rgba(127, 29, 29, 0.55)',
    });
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        alphaTest: 0.05,
        sizeAttenuation: true,
      }),
    );
    sprite.scale.set(0.72, 0.72, 1);
    sprite.renderOrder = 2;
    group.add(sprite);

    return group;
  }

  /**
   * 轨道组：环与电子同属一组，共享固定倾角 → 电子必在环上
   * 本地坐标系：环在 XZ 平面（torus 默认 XY，再 rotX=π/2）
   * 电子本地运动：x = cosθ·r, y = 0, z = sinθ·r
   */
  function createShellGroup(radius, shellIndex, electronCount) {
    const group = new THREE.Group();
    const tilt = SHELL_TILTS[shellIndex] || { x: 0, z: 0 };
    group.rotation.x = tilt.x;
    group.rotation.z = tilt.z;

    // 轨道环（本地 XZ 平面）
    const orbitGeom = new THREE.TorusGeometry(radius, 0.025, 16, 96);
    const orbitMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.1,
      roughness: 0.6,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(orbitGeom, orbitMat);
    ring.rotation.x = Math.PI / 2;
    ring.renderOrder = 0;
    group.add(ring);

    // 层标签：透明底，不写深度
    const texture = makeTextTexture(SHELL_NAMES[shellIndex] || '', {
      size: 128,
      fontPx: 56,
      fill: '#475569',
      stroke: 'rgba(255,255,255,0.85)',
    });
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        alphaTest: 0.05,
        sizeAttenuation: true,
      }),
    );
    sprite.scale.set(0.48, 0.48, 1);
    sprite.position.set(radius + 0.35, 0.15, 0);
    sprite.renderOrder = 1;
    group.add(sprite);

    // 电子（与环共面：本地 XZ）
    const color = SHELL_COLORS[shellIndex % SHELL_COLORS.length];
    const baseSpeed = 0.55 + shellIndex * 0.12;

    for (let i = 0; i < electronCount; i++) {
      const angle0 = (i / electronCount) * Math.PI * 2;
      // 同层电子略不同速，避免完全重叠观感
      const speed = baseSpeed * (0.92 + (i % 3) * 0.06);

      const electronGeom = new THREE.SphereGeometry(0.14, 16, 16);
      const electronMat = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.2,
        roughness: 0.3,
        emissive: color,
        emissiveIntensity: 0.28,
      });
      const electron = new THREE.Mesh(electronGeom, electronMat);

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 12, 12),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        }),
      );
      electron.add(glow);

      electron.userData = { radius, angle0, speed };
      // 初始位置在环上
      electron.position.set(
        Math.cos(angle0) * radius,
        0,
        Math.sin(angle0) * radius,
      );
      group.add(electron);
      electrons.push(electron);
    }

    return group;
  }

  function load(element) {
    clearRoot();
    currentElement = element || null;
    if (!element) {
      resize();
      return;
    }

    root.add(createNucleus(element.z));

    const shells = element.electrons || [];
    shells.forEach((count, shellIndex) => {
      if (!count) return;
      const radius = SHELL_RADIUS[shellIndex] || (shellIndex + 1) * 1.5;
      root.add(createShellGroup(radius, shellIndex, count));
    });

    // 相机：按最外层半径适配
    let maxR = 1.5;
    for (let i = shells.length - 1; i >= 0; i--) {
      if (shells[i] > 0) {
        maxR = SHELL_RADIUS[i] || (i + 1) * 1.5;
        break;
      }
    }
    const dist = Math.max(maxR * 2.6, 6);
    controls.target.set(0, 0, 0);
    camera.position.set(dist * 0.75, dist * 0.48, dist * 0.85);
    controls.minDistance = dist * 0.28;
    controls.maxDistance = dist * 3.2;
    controls.update();
    saveHomeView();
    resize();
  }

  function saveHomeView() {
    homeView = {
      target: controls.target.clone(),
      position: camera.position.clone(),
    };
  }

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
    const btn = document.querySelector('#electronControls .mol-ctrl[data-act="auto"]');
    if (btn) {
      btn.classList.toggle('is-on', controls.autoRotate);
      btn.setAttribute('aria-pressed', controls.autoRotate ? 'true' : 'false');
      btn.textContent = controls.autoRotate ? '慢转·开' : '慢转';
    }
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
    const pad = document.getElementById('electronControls');
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
  }

  function animate(time) {
    raf = requestAnimationFrame(animate);
    controls.update();

    // 电子沿本地 XZ 环运动（与 torus 共面）
    const t = (time || 0) * 0.001;
    electrons.forEach((electron) => {
      const { radius, angle0, speed } = electron.userData;
      const a = angle0 + t * speed;
      electron.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    });

    renderer.render(scene, camera);
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
      raf = requestAnimationFrame(animate);
    });
  }

  function stop() {
    cancelAnimationFrame(raf);
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
  }

  function getCurrentElement() {
    return currentElement;
  }

  return {
    load,
    resize,
    start,
    stop,
    dispose,
    setAutoRotate,
    getCurrentElement,
    syncBackground,
  };
}
