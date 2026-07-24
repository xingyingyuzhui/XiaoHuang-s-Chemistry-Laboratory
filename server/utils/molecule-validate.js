/**
 * 分子结构校验 + 几何整理（API 写入与 AI 生成共用）
 * 复杂药物/大分子不适合靠 LLM 编坐标，需在入口与校验中拦住
 */

const MAX_ATOMS_CLASSROOM = 24;
const MAX_ATOMS_HARD = 32;

/** 明显超出中学 3D 示意能力的关键词 */
const COMPLEX_MOLECULE_RE =
  /紫杉醇|红霉素|阿莫西林|青霉素|头孢|胰岛素|血红蛋白|叶绿素|维生素\s*b12|维生素b12|蛋白质|多肽|dna|rna|高分子|聚合物|淀粉|纤维素|石墨烯|富勒烯|碳纳米|taxol|paclitaxel|amoxicillin|penicillin|erythromycin|insulin|hemoglobin|chlorophyll|polymer|protein|peptide|fullerene/i;

/**
 * 用户描述是否像「过大、过复杂」的分子
 * @returns {string|null} 拒绝原因，null 表示可通过
 */
function rejectComplexPrompt(prompt) {
  const p = String(prompt || '').trim();
  if (!p) return null;
  if (COMPLEX_MOLECULE_RE.test(p)) {
    return (
      '该分子结构过于复杂，课堂 3D 示意无法可靠生成完整球棍模型。' +
      '请改用高中常见分子（如乙醇、葡萄糖、苯、乙酸、氨、臭氧等），' +
      '或描述其简化核心片段。'
    );
  }
  // 化学式里原子数粗估：C46 这类
  const carbon = p.match(/C\s*([₀-₉\d]{2,})/i);
  if (carbon) {
    const n = parseInt(
      String(carbon[1]).replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (d) =>
        '0123456789'['₀₁₂₃₄₅₆₇₈₉'.indexOf(d)],
      ),
      10,
    );
    if (n >= 20) {
      return (
        '化学式规模过大（碳原子数过多），不适合本应用的 AI 示意 3D。' +
        '请换成原子数更少的高中分子。'
      );
    }
  }
  return null;
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 弹簧松弛：把离谱键长拉回合理范围，避免完全乱成一团
 */
function relaxGeometry(atoms, bonds, iterations = 80) {
  if (!atoms.length || !bonds.length) return atoms;
  const pts = atoms.map((a) => ({ el: a.el, x: a.x, y: a.y, z: a.z }));
  const ideal = 1.45;
  const kSpring = 0.35;
  const kRepel = 0.08;

  for (let iter = 0; iter < iterations; iter++) {
    const forces = pts.map(() => ({ x: 0, y: 0, z: 0 }));

    // 键弹簧
    for (const [i, j] of bonds) {
      if (i < 0 || j < 0 || i >= pts.length || j >= pts.length) continue;
      const a = pts[i];
      const b = pts[j];
      let d = dist(a, b);
      if (d < 1e-6) d = 1e-6;
      const f = kSpring * (d - ideal);
      const ux = (b.x - a.x) / d;
      const uy = (b.y - a.y) / d;
      const uz = (b.z - a.z) / d;
      forces[i].x += f * ux;
      forces[i].y += f * uy;
      forces[i].z += f * uz;
      forces[j].x -= f * ux;
      forces[j].y -= f * uy;
      forces[j].z -= f * uz;
    }

    // 弱排斥，防重叠
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        let d = dist(pts[i], pts[j]);
        if (d < 1e-6) d = 1e-6;
        if (d > 3.5) continue;
        const f = kRepel / (d * d);
        const ux = (pts[j].x - pts[i].x) / d;
        const uy = (pts[j].y - pts[i].y) / d;
        const uz = (pts[j].z - pts[i].z) / d;
        forces[i].x -= f * ux;
        forces[i].y -= f * uy;
        forces[i].z -= f * uz;
        forces[j].x += f * ux;
        forces[j].y += f * uy;
        forces[j].z += f * uz;
      }
    }

    const damp = 0.4 * (1 - iter / iterations * 0.5);
    for (let i = 0; i < pts.length; i++) {
      pts[i].x += forces[i].x * damp;
      pts[i].y += forces[i].y * damp;
      pts[i].z += forces[i].z * damp;
    }
  }

  return pts;
}

/** 居中 */
function centerAtoms(atoms) {
  if (!atoms.length) return atoms;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const a of atoms) {
    cx += a.x;
    cy += a.y;
    cz += a.z;
  }
  cx /= atoms.length;
  cy /= atoms.length;
  cz /= atoms.length;
  return atoms.map((a) => ({
    el: a.el,
    x: a.x - cx,
    y: a.y - cy,
    z: a.z - cz,
  }));
}

/**
 * 评估几何是否可用（键长是否离谱、是否大量重叠）
 * @returns {{ ok: boolean, badBondRatio: number, message?: string }}
 */
function assessGeometry(atoms, bonds) {
  if (atoms.length < 2) return { ok: true, badBondRatio: 0 };
  if (!bonds.length) {
    return { ok: false, badBondRatio: 1, message: '分子几乎没有有效化学键' };
  }

  let bad = 0;
  let total = 0;
  for (const [i, j] of bonds) {
    if (i < 0 || j < 0 || i >= atoms.length || j >= atoms.length) {
      bad += 1;
      total += 1;
      continue;
    }
    total += 1;
    const d = dist(atoms[i], atoms[j]);
    // 合理共价键大致 0.7～2.6 Å（示意可略宽）
    if (d < 0.55 || d > 3.2) bad += 1;
  }

  // 重叠：过近的非键原子对
  let overlaps = 0;
  let pairs = 0;
  const bondSet = new Set(bonds.map(([i, j]) => (i < j ? `${i}-${j}` : `${j}-${i}`)));
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      pairs += 1;
      const key = `${i}-${j}`;
      if (bondSet.has(key)) continue;
      if (dist(atoms[i], atoms[j]) < 0.45) overlaps += 1;
    }
  }

  const badBondRatio = total ? bad / total : 1;
  if (badBondRatio > 0.45) {
    return {
      ok: false,
      badBondRatio,
      message: '3D 坐标与化学键明显不合理，无法可靠展示',
    };
  }
  if (pairs > 0 && overlaps / pairs > 0.15) {
    return {
      ok: false,
      badBondRatio,
      message: '原子重叠过多，结构像「揉成一团」，请换简单分子重试',
    };
  }
  return { ok: true, badBondRatio };
}

function validateMoleculePayload(data, options = {}) {
  const maxAtoms = options.maxAtoms || MAX_ATOMS_CLASSROOM;
  const relax = options.relax !== false;
  const strictGeometry = options.strictGeometry === true;

  if (!data || typeof data !== 'object') {
    throw new Error('结构数据无效');
  }

  const name = String(data.name || '').trim() || '未命名分子';
  let formula = String(data.formula || '').trim() || '?';
  let desc = String(data.desc || '').trim() || '教学示意结构。';

  // 名称/描述里也拦复杂药物
  const complexHit = rejectComplexPrompt(`${name} ${formula} ${desc}`);
  if (complexHit && options.fromAi) {
    throw new Error(complexHit);
  }

  if (!Array.isArray(data.atoms) || data.atoms.length < 1) {
    throw new Error('缺少 atoms 原子坐标');
  }
  if (data.atoms.length > maxAtoms) {
    throw new Error(
      `原子数过多（${data.atoms.length} > ${maxAtoms}）。` +
        '本应用仅适合高中常见小分子的示意 3D，请换乙醇、苯、葡萄糖等重试。',
    );
  }
  if (data.atoms.length > MAX_ATOMS_HARD) {
    throw new Error('原子数超过硬上限，拒绝保存');
  }

  let atoms = data.atoms.map((a, i) => {
    const el = String(a.el || a.element || '').trim();
    if (!/^[A-Z][a-z]?$/.test(el)) {
      throw new Error(`第 ${i + 1} 个原子元素符号无效：${el || '(空)'}`);
    }
    const x = Number(a.x);
    const y = Number(a.y);
    const z = Number(a.z);
    if (![x, y, z].every(Number.isFinite)) {
      throw new Error(`第 ${i + 1} 个原子坐标无效`);
    }
    // 拒绝天文数字坐标
    if (Math.abs(x) > 50 || Math.abs(y) > 50 || Math.abs(z) > 50) {
      throw new Error(`第 ${i + 1} 个原子坐标超出示意范围`);
    }
    return { el, x, y, z };
  });

  const n = atoms.length;
  const bonds = [];
  const rawBonds = Array.isArray(data.bonds) ? data.bonds : [];
  for (const b of rawBonds) {
    if (!Array.isArray(b) || b.length < 2) continue;
    const i = Number(b[0]);
    const j = Number(b[1]);
    if (!Number.isInteger(i) || !Number.isInteger(j)) continue;
    if (i < 0 || j < 0 || i >= n || j >= n || i === j) continue;
    bonds.push([i, j]);
  }

  if (bonds.length === 0 && n > 1) {
    for (let i = 0; i < n - 1; i++) {
      bonds.push([i, i + 1]);
    }
  }

  // 连通性：孤立原子过多
  if (n > 3) {
    const deg = new Array(n).fill(0);
    for (const [i, j] of bonds) {
      deg[i] += 1;
      deg[j] += 1;
    }
    const isolated = deg.filter((d) => d === 0).length;
    if (isolated > Math.max(1, Math.floor(n * 0.25))) {
      throw new Error('存在过多未成键原子，结构不可靠，请换简单分子重试');
    }
  }

  if (relax && bonds.length) {
    atoms = relaxGeometry(atoms, bonds);
  }
  atoms = centerAtoms(atoms);

  const geo = assessGeometry(atoms, bonds);
  if (!geo.ok && (strictGeometry || options.fromAi)) {
    throw new Error(
      (geo.message || '3D 结构不合理') +
        '。复杂分子请勿使用 AI 生成完整模型，可改用高中常见小分子。',
    );
  }

  // 示意说明：若键长仍有一定比例不佳，在 desc 标注
  if (geo.badBondRatio > 0.2) {
    if (!/示意|简化/.test(desc)) {
      desc = `${desc}（球棍坐标为 AI 示意，键长可能不完全准确）`;
    }
  }

  const physics = {
    state: String(data.physics?.state || '').trim() || '未知',
    density: String(data.physics?.density || '').trim() || '未知',
    meltingPoint: String(data.physics?.meltingPoint || '').trim() || '未知',
    boilingPoint: String(data.physics?.boilingPoint || '').trim() || '未知',
  };

  const chemistry = {
    acidity: String(data.chemistry?.acidity || '').trim() || '未知',
    solubility: String(data.chemistry?.solubility || '').trim() || '未知',
    reactivity: String(data.chemistry?.reactivity || '').trim() || '未知',
  };

  return { name, formula, desc, atoms, bonds, physics, chemistry };
}

function safeParseJson(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function mapMoleculeRow(mol) {
  return {
    ...mol,
    atoms: safeParseJson(mol.atoms, []),
    bonds: safeParseJson(mol.bonds, []),
    physics: safeParseJson(mol.physics || '{}', {}),
    chemistry: safeParseJson(mol.chemistry || '{}', {}),
    custom: Boolean(mol.custom),
  };
}

module.exports = {
  MAX_ATOMS_CLASSROOM,
  validateMoleculePayload,
  rejectComplexPrompt,
  assessGeometry,
  relaxGeometry,
  centerAtoms,
  safeParseJson,
  mapMoleculeRow,
};
