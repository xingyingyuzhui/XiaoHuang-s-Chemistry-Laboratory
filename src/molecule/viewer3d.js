import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ATOM_COLORS, ATOM_RADIUS } from '../data/molecules.js';
import { getViewerStyle, getShadowTexture, currentThemeId } from './viewer-style.js';

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** 带回弹的缓出：原子「长出来」时略微超过再落定 */
function easeOutBack(u) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
}

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

  const ambient = new THREE.AmbientLight(0xffffff, 0.78);
  scene.add(ambient);
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
    } else {
      scene.environment = null;
    }
    ambient.intensity = style.ambient;
  }
  applySceneStyle();
  /** 载入动画：原子由中心向外依次长出，键在两端原子出现后伸出 */
  let intro = null;
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

  /** 背面外扩一圈纯色网格做描边（文具墨线 / 黑板粉笔 / 像素硬边） */
  function addOutline(mesh, geometry, sx, sy, sz) {
    if (!style.outline) return;
    const o = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: style.outline.color, side: THREE.BackSide }),
    );
    o.scale.set(sx, sy, sz);
    o.userData.isOutline = true;
    mesh.add(o);
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
      const ca = ATOM_COLORS[a.el] ?? ATOM_COLORS.default;
      const cb = ATOM_COLORS[b.el] ?? ATOM_COLORS.default;
      mesh = new THREE.Mesh(geom, [style.bondMaterial(ca, a.el), style.bondMaterial(cb, b.el)]);
    } else {
      const geom = style.bondGeometry(len).scale(r / style.bondRadius, 1, r / style.bondRadius);
      mesh = new THREE.Mesh(geom, style.bondMaterial(style.neutralBond, ''));
    }
    mesh.position.copy(mid).add(bondOffset);
    if (style.outline) {
      const k = (r + style.outline.width) / r;
      addOutline(mesh, mesh.geometry, k, 1, k);
    }

    const axis = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, dir.clone().normalize());
    mesh.setRotationFromQuaternion(quaternion);
    return mesh;
  }

  /** 材质可能是数组（双色键） */
  function eachMaterial(mesh, fn) {
    const m = mesh?.material;
    if (!m) return;
    (Array.isArray(m) ? m : [m]).forEach(fn);
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

  function describeBond(i, j, order) {
    const atoms = currentMolecule?.atoms || [];
    const a = atoms[i];
    const b = atoms[j];
    const elA = a?.el || '?';
    const elB = b?.el || '?';
    const orderName =
      order >= 3 ? '三键' : order === 2 ? '双键' : '单键';
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
    currentMolecule = molecule || null;
    if (!molecule || !molecule.atoms?.length) {
      resize();
      return;
    }

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
      const mesh = makeBond(a, b, seen, total);
      mesh.userData = { isBond: true, i, j, order: total };
      bondMeshes.push(mesh);
      root.add(mesh);
    }

    for (let ai = 0; ai < molecule.atoms.length; ai++) {
      const atom = molecule.atoms[ai];
      const color = ATOM_COLORS[atom.el] ?? ATOM_COLORS.default;
      const r = ATOM_RADIUS[atom.el] ?? ATOM_RADIUS.default;
      const geom = style.atomGeometry(r);
      const mesh = new THREE.Mesh(geom, style.atomMaterial(color, atom.el));
      mesh.position.set(atom.x, atom.y, atom.z);
      if (style.outline) {
        const k = (r + style.outline.width) / r;
        addOutline(mesh, geom, k, k, k);
      }
      mesh.userData = { isAtom: true, atomIndex: ai };
      const label = makeAtomLabel(atom.el, r);
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
      const span = Math.max(ext.x, ext.z, 1.2) * 1.5;
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

    if (!opts.keepCamera) {
      const dist = Math.max(size * 1.85, 4.2);
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(dist * 0.72, dist * 0.48, dist * 0.9));
      controls.minDistance = Math.max(dist * 0.35, 2);
      controls.maxDistance = Math.max(dist * 4, 20);
      controls.update();
      saveHomeView();
    }
    startIntro(center, opts.animate !== false);
    resize();
  }

  /** 原子按到中心的距离排序依次长出；键在两端都出现后沿长度伸出；标签随原子淡入 */
  function startIntro(center, enabled) {
    intro = null;
    if (!enabled || prefersReducedMotion() || !atomMeshes.length) return;
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
    intro = { t0: performance.now(), delay, atomDur: 420, bondDur: 260 };
  }

  function tickIntro(now) {
    if (!intro) return;
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
      intro = null;
    }
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
    tickIntro(now);
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
    bindControls();
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
    setAutoRotate,
    toggleLabels,
    syncBackground,
    setOnBondSelect,
    setOnAtomSelect,
    clearSelection,
  };
}
