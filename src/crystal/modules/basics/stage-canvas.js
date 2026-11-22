/**
 * 模块 01 共享高分屏 2D 舞台画布工具（实时响应 5 主题切换）
 */

import { getStagePalette, observeThemeChange } from '../stage-theme.js';

export function setupHiDpiCanvas(stageEl, onThemeChange) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
  stageEl.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let width = 640;
  let height = 420;
  let palette = getStagePalette();

  function resize() {
    const rect = stageEl.getBoundingClientRect();
    width = Math.max(320, Math.floor(rect.width || 640));
    height = Math.max(280, Math.floor(rect.height || 420));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(stageEl);

  const stopTheme = observeThemeChange((next) => {
    palette = next;
    onThemeChange?.(next);
  });

  return {
    canvas,
    ctx,
    getSize: () => ({ width, height }),
    getPalette: () => palette,
    resize,
    dispose() {
      stopTheme();
      ro?.disconnect();
      canvas.remove();
    },
  };
}
