/**
 * 模块 01 · 认识晶体：Demo 6（从金属铜晶体到单个 FCC 晶胞，再无隙并置拼回）
 * 使用 Three.js + OrbitControls 实现真实 3D 交互演示。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const STAGE_BG = 0x0d1322;
const CELL_SIZE = 1.8;

// 面心立方（FCC）单个晶胞的 14 个格点（8 顶点 + 6 面心，归一化坐标 [-0.5, 0.5]）
const FCC_SITES = [
  [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
  [0, 0, -0.5], [0, 0, 0.5], [0, -0.5, 0], [0, 0.5, 0], [-0.5, 0, 0], [0.5, 0, 0],
];

export function mountUnitCellDemo({ stageEl, controlsEl, setCaption, setLegend }) {
  setLegend([
    { label: 'Cu 原子（提取晶胞）', color: '#f59e0b' },
    { label: 'Cu 原子（周围晶胞）', color: '#d97757' },
    { label: '晶胞边界', color: '#38bdf8' },
  ]);

  controlsEl.innerHTML = `
    <div class="crystal-exam-tabs" role="group" aria-label="演示步骤">
      <button type="button" class="crystal-exam-tab is-active" data-step="bulk">1.整块晶体</button>
      <button type="button" class="crystal-exam-tab" data-step="extract">2.提取晶胞</button>
      <button type="button" class="crystal-exam-tab" data-step="tile">3.无隙拼回</button>
    </div>
    <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-full" data-act="auto">
      自动演示全流程
    </button>
    <div class="crystal-slice-actions">
      <button type="button" class="crystal-btn crystal-btn-ghost" data-act="wire">隐藏晶胞框</button>
      <button type="button" class="crystal-btn crystal-btn-ghost" data-act="reset">重置视角</button>
    </div>
    <div class="crystal-exam-body">
      <div class="crystal-exam-metric">
        <span class="crystal-exam-k">单 FCC 晶胞铜原子数</span>
        <span class="crystal-exam-v">4 个</span>
      </div>
      <p class="crystal-exam-formula">8 × 1/8 (顶点) + 6 × 1/2 (面心) = 4</p>
      <p class="crystal-exam-desc">晶胞是晶体中最小的基本重复单元，沿三维方向<strong>无隙并置</strong>（平移不旋转）即可拼成整块晶体。</p>
    </div>
  `;

  const stepBtns = controlsEl.querySelectorAll('[data-step]');
  const btnAuto = controlsEl.querySelector('[data-act="auto"]');
  const btnWire = controlsEl.querySelector('[data-act="wire"]');
  const btnReset = controlsEl.querySelector('[data-act="reset"]');

  // Three.js 场景、相机与渲染器
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STAGE_BG);

  const rect = stageEl.getBoundingClientRect();
  const initW = Math.max(320, Math.floor(rect.width || 640));
  const initH = Math.max(280, Math.floor(rect.height || 420));

  const camera = new THREE.PerspectiveCamera(42, initW / initH, 0.1, 60);
  camera.position.set(5.4, 4.1, 6.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(initW, initH);
  renderer.domElement.className = 'crystal-webgl-canvas';
  stageEl.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3.2;
  controls.maxDistance = 16;

  // 三点布光呈现金属铜质感
  scene.add(new THREE.AmbientLight(0xdbeafe, 0.65));
  const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.85);
  keyLight.position.set(6, 9, 7);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.85);
  rimLight.position.set(-7, -4, -6);
  scene.add(rimLight);

  const sphereGeo = new THREE.SphereGeometry(0.27, 22, 18);
  const boxEdgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE));

  const heroMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.72,
    roughness: 0.24,
    emissive: 0x78350f,
    emissiveIntensity: 0.28,
  });
  const peerMat = new THREE.MeshStandardMaterial({
    color: 0xd97757,
    metalness: 0.68,
    roughness: 0.3,
    transparent: true,
    opacity: 1,
  });
  const heroWireMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.95 });
  const peerWireMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.32 });

  const rootGroup = new THREE.Group();
  scene.add(rootGroup);

  const cells = [];
  let peerOrder = 0;

  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      for (let iz = 0; iz < 2; iz++) {
        const isHero = ix === 1 && iy === 1 && iz === 1;
        const group = new THREE.Group();
        const home = new THREE.Vector3(
          (ix - 0.5) * CELL_SIZE,
          (iy - 0.5) * CELL_SIZE,
          (iz - 0.5) * CELL_SIZE,
        );
        const explode = home.clone().normalize().multiplyScalar(CELL_SIZE * 2.35);

        for (const [fx, fy, fz] of FCC_SITES) {
          const mesh = new THREE.Mesh(sphereGeo, isHero ? heroMat : peerMat);
          mesh.position.set(fx * CELL_SIZE, fy * CELL_SIZE, fz * CELL_SIZE);
          group.add(mesh);
        }
        const wire = new THREE.LineSegments(boxEdgesGeo, isHero ? heroWireMat : peerWireMat);
        group.add(wire);

        group.position.copy(home);
        rootGroup.add(group);
        cells.push({
          isHero,
          group,
          wire,
          home,
          explode,
          order: isHero ? 0 : ++peerOrder,
        });
      }
    }
  }

  let step = 'bulk'; // 'bulk' | 'extract' | 'tile'
  let showWire = true;
  let autoPlay = false;
  let autoTimer = 0;
  let tileProgress = 0;
  let paused = false;
  let rafId = 0;

  function setStep(nextStep, fromAuto = false) {
    step = nextStep;
    if (!fromAuto) autoPlay = false;
    if (nextStep === 'tile') {
      // 从提取态开始平滑无隙拼回
      tileProgress = 0;
      for (const c of cells) {
        c.group.position.copy(c.isHero ? new THREE.Vector3(0, 0, 0) : c.explode);
      }
      peerMat.opacity = 0.2;
    }
    syncUi();
  }

  function syncUi() {
    stepBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.step === step));
    btnAuto.textContent = autoPlay ? '停止自动演示' : '自动演示全流程';
    btnWire.textContent = showWire ? '隐藏晶胞框' : '显示晶胞框';
    if (step === 'bulk') {
      setCaption('① 金属铜（Cu）晶体：2×2×2 面心立方阵列，拖拽可 360° 观察长程周期性');
    } else if (step === 'extract') {
      setCaption('② 提取单个 FCC 晶胞：8 个顶点 + 6 个面心铜原子，构成最小重复单元');
    } else {
      setCaption('③ 无隙并置拼回：晶胞沿三维坐标轴平移、不旋转、不留空隙，拼出整块晶体');
    }
  }

  stepBtns.forEach((b) => b.addEventListener('click', () => setStep(b.dataset.step)));
  btnAuto.addEventListener('click', () => {
    autoPlay = !autoPlay;
    autoTimer = 0;
    if (autoPlay) setStep('bulk', true);
    else syncUi();
  });
  btnWire.addEventListener('click', () => {
    showWire = !showWire;
    cells.forEach((c) => {
      c.wire.visible = showWire;
    });
    syncUi();
  });
  btnReset.addEventListener('click', () => {
    camera.position.set(5.4, 4.1, 6.2);
    controls.target.set(0, 0, 0);
    controls.update();
  });

  function resize() {
    const r = stageEl.getBoundingClientRect();
    const w = Math.max(320, Math.floor(r.width || 640));
    const h = Math.max(280, Math.floor(r.height || 420));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(stageEl);

  const originVec = new THREE.Vector3(0, 0, 0);

  function frame() {
    if (paused) return;

    if (autoPlay) {
      autoTimer += 1;
      if (autoTimer === 130) setStep('extract', true);
      else if (autoTimer === 280) setStep('tile', true);
      else if (autoTimer >= 460) {
        autoTimer = 0;
        setStep('bulk', true);
      }
    }

    rootGroup.rotation.y += 0.0032;

    if (step === 'bulk') {
      peerMat.opacity += (1 - peerMat.opacity) * 0.08;
      peerWireMat.opacity += (0.32 - peerWireMat.opacity) * 0.08;
      for (const c of cells) {
        c.group.visible = true;
        c.group.position.lerp(c.home, 0.09);
      }
    } else if (step === 'extract') {
      peerMat.opacity += (0.04 - peerMat.opacity) * 0.08;
      peerWireMat.opacity += (0.04 - peerWireMat.opacity) * 0.08;
      for (const c of cells) {
        if (c.isHero) {
          c.group.visible = true;
          c.group.position.lerp(originVec, 0.09);
        } else {
          c.group.position.lerp(c.explode, 0.07);
          c.group.visible = peerMat.opacity > 0.06;
        }
      }
    } else if (step === 'tile') {
      tileProgress = Math.min(1, tileProgress + 0.009);
      peerMat.opacity += (1 - peerMat.opacity) * 0.06;
      peerWireMat.opacity += (0.34 - peerWireMat.opacity) * 0.06;
      for (const c of cells) {
        c.group.visible = true;
        if (c.isHero) {
          c.group.position.lerp(c.home, 0.08);
        } else {
          const delay = (c.order - 1) * 0.09;
          const localT = Math.max(0, Math.min(1, (tileProgress - delay) / 0.35));
          const ease = 1 - Math.pow(1 - localT, 3);
          c.group.position.lerpVectors(c.explode, c.home, ease);
        }
      }
    }

    controls.update();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }

  syncUi();
  rafId = requestAnimationFrame(frame);

  return {
    pause() {
      paused = true;
      cancelAnimationFrame(rafId);
    },
    resume() {
      if (!paused) return;
      paused = false;
      rafId = requestAnimationFrame(frame);
    },
    resize,
    destroy() {
      paused = true;
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      controls.dispose();
      sphereGeo.dispose();
      boxEdgesGeo.dispose();
      heroMat.dispose();
      peerMat.dispose();
      heroWireMat.dispose();
      peerWireMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
