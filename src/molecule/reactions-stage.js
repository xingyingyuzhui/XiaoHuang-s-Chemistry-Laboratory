/**
 * 3D 分子 · 常见反应：舞台层（3D 分子淡入切换 + 原子动画视图 + dock 高度同步）
 */

import { moleculeApi } from '../api/client.js';
import { ensureMolViewer, getMolViewer } from './list.js';
import { buildReactionPlan } from './reaction-plan.js';
import { createAtomStage } from './atom-stage.js';

const $ = (sel) => document.querySelector(sel);
const VIEW_KEY = 'xh-rxn-view';

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function highlightEquation(eq, frag) {
  const full = escapeHtml(eq || '');
  if (!frag) return full;
  const f = escapeHtml(frag);
  if (!f || !full.includes(f)) return full;
  return full.split(f).join(`<mark class="rxn-eq-mark">${f}</mark>`);
}

/** 规范化化学式便于匹配库内分子 */
function normFormula(f) {
  return String(f || '')
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (d) => '0123456789'['₀₁₂₃₄₅₆₇₈₉'.indexOf(d)])
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

export function createReactionStage({
  getPlayerEl,
  getCurrentMoleculeId,
  getElapsed,
}) {
  /** 原子动画：剧本、舞台、当前视图（atoms | 3d），视图选择记在本机 */
  let atomPlan = null;
  let atomStage = null;
  let viewMode = (() => {
    try {
      return localStorage.getItem(VIEW_KEY) === '3d' ? '3d' : 'atoms';
    } catch {
      return 'atoms';
    }
  })();

  let molListCache = null;
  /** 串行化 3D 加载，避免 scrub 时乱序 */
  let molLoadSeq = 0;

  function stage3d() {
    return document.querySelector('.stage-3d');
  }

  function updateViewToggle() {
    const btn = $('#rxnViewToggle');
    if (!btn) return;
    btn.hidden = !atomPlan;
    btn.textContent = viewMode === 'atoms' ? '看 3D 结构' : '看原子动画';
  }

  function enterAtomView() {
    const stage = stage3d();
    if (!stage || !atomPlan) return;
    stage.classList.add('rxn-atoms');
    atomStage ||= createAtomStage(stage);
    atomStage.start(atomPlan, getElapsed);
  }

  function leaveAtomView() {
    stage3d()?.classList.remove('rxn-atoms');
    atomStage?.stop();
  }

  function applyViewMode() {
    if (atomPlan && viewMode === 'atoms') enterAtomView();
    else leaveAtomView();
    updateViewToggle();
  }

  function toggleViewMode() {
    viewMode = viewMode === 'atoms' ? '3d' : 'atoms';
    try {
      localStorage.setItem(VIEW_KEY, viewMode);
    } catch {
      /* ignore */
    }
    applyViewMode();
  }

  function prepareAtomPlan(reaction, stepTime, total) {
    try {
      atomPlan = buildReactionPlan(reaction, stepTime, total);
    } catch (err) {
      // AI 生成的方程式可能千奇百怪：出错就只用 3D 模式
      console.warn('原子示意不可用', err);
      atomPlan = null;
    }
  }

  function clearAtomPlan() {
    leaveAtomView();
    atomPlan = null;
  }

  function refreshAtomStage() {
    atomStage?.refresh();
  }

  function notifyViewerResize() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          getMolViewer()?.resize?.();
        } catch {
          /* ignore */
        }
      });
    });
  }

  /** 按 dock 实际高度抬高 3D 画布，避免分子被挡 */
  function syncDockHeight() {
    const stage = stage3d();
    const playerEl = getPlayerEl();
    if (!stage || !playerEl?.classList.contains('is-open')) {
      stage?.style.removeProperty('--rxn-dock-h');
      return;
    }
    const h = Math.ceil(playerEl.getBoundingClientRect().height + 14);
    stage.style.setProperty('--rxn-dock-h', `${Math.max(h, 180)}px`);
    notifyViewerResize();
    atomStage?.refresh();
  }

  function resetMolCache() {
    molListCache = null;
  }

  async function restoreMolecule3D(id) {
    if (!id) return;
    try {
      ensureMolViewer();
      const m = await moleculeApi.getById(id);
      if (m) getMolViewer()?.load(m);
    } catch {
      /* ignore */
    }
  }

  async function getMolListCached() {
    if (molListCache) return molListCache;
    try {
      molListCache = (await moleculeApi.getList()) || [];
    } catch {
      molListCache = [];
    }
    return molListCache;
  }

  async function formulaToMoleculeId(formula) {
    if (!formula) return null;
    const list = await getMolListCached();
    const n = normFormula(formula);
    if (!n) return null;
    const hit = list.find((m) => normFormula(m.formula) === n || m.id === formula);
    return hit?.id || null;
  }

  /**
   * 解析某步应展示的 3D 分子 id
   */
  async function resolveStepMoleculeId(reaction, step, stepIdx = 0) {
    if (step?.moleculeId) return step.moleculeId;

    const reactants = (reaction.reactants || []).filter((r) => r.moleculeId);
    const products = (reaction.products || []).filter((p) => p.moleculeId);
    const focus = step?.focus || 'reactant';

    if (focus === 'product' || focus === 'done') {
      if (products[0]?.moleculeId) return products[0].moleculeId;
      // 按化学式在库中找
      for (const p of reaction.products || []) {
        const id = await formulaToMoleculeId(p.formula);
        if (id) return id;
      }
      // 分子 ids 里取非反应物的
      const rset = new Set(reactants.map((r) => r.moleculeId));
      const extra = (reaction.moleculeIds || []).find((id) => id && !rset.has(id));
      if (extra) return extra;
    }

    if (focus === 'join') {
      if (reactants.length > 1) return reactants[1].moleculeId;
      if (products[0]?.moleculeId) return products[0].moleculeId;
    }

    if (focus === 'break' && reactants.length > 1 && stepIdx > 0) {
      return reactants[Math.min(1, reactants.length - 1)].moleculeId;
    }

    if (reactants[0]?.moleculeId) return reactants[0].moleculeId;
    if (reaction.moleculeIds?.[0]) return reaction.moleculeIds[0];
    return getCurrentMoleculeId();
  }

  /**
   * 淡入淡出加载分子
   */
  async function fadeLoadMolecule(id, fade = true) {
    if (!id) return false;
    const seq = ++molLoadSeq;
    const root = $('#mol-root');
    try {
      ensureMolViewer();
      if (fade && root) {
        root.style.transition = 'opacity 0.45s ease';
        root.style.opacity = '0.12';
        await new Promise((r) => setTimeout(r, 380));
      }
      if (seq !== molLoadSeq) return false; // 已被更新请求取代
      const m = await moleculeApi.getById(id);
      if (seq !== molLoadSeq) return false;
      if (m) getMolViewer()?.load(m);
      if (root && seq === molLoadSeq) root.style.opacity = '1';
      return true;
    } catch {
      if (root && seq === molLoadSeq) root.style.opacity = '1';
      return false;
    }
  }

  function setMol3dHint(step, hasModel, molId) {
    // 在 tip 后附加轻提示：无对应 3D 时不误导
    const tipEl = $('#rxnPlayerTip');
    if (!tipEl || !step) return;
    const base = step.tip || '';
    if (hasModel && molId) {
      tipEl.dataset.molId = molId;
    }
    // tip 正文仍用 base；缺少模型时若 tip 未说明则补一句
    if (!hasModel && base && !/暂无|无 3D|无3D/.test(base)) {
      tipEl.textContent = `${base}（本步无独立 3D，请看方程式）`;
    }
  }

  /**
   * 步骤变化时切换 3D
   */
  async function applyStep3D(reaction, step, stepIdx) {
    if (!reaction) return;
    const id = await resolveStepMoleculeId(reaction, step, stepIdx);
    if (!id) {
      setMol3dHint(step, false);
      return;
    }
    if (reaction.__lastMolId === id) {
      setMol3dHint(step, true, id);
      return;
    }
    reaction.__lastMolId = id;
    const ok = await fadeLoadMolecule(id, true);
    // 若中途被新请求取代，不要更新 hint 状态误导
    if (ok) setMol3dHint(step, true, id);
  }

  return {
    applyViewMode,
    toggleViewMode,
    prepareAtomPlan,
    clearAtomPlan,
    refreshAtomStage,
    notifyViewerResize,
    syncDockHeight,
    resetMolCache,
    restoreMolecule3D,
    applyStep3D,
  };
}
