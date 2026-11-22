/**
 * 分子结构校验 + 安全几何整理（API 写入与 AI 生成共用）
 * 复杂药物/大分子在入口与校验中拦截；元素、价态、共价理想键长与 VSEPR 保持松弛基于 chem-reference。
 */

const { IUPAC_ELEMENTS, COVALENT_RADII_PM, VALENCE_MAX, parseChemicalFormula } = require('./chem-reference');

const MAX_ATOMS_CLASSROOM = 24;
const MAX_ATOMS_HARD = 32;
const COMPLEX_MOLECULE_RE =
  /紫杉醇|红霉素|阿莫西林|青霉素|头孢|胰岛素|血红蛋白|叶绿素|维生素\s*b12|维生素b12|蛋白质|多肽|dna|rna|高分子|聚合物|淀粉|纤维素|石墨烯|富勒烯|碳纳米|taxol|paclitaxel|amoxicillin|penicillin|erythromycin|insulin|hemoglobin|chlorophyll|polymer|protein|peptide|fullerene/i;

function rejectComplexPrompt(prompt) {
  const p = String(prompt || '').trim();
  if (!p) return null;
  if (COMPLEX_MOLECULE_RE.test(p)) {
    return '该分子结构过于复杂，课堂 3D 示意无法可靠生成完整球棍模型。请改用高中常见分子（如乙醇、葡萄糖、苯、乙酸、氨、臭氧等），或描述其简化核心片段。';
  }
  const carbon = p.match(/C\s*([₀-₉\d]{2,})/i);
  if (carbon) {
    const n = parseInt(String(carbon[1]).replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (d) => '0123456789'['₀₁₂₃₄₅₆₇₈₉'.indexOf(d)]), 10);
    if (n >= 20) return '化学式规模过大（碳原子数过多），不适合本应用的 AI 示意 3D。请换成原子数更少的高中分子。';
  }
  return null;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function idealBondLength(elA, elB, order = 1) {
  const rA = (COVALENT_RADII_PM[elA] || 77) / 100;
  const rB = (COVALENT_RADII_PM[elB] || 77) / 100;
  return (rA + rB) * (order >= 3 ? 0.78 : order === 2 ? 0.87 : 1.0);
}

function buildUniqueEdges(atoms, bonds) {
  const map = new Map();
  for (const b of bonds) {
    if (!Array.isArray(b) || b.length < 2) continue;
    const i = Math.min(b[0], b[1]), j = Math.max(b[0], b[1]);
    if (i < 0 || j >= atoms.length || i === j) continue;
    const key = `${i}-${j}`;
    const prev = map.get(key);
    if (prev) prev.order += 1; else map.set(key, { i, j, order: 1, key });
  }
  return [...map.values()].map((e) => ({ ...e, ideal: idealBondLength(atoms[e.i].el, atoms[e.j].el, Math.min(e.order, 3)) }));
}

function detUnitVec(i, j) {
  const seed = (i + 1) * 37 + (j + 1) * 17;
  const theta = seed * 2.3999632;
  const z = ((seed % 11) - 5) / 6;
  const r = Math.sqrt(Math.max(0.05, 1 - z * z));
  return [r * Math.cos(theta), r * Math.sin(theta), z];
}

function isGeometryAcceptable(atoms, edges) {
  if (atoms.length < 2) return true;
  if (!edges.length) return false;
  const bondSet = new Set(edges.map((e) => e.key));
  for (const e of edges) {
    const d = dist(atoms[e.i], atoms[e.j]);
    if (d < 0.65 * e.ideal || d > 1.45 * e.ideal) return false;
  }
  for (let i = 0; i < atoms.length; i += 1)
    for (let j = i + 1; j < atoms.length; j += 1)
      if (!bondSet.has(`${i}-${j}`) && dist(atoms[i], atoms[j]) < 0.85) return false;
  return true;
}

/** 安全弹簧松弛：按元素对理想键长、去重多键、跳过 1-3 邻位排斥保留 VSEPR 键角、距离下限防爆炸。 */
function relaxGeometry(atoms, bonds, iterations = 80) {
  if (!atoms.length || !bonds.length) return atoms;
  const edges = buildUniqueEdges(atoms, bonds);
  if (!edges.length) return atoms;

  const pts = atoms.map((a) => ({ el: a.el, x: a.x, y: a.y, z: a.z }));
  const bondSet = new Set(edges.map((e) => e.key));
  const adj = Array.from({ length: pts.length }, () => []);
  for (const e of edges) { adj[e.i].push(e.j); adj[e.j].push(e.i); }
  const geminalSet = new Set();
  for (const nb of adj) {
    for (let a = 0; a < nb.length; a += 1)
      for (let b = a + 1; b < nb.length; b += 1) geminalSet.add(`${Math.min(nb[a], nb[b])}-${Math.max(nb[a], nb[b])}`);
  }

  for (let iter = 0; iter < iterations; iter += 1) {
    const forces = pts.map(() => ({ x: 0, y: 0, z: 0 }));
    for (const e of edges) {
      const a = pts[e.i], b = pts[e.j];
      const d = dist(a, b);
      const [ux, uy, uz] = d > 1e-4 ? [(b.x - a.x) / d, (b.y - a.y) / d, (b.z - a.z) / d] : detUnitVec(e.i, e.j);
      const f = Math.max(-1.5, Math.min(1.5, 0.35 * (d - e.ideal)));
      forces[e.i].x += f * ux; forces[e.i].y += f * uy; forces[e.i].z += f * uz;
      forces[e.j].x -= f * ux; forces[e.j].y -= f * uy; forces[e.j].z -= f * uz;
    }
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        const key = `${i}-${j}`;
        if (bondSet.has(key) || geminalSet.has(key)) continue;
        const d = dist(pts[i], pts[j]);
        if (d >= 2.0) continue;
        const [ux, uy, uz] = d > 1e-4 ? [(pts[j].x - pts[i].x) / d, (pts[j].y - pts[i].y) / d, (pts[j].z - pts[i].z) / d] : detUnitVec(i, j);
        const dEff = Math.max(d, 0.35);
        const f = Math.min(0.08 / (dEff * dEff), 1.2);
        forces[i].x -= f * ux; forces[i].y -= f * uy; forces[i].z -= f * uz;
        forces[j].x += f * ux; forces[j].y += f * uy; forces[j].z += f * uz;
      }
    }
    const damp = 0.4 * (1 - (iter / iterations) * 0.5);
    for (let i = 0; i < pts.length; i += 1) {
      let [dx, dy, dz] = [forces[i].x * damp, forces[i].y * damp, forces[i].z * damp];
      const step = Math.hypot(dx, dy, dz);
      if (step > 0.35) { const sc = 0.35 / step; dx *= sc; dy *= sc; dz *= sc; }
      pts[i].x += dx; pts[i].y += dy; pts[i].z += dz;
    }
  }
  return pts;
}

function centerAtoms(atoms) {
  if (!atoms.length) return atoms;
  let cx = 0, cy = 0, cz = 0;
  for (const a of atoms) { cx += a.x; cy += a.y; cz += a.z; }
  cx /= atoms.length; cy /= atoms.length; cz /= atoms.length;
  return atoms.map((a) => ({ el: a.el, x: a.x - cx, y: a.y - cy, z: a.z - cz }));
}

function assessGeometry(atoms, bonds, options = {}) {
  if (atoms.length < 2) return { ok: true, badBondRatio: 0 };
  if (!bonds.length) return { ok: false, badBondRatio: 1, message: '分子几乎没有有效化学键' };
  const fromAi = options.fromAi === true;
  const [loF, hiF, minNB, maxBad] = fromAi ? [0.65, 1.45, 0.85, 0.15] : [0.55, 1.65, 0.45, 0.45];

  const edges = buildUniqueEdges(atoms, bonds);
  let bad = 0;
  for (const e of edges) {
    const d = dist(atoms[e.i], atoms[e.j]);
    if (d < loF * e.ideal || d > hiF * e.ideal) bad += 1;
  }
  let overlaps = 0, pairs = 0;
  const bondSet = new Set(edges.map((e) => e.key));
  for (let i = 0; i < atoms.length; i += 1) {
    for (let j = i + 1; j < atoms.length; j += 1) {
      pairs += 1;
      if (!bondSet.has(`${i}-${j}`) && dist(atoms[i], atoms[j]) < minNB) overlaps += 1;
    }
  }
  const badBondRatio = edges.length ? bad / edges.length : 1;
  if (badBondRatio > maxBad) return { ok: false, badBondRatio, message: '3D 坐标与化学键明显不合理，无法可靠展示' };
  if (fromAi ? overlaps > 0 : (pairs > 0 && overlaps / pairs > 0.15)) {
    return { ok: false, badBondRatio, message: '原子重叠过多，结构像「揉成一团」，请换简单分子重试' };
  }
  return { ok: true, badBondRatio };
}

function inferCovalentBonds(atoms) {
  const inferred = [];
  for (let i = 0; i < atoms.length; i += 1) {
    const rA = (COVALENT_RADII_PM[atoms[i].el] || 77) / 100;
    for (let j = i + 1; j < atoms.length; j += 1) {
      const rB = (COVALENT_RADII_PM[atoms[j].el] || 77) / 100;
      const d = dist(atoms[i], atoms[j]);
      if (d >= 0.4 && d <= 1.25 * (rA + rB)) inferred.push([i, j]);
    }
  }
  return inferred;
}

function canonicalizeAndCheckBonds(rawBonds, atoms, fromAi) {
  const n = atoms.length;
  const stats = new Map();
  for (const b of Array.isArray(rawBonds) ? rawBonds : []) {
    if (!Array.isArray(b) || b.length < 2) continue;
    const i = Number(b[0]), j = Number(b[1]);
    if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= n || j >= n || i === j) continue;
    const lo = Math.min(i, j), hi = Math.max(i, j), key = `${lo}-${hi}`;
    const entry = stats.get(key) || { i: lo, j: hi, fwd: 0, rev: 0 };
    if (i < j) entry.fwd += 1; else entry.rev += 1;
    stats.set(key, entry);
  }
  const vals = [...stats.values()];
  const allMirrored = vals.length > 0 && vals.some((v) => v.rev > 0) && vals.every((v) => v.fwd > 0 && v.fwd === v.rev);
  const isBidir = allMirrored && (
    vals.length >= 2 ||
    (VALENCE_MAX[atoms[vals[0].i].el] ?? 6) < vals[0].fwd + vals[0].rev ||
    (VALENCE_MAX[atoms[vals[0].j].el] ?? 6) < vals[0].fwd + vals[0].rev
  );
  let bonds = [];
  const valence = new Array(n).fill(0);
  for (const v of vals) {
    const order = isBidir ? v.fwd : v.fwd + v.rev;
    if (order > 3) throw new Error(`原子 #${v.i + 1}–#${v.j + 1} 间化学键级为 ${order}，超过最大允许三键`);
    valence[v.i] += order; valence[v.j] += order;
    for (let k = 0; k < order; k += 1) bonds.push([v.i, v.j]);
  }
  if (bonds.length === 0 && n > 1) {
    if (fromAi) throw new Error('模型未提供有效化学键 bonds，拒绝保存');
    bonds = inferCovalentBonds(atoms);
    for (const [i, j] of bonds) { valence[i] += 1; valence[j] += 1; }
  }
  for (let i = 0; i < n; i += 1) {
    const maxV = VALENCE_MAX[atoms[i].el];
    if (maxV != null && valence[i] > maxV) throw new Error(`原子 ${atoms[i].el}(#${i + 1}) 成键数 ${valence[i]} 超过最大价态 ${maxV}`);
  }
  return bonds;
}

function validateMoleculePayload(data, options = {}) {
  const maxAtoms = options.maxAtoms || MAX_ATOMS_CLASSROOM;
  const relax = options.relax !== false;
  const strictGeometry = options.strictGeometry === true;
  const fromAi = options.fromAi === true;

  if (!data || typeof data !== 'object') throw new Error('结构数据无效');
  const name = String(data.name || '').trim() || '未命名分子';
  const formula = String(data.formula || '').trim() || '?';
  let desc = String(data.desc || '').trim() || '教学示意结构。';

  const complexHit = rejectComplexPrompt(`${name} ${formula} ${desc}`);
  if (complexHit && fromAi) throw new Error(complexHit);
  if (!Array.isArray(data.atoms) || data.atoms.length < 1) throw new Error('缺少 atoms 原子坐标');
  if (data.atoms.length > maxAtoms) {
    throw new Error(`原子数过多（${data.atoms.length} > ${maxAtoms}）。本应用仅适合高中常见小分子的示意 3D，请换乙醇、苯、葡萄糖等重试。`);
  }
  if (data.atoms.length > MAX_ATOMS_HARD) throw new Error('原子数超过硬上限，拒绝保存');

  let atoms = data.atoms.map((a, i) => {
    const el = String(a?.el || a?.element || '').trim();
    if (!IUPAC_ELEMENTS.has(el)) throw new Error(`第 ${i + 1} 个原子元素符号无效：${el || '(空)'}`);
    const [x, y, z] = [Number(a.x), Number(a.y), Number(a.z)];
    if (![x, y, z].every(Number.isFinite)) throw new Error(`第 ${i + 1} 个原子坐标无效`);
    if (Math.abs(x) > 50 || Math.abs(y) > 50 || Math.abs(z) > 50) throw new Error(`第 ${i + 1} 个原子坐标超出示意范围`);
    return { el, x, y, z };
  });

  if (fromAi && formula !== '?') {
    const parsedF = parseChemicalFormula(formula);
    if (parsedF) {
      const actual = Object.create(null);
      for (const a of atoms) actual[a.el] = (actual[a.el] || 0) + 1;
      const fKeys = Object.keys(parsedF.counts).sort(), aKeys = Object.keys(actual).sort();
      if (fKeys.join(',') !== aKeys.join(',') || fKeys.some((k) => actual[k] !== parsedF.counts[k])) {
        throw new Error(`化学式 ${formula} 与原子列表元素计数不一致`);
      }
    }
  }

  const bonds = canonicalizeAndCheckBonds(data.bonds, atoms, fromAi);
  const n = atoms.length;
  if (n > 3) {
    const deg = new Array(n).fill(0);
    for (const [i, j] of bonds) { deg[i] += 1; deg[j] += 1; }
    if (deg.filter((d) => d === 0).length > Math.max(1, Math.floor(n * 0.25))) {
      throw new Error('存在过多未成键原子，结构不可靠，请换简单分子重试');
    }
  }

  const edges = buildUniqueEdges(atoms, bonds);
  if (relax && edges.length && !isGeometryAcceptable(atoms, edges)) atoms = relaxGeometry(atoms, bonds);
  atoms = centerAtoms(atoms);

  const geo = assessGeometry(atoms, bonds, { fromAi });
  if (!geo.ok && (strictGeometry || fromAi)) {
    throw new Error((geo.message || '3D 结构不合理') + '。复杂分子请勿使用 AI 生成完整模型，可改用高中常见小分子。');
  }
  if (geo.badBondRatio > 0.2 && !/示意|简化/.test(desc)) desc = `${desc}（球棍坐标为 AI 示意，键长可能不完全准确）`;

  const strOr = (v) => String(v || '').trim() || '未知';
  const physics = {
    state: strOr(data.physics?.state), density: strOr(data.physics?.density),
    meltingPoint: strOr(data.physics?.meltingPoint), boilingPoint: strOr(data.physics?.boilingPoint),
  };
  const chemistry = {
    acidity: strOr(data.chemistry?.acidity), solubility: strOr(data.chemistry?.solubility),
    reactivity: strOr(data.chemistry?.reactivity),
  };
  return { name, formula, desc, atoms, bonds, physics, chemistry };
}

const safeParseJson = (str, fallback) => { try { return JSON.parse(str); } catch { return fallback; } };

function mapMoleculeRow(mol) {
  return {
    ...mol,
    atoms: safeParseJson(mol.atoms, []), bonds: safeParseJson(mol.bonds, []),
    physics: safeParseJson(mol.physics || '{}', {}), chemistry: safeParseJson(mol.chemistry || '{}', {}),
    custom: Boolean(mol.custom),
  };
}

module.exports = {
  MAX_ATOMS_CLASSROOM, validateMoleculePayload, rejectComplexPrompt,
  assessGeometry, relaxGeometry, centerAtoms, idealBondLength, safeParseJson, mapMoleculeRow,
};
