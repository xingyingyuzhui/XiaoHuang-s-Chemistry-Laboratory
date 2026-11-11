/**
 * 化学式 → 示意结构（原子 + 键 + 二维坐标），纯函数、无 DOM。
 *
 * 只靠化学式推结构，适合中学常见分子的「示意」，不是真实几何：
 *   - 碳原子按书写顺序连成主链；C6 且氢不多于 6 视为苯环
 *   - 主链前出现的 H 挂到下一个重原子上（HCl、H2O）
 *   - 紧跟 Cn 的 H 在这几个碳上轮流分配（C2H5 → 3 + 2）
 *   - 杂原子后面紧跟 C 时作为桥连进主链（酯 COOC），否则作为取代基挂到最近有空价的碳
 *   - 最后把相邻原子的剩余价配成双键 / 三键（C=C、C≡C、C=O、苯环 Kekulé）
 *
 * 坐标单位：一根重原子键长 = 1。
 */

const VALENCE = { H: 1, C: 4, N: 3, O: 2, S: 2, P: 3, F: 1, Cl: 1, Br: 1, I: 1, B: 3, Si: 4 };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

export function normalizeFormula(f) {
  return String(f || '')
    .replace(/[₀-₉]/g, (d) => SUB[d])
    .replace(/[↑↓\s]/g, '');
}

/** 词法：元素 + 个数，支持一层或多层括号（展开为重复片段，并标记分组起点） */
function tokenize(formula) {
  const s = normalizeFormula(formula);
  if (!s || /[^A-Za-z0-9()]/.test(s)) return null;
  let i = 0;
  function readNum() {
    let j = i;
    while (j < s.length && /\d/.test(s[j])) j++;
    const n = j > i ? parseInt(s.slice(i, j), 10) : 1;
    i = j;
    return n;
  }
  function group() {
    const out = [];
    while (i < s.length) {
      const ch = s[i];
      if (ch === '(') {
        i++;
        const inner = group();
        if (s[i] !== ')') return null;
        i++;
        const n = readNum();
        for (let k = 0; k < n; k++) out.push({ group: inner });
      } else if (ch === ')') {
        return out;
      } else if (/[A-Z]/.test(ch)) {
        let el = ch;
        i++;
        if (i < s.length && /[a-z]/.test(s[i])) el += s[i++];
        if (!VALENCE[el] && !/^(Na|K|Ca|Mg|Al|Fe|Cu|Zn|Ag|Ba|Mn)$/.test(el)) return null;
        out.push({ el, n: readNum() });
      } else {
        return null;
      }
    }
    return out;
  }
  const toks = group();
  if (!toks || i !== s.length) return null;
  return toks;
}

/**
 * @param {string} formula
 * @returns {{ atoms: Array<{el:string,x:number,y:number}>, bonds: Array<{a:number,b:number,order:number}> } | null}
 */
export function buildMolecule(formula) {
  const toks = tokenize(formula);
  if (!toks) return null;

  const atoms = [];
  const bonds = [];
  const backbone = [];
  const val = (el) => VALENCE[el] ?? 2;
  const used = [];
  const free = (i) => val(atoms[i].el) - used[i];
  const add = (el) => {
    atoms.push({ el });
    used.push(0);
    return atoms.length - 1;
  };
  const bond = (a, b) => {
    bonds.push({ a, b, order: 1 });
    used[a]++;
    used[b]++;
  };

  // 扁平化：括号片段在原位置展开，记录片段所挂的锚点
  const flat = [];
  (function walk(list, anchorMark) {
    for (const t of list) {
      if (t.group) {
        flat.push({ groupStart: true });
        walk(t.group);
        flat.push({ groupEnd: true });
      } else {
        flat.push(t);
      }
    }
  })(toks);

  const hasCarbon = flat.some((t) => t.el === 'C');
  const totalC = flat.filter((t) => t.el === 'C').reduce((s, t) => s + t.n, 0);
  const totalH = flat.filter((t) => t.el === 'H').reduce((s, t) => s + t.n, 0);
  const ring = totalC === 6 && totalH <= 6 && flat.filter((t) => t.el === 'C').length === 1;

  let pendingH = 0;
  let lastAtom = -1;
  let lastCarbons = [];
  let center = -1;
  const groupAnchors = [];

  const lastBackboneWithFree = () => {
    for (let k = backbone.length - 1; k >= 0; k--) if (free(backbone[k]) > 0) return backbone[k];
    return -1;
  };

  for (let ti = 0; ti < flat.length; ti++) {
    const t = flat[ti];
    if (t.groupStart) {
      groupAnchors.push(lastAtom >= 0 ? lastAtom : center);
      continue;
    }
    if (t.groupEnd) {
      groupAnchors.pop();
      continue;
    }
    const anchorOverride = groupAnchors.length ? groupAnchors[groupAnchors.length - 1] : -1;
    const next = flat[ti + 1];

    if (t.el === 'H') {
      if (lastAtom < 0) {
        pendingH += t.n;
        continue;
      }
      if (lastCarbons.length > 1) {
        // 多个碳一起写（C2H5）：轮流分到这几个碳上
        let k = 0;
        let left = t.n;
        let guard = 0;
        while (left > 0 && guard++ < 64) {
          const c = lastCarbons[k % lastCarbons.length];
          // 给后续还要连的重原子留一价（最后一个碳）
          const reserve = c === lastCarbons[lastCarbons.length - 1] && next && next.el && next.el !== 'H' ? 1 : 0;
          if (free(c) - reserve > 0) {
            bond(c, add('H'));
            left--;
          }
          k++;
          if (k > lastCarbons.length * 8) break;
        }
        for (let r = 0; r < left; r++) {
          const host = lastBackboneWithFree();
          if (host < 0) return null;
          bond(host, add('H'));
        }
      } else {
        for (let r = 0; r < t.n; r++) {
          let host = lastAtom;
          if (free(host) <= 0) host = lastBackboneWithFree();
          if (host < 0) return null;
          bond(host, add('H'));
        }
      }
      continue;
    }

    const isC = t.el === 'C';
    lastCarbons = [];
    for (let r = 0; r < t.n; r++) {
      const idx = add(t.el);
      if (isC) {
        if (ring && backbone.length && backbone.length < 6) bond(backbone[backbone.length - 1], idx);
        else if (!ring && backbone.length) {
          const prev = backbone[backbone.length - 1];
          if (free(prev) > 0) bond(prev, idx);
          else {
            const host = lastBackboneWithFree();
            if (host >= 0) bond(host, idx);
          }
        } else if (!ring && anchorOverride >= 0 && free(anchorOverride) > 0) {
          bond(anchorOverride, idx);
        }
        backbone.push(idx);
        lastCarbons.push(idx);
        if (ring && backbone.length === 6) bond(backbone[5], backbone[0]);
      } else if (!hasCarbon) {
        // 无机：第一个重原子做中心，其余挂中心（满了就接到上一个重原子）
        if (center < 0) {
          center = idx;
          backbone.push(idx);
        } else {
          let host = anchorOverride >= 0 ? anchorOverride : center;
          if (free(host) <= 0) host = lastAtom >= 0 && lastAtom !== idx && free(lastAtom) > 0 ? lastAtom : -1;
          if (host < 0) host = lastBackboneWithFree();
          if (host < 0) return null;
          bond(host, idx);
          backbone.push(idx);
        }
      } else {
        // 有机中的杂原子：后面紧跟 C → 桥连进主链；否则做取代基
        const bridge = next && next.el === 'C' && r === t.n - 1;
        let host = anchorOverride >= 0 && free(anchorOverride) > 0 ? anchorOverride : -1;
        if (host < 0) {
          host = backbone.length && free(backbone[backbone.length - 1]) > 0 ? backbone[backbone.length - 1] : lastBackboneWithFree();
        }
        if (host >= 0) bond(host, idx);
        if (bridge) backbone.push(idx);
      }
      if (center < 0 && !hasCarbon) center = idx;
      lastAtom = idx;
      if (pendingH) {
        for (let k = 0; k < pendingH; k++) {
          if (free(idx) <= 0) return null;
          bond(idx, add('H'));
        }
        pendingH = 0;
      }
    }
  }

  // 只有氢（H2）
  if (!atoms.length && pendingH) {
    for (let k = 0; k < pendingH; k++) {
      const idx = add('H');
      if (k) bond(idx - 1, idx);
    }
    backbone.push(0);
  }
  if (!atoms.length) return null;

  // 剩余价配成多重键：沿键表反复配对，直到没有可配的
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 20) {
    changed = false;
    for (const b of bonds) {
      if (b.order < 3 && free(b.a) > 0 && free(b.b) > 0 && atoms[b.a].el !== 'H' && atoms[b.b].el !== 'H') {
        // 苯环：只在交替位置配双键
        if (ring && b.order >= 2) continue;
        b.order++;
        used[b.a]++;
        used[b.b]++;
        changed = true;
        if (ring) break;
      }
    }
  }

  layout(atoms, bonds, backbone, ring);
  return { atoms, bonds };
}

/** 二维布局：主链锯齿 / 苯环正六边形，其余原子按 BFS 放进最大空角 */
function layout(atoms, bonds, backbone, ring) {
  const nb = atoms.map(() => []);
  bonds.forEach((b) => {
    nb[b.a].push(b.b);
    nb[b.b].push(b.a);
  });
  const placed = new Set();
  if (ring) {
    backbone.slice(0, 6).forEach((idx, k) => {
      const a = -Math.PI / 2 + (k * Math.PI) / 3;
      atoms[idx].x = Math.cos(a);
      atoms[idx].y = Math.sin(a);
      placed.add(idx);
    });
  } else {
    // 主链只取彼此相连的那一串
    const chain = [];
    for (const idx of backbone) {
      if (!chain.length || nb[chain[chain.length - 1]].includes(idx)) chain.push(idx);
    }
    chain.forEach((idx, k) => {
      atoms[idx].x = k * 0.866;
      atoms[idx].y = k % 2 ? -0.5 : 0;
      placed.add(idx);
    });
  }
  if (!placed.size) {
    atoms[0].x = 0;
    atoms[0].y = 0;
    placed.add(0);
  }

  const queue = [...placed];
  while (queue.length) {
    const p = queue.shift();
    const kids = nb[p].filter((c) => !placed.has(c));
    if (!kids.length) continue;
    const taken = nb[p]
      .filter((c) => placed.has(c))
      .map((c) => Math.atan2(atoms[c].y - atoms[p].y, atoms[c].x - atoms[p].x))
      .sort((a, b) => a - b);
    let angles;
    if (!taken.length) {
      // 中心原子：H2O 这类两个取代基做 V 形
      const start = kids.length === 2 ? Math.PI / 2 + 0.95 : -Math.PI / 2;
      const step = kids.length === 2 ? -1.9 : (2 * Math.PI) / kids.length;
      angles = kids.map((_, i) => start + i * step);
    } else {
      // 找最大空角，平均放
      let bestGap = -1;
      let bestStart = 0;
      for (let i = 0; i < taken.length; i++) {
        const a = taken[i];
        const b = i + 1 < taken.length ? taken[i + 1] : taken[0] + 2 * Math.PI;
        if (b - a > bestGap) {
          bestGap = b - a;
          bestStart = a;
        }
      }
      angles = kids.map((_, i) => bestStart + (bestGap * (i + 1)) / (kids.length + 1));
    }
    kids.forEach((c, i) => {
      const len = atoms[c].el === 'H' || atoms[p].el === 'H' ? 0.72 : 1;
      atoms[c].x = atoms[p].x + Math.cos(angles[i]) * len;
      atoms[c].y = atoms[p].y + Math.sin(angles[i]) * len;
      placed.add(c);
      queue.push(c);
    });
  }

  // 居中
  const cx = atoms.reduce((s, a) => s + a.x, 0) / atoms.length;
  const cy = atoms.reduce((s, a) => s + a.y, 0) / atoms.length;
  atoms.forEach((a) => {
    a.x -= cx;
    a.y -= cy;
  });
}

/** 分子外接尺寸（含原子半径余量） */
export function moleculeBox(mol) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of mol.atoms) {
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
  }
  const pad = 0.55;
  return { w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}
