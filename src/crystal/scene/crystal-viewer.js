/**
 * 3D 晶胞交互渲染引擎主外壳（Three.js + OrbitControls）
 * 协调场景灯光、相机与渲染循环，委托子模块完成裁剪、拼接与标注。
 */

import * as THREE from 'three';
import {
  CELL_SCALE,
  createStudioStage,
  buildNormalCellGroup,
  disposeGroupWithExtras,
} from './scene-helpers.js';
import { createBadgeLayer } from './badge-layer.js';
import { buildSlicedCellGroup, applyExplodeTransform } from './slicer-caps.js';
import { createSupercellTiler } from './supercell-tiler.js';
import {
  buildCoordinationOverlay,
  buildDistanceOverlay,
  updateOverlayBillboards,
} from './exam-overlays.js';

export { CELL_SCALE };

export function createCrystalViewer(container) {
  const { scene, camera, renderer, canvas, controls } = createStudioStage(container);
  const badges = createBadgeLayer(container);

  const sharedUnitSphere = new THREE.SphereGeometry(1, 36, 26);
  const sharedRingGeom = new THREE.TorusGeometry(1, 0.08, 12, 36);
  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

  let currentCrystal = null;
  let displayMode = 'ball-stick';
  let sliced = false;
  let exploded = false;
  let tileCount = 1;
  let overlay = 'none';
  let explodeProgress = 0;
  let targetExplode = 0;

  let singleCellGroup = null;
  let sliceState = null;
  let overlayGroup = null;
  let cameraLerp = null;

  let rafId = 0;
  let running = false;
  let lastTime = 0;
  let pulsePhase = 0;
  let disposed = false;

  const tiler = createSupercellTiler({
    worldRoot,
    sharedUnitSphere,
    addBadge: badges.add,
    clearBadges: badges.clear,
  });

  function clearSingleCell() {
    if (!singleCellGroup) return;
    disposeGroupWithExtras(singleCellGroup);
    worldRoot.remove(singleCellGroup);
    singleCellGroup = null;
    sliceState = null;
  }

  function clearOverlay() {
    if (overlayGroup) {
      disposeGroupWithExtras(overlayGroup);
      worldRoot.remove(overlayGroup);
      overlayGroup = null;
    }
    badges.clear('overlay');
  }

  function frameCameraForTiles(count) {
    const dist = count <= 1 ? 6.6 : 6.6 + Math.pow(count - 1, 0.52) * 2.15;
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 0.01) dir.set(4.8, 3.6, 5.6);
    dir.normalize().multiplyScalar(dist);
    cameraLerp = { targetPos: dir, targetLookAt: new THREE.Vector3(0, 0, 0) };
  }

  function exitSupercellIfNeeded() {
    const wasTiled = tileCount > 1;
    tileCount = 1;
    tiler.clear();
    tiler.snapToOrigin();
    if (wasTiled) frameCameraForTiles(1);
  }

  function resetSliceFlags() {
    sliced = false;
    exploded = false;
    explodeProgress = 0;
    targetExplode = 0;
  }

  function rebuildScene() {
    if (!currentCrystal || disposed) return;
    clearSingleCell();
    badges.clear('slice');
    clearOverlay();

    if (tileCount > 1 && !sliced) {
      frameCameraForTiles(tiler.syncTiles(currentCrystal, tileCount, displayMode));
      return;
    }

    tiler.clear();
    if (sliced) {
      tiler.snapToOrigin();
      sliceState = buildSlicedCellGroup(currentCrystal, {
        displayMode,
        sharedUnitSphere,
        addBadge: badges.add,
        clearBadges: badges.clear,
        explodeProgress,
      });
      singleCellGroup = sliceState.group;
      worldRoot.add(singleCellGroup);
      return;
    }

    let atomOpacityMap = null;
    if (overlay === 'coordination') {
      const res = buildCoordinationOverlay(currentCrystal, {
        displayMode,
        sharedUnitSphere,
        sharedRingGeom,
        addBadge: badges.add,
      });
      overlayGroup = res.group;
      atomOpacityMap = res.opacityMap;
    } else if (overlay === 'distance') {
      const res = buildDistanceOverlay(currentCrystal, {
        displayMode,
        sharedRingGeom,
        addBadge: badges.add,
      });
      overlayGroup = res.group;
      atomOpacityMap = res.opacityMap;
    }
    if (overlayGroup) worldRoot.add(overlayGroup);

    singleCellGroup = buildNormalCellGroup(currentCrystal, {
      displayMode,
      sharedUnitSphere,
      atomOpacityMap,
    });
    worldRoot.add(singleCellGroup);
  }

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
      if (
        camera.position.distanceTo(cameraLerp.targetPos) < 0.03 &&
        controls.target.distanceTo(cameraLerp.targetLookAt) < 0.02
      ) {
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
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (!running) {
      renderer.render(scene, camera);
      badges.update(camera, worldRoot.position, { sliced, explodeProgress });
    }
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(container);

  function setCrystal(crystal) {
    currentCrystal = crystal;
    resetSliceFlags();
    tileCount = 1;
    overlay = 'none';
    tiler.clear();
    tiler.snapToOrigin();
    rebuildScene();
    resetCamera();
  }

  function setDisplayMode(mode) {
    const next = mode === 'space-filling' ? 'space-filling' : 'ball-stick';
    if (next === displayMode) return;
    displayMode = next;
    tiler.clear();
    rebuildScene();
  }

  function setSliced(on) {
    const next = Boolean(on);
    if (next) {
      overlay = 'none';
      exitSupercellIfNeeded();
      sliced = true;
    } else {
      resetSliceFlags();
    }
    rebuildScene();
  }

  function setExploded(on) {
    const next = Boolean(on);
    if (next && !sliced) {
      overlay = 'none';
      exitSupercellIfNeeded();
      sliced = true;
      exploded = true;
      targetExplode = 1;
      rebuildScene();
      return;
    }
    exploded = next;
    targetExplode = next ? 1 : 0;
  }

  function setTileCount(count) {
    const clamped = Math.max(1, Math.min(8, Math.round(Number(count) || 1)));
    const prev = tileCount;
    if (clamped > 1) {
      resetSliceFlags();
      overlay = 'none';
    }
    tileCount = clamped;
    if (clamped === 1) {
      rebuildScene();
      if (prev > 1) frameCameraForTiles(1);
    } else {
      clearSingleCell();
      badges.clear('slice');
      clearOverlay();
      frameCameraForTiles(tiler.syncTiles(currentCrystal, tileCount, displayMode));
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

  function resetCamera() {
    const dist = tileCount <= 1 ? 6.6 : 6.6 + Math.pow(tileCount - 1, 0.52) * 2.15;
    const pos = new THREE.Vector3(0.68, 0.52, 0.78).normalize().multiplyScalar(dist);
    cameraLerp = { targetPos: pos, targetLookAt: new THREE.Vector3(0, 0, 0) };
  }

  function start() {
    if (running || disposed) return;
    running = true;
    lastTime = 0;
    resize();
    rafId = requestAnimationFrame(animate);
  }

  function stop() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    ro?.disconnect();
    controls.removeEventListener('start', onControlStart);
    controls.dispose();
    clearSingleCell();
    tiler.clear();
    clearOverlay();
    badges.dispose();
    sharedUnitSphere.dispose();
    sharedRingGeom.dispose();
    renderer.dispose();
    canvas.remove();
  }

  return {
    setCrystal,
    setDisplayMode,
    setSliced,
    setExploded,
    setTileCount,
    setOverlay,
    setAutoRotate(on) { controls.autoRotate = Boolean(on); },
    resetCamera,
    start,
    stop,
    resize,
    dispose,
  };
}
