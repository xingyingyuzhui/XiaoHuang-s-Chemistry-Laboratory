'use strict';

/**
 * ChemStageJSON & LessonPlanJSON 服务端校验器（CJS）
 * 与 src/crystal/stage-spec/schema.js 保持严格白名单与规范化等价。
 */

const STAGE_TYPES = Object.freeze(['dual-3d-compare', 'lattice-stress', 'particle-field', 'thermal-phase', 'cell-extract']);
const COMPARE_KINDS = Object.freeze(['quartz', 'glass', 'diamond', 'graphite', 'dryice', 'sio2', 'nacl', 'cscl']);
const BOND_TYPES = Object.freeze(['metallic', 'ionic', 'covalent']);
const PARTICLE_MODES = Object.freeze(['crystal-growth', 'conductivity', 'hbond-collapse']);
const THERMAL_VIEWS = Object.freeze(['race', 'curve']);
const CRYSTAL_CATEGORIES = Object.freeze(['molecular', 'metallic', 'ionic', 'covalent']);
const CELL_CRYSTAL_IDS = Object.freeze(['cu', 'nacl', 'fe', 'diamond']);

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
const CLASSIC_RACE_16 = Object.freeze([
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

function validateChemStage(raw, opts = {}) {
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

const DEFAULT_QA = {
  'dual-3d-compare': { question: '左右两种物质微观微粒排布有何核心差异？', answer: '微观排布的有序度与化学键类型决定了宏观晶形与物理性质差异。' },
  'lattice-stress': { question: '为何两类晶体受相同剪切力后力学表现截然不同？', answer: '金属键无方向性允许晶面滑移不断裂，而离子/共价晶体错位后会发生排斥或断键脆裂。' },
  'particle-field': { question: '宏观现象背后的微观粒子运动规律是什么？', answer: '微粒间相互作用与热运动的平衡主导了晶体生长、导电迁移或氢键坍塌过程。' },
  'thermal-phase': { question: '为什么不同晶体的熔点差异可达数千摄氏度？', answer: '熔化克服的微粒间作用力（共价键、离子键、金属键、分子间力）强弱相差悬殊。' },
  'cell-extract': { question: '如何用均摊法计算该晶胞中实际拥有的微粒数？', answer: '顶点按 1/8、棱心按 1/4、面心按 1/2、体心按 1 累加即可得晶胞化学式。' },
};

const DEFAULT_FALLBACK_SLIDES = Object.freeze([
  { title: '水晶 vs 石英玻璃', cue: '切换宏观与微观视角，引导学生归纳晶体长程有序的本质差异。', stage: validateChemStage({ type: 'dual-3d-compare', left: { kind: 'quartz' }, right: { kind: 'glass' }, defaultMode: 'macro' }) },
  { title: '铜 vs 食盐 3D 剪切受力', cue: '点击施加剪切力，观察金属滑移延展与离子晶体错位脆裂。', stage: validateChemStage({ type: 'lattice-stress', left: { bondType: 'metallic' }, right: { bondType: 'ionic' } }) },
  { title: '四类晶体热成像熔化赛', cue: '随温度升高观察分子、离子与共价晶体熔点跨越。', stage: validateChemStage({ type: 'thermal-phase', view: 'race', substances: DEFAULT_RACE_4 }) },
  { title: '铜 FCC 晶胞提取与并置', cue: '演示晶胞无隙并置，引导学生用均摊法计算原子数。', stage: validateChemStage({ type: 'cell-extract', crystalId: 'cu' }) },
]);

function normalizeLessonPlan(raw, opts = {}) {
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
    for (const fb of DEFAULT_FALLBACK_SLIDES.slice(0, 2)) {
      const qa = { ...DEFAULT_QA[fb.stage.type] };
      slides.push({ id: `slide-${slides.length + 1}`, title: fb.title, cue: fb.cue, stage: fb.stage, qa, quickQuestions: [qa.question] });
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

module.exports = {
  STAGE_TYPES, COMPARE_KINDS, BOND_TYPES, PARTICLE_MODES, THERMAL_VIEWS, CRYSTAL_CATEGORIES, CELL_CRYSTAL_IDS,
  CLASSIC_RACE_16, DEFAULT_QA, DEFAULT_FALLBACK_SLIDES, clean, validateChemStage, normalizeLessonPlan,
};
