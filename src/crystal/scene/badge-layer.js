/**
 * 3D 坐标到 2D DOM 徽章投影层（分数徽章、配位数、最短距离、正六棱柱提示）
 */

import * as THREE from 'three';

/**
 * 创建 2D 投影徽章管理器
 * @param {HTMLElement} container
 */
export function createBadgeLayer(container) {
  const layer = document.createElement('div');
  layer.className = 'crystal-label-layer';
  layer.setAttribute('aria-hidden', 'true');
  container.appendChild(layer);

  let badges = [];
  let showLabels = true;
  const projVec = new THREE.Vector3();

  function setShowLabels(visible) {
    showLabels = Boolean(visible);
    layer.hidden = !showLabels;
    layer.style.display = showLabels ? '' : 'none';
  }

  function getShowLabels() {
    return showLabels;
  }

  function clear(kindFilter = null) {
    badges = badges.filter((b) => {
      if (kindFilter && b.kind !== kindFilter) return true;
      b.el.remove();
      return false;
    });
  }

  function add({ text, subText = '', className = '', colorHex = '', worldPos, kind = 'slice' }) {
    const el = document.createElement('div');
    el.className = `crystal-badge ${className}`.trim();
    if (colorHex) el.style.setProperty('--badge-dot', colorHex);

    const mainSpan = document.createElement('span');
    mainSpan.className = 'crystal-badge-main';
    mainSpan.textContent = text;
    el.appendChild(mainSpan);

    if (subText) {
      const subSpan = document.createElement('span');
      subSpan.className = 'crystal-badge-sub';
      subSpan.textContent = subText;
      el.appendChild(subSpan);
    }

    layer.appendChild(el);
    const entry = { el, worldPos: worldPos.clone(), kind };
    badges.push(entry);
    return entry;
  }

  function update(camera, worldOffset, { sliced, explodeProgress }) {
    if (!showLabels || !badges.length) return;
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;

    for (const b of badges) {
      projVec.copy(b.worldPos).add(worldOffset).project(camera);
      if (projVec.z < -1 || projVec.z > 1) {
        b.el.style.opacity = '0';
        continue;
      }
      const x = (projVec.x * 0.5 + 0.5) * width;
      const y = (-projVec.y * 0.5 + 0.5) * height;
      if (x < -40 || x > width + 40 || y < -30 || y > height + 30) {
        b.el.style.opacity = '0';
        continue;
      }
      const alpha =
        b.kind === 'slice' ? (sliced ? Math.min(1, 0.25 + explodeProgress * 0.95) : 0) : 1;
      b.el.style.opacity = alpha.toFixed(2);
      b.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  }

  function dispose() {
    clear();
    layer.remove();
  }

  return { add, clear, update, setShowLabels, getShowLabels, dispose };
}
