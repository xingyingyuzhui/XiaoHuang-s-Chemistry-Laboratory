/**
 * 晶体探究 · 课例持久化仓库（localStorage v2，基于 ChemStageJSON 规范）
 * 内置 3 节示范课例，支持课例与环节 CRUD、排序、AI 课例导入与重置。
 */

import { STAGE_PRESETS, validateChemStage, normalizeLessonPlan } from '../crystal/stage-spec/schema.js';

export const STORAGE_KEY = 'chem-lab-crystal-lessons-v2';

let idSeq = 1;
const nextId = (prefix) => `${prefix}-${Date.now().toString(36)}-${++idSeq}`;
const cloneJson = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const PRESET_MAP = new Map((Array.isArray(STAGE_PRESETS) ? STAGE_PRESETS : []).map((p) => [p.presetId, p]));

const FOUR_CRYSTAL_RACE = {
  type: 'thermal-phase',
  view: 'race',
  substances: [
    { formula: 'CO₂', name: '干冰', category: 'molecular', mpC: -78.5 },
    { formula: 'H₂O', name: '冰', category: 'molecular', mpC: 0 },
    { formula: 'NaCl', name: '食盐', category: 'ionic', mpC: 801 },
    { formula: 'C', name: '金刚石', category: 'covalent', mpC: 3550 },
  ],
  tempRange: [-120, 3650],
};

function inferCategory(stage, explicit) {
  if (explicit === 'basics' || explicit === 'properties') return explicit;
  if (!stage || typeof stage !== 'object') return 'basics';
  if (stage.type === 'lattice-stress') return 'properties';
  if (stage.type === 'thermal-phase') return stage.view === 'race' ? 'properties' : 'basics';
  if (stage.type === 'particle-field') return stage.mode === 'crystal-growth' ? 'basics' : 'properties';
  return 'basics';
}

function normalizeQa(raw) {
  const question = String(raw?.question || '').trim(), answer = String(raw?.answer || '').trim();
  return question && answer ? { question, answer } : null;
}

function normalizeSlide(raw) {
  const isStr = typeof raw === 'string';
  const preset = isStr ? PRESET_MAP.get(raw) : (raw?.presetId ? PRESET_MAP.get(raw.presetId) : null);
  const src = isStr ? {} : (raw && typeof raw === 'object' ? raw : {});
  const stage = validateChemStage(cloneJson(src.stage || preset?.stage || { type: 'dual-3d-compare' }));
  const quickQuestions = Array.isArray(src.quickQuestions) && src.quickQuestions.length
    ? src.quickQuestions.map((q) => String(q || '').trim()).filter(Boolean).slice(0, 4)
    : (Array.isArray(preset?.quickQuestions) ? [...preset.quickQuestions] : []);
  return {
    id: String(src.id || nextId('slide')),
    presetId: String(src.presetId || (isStr ? raw : preset?.presetId || '')),
    title: String(src.title || preset?.title || '晶体探究环节').trim().slice(0, 48),
    cue: String(src.cue ?? src.teacherNote ?? '').trim().slice(0, 280),
    stage,
    category: inferCategory(stage, src.category || preset?.category),
    summary: String(src.summary || preset?.summary || '').trim(),
    qa: normalizeQa(src.qa) || normalizeQa(preset?.qa),
    quickQuestions,
  };
}

function seedPreset(id, presetId, title, cue, q, a) {
  const preset = PRESET_MAP.get(presetId);
  return normalizeSlide({
    id, presetId, title, cue,
    stage: preset?.stage,
    category: preset?.category,
    summary: preset?.summary,
    qa: q && a ? { question: q, answer: a } : preset?.qa,
    quickQuestions: preset?.quickQuestions,
  });
}

export function createDefaultLessons() {
  return [
    {
      id: 'builtin-intro',
      title: '第 1 节 · 走进晶体世界',
      subtitle: '有序排布 · 自范生长 · 固定熔点 · 最小晶胞',
      builtin: true,
      isAi: false,
      slides: [
        seedPreset('intro-1', 'quartz-vs-glass', '水晶与石英玻璃',
          '先拖动对比天然水晶与石英玻璃外形，再切「微观 3D 结构」追问：同为 SiO₂，为何外貌迥异？',
          '水晶和石英玻璃化学成分都是 SiO₂，为何外观截然不同？',
          '水晶内部 Si-O 四面体呈长程周期性有序排列，是晶体；石英玻璃内部粒子排列无序，是非晶体。'),
        seedPreset('intro-2', 'nacl-growth', '食盐的自范性与断角修复',
          '依次点击「自发生长 → 敲掉一角 → 溶液自修复」，强调晶体自范性需在适宜结晶条件下才能体现。',
          '把缺角的食盐放回饱和食盐水中，为什么能“长回”规则立方体？',
          '晶体微粒周期性有序堆积，溶质离子优先在能量较高的缺损处有序沉积，体现晶体自范性。'),
        seedPreset('intro-3', 'melting-curve', '晶体为什么有固定熔点？',
          '开启加热，在海波出现 48℃ 水平平台时暂停，引导学生说出吸热用于破坏点阵而非升温。',
          '加热过程中，晶体熔化曲线为何会出现一段温度不变的平台？',
          '晶体内部微粒排布规整、作用力均一，达到熔点后吸热全部用于克服微粒间作用力，故温度恒定。'),
        seedPreset('intro-4', 'cu-cell-extract', '从铜晶体里提取最小晶胞',
          '先看整块铜点阵，再提取单个面心立方晶胞并观察无隙并置，为均摊法计算做空间铺垫。',
          '晶胞必须满足哪两个条件才能代表整块晶体？',
          '晶胞是最小的结构重复单元，且沿三维方向平移无隙并置即可还原整个晶体。'),
      ],
    },
    {
      id: 'builtin-metal-ionic',
      title: '第 2 节 · 金属与离子晶体为何脾气相反',
      subtitle: '受力滑移与解理 · 三态导电 · 16 晶体熔点大比拼',
      builtin: true,
      isAi: false,
      slides: [
        seedPreset('mi-1', 'cu-vs-nacl-stress', '同受剪切力：金属滑移 vs 食盐解理',
          '点击「施加剪切力」并切 0.35× 慢动作，停在错位瞬间看清自由电子气维系不断键与同号离子排斥解理。',
          '同受外力剪切，为什么金属铜能锻打延展，而食盐晶体一碰就碎？',
          '金属键无方向性，层间滑移时自由电子仍维系结合；离子晶体滑移后同号离子相对，强烈排斥导致解理碎裂。'),
        seedPreset('mi-2', 'nacl-conduct', '食盐三态导电实验对比',
          '依次切换固态、熔融态、水溶液，强调“有离子不等于能导电，必须存在可自由移动的离子”。',
          'NaCl 晶体里全是 Na⁺ 和 Cl⁻，为什么固态时不导电？',
          '固态 NaCl 中离子被强离子键束缚在晶格节点上无法自由移动；熔融或溶于水后离子键断裂才可自由导电。'),
        seedPreset('mi-3', 'melt-race-16', '16 种晶体热成像熔化大比拼',
          '缓慢推动升温滑块至 3500℃，让学生按“分子 → 金属/离子 → 共价”归纳作用力与熔点规律。',
          '从 16 种晶体的熔化顺序看，四大晶体类型熔点总体呈什么规律？',
          '一般为共价晶体 > 离子晶体 > 分子晶体，金属晶体跨度极大（如汞 -39℃，钨 3422℃）。'),
      ],
    },
    {
      id: 'builtin-ice-water',
      title: '第 3 节 · 冰与碳的结构奥秘',
      subtitle: '氢键空隙坍塌 · 金刚石 vs 石墨 · 四大晶体熔点直击',
      builtin: true,
      isAi: false,
      slides: [
        seedPreset('iw-1', 'ice-hbond', '冰浮水上：氢键笼与 4℃ 最大密度',
          '打开「氢键高亮」观察 0℃ 冰的六边形空旷孔道，再滑向 4℃ 液态水读右上角密度条变化。',
          '为什么冰的密度比液态水小，且液态水在 4℃ 时密度达到最大？',
          '冰中氢键的方向性与饱和性形成空旷四面体笼；升温熔化时部分氢键断裂，水分子塌入空隙使 4℃ 时最密。'),
        seedPreset('iw-2', 'diamond-vs-graphite', '金刚石与石墨：同素异形体的微观巨变',
          '切到「微观 3D 结构」，对比 sp³ 立体共价网与层状石墨烯 π 电子及层间范德华力，解释硬度与导电差异。',
          '金刚石与石墨均由碳原子构成，为何金刚石极硬绝缘而石墨质软导电？',
          '金刚石中碳原子以 sp³ 杂化形成三维共价网；石墨层内存在大 π 键（导电），层间靠弱范德华力结合（易滑动）。'),
        normalizeSlide({
          id: 'iw-3',
          title: '四大晶体熔点直击：CO₂ / H₂O / NaCl / 金刚石',
          cue: '拖动温度轴依次越过 -78.5℃、0℃、801℃ 与 3550℃，对比范德华力、氢键、离子键与共价键的能级跨越。',
          stage: FOUR_CRYSTAL_RACE,
          category: 'properties',
          summary: '在暗室热成像舞台中直击干冰、冰、食盐与金刚石跨越近 3600℃ 的熔化历程。',
          qa: {
            question: '同属分子晶体，为何冰（0℃）的熔点远高于干冰（-78.5℃），又远低于 NaCl（801℃）？',
            answer: '冰分子间存在强氢键，强于干冰间的范德华力；但氢键仍远弱于 NaCl 的离子键与金刚石的共价键。',
          },
          quickQuestions: ['为什么干冰在常压下直接升华？', '金刚石熔化破坏的是什么作用力？'],
        }),
      ],
    },
  ];
}

function enrichLesson(raw, { builtin = false, isAi = false } = {}) {
  const norm = normalizeLessonPlan(raw);
  const rawSlides = Array.isArray(raw?.slides) ? raw.slides : [];
  const slides = (norm.slides || []).map((s, idx) =>
    normalizeSlide({ ...s, category: rawSlides[idx]?.category, summary: rawSlides[idx]?.summary, presetId: rawSlides[idx]?.presetId }));
  return {
    id: String(norm.id || raw?.id || nextId('lesson')),
    title: String(norm.title || '未命名晶体课例').trim().slice(0, 60),
    subtitle: String(norm.subtitle || '').trim().slice(0, 80),
    builtin: Boolean(raw?.builtin ?? builtin),
    isAi: Boolean(norm.isAi ?? raw?.isAi ?? isAi),
    slides: slides.length ? slides : [normalizeSlide('quartz-vs-glass')],
  };
}

function resolveStorage(explicit) {
  if (explicit !== undefined) return explicit;
  try { return typeof globalThis !== 'undefined' ? globalThis.localStorage || null : null; }
  catch { return null; }
}

export function createCrystalLessonStore({ storage } = {}) {
  const backend = resolveStorage(storage);
  let state = { lessons: createDefaultLessons(), activeLessonId: 'builtin-intro' };

  if (backend) {
    try {
      const parsed = JSON.parse(backend.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(parsed?.lessons) && parsed.lessons.length) {
        const lessons = parsed.lessons.map((item) => enrichLesson(item)).filter((l) => l.title);
        if (lessons.length) {
          const activeLessonId = lessons.some((l) => l.id === parsed.activeLessonId) ? parsed.activeLessonId : lessons[0].id;
          state = { lessons, activeLessonId };
        }
      }
    } catch { /* ignore corrupted cache */ }
  }

  const save = () => { try { backend?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore quota */ } };
  const find = (id) => state.lessons.find((l) => l.id === id) || null;

  return {
    getState: () => ({ lessons: state.lessons, activeLessonId: state.activeLessonId }),
    getLessons: () => state.lessons,
    getActiveLesson: () => find(state.activeLessonId) || state.lessons[0],
    setActiveLesson(id) { if (!find(id)) return false; state.activeLessonId = id; save(); return true; },
    createLesson({ title = '新建晶体探究课例', subtitle = '', slides, isAi = false } = {}) {
      const items = Array.isArray(slides) && slides.length ? slides.map((s) => normalizeSlide(s)) : [normalizeSlide('quartz-vs-glass'), normalizeSlide('cu-vs-nacl-stress')];
      const lesson = { id: nextId('lesson'), title: String(title || '').trim().slice(0, 60) || '新建晶体探究课例', subtitle: String(subtitle || '').trim().slice(0, 80), builtin: false, isAi: Boolean(isAi), slides: items };
      state.lessons.push(lesson); state.activeLessonId = lesson.id; save(); return lesson;
    },
    importAiLesson(rawPlan) {
      const lesson = enrichLesson({ ...rawPlan, id: nextId('ai-lesson'), isAi: true, builtin: false }, { isAi: true });
      state.lessons.push(lesson); state.activeLessonId = lesson.id; save(); return lesson;
    },
    duplicateLesson(id) {
      const src = find(id);
      if (!src) return null;
      const copy = { ...cloneJson(src), id: nextId('lesson'), title: `${src.title.slice(0, 52)}（副本）`, builtin: false, isAi: false, slides: src.slides.map((s) => ({ ...cloneJson(s), id: nextId('slide') })) };
      state.lessons.push(copy); state.activeLessonId = copy.id; save(); return copy;
    },
    renameLesson(id, nextTitle) {
      const lesson = find(id); const clean = String(nextTitle || '').trim().slice(0, 60);
      if (!lesson || !clean) return false;
      lesson.title = clean; save(); return true;
    },
    deleteLesson(id) {
      if (state.lessons.length <= 1) return false;
      const idx = state.lessons.findIndex((l) => l.id === id);
      if (idx < 0) return false;
      state.lessons.splice(idx, 1);
      if (state.activeLessonId === id) state.activeLessonId = state.lessons[Math.max(0, idx - 1)].id;
      save(); return true;
    },
    addSlide(lessonId, presetOrSlide) {
      const lesson = find(lessonId);
      if (!lesson) return null;
      const slide = normalizeSlide(presetOrSlide);
      lesson.slides.push(slide); save(); return slide;
    },
    removeSlide(lessonId, slideId) {
      const lesson = find(lessonId);
      const idx = lesson ? lesson.slides.findIndex((s) => s.id === slideId) : -1;
      if (idx < 0 || lesson.slides.length <= 1) return false;
      lesson.slides.splice(idx, 1); save(); return true;
    },
    reorderSlide(lessonId, slideId, delta) {
      const lesson = find(lessonId);
      const idx = lesson ? lesson.slides.findIndex((s) => s.id === slideId) : -1;
      const target = idx + (delta > 0 ? 1 : -1);
      if (idx < 0 || target < 0 || target >= lesson.slides.length) return false;
      const [moved] = lesson.slides.splice(idx, 1);
      lesson.slides.splice(target, 0, moved); save(); return true;
    },
    updateSlide(lessonId, slideId, patch = {}) {
      const slide = find(lessonId)?.slides.find((s) => s.id === slideId);
      if (!slide) return null;
      if (typeof patch.title === 'string' && patch.title.trim()) slide.title = patch.title.trim().slice(0, 48);
      if (typeof patch.cue === 'string') slide.cue = patch.cue.trim().slice(0, 280);
      if (patch.qa !== undefined) slide.qa = normalizeQa(patch.qa);
      if (patch.stage) slide.stage = validateChemStage(cloneJson(patch.stage));
      save(); return slide;
    },
    resetDefaults() { state = { lessons: createDefaultLessons(), activeLessonId: 'builtin-intro' }; save(); return state.lessons; },
  };
}
