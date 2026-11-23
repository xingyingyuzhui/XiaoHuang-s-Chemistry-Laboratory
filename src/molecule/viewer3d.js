import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getViewerStyle, currentThemeId } from './viewer-style.js';
import {
  eachMaterial,
  disposeRootContents,
  describeBond,
  buildMoleculeScene,
  createIntroState,
  stepIntro,
} from './viewer3d-mesh.js';
import { AUTO_SPEED, createCameraControls } from './viewer3d-controls.js';

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

  const cameraControls = createCameraControls({ camera, controls });

  const ambient = new THREE.AmbientLight(0xffffff, 0.78);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(5, 8, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x93c5fd, 0.35);
  fill.position.set(-4, -2, -3);
  scene.add(fill);

  let style = getViewerStyle(currentThemeId());
  /** 环境反射贴图（光亮 / 哑光主题用），懒创建 */
  let envTex = null;
  function applySceneStyle() {
    if (style.environment) {
      if (!envTex) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
      }
      scene.environment = envTex;
      scene.environmentIntensity = style.envIntensity ?? 1;
    } else {
      scene.environment = null;
    }
    ambient.intensity = style.ambient;
    key.intensity = style.keyIntensity ?? 1.0;
    fill.intensity = style.fillIntensity ?? 0.35;
    // 光亮 / 哑光主题：电影级色调映射压住高光，白色原子不再过曝成纯白
    renderer.toneMapping = style.toneMapping ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = style.exposure ?? 1;
  }
  applySceneStyle();

  /** 载入动画：原子由中心向外依次长出，键在两端原子出现后伸出 */
  let intro = null;

  const root = new THREE.Group();
  scene.add(root);

  let raf = 0;
  let ro = null;
  let labelObjs = [];
  let labelsVisible = true; // 标签可见性状态
  /** @type {((info: object | null) => void) | null} */
  let bondSelectHandler = null;
  /** @type {((info: object | null) => void) | null} */
  let atomSelectHandler = null;
  /** @type {THREE.Mesh | null} */
  let selectedBondMesh = null;
  /** @type {THREE.Mesh | null} */
  let selectedAtomMesh = null;
  /** @type {THREE.Mesh[]} */
  let bondMeshes = [];
  /** @type {THREE.Mesh[]} */
  let atomMeshes = [];
  let currentMolecule = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function clearRoot() {
    disposeRootContents(root, labelObjs);
    labelObjs = [];
  }

  function clearBondHighlight() {
    eachMaterial(selectedBondMesh, (m) => m.emissive?.setHex?.(0x000000));
    selectedBondMesh = null;
  }

  function clearAtomHighlight() {
    if (selectedAtomMesh?.material) {
      selectedAtomMesh.scale.setScalar(1);
      selectedAtomMesh.material.emissive?.setHex?.(0x000000);
    }
    selectedAtomMesh = null;
  }

  function clearSelection() {
    clearBondHighlight();
    clearAtomHighlight();
  }

  function onPointerClick(event) {
    if (!atomMeshes.length && !bondMeshes.length) return;
    // 反应播放中不响应
    if (container.closest('.rxn-playing')) return;

    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    // 优先原子
    const atomHits = atomMeshes.length
      ? raycaster.intersectObjects(atomMeshes, false)
      : [];
    if (atomHits.length) {
      const mesh = atomHits[0].object;
      const idx = mesh.userData.atomIndex;
      clearSelection();
      selectedAtomMesh = mesh;
      // 高亮：略微放大 + 琥珀色 emissive
      mesh.scale.setScalar(1.12);
      if (mesh.material?.emissive) mesh.material.emissive.setHex(0xb45309);
      bondSelectHandler?.(null); // 清键卡
      atomSelectHandler?.({ atomIndex: idx });
      return;
    }

    // 其次键
    const bondHits = bondMeshes.length
      ? raycaster.intersectObjects(bondMeshes, false)
      : [];
    if (bondHits.length) {
      const mesh = bondHits[0].object;
      clearSelection();
      selectedBondMesh = mesh;
      // 选中键：整根发红光（保留两端原子色，便于看清是哪两个原子）
      eachMaterial(mesh, (m) => m.emissive?.setHex?.(0xbe123c));
      const info = describeBond(
        currentMolecule,
        mesh.userData.i,
        mesh.userData.j,
        mesh.userData.order || 1,
      );
      atomSelectHandler?.(null); // 清原子卡
      bondSelectHandler?.(info);
      return;
    }

    // 空白：清全部
    clearSelection();
    bondSelectHandler?.(null);
    atomSelectHandler?.(null);
  }

  function toggleLabels() {
    labelsVisible = !labelsVisible;
    labelRenderer.domElement.style.display = labelsVisible ? '' : 'none';
  }

  /**
   * @param {object} molecule
   * @param {{ keepCamera?: boolean, animate?: boolean }} [opts] 换主题时保留视角、不播载入动画
   */
  function load(molecule, opts = {}) {
    // 先清选中态与信息卡，再 dispose 网格（避免改已 dispose 的 material）
    clearSelection();
    bondSelectHandler?.(null);
    atomSelectHandler?.(null);
    clearRoot();
    bondMeshes = [];
    atomMeshes = [];
    intro = null;
    currentMolecule = molecule || null;
    if (!molecule || !molecule.atoms?.length) {
      resize();
      return;
    }

    const built = buildMoleculeScene(molecule, style, root, labelsVisible);
    bondMeshes = built.bondMeshes;
    atomMeshes = built.atomMeshes;
    labelObjs = built.labelObjs;

    if (!opts.keepCamera) {
      cameraControls.frameMolecule(built.center, built.size);
    }
    intro = createIntroState(
      atomMeshes,
      bondMeshes,
      labelObjs,
      built.center,
      opts.animate !== false,
    );
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

  function animate(now = performance.now()) {
    raf = requestAnimationFrame(animate);
    intro = stepIntro(intro, atomMeshes, bondMeshes, labelObjs, now);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  function syncBackground() {
    scene.background = readStageBgColor();
  }

  function onThemeChange() {
    syncBackground();
    // 换主题：换画风并保持当前视角，不重播载入动画
    style = getViewerStyle(currentThemeId());
    applySceneStyle();
    if (currentMolecule) load(currentMolecule, { keepCamera: true, animate: false });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('chem-theme-change', onThemeChange);
  }

  function setOnBondSelect(fn) {
    bondSelectHandler = typeof fn === 'function' ? fn : null;
  }

  function setOnAtomSelect(fn) {
    atomSelectHandler = typeof fn === 'function' ? fn : null;
  }

  function start() {
    cameraControls.bindControls();
    syncBackground();
    resize();
    if (!canvas.dataset.bondClick) {
      canvas.dataset.bondClick = '1';
      canvas.addEventListener('click', onPointerClick);
    }
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
    cameraControls.setAutoRotate(false);
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
    envTex?.dispose();
    controls.dispose();
    renderer.dispose();
    canvas.remove();
    labelRenderer.domElement.remove();
  }

  return {
    load,
    resize,
    start,
    stop,
    dispose,
    setAutoRotate: cameraControls.setAutoRotate,
    toggleLabels,
    syncBackground,
    setOnBondSelect,
    setOnAtomSelect,
    clearSelection,
  };
}
