/**
 * 杂化方式推断（中学简化）
 *
 * 纯函数，无 DOM / Three.js 依赖。
 * 给定分子拓扑 + 原子下标，推断 sp / sp² / sp³ 等。
 */

const VALENCE_E = {
  H: 1, B: 3, C: 4, N: 5, O: 6, F: 7,
  Si: 4, P: 5, S: 6, Cl: 7, Br: 7, I: 7,
};

const METALS = new Set(['Na', 'K', 'Mg', 'Ca', 'Fe', 'Al', 'Cu', 'Zn', 'Ag', 'Ba']);

const GEOMETRY_MAP = {
  sp: '直线',
  sp2: '平面三角',
  sp3: '四面体',
};

const HYBRID_LABEL = {
  sp: 'sp',
  sp2: 'sp²',
  sp3: 'sp³',
  none: '—',
  na: '—',
  unknown: '—',
};

/**
 * @param {object|null} molecule  { atoms, bonds }
 * @param {number} atomIndex
 */
export function inferHybridization(molecule, atomIndex) {
  const fallback = (hybrid, tip) => ({
    atomIndex,
    el: molecule?.atoms?.[atomIndex]?.el || '?',
    hybrid,
    hybridLabel: HYBRID_LABEL[hybrid] || '—',
    geometry: '—',
    sigmaDirs: 0,
    lonePairs: null,
    electronPairs: null,
    reason: '',
    tip,
    label: molecule?.atoms?.[atomIndex]?.el || '?',
    source: 'inferred',
  });

  if (!molecule || !Array.isArray(molecule.atoms) || !Array.isArray(molecule.bonds)) {
    return fallback('unknown', '根据现有键表无法稳定判断杂化（示意结构或配位特殊），请以课本为准。');
  }

  const atom = molecule.atoms[atomIndex];
  if (!atom) {
    return fallback('unknown', '根据现有键表无法稳定判断杂化（示意结构或配位特殊），请以课本为准。');
  }

  const el = atom.el;

  if (el === 'H') {
    return {
      ...fallback('none', '氢原子用 1s 轨道成键，中学一般不讨论杂化。'),
      label: 'H',
    };
  }

  if (METALS.has(el)) {
    return {
      ...fallback('na', '当前为金属/离子示意结构，本教学模型不讨论杂化。'),
      label: el,
    };
  }

  // neighborIndex → 键级（bonds 中该无向边出现次数之和）
  const adj = new Map();
  for (const pair of molecule.bonds) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const a = Number(pair[0]);
    const b = Number(pair[1]);
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    if (a === atomIndex) {
      adj.set(b, (adj.get(b) || 0) + 1);
    } else if (b === atomIndex) {
      adj.set(a, (adj.get(a) || 0) + 1);
    }
  }

  const sigmaDirs = adj.size;
  if (sigmaDirs === 0) {
    return {
      ...fallback('unknown', '根据现有键表无法稳定判断杂化（无邻原子），请以课本为准。'),
      el,
      label: el,
    };
  }

  let bondingElectrons = 0;
  let maxOrder = 1;
  for (const order of adj.values()) {
    bondingElectrons += order;
    if (order > maxOrder) maxOrder = order;
  }
  const hasMultipleBond = maxOrder >= 2;

  const V = VALENCE_E[el];
  let lonePairs = null;
  let electronPairs = null;

  if (V != null) {
    // floor：避免 NH₄⁺ 类 (5-4)/2=0.5 → round 成 1 孤对
    const raw = (V - bondingElectrons) / 2;
    if (raw < -0.5) {
      lonePairs = null;
    } else {
      lonePairs = Math.max(0, Math.min(4, Math.floor(raw + 1e-9)));
      electronPairs = sigmaDirs + lonePairs;
    }
  }

  // 4 个 σ 方向且主路径给出 5 区（常见正离子如 NH₄⁺）→ 回退为 sp³
  if (electronPairs != null && electronPairs > 4 && sigmaDirs === 4) {
    lonePairs = 0;
    electronPairs = 4;
  }

  let hybrid;
  if (electronPairs != null) {
    if (electronPairs === 2) hybrid = 'sp';
    else if (electronPairs === 3) hybrid = 'sp2';
    else if (electronPairs === 4) hybrid = 'sp3';
    else hybrid = 'unknown';
  } else if (sigmaDirs === 2) hybrid = 'sp';
  else if (sigmaDirs === 3) hybrid = 'sp2';
  else if (sigmaDirs === 4) hybrid = 'sp3';
  else hybrid = 'unknown';

  let reason;
  if (electronPairs != null && lonePairs != null) {
    reason = `σ方向 ${sigmaDirs} + 孤对 ${lonePairs} → ${electronPairs} 电子对 → ${HYBRID_LABEL[hybrid] || hybrid}`;
  } else {
    reason = `σ方向 ${sigmaDirs}（无价电子表回退）→ ${HYBRID_LABEL[hybrid] || hybrid}`;
  }

  const tip = buildTip(hybrid, sigmaDirs, electronPairs, hasMultipleBond, maxOrder);

  return {
    atomIndex,
    el,
    hybrid,
    hybridLabel: HYBRID_LABEL[hybrid] || '—',
    geometry: GEOMETRY_MAP[hybrid] || '—',
    sigmaDirs,
    lonePairs,
    electronPairs,
    reason,
    tip,
    label: `${el} · ${HYBRID_LABEL[hybrid] || '—'}`,
    source: 'inferred',
  };
}

/**
 * @param {string} hybrid
 * @param {number} sigmaDirs
 * @param {number|null} electronPairs
 * @param {boolean} hasMultipleBond
 * @param {number} maxOrder
 */
function buildTip(hybrid, sigmaDirs, electronPairs, hasMultipleBond, maxOrder) {
  if (hybrid === 'sp3') {
    const n = electronPairs ?? 4;
    return `中学简化：该原子约 ${n} 个电子对区、${sigmaDirs} 个 σ 方向，采取 sp³ 杂化，形成四面体取向的 σ 键（可含孤对）。`;
  }
  if (hybrid === 'sp2') {
    let tip = `中学简化：约 ${sigmaDirs} 个 σ 方向，sp² 杂化，平面三角取向。`;
    if (hasMultipleBond) {
      tip += '未杂化 p 轨道可参与 π 键（双键示意）。';
    } else {
      tip += '（如 BF₃ 等缺电子分子可不形成 π 键。）';
    }
    return tip;
  }
  if (hybrid === 'sp') {
    let tip = `中学简化：约 ${sigmaDirs} 个 σ 方向，sp 杂化，直线取向。`;
    if (maxOrder >= 3) {
      tip += '两枚 p 轨道参与 π 键（三键示意）。';
    } else if (hasMultipleBond) {
      tip += '未杂化 p 轨道可参与 π 键（双键/累积双键示意）。';
    }
    return tip;
  }
  return '根据现有键表无法稳定判断杂化（示意结构或配位特殊），请以课本为准。';
}
