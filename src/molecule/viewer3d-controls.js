import * as THREE from 'three';

const STEP_AZIMUTH = 0.22; // 水平旋转步进（弧度）
const STEP_POLAR = 0.16; // 俯仰步进
const ZOOM_IN = 0.88;
const ZOOM_OUT = 1.14;

export const AUTO_SPEED = 1.15; // OrbitControls autoRotateSpeed

export function createCameraControls({ camera, controls }) {
  /** @type {{ target: THREE.Vector3, position: THREE.Vector3 } | null} */
  let homeView = null;
  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();

  function saveHomeView() {
    homeView = {
      target: controls.target.clone(),
      position: camera.position.clone(),
    };
  }

  function frameMolecule(center, size) {
    const dist = Math.max(size * 1.85, 4.2);
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(dist * 0.72, dist * 0.48, dist * 0.9));
    controls.minDistance = Math.max(dist * 0.35, 2);
    controls.maxDistance = Math.max(dist * 4, 20);
    controls.update();
    saveHomeView();
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

  return {
    saveHomeView,
    frameMolecule,
    setAutoRotate,
    bindControls,
  };
}
