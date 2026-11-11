/**
 * 反应原子动画的「剧本」：纯函数、无 DOM。
 *
 * buildReactionPlan(reaction) 把方程式拆成分子实例，给每个反应物原子找到生成物里的去处，
 * 并标出每根键的命运：
 *   keep   两端原子去了同一个生成物且仍相连（键级可能变化，如 C=C → C–C）
 *   break  反应物里有、生成物里没有 → 断键阶段闪红淡出
 *   form   生成物里新出现 → 成键阶段闪绿淡入
 * frameAt(plan, t) 按播放时间（秒）给出每一帧的原子位置与键透明度，可任意拖动。
 *
 * 坐标单位：键长 = 1；舞台再按画布大小缩放。
 */
import { buildMolecule, moleculeBox, normalizeFormula } from './atom-layout.js';

/** 一条反应最多展开的原子数（太多就退回 3D 模式） */
const MAX_ATOMS = 64;
const MAX_INSTANCES = 4;

/**
 * 解析「2 H₂ + O₂ → 2 H₂O」；支持 → ⇌ = ，系数可带空格
 * @returns {{ left: Array<{formula:string, coef:number}>, right: Array<{formula:string, coef:number}> } | null}
 */
export function parseSides(equation) {
  const raw = String(equation || '').replace(/[₀-₉]/g, (d) => normalizeFormula(d));
  const parts = raw.split(/→|⇌|⟶|=|->/);
  if (parts.length !== 2) return null;
  const side = (s) =>
    s
      .split('+')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const m = /^(\d+)\s*(.+)$/.exec(x);
        const coef = m ? parseInt(m[1], 10) : 1;
        return { formula: normalizeFormula(m ? m[2] : x), coef };
      });
  const left = side(parts[0]);
  const right = side(parts[1]);
  if (!left.length || !right.length) return null;
  return { left, right };
}

/**
 * 把一侧摆成「列」：每种物质一列，系数 >1 时纵向叠放
 * @returns {Array<{ formula, coef, mols: Array<{atoms, bonds, cx, cy}>, cx, w }>}
 */
function arrangeSide(list) {
  const cols = [];
  for (const sp of list) {
    const base = buildMolecule(sp.formula);
    if (!base) return null;
    const n = Math.min(sp.coef, MAX_INSTANCES);
    const box = moleculeBox(base);
    const mols = [];
    for (let k = 0; k < n; k++) {
      mols.push({
        atoms: base.atoms.map((a) => ({ ...a })),
        bonds: base.bonds.map((b) => ({ ...b })),
        cy: (k - (n - 1) / 2) * (box.h + 0.35),
      });
    }
    cols.push({ formula: sp.formula, coef: sp.coef, mols, w: box.w, h: box.h * n + 0.35 * (n - 1) });
  }
  return cols;
}

/** 列横向排开，返回整体宽度；gap 里留给「+」号 */
function placeColumns(cols, x0, gap) {
  let x = x0;
  for (const c of cols) {
    c.cx = x + c.w / 2;
    x += c.w + gap;
  }
  return x - gap - x0;
}

/**
 * 原子对应：逐个生成物原子挑同元素的反应物原子
 * 优先：已对应邻居的原邻居（保住骨架）> 同一个反应物分子已有原子去了这个生成物分子 > 先到先得
 */
function mapAtoms(R, P) {
  const map = new Array(R.length).fill(-1);
  const inv = new Array(P.length).fill(-1);
  const rNb = R.map(() => new Set());
  const pNb = P.map(() => new Set());
  for (const a of R) for (const n of a.nb) rNb[a.id].add(n);
  for (const a of P) for (const n of a.nb) pNb[a.id].add(n);

  // 重原子先对应，氢跟着骨架走
  const order = [...P].sort((a, b) => (a.el === 'H') - (b.el === 'H') || a.mol - b.mol || a.id - b.id);
  for (const p of order) {
    let best = -1;
    let bestScore = -Infinity;
    for (const r of R) {
      if (r.el !== p.el || map[r.id] >= 0) continue;
      let score = 0;
      for (const pn of pNb[p.id]) {
        const rn = inv[pn];
        if (rn >= 0 && rNb[r.id].has(rn)) score += 10;
      }
      for (const pa of P) {
        if (pa.mol === p.mol && inv[pa.id] >= 0 && R[inv[pa.id]].mol === r.mol) {
          score += 3;
          break;
        }
      }
      score -= r.id * 0.001;
      if (score > bestScore) {
        bestScore = score;
        best = r.id;
      }
    }
    if (best >= 0) {
      map[best] = p.id;
      inv[p.id] = best;
    }
  }
  return { map, inv };
}

/**
 * 断/成一根键的代价。酰基碳（连着 C=O 的碳）上的 C–O 单键代价略低：
 * 这正是「酸脱羟基、醇脱氢」的依据，让酯化反应的对应符合教材。
 */
function breakCost(atoms, bonds, b) {
  if (b.order === 1) {
    const [x, y] = [atoms[b.a], atoms[b.b]];
    const c = x.el === 'C' && y.el === 'O' ? x : y.el === 'C' && x.el === 'O' ? y : null;
    if (c) {
      const acyl = bonds.some(
        (o) => o.order === 2 && (o.a === c.id || o.b === c.id) && atoms[o.a === c.id ? o.b : o.a].el === 'O',
      );
      if (acyl) return 0.9;
    }
  }
  return 1;
}

/**
 * 映射总代价：断键 + 成键 + 键级变化（每级 0.5）
 * @param {boolean} heavyOnly 只看重原子之间的键（先定骨架）
 */
function mappingCost(R, P, map, heavyOnly = false) {
  const heavy = (atoms, b) => atoms[b.a].el !== 'H' && atoms[b.b].el !== 'H';
  const pBonds = heavyOnly ? P.bonds.filter((b) => heavy(P.atoms, b)) : P.bonds;
  const rBonds = heavyOnly ? R.bonds.filter((b) => heavy(R.atoms, b)) : R.bonds;
  const pIndex = new Map(pBonds.map((b) => [`${Math.min(b.a, b.b)}-${Math.max(b.a, b.b)}`, b]));
  const seen = new Set();
  let cost = 0;
  for (const b of rBonds) {
    const pa = map[b.a];
    const pb = map[b.b];
    const key = pa >= 0 && pb >= 0 ? `${Math.min(pa, pb)}-${Math.max(pa, pb)}` : '';
    const hit = key && pIndex.get(key);
    if (hit) {
      seen.add(key);
      cost += Math.abs(hit.order - b.order) * 0.5;
    } else cost += breakCost(R.atoms, R.bonds, b);
  }
  for (const b of pBonds) {
    if (!seen.has(`${Math.min(b.a, b.b)}-${Math.max(b.a, b.b)}`)) cost += 1;
  }
  return cost;
}

/** 同元素两两交换爬山；filter 限定参与交换的原子 */
function hillClimb(R, P, m, filter, heavyOnly) {
  let best = mappingCost(R, P, m, heavyOnly);
  for (let pass = 0; pass < 10; pass++) {
    let improved = false;
    for (let i = 0; i < m.length; i++) {
      if (!filter(R.atoms[i])) continue;
      for (let j = i + 1; j < m.length; j++) {
        if (R.atoms[i].el !== R.atoms[j].el || m[i] === m[j]) continue;
        [m[i], m[j]] = [m[j], m[i]];
        const c = mappingCost(R, P, m, heavyOnly);
        if (c < best - 1e-9) {
          best = c;
          improved = true;
        } else {
          [m[i], m[j]] = [m[j], m[i]];
        }
      }
    }
    if (!improved) break;
  }
}

/**
 * 两段式：先只按重原子骨架优化（键级变化比断了再连便宜，保住 C–O 等骨架），
 * 再让每个 H 尽量跟着原来相连的重原子走，最后整体微调 H。
 */
/**
 * 骨架阶段跳出局部最优：同时做两次交换（如酯化里「两个 O 互换 + 乙基两个 C 互换」）
 * 重原子少（≤ 24），四重循环可以接受
 */
function pairSwapClimb(R, P, m) {
  const ids = R.atoms.filter((a) => a.el !== 'H').map((a) => a.id);
  if (ids.length > 24) return;
  const pairs = [];
  for (let x = 0; x < ids.length; x++) {
    for (let y = x + 1; y < ids.length; y++) {
      const i = ids[x];
      const j = ids[y];
      if (R.atoms[i].el === R.atoms[j].el && m[i] !== m[j]) pairs.push([i, j]);
    }
  }
  let best = mappingCost(R, P, m, true);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 6) {
    improved = false;
    outer: for (let u = 0; u < pairs.length; u++) {
      for (let v = u + 1; v < pairs.length; v++) {
        const [i, j] = pairs[u];
        const [k, l] = pairs[v];
        if (i === k || i === l || j === k || j === l) continue;
        [m[i], m[j]] = [m[j], m[i]];
        [m[k], m[l]] = [m[l], m[k]];
        const c = mappingCost(R, P, m, true);
        if (c < best - 1e-9) {
          best = c;
          improved = true;
          break outer;
        }
        [m[k], m[l]] = [m[l], m[k]];
        [m[i], m[j]] = [m[j], m[i]];
      }
    }
    if (improved) hillClimb(R, P, m, (a) => a.el !== 'H', true);
  }
}

function refineMapping(R, P, { map }) {
  const m = map.slice();
  hillClimb(R, P, m, (a) => a.el !== 'H', true);
  pairSwapClimb(R, P, m);

  // 重新分配 H：优先去「原来所连重原子」在生成物里对应的那个原子身上
  const freeP = new Set(P.atoms.filter((a) => a.el === 'H').map((a) => a.id));
  const rH = R.atoms.filter((a) => a.el === 'H');
  rH.forEach((h) => {
    m[h.id] = -1;
  });
  for (const h of rH) {
    const host = h.nb.find((n) => R.atoms[n].el !== 'H');
    const target = host !== undefined ? m[host] : -1;
    if (target < 0) continue;
    const cand = P.atoms[target].nb.find((n) => freeP.has(n) && P.atoms[n].el === 'H');
    if (cand !== undefined) {
      m[h.id] = cand;
      freeP.delete(cand);
    }
  }
  for (const h of rH) {
    if (m[h.id] >= 0) continue;
    const next = freeP.values().next();
    if (!next.done) {
      m[h.id] = next.value;
      freeP.delete(next.value);
    }
  }
  hillClimb(R, P, m, (a) => a.el === 'H', false);

  const inv = new Array(P.atoms.length).fill(-1);
  m.forEach((p, r) => {
    if (p >= 0) inv[p] = r;
  });
  return { map: m, inv };
}

function flatten(cols, sideX) {
  const atoms = [];
  const bonds = [];
  const labels = [];
  let molId = 0;
  for (const c of cols) {
    for (const m of c.mols) {
      const base = atoms.length;
      m.atoms.forEach((a) => {
        atoms.push({ id: atoms.length, el: a.el, x: c.cx + a.x + sideX, y: m.cy + a.y, mol: molId, nb: [] });
      });
      m.bonds.forEach((b) => {
        bonds.push({ a: base + b.a, b: base + b.b, order: b.order });
        atoms[base + b.a].nb.push(base + b.b);
        atoms[base + b.b].nb.push(base + b.a);
      });
      molId++;
    }
    labels.push({ formula: c.formula, coef: c.coef, x: c.cx + sideX, y: c.h / 2 + 0.75 });
  }
  return { atoms, bonds, labels };
}

/**
 * @param {{ equation: string, steps?: Array<{ t:number, focus?:string }> }} reaction
 * @param {(step:any) => number} stepTime 步骤 → 播放秒数（含放大倍数）
 * @param {number} total 总时长（秒）
 */
export function buildReactionPlan(reaction, stepTime, total) {
  const sides = parseSides(reaction?.equation);
  if (!sides) return null;
  const L = arrangeSide(sides.left);
  const Rt = arrangeSide(sides.right);
  if (!L || !Rt) return null;

  const gap = 1.1;
  const arrowW = 2.2;
  const wl = placeColumns(L, 0, gap);
  const wr = placeColumns(Rt, 0, gap);
  const width = wl + arrowW + wr;
  const leftX = -width / 2;
  const rightX = leftX + wl + arrowW;
  const R = flatten(L, leftX);
  const P = flatten(Rt, rightX);
  if (R.atoms.length + P.atoms.length > MAX_ATOMS * 2) return null;

  const { map, inv } = refineMapping(R, P, mapAtoms(R.atoms, P.atoms));

  // 键的命运
  const pKey = new Map(P.bonds.map((b) => [`${Math.min(b.a, b.b)}-${Math.max(b.a, b.b)}`, b]));
  const bonds = [];
  const seenP = new Set();
  for (const b of R.bonds) {
    const pa = map[b.a];
    const pb = map[b.b];
    const key = pa >= 0 && pb >= 0 ? `${Math.min(pa, pb)}-${Math.max(pa, pb)}` : '';
    const pb2 = key && pKey.get(key);
    if (pb2) {
      seenP.add(key);
      bonds.push({ a: b.a, b: b.b, from: b.order, to: pb2.order, fate: 'keep' });
    } else {
      bonds.push({ a: b.a, b: b.b, from: b.order, to: 0, fate: 'break' });
    }
  }
  // 生成物新键：端点用反应物原子编号表示（没有对应的生成物原子单独追加）
  const extra = [];
  const pToNode = (pid) => (inv[pid] >= 0 ? inv[pid] : null);
  for (const b of P.bonds) {
    const key = `${Math.min(b.a, b.b)}-${Math.max(b.a, b.b)}`;
    if (seenP.has(key)) continue;
    bonds.push({ pa: b.a, pb: b.b, a: pToNode(b.a), b: pToNode(b.b), from: 0, to: b.order, fate: 'form' });
  }

  // 节点：每个反应物原子一个（起点 → 终点）；生成物里多出来的原子单独淡入
  const nodes = R.atoms.map((a) => {
    const p = map[a.id] >= 0 ? P.atoms[map[a.id]] : null;
    return { el: a.el, x0: a.x, y0: a.y, x1: p ? p.x : a.x, y1: p ? p.y : a.y, gone: !p, rMol: a.mol, pMol: p ? p.mol : -1 };
  });
  P.atoms.forEach((p) => {
    if (inv[p.id] < 0) {
      extra.push(nodes.length);
      nodes.push({ el: p.el, x0: p.x, y0: p.y, x1: p.x, y1: p.y, born: true, rMol: -1, pMol: p.mol });
    }
  });
  // 把 form 键里没有反应物原子的一端指向新节点
  let ei = 0;
  const bornIndex = new Map();
  P.atoms.forEach((p) => {
    if (inv[p.id] < 0) bornIndex.set(p.id, extra[ei++]);
  });
  for (const b of bonds) {
    if (b.fate !== 'form') continue;
    if (b.a === null) b.a = bornIndex.get(b.pa);
    if (b.b === null) b.b = bornIndex.get(b.pb);
  }

  // 时间节点：取步骤的 focus；缺省按总长三等分
  const steps = reaction.steps || [];
  const at = (focus) => {
    const s = steps.find((x) => x.focus === focus);
    return s ? stepTime(s) : null;
  };
  const tBreak = at('break') ?? total * 0.3;
  const tJoin = Math.max(tBreak + 0.5, at('join') ?? total * 0.5);
  const tProduct = Math.max(tJoin + 0.8, at('product') ?? total * 0.75);

  // 舞台范围
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    for (const [x, y] of [
      [n.x0, n.y0],
      [n.x1, n.y1],
    ]) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  for (const l of [...R.labels, ...P.labels]) maxY = Math.max(maxY, l.y + 0.4);

  const counts = { keep: 0, break: 0, form: 0, orderChange: 0 };
  bonds.forEach((b) => {
    counts[b.fate]++;
    if (b.fate === 'keep' && b.from !== b.to) counts.orderChange++;
  });

  return {
    nodes,
    bonds,
    labels: { left: R.labels, right: P.labels },
    arrowX: leftX + wl + arrowW / 2,
    bounds: { minX: minX - 0.7, maxX: maxX + 0.7, minY: minY - 0.7, maxY: maxY + 0.2 },
    times: { tBreak, tJoin, tProduct, total },
    counts,
  };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/**
 * 某一时刻的画面
 * @returns {{ atoms: Array<{el,x,y,alpha}>, bonds: Array<{a,b,lines,alpha,fate,flash,extraAlpha}>, phase: string, labelAlpha: {left:number,right:number}, jitter:number }}
 */
export function frameAt(plan, t) {
  const { tBreak, tJoin, tProduct } = plan.times;
  // 反应物先向箭头靠拢一点
  const approach = ease(clamp01(t / Math.max(0.01, tBreak)));
  const move = ease(clamp01((t - tJoin) / Math.max(0.01, tProduct - tJoin)));
  const breakU = clamp01((t - tBreak) / Math.max(0.01, tJoin - tBreak));
  let phase = 'reactant';
  if (t >= tProduct) phase = 'product';
  else if (t >= tJoin) phase = 'join';
  else if (t >= tBreak) phase = 'break';

  const pull = 0.35 * approach;
  const atoms = plan.nodes.map((n) => {
    const sx = n.x0 + (plan.arrowX - n.x0) * pull * 0.25;
    let alpha = 1;
    if (n.gone) alpha = 1 - move;
    if (n.born) alpha = move;
    return {
      el: n.el,
      x: sx + (n.x1 - sx) * move,
      y: n.y0 + (n.y1 - n.y0) * move,
      alpha,
    };
  });

  const bonds = plan.bonds.map((b) => {
    let alpha = 1;
    let lines = b.from;
    let extraAlpha = 0;
    let flash = 0;
    if (b.fate === 'break') {
      alpha = 1 - clamp01(breakU / 0.7);
      flash = breakU > 0 && breakU < 1 ? Math.sin(Math.PI * clamp01(breakU / 0.7)) : 0;
    } else if (b.fate === 'form') {
      const u = clamp01((move - 0.7) / 0.3);
      alpha = u;
      lines = b.to;
      flash = t >= tJoin ? Math.max(0, 1 - Math.abs(u - 1) * 3) * (t < tProduct + 1.2 ? 1 : 0) : 0;
    } else if (b.from !== b.to) {
      // 键级变化：多出来的那几根随断键阶段淡出（π 键打开），或成键阶段淡入
      lines = Math.max(b.from, b.to);
      if (b.to < b.from) {
        extraAlpha = 1 - clamp01(breakU / 0.7);
        flash = breakU > 0 && breakU < 1 ? Math.sin(Math.PI * clamp01(breakU / 0.7)) : 0;
      } else {
        extraAlpha = clamp01((move - 0.7) / 0.3);
      }
    }
    return { a: b.a, b: b.b, lines, keepLines: Math.min(b.from, b.to) || lines, alpha, extraAlpha, fate: b.fate, flash, shrink: b.to < b.from };
  });

  return {
    atoms,
    bonds,
    phase,
    labelAlpha: { left: 1 - clamp01(breakU * 1.5), right: clamp01((t - tProduct) / 0.6) },
    jitter: phase === 'break' ? Math.sin(Math.PI * breakU) : 0,
  };
}
