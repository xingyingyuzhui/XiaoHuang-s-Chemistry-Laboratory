/**
 * ChemStageJSON & LessonPlanJSON 声明式舞台规范与纯 JS 校验器（ESM，零 DOM）
 * 与 server/utils/chem-stage-schema.js 保持严格校验等价。
 */

export const STAGE_TYPES = Object.freeze(['dual-3d-compare', 'lattice-stress', 'particle-field', 'thermal-phase', 'cell-extract']);
export const COMPARE_KINDS = Object.freeze(['quartz', 'glass', 'diamond', 'graphite', 'dryice', 'sio2', 'nacl', 'cscl']);
export const BOND_TYPES = Object.freeze(['metallic', 'ionic', 'covalent']);
export const PARTICLE_MODES = Object.freeze(['crystal-growth', 'conductivity', 'hbond-collapse']);
export const THERMAL_VIEWS = Object.freeze(['race', 'curve']);
export const CRYSTAL_CATEGORIES = Object.freeze(['molecular', 'metallic', 'ionic', 'covalent']);
export const CELL_CRYSTAL_IDS = Object.freeze(['cu', 'nacl', 'fe', 'diamond']);

const KIND_META = {
  quartz: { label: '天然水晶', sublabel: '长程有序 · SiO₂ 晶体' },
  glass: { label: '石英玻璃', sublabel: '短程有序 · 非晶体' },
  diamond: { label: '金刚石', sublabel: 'sp³ 正四面体共价网' },
  graphite: { label: '石墨', sublabel: '层状六方网 · 分子间力' },
  dryice: { label: '干冰', sublabel: 'CO₂ 分子晶体' },
  sio2: { label: '二氧化硅', sublabel: 'Si-O 三维共价晶体' },
  nacl: { label: '氯化钠', sublabel: 'NaCl 离子晶体' },
  cscl: { label: '氯化铯', sublabel: 'CsCl 体心立方离子晶体' },
};
const BOND_META = {
  metallic: { label: '金属铜 Cu', sublabel: '自由电子海 · 滑移不断裂', colorA: '#e0824a', colorB: '#f5c07a' },
  ionic: { label: '食盐 NaCl', sublabel: '正负离子交替 · 错位即碎裂', colorA: '#a78bfa', colorB: '#34d399' },
  covalent: { label: '金刚石 C', sublabel: '强共价键骨架 · 硬而脆', colorA: '#475569', colorB: '#94a3b8' },
};
const PARTICLE_META = {
  'crystal-growth': { label: '食盐晶体自发生长与自修复', substance: 'NaCl' },
  conductivity: { label: '食盐固态 / 熔融 / 水溶液导电对比', substance: 'NaCl' },
  'hbond-collapse': { label: '冰 Ih 六方氢键笼与 4℃ 密度极大值', substance: 'H₂O' },
};
const CELL_META = {
  cu: '金属铜 FCC 晶胞提取与无隙并置',
  nacl: '氯化钠 NaCl 晶胞提取与无隙并置',
  fe: 'α-铁 BCC 晶胞提取与无隙并置',
  diamond: '金刚石共价晶胞提取与无隙并置',
};

const toSub = ([formula, name, category, mpC, subl]) => (subl ? { formula, name, category, mpC, subl: true } : { formula, name, category, mpC });
const isSublSubstance = (formula, name, subl) => Boolean(subl) || formula === 'CO₂' || formula === 'CO2' || name === '干冰';
export const CLASSIC_RACE_16 = Object.freeze([
  ['O₂', '固态氧', 'molecular', -218], ['CO₂', '干冰', 'molecular', -78.5, true], ['H₂O', '冰', 'molecular', 0], ['I₂', '碘', 'molecular', 114],
  ['Hg', '固态汞', 'metallic', -39], ['Na', '金属钠', 'metallic', 98], ['Cu', '金属铜', 'metallic', 1085], ['W', '金属钨', 'metallic', 3422],
  ['NaCl', '食盐', 'ionic', 801], ['CaF₂', '萤石', 'ionic', 1418], ['Al₂O₃', '刚玉', 'ionic', 2072], ['MgO', '氧化镁', 'ionic', 2852],
  ['Si', '晶体硅', 'covalent', 1414], ['SiO₂', '石英', 'covalent', 1713], ['SiC', '金刚砂', 'covalent', 2730], ['C', '金刚石', 'covalent', 3550],
].map(toSub));

const DEFAULT_CURVE_2 = [
  ['Na₂S₂O₃·5H₂O', '海波（晶体）', 'ionic', 48], ['CₙH₂ₙ₊₂', '石蜡（非晶体）', 'molecular', 55],
].map(toSub);
const DEFAULT_RACE_4 = [
  ['CO₂', '干冰', 'molecular', -78.5, true], ['H₂O', '冰', 'molecular', 0], ['NaCl', '食盐', 'ionic', 801], ['C', '金刚石', 'covalent', 3550],
].map(toSub);

const clean = (v, max = 60) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
function cleanColor(v) {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff) return `#${v.toString(16).padStart(6, '0')}`;
  const s = String(v ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  return null;
}

function autoTempRange(view, subs) {
  if (view === 'curve') return [20, 80];
  const mps = subs.map((s) => s.mpC);
  const lo = Math.max(-250, Math.floor((Math.min(...mps) - 100) / 10) * 10);
  const hi = Math.min(4000, Math.ceil((Math.max(...mps) + 150) / 50) * 50);
  return lo < hi ? [lo, hi] : [-250, 3600];
}

export function validateChemStage(raw, opts = {}) {
  const strict = Boolean(opts.strict);
  if (!raw || typeof raw !== 'object') {
    if (strict) throw new Error('ChemStageJSON 必须是对象');
    return validateChemStage({ type: 'dual-3d-compare' });
  }
  const rawType = String(raw.type || '').trim();
  const type = STAGE_TYPES.includes(rawType) ? rawType : (strict ? null : 'dual-3d-compare');
  if (!type) throw new Error(`未知舞台类型: ${rawType}`);

  if (type === 'dual-3d-compare') {
    const normSide = (side, fbKind) => {
      const k = String(side?.kind || '').trim();
      if (!COMPARE_KINDS.includes(k) && strict) throw new Error(`非法 3D 对比材质 kind: ${k}`);
      const kind = COMPARE_KINDS.includes(k) ? k : fbKind;
      return { kind, label: clean(side?.label, 28) || KIND_META[kind].label, sublabel: clean(side?.sublabel, 44) || KIND_META[kind].sublabel };
    };
    return { type, left: normSide(raw.left, 'quartz'), right: normSide(raw.right, 'glass'), defaultMode: raw.defaultMode === 'micro' ? 'micro' : 'macro' };
  }

  if (type === 'lattice-stress') {
    const normSide = (side, fbBond) => {
      const b = String(side?.bondType || '').trim();
      if (!BOND_TYPES.includes(b) && strict) throw new Error(`非法键型 bondType: ${b}`);
      const bondType = BOND_TYPES.includes(b) ? b : fbBond;
      const d = BOND_META[bondType];
      const out = { label: clean(side?.label, 28) || d.label, sublabel: clean(side?.sublabel, 44) || d.sublabel, bondType };
      const cA = cleanColor(side?.colorA), cB = cleanColor(side?.colorB);
      if (cA) out.colorA = cA;
      if (cB) out.colorB = cB;
      return out;
    };
    return { type, left: normSide(raw.left, 'metallic'), right: normSide(raw.right, 'ionic') };
  }

  if (type === 'particle-field') {
    const m = String(raw.mode || '').trim();
    if (!PARTICLE_MODES.includes(m) && strict) throw new Error(`非法粒子场模式 mode: ${m}`);
    const mode = PARTICLE_MODES.includes(m) ? m : 'crystal-growth';
    return { type, mode, label: clean(raw.label, 48) || PARTICLE_META[mode].label, substance: clean(raw.substance, 24) || PARTICLE_META[mode].substance };
  }

  if (type === 'thermal-phase') {
    const v = String(raw.view || '').trim();
    if (!THERMAL_VIEWS.includes(v) && strict) throw new Error(`非法热学视图 view: ${v}`);
    const view = THERMAL_VIEWS.includes(v) ? v : 'race';
    const rawSubs = Array.isArray(raw.substances) ? raw.substances : [];
    const maxN = view === 'curve' ? 2 : 16;
    if (strict && (rawSubs.length < 2 || rawSubs.length > maxN)) throw new Error(`thermal-phase 物质数量必须在 2..${maxN} 之间`);
    const subs = [];
    for (const item of rawSubs) {
      if (subs.length >= maxN) break;
      if (!item || typeof item !== 'object') continue;
      const formula = clean(item.formula, 28), name = clean(item.name, 24), mp = Number(item.mpC), cat = String(item.category || '').trim();
      if (!formula || !name || !Number.isFinite(mp)) { if (strict) throw new Error('thermal-phase 物质缺少有效 formula / name / mpC'); continue; }
      if (strict && (mp < -270 || mp > 4000)) throw new Error(`熔点 mpC 超出允许范围: ${mp}`);
      if (strict && !CRYSTAL_CATEGORIES.includes(cat)) throw new Error(`非法晶体分类 category: ${cat}`);
      const entry = { formula, name, category: CRYSTAL_CATEGORIES.includes(cat) ? cat : 'ionic', mpC: Math.round(clamp(mp, -270, 4000) * 10) / 10 };
      if (isSublSubstance(formula, name, item.subl)) entry.subl = true;
      subs.push(entry);
    }
    if (subs.length < 2) {
      if (strict) throw new Error('thermal-phase 至少需要 2 种有效物质');
      subs.splice(0, subs.length, ...(view === 'curve' ? DEFAULT_CURVE_2 : DEFAULT_RACE_4).map((x) => ({ ...x })));
    }
    let tempRange = null;
    if (Array.isArray(raw.tempRange) && raw.tempRange.length === 2) {
      const a = Number(raw.tempRange[0]), b = Number(raw.tempRange[1]);
      if (Number.isFinite(a) && Number.isFinite(b) && a < b) tempRange = [Math.round(clamp(a, -273, 4000)), Math.round(clamp(b, -270, 4200))];
    }
    return { type, view, substances: subs, tempRange: tempRange || autoTempRange(view, subs) };
  }

  const cid = raw.crystalId == null ? 'cu' : String(raw.crystalId).trim();
  if (!CELL_CRYSTAL_IDS.includes(cid) && strict) throw new Error(`非法晶胞 crystalId: ${cid}`);
  const crystalId = CELL_CRYSTAL_IDS.includes(cid) ? cid : 'cu';
  return { type: 'cell-extract', crystalId, label: clean(raw.label, 48) || CELL_META[crystalId] };
}

const mkPreset = (presetId, title, badge, category, summary, stage, question, answer, quickQuestions) => ({
  presetId, title, badge, category, summary, stage: validateChemStage(stage), qa: { question, answer }, quickQuestions,
});

export const STAGE_PRESETS = Object.freeze([
  mkPreset('quartz-vs-glass', '水晶 vs 石英玻璃', '3D 对比', 'basics',
    '同为 SiO₂，水晶内部长程周期有序呈规则六棱柱，石英玻璃长程无序无固定外形。',
    { type: 'dual-3d-compare', left: { kind: 'quartz', label: '天然水晶', sublabel: '长程有序 · 晶体' }, right: { kind: 'glass', label: '石英玻璃', sublabel: '长程无序 · 非晶体' }, defaultMode: 'macro' },
    '天然水晶与石英玻璃成分都是 SiO₂，为何前者有规则多面体晶面而后者没有？',
    '水晶内部 Si、O 原子呈三维周期性长程有序排列；石英玻璃仅短程有序、长程无序。',
    ['水晶和石英玻璃为何外形不同？', '什么是长程有序与短程有序？', '非晶体如何转化为晶体？']),
  mkPreset('diamond-vs-graphite', '金刚石 vs 石墨', '3D 对比', 'properties',
    '同素异形体对比：金刚石为 sp³ 三维共价网极硬，石墨为层状六方网层间易滑移且可导电。',
    { type: 'dual-3d-compare', left: { kind: 'diamond', label: '金刚石', sublabel: 'sp³ 正四面体共价网' }, right: { kind: 'graphite', label: '石墨', sublabel: 'sp² 层状六方网' }, defaultMode: 'micro' },
    '金刚石与石墨都是碳单质，为何一个最硬绝缘、一个质软导电？',
    '金刚石形成三维共价键网络无自由电子；石墨层间靠弱分子间力易滑移，层内大 π 键自由电子可导电。',
    ['金刚石和石墨碳原子杂化方式？', '为何石墨熔点甚至略高于金刚石？', '石墨为何既润滑又导电？']),
  mkPreset('nacl-growth', '食盐晶体自发生长与自修复', '3D 粒子', 'basics',
    '晶体在适宜条件下自发呈现规则几何多面体外形，缺角在饱和溶液中可优先自修复。',
    { type: 'particle-field', mode: 'crystal-growth', label: '食盐自范性与缺角自修复', substance: 'NaCl' },
    '把玻璃打磨成正方体是晶体吗？缺角食盐在饱和食盐水中会怎样？',
    '打磨玻璃非自发形成不是晶体；缺角食盐经溶解-结晶动态平衡优先补齐缺角。',
    ['打磨成正方体的玻璃是晶体吗？', '缺角食盐为何优先补齐缺口？', '呈现自范性的条件是什么？']),
  mkPreset('cu-vs-nacl-stress', '铜 vs 食盐 3D 剪切受力', '3D 受力', 'properties',
    '金属键无方向性使铜滑移不断裂（延展性）；离子晶体错位后同号相斥沿解理面脆裂。',
    { type: 'lattice-stress', left: { label: '金属铜 Cu', sublabel: '自由电子海 · 延展滑移', bondType: 'metallic', colorA: '#e0824a', colorB: '#f5c07a' }, right: { label: '食盐 NaCl', sublabel: '同号相斥 · 沿面脆裂', bondType: 'ionic', colorA: '#a78bfa', colorB: '#34d399' } },
    '为何铜受剪切力会平滑延展，而食盐晶体错位瞬间就沿平面碎裂？',
    '金属阳离子与自由电子海无方向性作用，层间滑移不断键；离子晶体错位使同号离子正对相斥而断裂。',
    ['为何金属具延展性而盐易碎？', '金属键无方向性是什么意思？', '共价晶体受力会延展吗？']),
  mkPreset('nacl-conduct', '食盐三态导电对比', '电学性质', 'properties',
    '固态 NaCl 离子被晶格束缚不导电；熔融态与水溶液解离出自由离子定向迁移而导电。',
    { type: 'particle-field', mode: 'conductivity', label: 'NaCl 固态 / 熔融 / 水溶液导电', substance: 'NaCl' },
    '食盐由 Na⁺ 与 Cl⁻ 组成，为何固态不导电，熔融或溶于水后才能导电？',
    '导电需要自由移动的带电微粒；固态离子被离子键固定，熔融或水合后才可定向移动。',
    ['固态 NaCl 有离子为何不导电？', '熔融与水溶液导电有何区别？', '液态 HCl 能导电吗？']),
  mkPreset('ice-hbond', '冰浮水上 · 3D 氢键笼坍塌', '3D 氢键', 'properties',
    '结冰时水分子凭氢键方向性形成空旷六方笼（0.917 g/cm³）；4℃ 时部分破键坍缩密度最大。',
    { type: 'particle-field', mode: 'hbond-collapse', label: '冰 Ih 六方氢键笼与 4℃ 密度极大值', substance: 'H₂O' },
    '为何冰浮在水面上，且液态水在 4℃ 时密度达到最大值？',
    '氢键具方向性与饱和性使冰中存在大量空隙；升温至 4℃ 部分氢键断裂分子填空，密度达 1.000 g/cm³。',
    ['为何冰密度小于液态水？', '水为何在 4℃ 密度最大？', '一个水分子平均几个氢键？']),
  mkPreset('melting-curve', '固定熔点对比 · 海波 vs 石蜡', '熔化曲线', 'basics',
    '晶体海波在 48℃ 呈现恒温吸热熔化平台，非晶体石蜡持续升温逐渐软化无固定熔点。',
    { type: 'thermal-phase', view: 'curve', substances: DEFAULT_CURVE_2, tempRange: [20, 80] },
    '海波在 48℃ 熔化平台持续吸热，为何温度计示数保持不变？',
    '晶体微粒作用力均匀，熔化时吸收的热量全部用于破坏晶格束缚，平均动能不变故温度恒定。',
    ['48℃ 吸收的热量去了哪里？', '为何非晶体没有固定熔点？', '如何用熔点曲线鉴别晶体？']),
  mkPreset('melt-race-16', '16 种晶体热成像熔化赛', '热成像', 'properties',
    '同步升温对比分子、金属、离子、共价四类 16 种经典晶体，直观呈现作用力与熔点跨度。',
    { type: 'thermal-phase', view: 'race', substances: CLASSIC_RACE_16, tempRange: [-250, 3600] },
    '四类晶体熔点为何呈“共价 > 离子 > 分子”，金属却从 -39℃ 跨到 3422℃？',
    '熔化需克服微粒间作用力：共价键与离子键强于分子间力；金属键强度取决于价电子数与原子半径，跨度极大。',
    ['四类晶体熔沸点总体规律？', '同为金属为何汞低而钨极高？', '如何比较 NaCl 与 MgO 熔点？']),
  mkPreset('cu-cell-extract', '铜 FCC 晶胞提取与无隙并置', '3D 晶胞', 'basics',
    '晶胞是晶体结构最小重复单元，整块晶体由晶胞沿三维坐标轴无隙并置平移而成。',
    { type: 'cell-extract', crystalId: 'cu', label: '金属铜 FCC 晶胞提取与无隙并置' },
    '为何晶胞拼接强调“无隙并置”？FCC 晶胞中顶点与面心原子各占几分之几？',
    '相邻晶胞无空隙且取向一致仅平移重复；顶点占 1/8，面心占 1/2，铜晶胞共含 8×1/8 + 6×1/2 = 4 个原子。',
    ['什么是晶胞的“无隙并置”？', '均摊法如何算铜晶胞原子数？', 'FCC 与 BCC 晶胞有何区别？']),
]);

const DEFAULT_QA = {
  'dual-3d-compare': { question: '左右两种物质微观微粒排布有何核心差异？', answer: '微观排布的有序度与化学键类型决定了宏观晶形与物理性质差异。' },
  'lattice-stress': { question: '为何两类晶体受相同剪切力后力学表现截然不同？', answer: '金属键无方向性允许晶面滑移不断裂，而离子/共价晶体错位后会发生排斥或断键脆裂。' },
  'particle-field': { question: '宏观现象背后的微观粒子运动规律是什么？', answer: '微粒间相互作用与热运动的平衡主导了晶体生长、导电迁移或氢键坍塌过程。' },
  'thermal-phase': { question: '为什么不同晶体的熔点差异可达数千摄氏度？', answer: '熔化克服的微粒间作用力（共价键、离子键、金属键、分子间力）强弱相差悬殊。' },
  'cell-extract': { question: '如何用均摊法计算该晶胞中实际拥有的微粒数？', answer: '顶点按 1/8、棱心按 1/4、面心按 1/2、体心按 1 累加即可得晶胞化学式。' },
};

export function normalizeLessonPlan(raw, opts = {}) {
  const strict = Boolean(opts.strict);
  if (!raw || typeof raw !== 'object') {
    if (strict) throw new Error('课例数据必须是对象');
    raw = {};
  }
  const srcSlides = Array.isArray(raw.slides) ? raw.slides : (Array.isArray(raw.steps) ? raw.steps : []);
  const slides = [];
  for (let i = 0; i < srcSlides.length && slides.length < 12; i++) {
    const item = srcSlides[i];
    if (!item || typeof item !== 'object') continue;
    let stage;
    try { stage = validateChemStage(item.stage || item, { strict }); } catch (e) { if (strict) throw e; continue; }
    const fbQa = DEFAULT_QA[stage.type];
    const q = clean(item.qa?.question, 180), a = clean(item.qa?.answer, 360);
    const quick = (Array.isArray(item.quickQuestions) ? item.quickQuestions : []).map((s) => clean(s, 48)).filter(Boolean).slice(0, 4);
    slides.push({
      id: clean(item.id, 40) || `slide-${slides.length + 1}`,
      title: clean(item.title, 48) || stage.label || `${stage.left?.label || '晶体'}探究`,
      cue: clean(item.cue || item.teacherNote || item.summary, 240) || '操作舞台并停顿提问，引导学生从微观结构解释宏观性质。',
      stage,
      qa: q && a ? { question: q, answer: a } : { ...fbQa },
      quickQuestions: quick.length ? quick : [q || fbQa.question],
    });
  }
  if (!slides.length) {
    if (strict) throw new Error('课例至少需要 1 个有效环节');
    for (const p of STAGE_PRESETS.slice(0, 2)) {
      slides.push({ id: `slide-${slides.length + 1}`, title: p.title, cue: p.summary, stage: p.stage, qa: { ...p.qa }, quickQuestions: [...p.quickQuestions] });
    }
  }
  return {
    id: clean(raw.id, 48) || `lesson-${Date.now().toString(36)}`,
    title: clean(raw.title, 60) || clean(opts.fallbackTopic, 48) || '晶体探究课例',
    subtitle: clean(raw.subtitle || raw.summary, 160),
    isAi: Boolean(raw.isAi ?? raw.aiGenerated ?? opts.isAi),
    slides,
  };
}
