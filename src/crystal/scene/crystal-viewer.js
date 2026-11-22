/**
 * 3D 晶胞交互渲染引擎主外壳（Three.js + OrbitControls）
 * 与 3D 分子共用 viewer-style.js 5 主题渲染体系，监听 <html data-theme> 实时切换画风。
 */

import * as THREE from 'three';
import { getViewerStyle, currentThemeId } from '../../molecule/viewer-style.js';
import {
  CELL_SCALE, createStudioStage, observeCrystalTheme, createGroundShadow,
  buildNormalCellGroup, computeCrystalFraming, disposeObjectTree, disposeGroupWithExtras,
} from './scene-helpers.js';
import { createBadgeLayer } from './badge-layer.js';
import { buildSlicedCellGroup, applyExplodeTransform, sanitizeCrystalRadii } from './slicer-caps.js';
import { createSupercellTiler } from './supercell-tiler.js';
import {
  buildCoordinationOverlay, buildDistanceOverlay, updateOverlayBillboards,
} from './exam-overlays.js';

export { CELL_SCALE };
const HOME_CAM_DIR = new THREE.Vector3(0.68, 0.52, 0.78).normalize();

export function createCrystalViewer(container) {
  const { scene, camera, renderer, canvas, controls, applyStyle, disposeEnv } = createStudioStage(container);
  const badges = createBadgeLayer(container);

  const sharedUnitSphere = new THREE.SphereGeometry(1, 36, 26);
  const sharedUnitBox = new THREE.BoxGeometry(1.3, 1.3, 1.3);
  const sharedRingGeom = new THREE.TorusGeometry(1, 0.08, 12, 36);
  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

  let activeTheme = currentThemeId();
  let style = getViewerStyle(activeTheme);
  let shadowMesh = null;
  let currentCrystal = null;
  let displayMode = 'ball-stick';
  let sliced = false, exploded = false, tileCount = 1, overlay = 'none', showFrame = true;
  let explodeProgress = 0, targetExplode = 0;
  let singleCellGroup = null, sliceState = null, overlayGroup = null, cameraLerp = null;
  let rafId = 0, running = false, lastTime = 0, pulsePhase = 0, disposed = false;
  let lastFramedDist = 0, hasFramedOnce = false;
  const camOffset = new THREE.Vector3();
  const camSpherical = new THREE.Spherical();

  const tiler = createSupercellTiler({
    worldRoot, sharedUnitSphere, sharedUnitBox, addBadge: badges.add, clearBadges: badges.clear,
  });

  function syncGroundShadow() {
    if (shadowMesh) { disposeObjectTree(shadowMesh); scene.remove(shadowMesh); shadowMesh = null; }
    const span = CELL_SCALE * (tileCount > 1 ? 1.65 + Math.sqrt(tileCount - 1) * 0.55 : 1.55);
    shadowMesh = createGroundShadow(style, span, -CELL_SCALE * (tileCount > 1 ? 0.92 : 0.78));
    if (shadowMesh) scene.add(shadowMesh);
  }

  function clearActiveMeshes() {
    if (singleCellGroup) { disposeGroupWithExtras(singleCellGroup); worldRoot.remove(singleCellGroup); singleCellGroup = null; sliceState = null; }
    if (overlayGroup) { disposeGroupWithExtras(overlayGroup); worldRoot.remove(overlayGroup); overlayGroup = null; }
    badges.clear('slice'); badges.clear('overlay');
  }

  function isAtDefaultZoom() {
    if (cameraLerp || !lastFramedDist) return true;
    return Math.abs(camera.position.distanceTo(controls.target) - lastFramedDist) <= lastFramedDist * 0.15;
  }

  function syncFraming(count = tileCount) {
    const f = computeCrystalFraming(currentCrystal, camera, { tileCount: count, displayMode });
    controls.minDistance = f.minDistance;
    controls.maxDistance = f.maxDistance;
    return f.dist;
  }

  function frameCamera(count = tileCount, dirOverride = null, { immediate = false } = {}) {
    const dist = syncFraming(count);
    lastFramedDist = dist;
    const dir = dirOverride ? dirOverride.clone() : camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 0.01) dir.copy(HOME_CAM_DIR);
    const targetPos = dir.normalize().multiplyScalar(dist);
    if (immediate || !running) {
      cameraLerp = null;
      camera.position.copy(targetPos);
      controls.target.set(0, 0, 0);
      camera.lookAt(controls.target);
      controls.update();
      renderStill();
      return;
    }
    cameraLerp = { targetPos, targetLookAt: new THREE.Vector3() };
  }

  const frameCameraForTiles = (count, opts) => frameCamera(count, null, opts);
  const resetCamera = (opts) => frameCamera(tileCount, HOME_CAM_DIR, opts);
  const resetSliceFlags = () => { sliced = false; exploded = false; explodeProgress = 0; targetExplode = 0; };
  const applyFrameVisibility = () => { worldRoot.traverse((c) => { if (c.isLineSegments) c.visible = showFrame; }); };

  function exitSupercellIfNeeded() {
    const wasTiled = tileCount > 1;
    tileCount = 1; tiler.clear(); tiler.snapToOrigin();
    if (wasTiled) frameCameraForTiles(1);
  }

  function renderStill() {
    if (!running) {
      renderer.render(scene, camera);
      badges.update(camera, worldRoot.position, { sliced, explodeProgress });
    }
  }

  function rebuildScene({ keepTilesCamera = false } = {}) {
    if (!currentCrystal || disposed) return;
    clearActiveMeshes();
    syncGroundShadow();

    if (tileCount > 1 && !sliced) {
      const count = tiler.syncTiles(currentCrystal, tileCount, displayMode, style);
      applyFrameVisibility();
      if (!keepTilesCamera) frameCameraForTiles(count);
      return;
    }

    tiler.clear();
    if (sliced) {
      tiler.snapToOrigin();
      sliceState = buildSlicedCellGroup(currentCrystal, {
        displayMode, sharedUnitSphere, style,
        addBadge: badges.add, clearBadges: badges.clear, explodeProgress,
      });
      singleCellGroup = sliceState.group;
      worldRoot.add(singleCellGroup);
      applyFrameVisibility();
      return;
    }

    let atomOpacityMap = null;
    if (overlay === 'coordination') {
      const res = buildCoordinationOverlay(currentCrystal, {
        displayMode, sharedUnitSphere, sharedUnitBox, sharedRingGeom, style, addBadge: badges.add,
      });
      overlayGroup = res.group;
      atomOpacityMap = res.opacityMap;
    } else if (overlay === 'distance') {
      const res = buildDistanceOverlay(currentCrystal, {
        displayMode, sharedRingGeom, style, addBadge: badges.add,
      });
      overlayGroup = res.group;
      atomOpacityMap = res.opacityMap;
    }
    if (overlayGroup) worldRoot.add(overlayGroup);

    singleCellGroup = buildNormalCellGroup(currentCrystal, {
      displayMode, sharedUnitSphere, sharedUnitBox, style, atomOpacityMap,
    });
    worldRoot.add(singleCellGroup);
    applyFrameVisibility();
  }

  function handleThemeChange(force = false) {
    if (disposed) return;
    const nextTheme = currentThemeId();
    if (!force && nextTheme === activeTheme) return;
    activeTheme = nextTheme;
    style = getViewerStyle(activeTheme);
    applyStyle(style);
    if (tileCount > 1) tiler.clear();
    rebuildScene({ keepTilesCamera: true });
    renderStill();
  }

  const stopThemeObserver = observeCrystalTheme(handleThemeChange);

  function animate(now) {
    if (!running || disposed) return;
    rafId = requestAnimationFrame(animate);

    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
    lastTime = now;
    pulsePhase += dt * 3.2;

    if (Math.abs(explodeProgress - targetExplode) > 0.001) {
      explodeProgress += (targetExplode - explodeProgress) * (1 - Math.exp(-dt * 8.5));
      if (Math.abs(explodeProgress - targetExplode) <= 0.0015) explodeProgress = targetExplode;
      applyExplodeTransform(sliceState, explodeProgress);
    }

    tiler.update(dt);

    if (cameraLerp) {
      const k = 1 - Math.exp(-dt * 6.5);
      camera.position.lerp(cameraLerp.targetPos, k);
      controls.target.lerp(cameraLerp.targetLookAt, k);
      if (camera.position.distanceTo(cameraLerp.targetPos) < 0.03 && controls.target.distanceTo(cameraLerp.targetLookAt) < 0.02) {
        cameraLerp = null;
      }
    }

    updateOverlayBillboards(overlayGroup, camera, pulsePhase);
    controls.update();
    renderer.render(scene, camera);
    badges.update(camera, worldRoot.position, { sliced, explodeProgress });
  }

  const onControlStart = () => { cameraLerp = null; };
  controls.addEventListener('start', onControlStart);

  function resize() {
    if (disposed) return;
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    const prevAspect = camera.aspect;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (currentCrystal && w > 1 && h > 1 && (camera.aspect < 1 || prevAspect < 1) && isAtDefaultZoom()) {
      frameCameraForTiles(tileCount);
    }
    renderStill();
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(container);

  function setCrystal(crystal) {
    currentCrystal = crystal ? sanitizeCrystalRadii(crystal) : null;
    resetSliceFlags(); tileCount = 1; overlay = 'none';
    tiler.clear(); tiler.snapToOrigin();
    rebuildScene();
    resetCamera({ immediate: !hasFramedOnce });
    hasFramedOnce = true;
  }

  function setDisplayMode(mode) {
    const next = mode === 'space-filling' ? 'space-filling' : 'ball-stick';
    if (next === displayMode) return;
    const reframe = isAtDefaultZoom();
    displayMode = next; tiler.clear();
    rebuildScene({ keepTilesCamera: true });
    if (reframe) frameCameraForTiles(tileCount);
    else { syncFraming(tileCount); renderStill(); }
  }

  function setSliced(on) {
    if (on) { overlay = 'none'; exitSupercellIfNeeded(); sliced = true; }
    else resetSliceFlags();
    rebuildScene();
  }

  function setExploded(on) {
    const next = Boolean(on);
    if (next && !sliced) {
      overlay = 'none'; exitSupercellIfNeeded();
      sliced = true; exploded = true; targetExplode = 1;
      rebuildScene();
      return;
    }
    exploded = next; targetExplode = next ? 1 : 0;
  }

  function setTileCount(count) {
    const clamped = Math.max(1, Math.min(8, Math.round(Number(count) || 1)));
    const prev = tileCount;
    if (clamped > 1) { resetSliceFlags(); overlay = 'none'; }
    tileCount = clamped;
    if (clamped === 1) {
      rebuildScene();
      if (prev > 1) frameCameraForTiles(1);
    } else {
      clearActiveMeshes();
      syncGroundShadow();
      const count = tiler.syncTiles(currentCrystal, tileCount, displayMode, style);
      applyFrameVisibility();
      frameCameraForTiles(count);
    }
  }

  function setOverlay(mode) {
    const next = mode === 'coordination' || mode === 'distance' ? mode : 'none';
    if (next !== 'none') {
      resetSliceFlags();
      if (tileCount > 1) exitSupercellIfNeeded();
    }
    overlay = next;
    rebuildScene();
  }

  function stepRotate(dAzimuth, dPolar) {
    cameraLerp = null;
    camOffset.copy(camera.position).sub(controls.target);
    camSpherical.setFromVector3(camOffset);
    camSpherical.theta += dAzimuth;
    camSpherical.phi = THREE.MathUtils.clamp(camSpherical.phi + dPolar, 0.08, Math.PI - 0.08);
    camSpherical.makeSafe();
    camOffset.setFromSpherical(camSpherical);
    camera.position.copy(controls.target).add(camOffset);
    camera.lookAt(controls.target);
    controls.update();
    renderStill();
  }

  function stepZoom(factor) {
    cameraLerp = null;
    camOffset.copy(camera.position).sub(controls.target);
    const dist = THREE.MathUtils.clamp(camOffset.length() * factor, controls.minDistance, controls.maxDistance);
    camOffset.setLength(dist);
    camera.position.copy(controls.target).add(camOffset);
    controls.update();
    renderStill();
  }

  function setShowFrame(on) { showFrame = Boolean(on); applyFrameVisibility(); renderStill(); }

  function setShowLabels(visible) {
    badges.setShowLabels(visible);
    if (badges.getShowLabels()) badges.update(camera, worldRoot.position, { sliced, explodeProgress });
  }

  function start() {
    if (running || disposed) return;
    running = true; lastTime = 0; handleThemeChange(false); resize();
    rafId = requestAnimationFrame(animate);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop(); stopThemeObserver(); ro?.disconnect();
    controls.removeEventListener('start', onControlStart);
    controls.dispose(); clearActiveMeshes(); tiler.clear();
    if (shadowMesh) { disposeObjectTree(shadowMesh); scene.remove(shadowMesh); }
    badges.dispose(); disposeEnv();
    sharedUnitSphere.dispose(); sharedUnitBox.dispose(); sharedRingGeom.dispose();
    renderer.dispose(); canvas.remove();
  }

  return {
    setCrystal, setDisplayMode, setSliced, setExploded, setTileCount, setOverlay,
    setAutoRotate(on) { controls.autoRotate = Boolean(on); },
    stepRotate, stepZoom, setShowFrame, setShowLabels,
    getShowLabels: badges.getShowLabels,
    resetCamera, start, stop, resize, dispose,
  };
}
