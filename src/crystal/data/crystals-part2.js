/**
 * 晶体库数据（第二部分）：共价晶体（4 种）+ 分子晶体（4 种）+ 混合型晶体（2 种），共 10 种
 */

import { expandPeriodic } from '../math/lattice.js';

const FCC_FRACS = [
  [0, 0, 0],
  [0.5, 0.5, 0],
  [0.5, 0, 0.5],
  [0, 0.5, 0.5],
];

const TET_HALF_FRACS = [
  [0.25, 0.25, 0.25],
  [0.75, 0.75, 0.25],
  [0.75, 0.25, 0.75],
  [0.25, 0.75, 0.75],
];

const DIAMOND_FRACS = [...FCC_FRACS, ...TET_HALF_FRACS];

const toBasis = (species, fracs) => fracs.map(([u, v, w]) => ({ species, u, v, w }));

// 在金刚石晶格 4 个体内四面体中心与各自 4 个近邻的连线上生成 16 个桥联位（t=0.5 为 SiO₂ 氧位，t=0.36/0.64 为冰氢位）
const TET_NEIGHBOR_DIRS = [
  [-0.25, -0.25, -0.25],
  [0.25, 0.25, -0.25],
  [0.25, -0.25, 0.25],
  [-0.25, 0.25, 0.25],
];

function buildTetraBridges(species, fractions) {
  const out = [];
  for (const [tu, tv, tw] of TET_HALF_FRACS) {
    TET_NEIGHBOR_DIRS.forEach(([du, dv, dw], idx) => {
      const f = fractions[idx];
      out.push({ species, u: tu + du * f, v: tv + dv * f, w: tw + dw * f });
    });
  }
  return out;
}

const I2_FRACS = [
  [0.349, 0, 0.368], [0.151, 0, 0.132],
  [0.651, 0, 0.868], [0.849, 0, 0.632],
  [0.651, 0.5, 0.368], [0.849, 0.5, 0.132],
  [0.349, 0.5, 0.868], [0.151, 0.5, 0.632],
];

export const CRYSTALS_PART2 = [
  // ── 共价晶体（4） ──
  {
    id: 'diamond',
    name: '金刚石',
    formula: 'C',
    category: 'covalent',
    subtitle: '金刚石型 · sp³ 正四面体共价网',
    system: 'cubic',
    lattice: { a: 356.7, b: 356.7, c: 356.7, alpha: 90, beta: 90, gamma: 90 },
    species: [{ id: 'C', symbol: 'C', color: 0x3f4654, ballRadius: 0.19, spaceRadius: 0.52, countPerCell: 8 }],
    atoms: expandPeriodic(toBasis('C', DIAMOND_FRACS)),
    bondCutoff: 165,
    bonds: null,
    bondRule: 'any',
    coordination: { centerIndex: 14, label: '每个 C 原子采取 sp³ 杂化，与 4 个相邻 C 形成正四面体共价键（键角 109°28′）', number: 4, neighborSpecies: 'C' },
    shortestDistance: { formula: 'd(C–C) = √3/4 · a', desc: 'C–C 共价单键键长 154 pm，最小碳环为 6 元椅式环，每个 C 形成 2 条有效 C–C 键', pair: [[0, 0, 0], [0.25, 0.25, 0.25]], valuePm: 154 },
    density: { Z: 8, molarMass: 12.011, formulaText: 'ρ = (8 × M) / (Nₐ · a³)', valueGcm3: 3.52 },
    averagingFormula: 'C：8×1/8 + 6×1/2 + 4×1 = 8（含 16 条完整 C–C 键）',
    hexPrismHighlight: false,
    qa: { question: '1 mol 金刚石中含有多少摩尔 C–C 共价键？', answer: '2 mol！每个 C 原子与周围 4 个 C 原子成键，每条键被 2 个 C 原子共用，故平均每个 C 原子摊得 4 × 1/2 = 2 条 C–C 键。' },
  },
  {
    id: 'si',
    name: '晶体硅',
    formula: 'Si',
    category: 'covalent',
    subtitle: '金刚石型 · 半导体共价晶体',
    system: 'cubic',
    lattice: { a: 543.1, b: 543.1, c: 543.1, alpha: 90, beta: 90, gamma: 90 },
    species: [{ id: 'Si', symbol: 'Si', color: 0x7b88a8, ballRadius: 0.2, spaceRadius: 0.52, countPerCell: 8 }],
    atoms: expandPeriodic(toBasis('Si', DIAMOND_FRACS)),
    bondCutoff: 250,
    bonds: null,
    bondRule: 'any',
    coordination: { centerIndex: 14, label: '每个 Si 原子采取 sp³ 杂化，与 4 个相邻 Si 成正四面体共价键（CN = 4）', number: 4, neighborSpecies: 'Si' },
    shortestDistance: { formula: 'd(Si–Si) = √3/4 · a', desc: 'Si–Si 键长 235 pm 明显长于 C–C 键（154 pm），因此键能更小、熔点与硬度均低于金刚石', pair: [[0, 0, 0], [0.25, 0.25, 0.25]], valuePm: 235 },
    density: { Z: 8, molarMass: 28.085, formulaText: 'ρ = (8 × M) / (Nₐ · a³)', valueGcm3: 2.33 },
    averagingFormula: 'Si：8×1/8 + 6×1/2 + 4×1 = 8',
    hexPrismHighlight: false,
    qa: { question: '同为金刚石型共价晶体，为什么晶体硅的熔点（1414°C）远低于金刚石（>3550°C）？', answer: '因为 Si 原子半径大于 C，导致 Si–Si 共价键键长更长（235 pm > 154 pm）、键能更小，破坏三维共价网所需能量更低。' },
  },
  {
    id: 'sio2',
    name: '二氧化硅',
    formula: 'SiO₂',
    category: 'covalent',
    subtitle: 'β-方石英型 · Si–O–Si 三维网',
    system: 'cubic',
    lattice: { a: 716, b: 716, c: 716, alpha: 90, beta: 90, gamma: 90 },
    species: [
      { id: 'Si', symbol: 'Si', color: 0x7b88a8, ballRadius: 0.19, spaceRadius: 0.38, countPerCell: 8 },
      { id: 'O', symbol: 'O', color: 0xe03e3e, ballRadius: 0.14, spaceRadius: 0.42, countPerCell: 16 },
    ],
    atoms: expandPeriodic([
      ...toBasis('Si', DIAMOND_FRACS),
      ...buildTetraBridges('O', [0.5, 0.5, 0.5, 0.5]),
    ]),
    bondCutoff: 170,
    bonds: null,
    bondRule: 'hetero',
    coordination: { centerIndex: 14, label: '每个 Si 与 4 个 O 成正四面体共价键，每个 O 桥连 2 个 Si（CN = 4:2）', number: 4, neighborSpecies: 'O' },
    shortestDistance: { formula: 'd(Si–O) = √3/8 · a', desc: '相当于在金刚石每条键中点插入 1 个 O 原子，最小环为 12 元环（6 个 Si + 6 个 O）', pair: [[0, 0, 0], [0.125, 0.125, 0.125]], valuePm: 155 },
    density: { Z: 8, molarMass: 60.08, formulaText: 'ρ = (8 × M) / (Nₐ · a³)', valueGcm3: 2.17 },
    averagingFormula: 'Si：8×1/8 + 6×1/2 + 4×1 = 8；O：16×1 = 16（即 8 个 SiO₂）',
    hexPrismHighlight: false,
    qa: { question: '1 mol SiO₂ 晶体中含有多少摩尔 Si–O 共价键？存在单个 SiO₂ 分子吗？', answer: '含 4 mol Si–O 键！每个 Si 原子与 4 个 O 原子成键（1 个 Si 独占 4 条键，不重复计数）；SiO₂ 是三维共价网状晶体，不存在独立 SiO₂ 分子。' },
  },
  {
    id: 'sic',
    name: '碳化硅',
    formula: 'SiC',
    category: 'covalent',
    subtitle: '金刚砂 · 闪锌矿型共价晶体',
    system: 'cubic',
    lattice: { a: 435.9, b: 435.9, c: 435.9, alpha: 90, beta: 90, gamma: 90 },
    species: [
      { id: 'Si', symbol: 'Si', color: 0x7b88a8, ballRadius: 0.21, spaceRadius: 0.62, countPerCell: 4 },
      { id: 'C', symbol: 'C', color: 0x3f4654, ballRadius: 0.16, spaceRadius: 0.42, countPerCell: 4 },
    ],
    atoms: expandPeriodic([...toBasis('Si', FCC_FRACS), ...toBasis('C', TET_HALF_FRACS)]),
    bondCutoff: 200,
    bonds: null,
    bondRule: 'hetero',
    coordination: { centerIndex: 14, label: 'C 与 Si 交替采取 sp³ 杂化，彼此均为 4 配位正四面体（CN = 4:4）', number: 4, neighborSpecies: 'Si' },
    shortestDistance: { formula: 'd(Si–C) = √3/4 · a', desc: 'Si–C 键长 189 pm 介于金刚石与晶体硅之间，故硬度（莫氏 9.5）和熔点（~2700°C）也居两者之间', pair: [[0, 0, 0], [0.25, 0.25, 0.25]], valuePm: 189 },
    density: { Z: 4, molarMass: 40.1, formulaText: 'ρ = (4 × M) / (Nₐ · a³)', valueGcm3: 3.22 },
    averagingFormula: 'Si：8×1/8 + 6×1/2 = 4；C：4×1 = 4（即 4 个 SiC）',
    hexPrismHighlight: false,
    qa: { question: '将金刚石、碳化硅、晶体硅按熔点从高到低排序，并说明理由。', answer: '金刚石 > 碳化硅 > 晶体硅。三者结构同构，共价键键长 C–C (154 pm) < Si–C (189 pm) < Si–Si (235 pm)，键能依次减弱。' },
  },

  // ── 分子晶体（4） ──
  {
    id: 'co2',
    name: '干冰',
    formula: 'CO₂',
    category: 'molecular',
    subtitle: '面心立方分子晶体 · 范德华力',
    system: 'cubic',
    lattice: { a: 572, b: 572, c: 572, alpha: 90, beta: 90, gamma: 90 },
    species: [{ id: 'CO2', symbol: 'CO₂', color: 0x3f4654, ballRadius: 0.36, spaceRadius: 0.68, countPerCell: 4 }],
    atoms: expandPeriodic(toBasis('CO2', FCC_FRACS)),
    bondCutoff: 0,
    bonds: null,
    bondRule: 'any',
    coordination: { centerIndex: 8, label: '每个 CO₂ 分子周围有 12 个紧邻 CO₂ 分子（面心立方密堆积，CN = 12）', number: 12, neighborSpecies: 'CO2' },
    shortestDistance: { formula: 'd(CO₂–CO₂) = √2/2 · a', desc: '相邻 CO₂ 分子质心最短距离约 404 pm，4 个 CO₂ 分子分别沿 4 条体对角线取向', pair: [[0, 0, 0], [0.5, 0.5, 0]], valuePm: 404 },
    density: { Z: 4, molarMass: 44.01, formulaText: 'ρ = (4 × M) / (Nₐ · a³)', valueGcm3: 1.56 },
    averagingFormula: 'CO₂：8×1/8 + 6×1/2 = 4（每晶胞含 4 个完整线性 O=C=O 分子，沿 4 条体对角线取向）',
    hexPrismHighlight: false,
    qa: { question: 'CO₂ 和 SiO₂ 同为第 IVA 族元素的二氧化物，为什么干冰常温升华而 SiO₂ 熔点超过 1700°C？', answer: 'CO₂ 形成以弱范德华力结合的分子晶体，升华只需克服分子间作用力；SiO₂ 形成三维 Si–O 共价网状晶体，熔化必须断裂强共价键。' },
  },
  {
    id: 'ice',
    name: '冰',
    formula: 'H₂O',
    category: 'molecular',
    subtitle: '立方冰 Ic · 氢键四面体大空隙',
    system: 'cubic',
    lattice: { a: 635, b: 635, c: 635, alpha: 90, beta: 90, gamma: 90 },
    species: [
      { id: 'O', symbol: 'O', color: 0xe03e3e, ballRadius: 0.19, spaceRadius: 0.48, countPerCell: 8 },
      { id: 'H', symbol: 'H', color: 0xeef2f6, ballRadius: 0.11, spaceRadius: 0.28, countPerCell: 16 },
    ],
    atoms: expandPeriodic([
      ...toBasis('O', DIAMOND_FRACS),
      ...buildTetraBridges('H', [0.36, 0.36, 0.64, 0.64]),
    ]),
    bondCutoff: 190,
    bonds: null,
    bondRule: 'hetero',
    coordination: { centerIndex: 14, label: '每个 H₂O 通过 4 条氢键与 4 个相邻 H₂O 成正四面体配位（CN = 4，远低于密堆积的 12）', number: 4, neighborSpecies: 'O' },
    shortestDistance: { formula: 'd(O···O) = √3/4 · a', desc: '相邻水分子 O···O 氢键间距 275 pm（O–H 共价键 99 pm + H···O 氢键 176 pm）', pair: [[0, 0, 0], [0.25, 0.25, 0.25]], valuePm: 275 },
    density: { Z: 8, molarMass: 18.015, formulaText: 'ρ = (8 × M) / (Nₐ · a³)', valueGcm3: 0.93 },
    averagingFormula: 'O：8×1/8 + 6×1/2 + 4×1 = 8；H：16×1 = 16（即 8 个 H₂O 分子）',
    hexPrismHighlight: false,
    qa: { question: '冰为什么能浮在水面上？1 mol 冰中最多含有多少摩尔氢键？', answer: '氢键具有方向性和饱和性，使每个水分子只能与 4 个邻居配位形成疏松空旷的四面体骨架，密度（0.92 g/cm³）小于液态水；每条氢键被 2 个水分子共用，故 1 mol 冰含 2 mol 氢键。' },
  },
  {
    id: 'i2',
    name: '碘',
    formula: 'I₂',
    category: 'molecular',
    subtitle: '正交晶系 · 双取向人字形分子晶体',
    system: 'orthorhombic',
    lattice: { a: 727, b: 479, c: 979, alpha: 90, beta: 90, gamma: 90 },
    species: [{ id: 'I', symbol: 'I', color: 0x8b46a8, ballRadius: 0.22, spaceRadius: 0.56, countPerCell: 8 }],
    atoms: expandPeriodic(toBasis('I', I2_FRACS)),
    bondCutoff: 290,
    bonds: null,
    bondRule: 'any',
    coordination: { centerIndex: 8, label: '每个 I 原子在 I₂ 分子内仅与 1 个 I 成共价单键，分子间按两种倾斜取向规则排列', number: 1, neighborSpecies: 'I' },
    shortestDistance: { formula: 'd(I–I) ≈ 272 pm', desc: '分子内共价键 I–I 约 272 pm，分子间范德华接触距离约 350 pm，受热易升华', pair: [[0.651, 0.5, 0.368], [0.849, 0.5, 0.132]], valuePm: 272 },
    density: { Z: 4, molarMass: 253.81, formulaText: 'ρ = (4 × M) / (Nₐ · a · b · c)', valueGcm3: 4.94 },
    averagingFormula: 'I：8×1/2 + 4×1 = 8（即 4 个 I₂ 分子，呈两种不同空间取向）',
    hexPrismHighlight: false,
    qa: { question: '碘晶胞中碘分子的排列有几种取向？碘升华时有没有破坏 I–I 共价键？', answer: '有 2 种不同的倾斜取向（人字形层状排布）；碘升华只克服分子间的范德华力，不破坏分子内的 I–I 共价键。' },
  },
  {
    id: 'c60',
    name: '富勒烯',
    formula: 'C₆₀',
    category: 'molecular',
    subtitle: '足球烯 · 面心立方分子晶体',
    system: 'cubic',
    lattice: { a: 1417, b: 1417, c: 1417, alpha: 90, beta: 90, gamma: 90 },
    species: [{ id: 'C60', symbol: 'C₆₀', color: 0x3f4654, ballRadius: 0.36, spaceRadius: 0.85, countPerCell: 4 }],
    atoms: expandPeriodic(toBasis('C60', FCC_FRACS)),
    bondCutoff: 0,
    bonds: null,
    bondRule: 'any',
    coordination: { centerIndex: 8, label: '每个 C₆₀ 足球分子与 12 个相邻 C₆₀ 分子面心立方密堆积（CN = 12）', number: 12, neighborSpecies: 'C60' },
    shortestDistance: { formula: 'd(C₆₀–C₆₀) = √2/2 · a', desc: '相邻 C₆₀ 质心距约 1002 pm（分子直径 710 pm），晶胞八面体与四面体空隙可掺杂 K⁺ 得超导体 K₃C₆₀', pair: [[0, 0, 0], [0.5, 0.5, 0]], valuePm: 1002 },
    density: { Z: 4, molarMass: 720.66, formulaText: 'ρ = (4 × M) / (Nₐ · a³)', valueGcm3: 1.68 },
    averagingFormula: 'C₆₀：8×1/8 + 6×1/2 = 4（含 4 个八面体空隙和 8 个四面体空隙）',
    hexPrismHighlight: false,
    qa: { question: '把 K 原子填入 C₆₀ 面心立方晶胞的全部八面体和四面体空隙后，所得超导体的化学式是什么？', answer: 'K₃C₆₀！面心立方晶胞含 4 个 C₆₀ 分子、4 个八面体空隙和 8 个四面体空隙，共 12 个 K 原子，K : C₆₀ = 12 : 4 = 3 : 1。' },
  },

  // ── 混合型晶体（2） ──
  {
    id: 'graphite',
    name: '石墨',
    formula: 'C',
    category: 'mixed',
    subtitle: '六方层状 · 共价键 + 金属键 + 范德华力',
    system: 'hexagonal',
    lattice: { a: 246.1, b: 246.1, c: 670.8, alpha: 90, beta: 90, gamma: 120 },
    species: [{ id: 'C', symbol: 'C', color: 0x3f4654, ballRadius: 0.14, spaceRadius: 0.34, countPerCell: 4 }],
    atoms: expandPeriodic(toBasis('C', [[0, 0, 0], [1 / 3, 2 / 3, 0], [0, 0, 0.5], [2 / 3, 1 / 3, 0.5]])),
    bondCutoff: 155,
    bonds: null,
    bondRule: 'any',
    coordination: { centerIndex: 14, label: '层内每个 C 采取 sp² 杂化，与 3 个相邻 C 成平面正六边形网（键角 120°，CN = 3）', number: 3, neighborSpecies: 'C' },
    shortestDistance: { formula: 'd(C–C) = a / √3', desc: '层内 C–C 键长仅 142 pm（含离域大 π 键，比金刚石更短更强），层间距 c/2 = 335 pm 靠范德华力维系', pair: [[0, 0, 0], [1 / 3, 2 / 3, 0]], valuePm: 142 },
    density: { Z: 4, molarMass: 12.011, formulaText: 'ρ = (4 × M) / (Nₐ · √3/2 · a² · c)', valueGcm3: 2.27 },
    averagingFormula: 'C：(4×1/6 + 4×1/12) + 2×1/2 + (2×1/3 + 2×1/6) + 1×1 = 4',
    hexPrismHighlight: false,
    qa: { question: '石墨为什么既质软滑腻、又能导电，且熔点甚至略高于金刚石？', answer: '层间是弱范德华力易滑动（质软润滑）；层内未杂化 p 轨道形成离域大 π 键（导电）；层内 C–C 键长 142 pm 短于金刚石 154 pm、键能更大（熔点极高）。' },
  },
  {
    id: 'hbn',
    name: '六方氮化硼',
    formula: 'BN',
    category: 'mixed',
    subtitle: '白石墨 · 石墨等电子体层状晶体',
    system: 'hexagonal',
    lattice: { a: 250.4, b: 250.4, c: 666.1, alpha: 90, beta: 90, gamma: 120 },
    species: [
      { id: 'B', symbol: 'B', color: 0xe879a0, ballRadius: 0.14, spaceRadius: 0.34, countPerCell: 2 },
      { id: 'N', symbol: 'N', color: 0x3b6ef5, ballRadius: 0.14, spaceRadius: 0.34, countPerCell: 2 },
    ],
    atoms: expandPeriodic([
      ...toBasis('B', [[0, 0, 0], [1 / 3, 2 / 3, 0.5]]),
      ...toBasis('N', [[1 / 3, 2 / 3, 0], [0, 0, 0.5]]),
    ]),
    bondCutoff: 160,
    bonds: null,
    bondRule: 'hetero',
    coordination: { centerIndex: 8, label: 'B 与 N 均采取 sp² 杂化，层内交替连成正六边形网（B–N 键长 145 pm，CN = 3）', number: 3, neighborSpecies: 'N' },
    shortestDistance: { formula: 'd(B–N) = a / √3', desc: '层内 B–N 键长 145 pm，上下相邻层 B 正对 N 叠加（层间距 c/2 = 333 pm）', pair: [[0, 0, 0], [1 / 3, 2 / 3, 0]], valuePm: 145 },
    density: { Z: 2, molarMass: 24.82, formulaText: 'ρ = (2 × M) / (Nₐ · √3/2 · a² · c)', valueGcm3: 2.28 },
    averagingFormula: 'B：顶点(1) + 体内(1) = 2；N：面心(1) + 竖棱(1) = 2（即 2 个 BN）',
    hexPrismHighlight: false,
    qa: { question: '六方氮化硼与石墨结构几乎相同，为什么石墨优良导电而六方氮化硼却是绝缘体？', answer: 'N 的电负性（3.04）远高于 B（2.04），π 电子强烈局域在 N 原子附近难以自由移动，带隙宽达约 5.9 eV，故呈白色绝缘性。' },
  },
];
