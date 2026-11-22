/**
 * 统一 ChemStageJSON 舞台调度器
 * 冻结契约：导出 mountChemStage(stageSpec, stageEl, actionbarEl, { onCaption, onDualLabels })
 * 调度全部 5 类参数化引擎：dual-3d-compare / lattice-stress / particle-field / thermal-phase / cell-extract
 */

import { mountCompare3DStage } from './stage-compare-3d.js';
import { mountStress3DStage } from './stage-hammer-3d.js';
import { mountGrowth3DStage } from './stage-growth-3d.js';
import { mountIce3DStage } from './stage-ice-3d.js';
import { mountThermalStage } from './stage-thermal.js';
import { createConductExp } from '../modules/properties/exp-conduct.js';
import { mountUnitCellDemo } from '../modules/basics/demo-unitcell.js';

const NOOP_HANDLE = { pause() {}, resume() {}, resize() {}, destroy() {} };

function createCinemaInsetHost(stageEl, { darkFilter = false } = {}) {
  const host = document.createElement('div');
  host.className = 'chem-stage-inset-host';
  host.style.cssText = [
    'position:absolute;inset:14px 18px 34px;border-radius:14px;overflow:hidden;',
    'background:#0b1222;border:1px solid rgba(148,163,184,0.24);',
    'box-shadow:0 18px 44px rgba(2,6,23,0.48);',
    darkFilter ? 'color-scheme:dark;' : '',
  ].join('');
  stageEl.appendChild(host);
  return host;
}

function mountConductivityWrapped(spec, stageEl, controlsEl, onCaption) {
  const host = createCinemaInsetHost(stageEl, { darkFilter: true });
  const prefix = spec?.label ? `${spec.label} · ` : '';
  const inst = createConductExp(host, controlsEl, (text) => {
    const msg = text || '';
    onCaption?.(prefix && !msg.startsWith(prefix) ? `${prefix}${msg}` : msg);
  });
  return {
    pause: () => inst?.pause?.(),
    resume: () => inst?.resume?.(),
    resize: () => inst?.resize?.(),
    destroy() {
      inst?.destroy?.();
      host.remove();
    },
  };
}

function mountCellExtractWrapped(spec, stageEl, controlsEl, onCaption) {
  const host = createCinemaInsetHost(stageEl, { darkFilter: true });
  const prefix = spec?.label ? `${spec.label} · ` : '';
  const inst = mountUnitCellDemo({
    stageEl: host,
    controlsEl,
    setCaption: (text) => {
      const msg = text || '';
      onCaption?.(prefix && !msg.startsWith(prefix) ? `${prefix}${msg}` : msg);
    },
    setLegend() {},
  });
  return {
    pause: () => inst?.pause?.(),
    resume: () => inst?.resume?.(),
    resize: () => inst?.resize?.(),
    destroy() {
      inst?.destroy?.();
      host.remove();
    },
  };
}

function dispatchStage(spec, stageEl, controlsEl, callbacks) {
  const type = spec?.type || 'dual-3d-compare';

  if (type === 'dual-3d-compare') {
    return mountCompare3DStage(spec, stageEl, controlsEl, callbacks);
  }
  if (type === 'lattice-stress') {
    return mountStress3DStage(spec, stageEl, controlsEl, callbacks);
  }
  if (type === 'thermal-phase') {
    return mountThermalStage(spec, stageEl, controlsEl, callbacks);
  }
  if (type === 'cell-extract') {
    return mountCellExtractWrapped(spec, stageEl, controlsEl, callbacks.onCaption);
  }
  if (type === 'particle-field') {
    const mode = spec?.mode || 'crystal-growth';
    if (mode === 'hbond-collapse') {
      return mountIce3DStage(spec, stageEl, controlsEl, callbacks);
    }
    if (mode === 'conductivity') {
      return mountConductivityWrapped(spec, stageEl, controlsEl, callbacks.onCaption);
    }
    return mountGrowth3DStage(spec, stageEl, controlsEl, callbacks);
  }

  return mountCompare3DStage(
    {
      type: 'dual-3d-compare',
      left: { label: '水晶', sublabel: '晶体 · 长程有序', kind: 'quartz' },
      right: { label: '石英玻璃', sublabel: '非晶体 · 长程无序', kind: 'glass' },
      defaultMode: 'macro',
    },
    stageEl,
    controlsEl,
    callbacks,
  );
}

export function mountChemStage(stageSpec, stageEl, actionbarEl, { onCaption, onDualLabels } = {}) {
  if (!stageEl) return NOOP_HANDLE;

  stageEl.innerHTML = '';
  const controlsHost = actionbarEl || document.createElement('div');
  controlsHost.innerHTML = '';
  onDualLabels?.(null, null);

  const safeSpec = stageSpec && typeof stageSpec === 'object' ? stageSpec : { type: 'dual-3d-compare' };
  let inst = dispatchStage(safeSpec, stageEl, controlsHost, { onCaption, onDualLabels });
  let destroyed = false;

  return {
    pause() { if (!destroyed) inst?.pause?.(); },
    resume() { if (!destroyed) inst?.resume?.(); },
    resize() { if (!destroyed) inst?.resize?.(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        inst?.destroy?.();
      } catch (err) {
        console.warn('[chem-stages] destroy failed:', err);
      }
      inst = null;
      stageEl.innerHTML = '';
      if (actionbarEl) actionbarEl.innerHTML = '';
      onDualLabels?.(null, null);
    },
  };
}
