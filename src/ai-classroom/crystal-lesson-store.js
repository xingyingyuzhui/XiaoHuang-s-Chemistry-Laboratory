/**
 * 晶体探究 · 课例与环节持久化仓库（localStorage）
 * 内置 3 节高中示范课例，支持课例 CRUD / 复制 / 恢复默认，以及环节增删 / 排序 / 编辑。
 */

export const STORAGE_KEY = 'chem-lab-crystal-lessons';

export const STAGE_FALLBACK_TITLES = {
  'compare-3d': '水晶 vs 石英玻璃 · 真3D光学',
  selfform: '食盐自范性与修角',
  'melting-curve': '固定熔点对比',
  anisotropy: '云母 vs 玻璃各向异性',
  xray: 'X 射线衍射',
  'unitcell-3d': '铜晶胞提取与并置',
  'hammer-3d': 'Cu vs NaCl 真3D受力冲击',
  conduct: '食盐三态导电',
  'ice-3d': '冰浮水上 · 真3D氢键笼',
  'melt-race': '16 晶体热成像熔化大比拼',
};

export const VALID_STAGE_IDS = new Set(Object.keys(STAGE_FALLBACK_TITLES));

let idSeq = 1;
const nextId = (prefix) => `${prefix}-${Date.now().toString(36)}-${++idSeq}`;

function normalizeQa(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const question = String(raw.question || '').trim();
  const answer = String(raw.answer || '').trim();
  return question && answer ? { question, answer } : null;
}

function makeStep(raw, fallbackId) {
  const stageId = typeof raw === 'string' ? raw : String(raw?.stageId || raw?.id || '').trim();
  if (!VALID_STAGE_IDS.has(stageId)) return null;
  return {
    id: String(raw?.id && raw.id !== stageId ? raw.id : fallbackId || nextId('step')),
    stageId,
    title: String(raw?.title || '').trim() || STAGE_FALLBACK_TITLES[stageId],
    teacherNote: String(raw?.teacherNote || '').trim(),
    qa: normalizeQa(raw?.qa),
  };
}

const seedStep = (id, stageId, title, teacherNote, q, a) =>
  makeStep({ id, stageId, title, teacherNote, qa: { question: q, answer: a } });

export function createDefaultLessons() {
  return [
    {
      id: 'builtin-intro',
      title: '第 1 节 · 走进晶体世界',
      builtin: true,
      aiGenerated: false,
      steps: [
        seedStep('intro-1', 'compare-3d', '水晶与石英玻璃：宏观到微观',
          '先请学生转动 3D 模型对比天然水晶与石英玻璃外形，再切到「微观 3D Si-O 网」停顿追问：成分都是 SiO₂，为何外观截然不同？',
          '水晶和石英玻璃化学成分都是 SiO₂，为何外观截然不同？',
          '水晶内部 Si-O 四面体呈长程周期性有序排列，是晶体；石英玻璃内部粒子排列无序，是非晶体。'),
        seedStep('intro-2', 'selfform', '食盐的自范性与断角修复',
          '演示敲掉食盐一角后在饱和溶液中缓慢生长，强调「自范性」需要合适结晶条件，切勿误认为有规则外形就一定是晶体。',
          '把缺角的食盐放回饱和食盐水中，为什么能“长回”规则立方体？',
          '晶体内部微粒周期性有序堆积，溶质微粒优先在能量较高的缺损处有序沉积，体现晶体自范性。'),
        seedStep('intro-3', 'melting-curve', '晶体为什么有固定熔点？',
          '同步加热两条曲线，在晶体出现水平平台时暂停，引导学生说出此时吸热用于克服微粒间作用力而非升高温度。',
          '加热过程中，晶体熔化曲线为何会出现一段温度不变的平台？',
          '晶体内部微粒排布规整、作用力均一，达到熔点后吸热全部用于破坏晶体点阵，故温度恒定。'),
        seedStep('intro-4', 'unitcell-3d', '从铜晶体里提取最小晶胞',
          '先展示整块铜点阵，再提取单个面心立方晶胞并做“无隙并置”，为下节课均摊法计算做好空间铺垫。',
          '晶胞必须满足哪两个条件才能代表整块晶体？',
          '晶胞是最小的结构重复单元，且沿三维方向平移“无隙并置”即可还原整个晶体。'),
      ],
    },
    {
      id: 'builtin-metal-ionic',
      title: '第 2 节 · 金属与食盐为何脾气相反？',
      builtin: true,
      aiGenerated: false,
      steps: [
        seedStep('mi-1', 'hammer-3d', '同敲一锤：铜片延展 vs 食盐碎裂',
          '点击「同时敲一下」后可切 0.35× 慢动作回放，停在错位瞬间让学生看清：金属电子气维系不断键，NaCl 同号离子相对瞬间炸裂。',
          '同受外力冲击，为什么金属铜能锻打成片，而食盐晶体一敲就碎？',
          '金属键无方向性，层间滑移时自由电子仍维系结合；离子晶体滑移后同号离子相邻，强烈排斥导致解理碎裂。'),
        seedStep('mi-2', 'conduct', '食盐三态导电实验对比',
          '依次切换固态、熔融态、水溶液，强调“有离子不等于能导电，必须存在可自由移动的离子”。',
          'NaCl 晶体里明明全是 Na⁺ 和 Cl⁻，为什么固态时不导电？',
          '固态 NaCl 中阴、阳离子被强离子键束缚在晶格节点上无法自由移动；熔融或溶于水后离子键断裂才可自由导电。'),
        seedStep('mi-3', 'melt-race', '16 种晶体热成像熔化大比拼',
          '把升温滑块从低温推到 3500℃，让学生按“分子 → 金属/离子 → 共价”记录各家族熔化区间，归纳作用力决定熔沸点。',
          '从 16 种晶体的熔化顺序看，四大晶体类型熔点总体呈什么规律？',
          '一般为共价晶体 > 离子晶体 > 分子晶体，金属晶体跨度极大（如汞 -39℃，钨 3422℃）。'),
      ],
    },
    {
      id: 'builtin-ice-water',
      title: '第 3 节 · 冰为何浮在水上？',
      builtin: true,
      aiGenerated: false,
      steps: [
        seedStep('iw-1', 'ice-3d', '氢键笼坍塌：0℃ 冰到 4℃ 液态水',
          '先开「氢键高亮」旋转观察 0℃ 冰的空旷六边形孔道，再滑到 4℃ 读密度柱：为什么 4℃ 水密度最大？',
          '为什么冰的密度比液态水小，且液态水在 4℃ 时密度达到最大？',
          '冰中氢键的方向性与饱和性形成空旷四面体笼；升温熔化时部分氢键断裂，水分子塌入空隙使体积缩小、4℃ 时最密。'),
        seedStep('iw-2', 'compare-3d', '延伸对比：有序晶体与无序非晶体',
          '呼应冰的规则氢键网，回看 Si-O 有序网与无序网，强化“微观排布决定宏观密度与对称性”。',
          '微粒有序排列是否一定意味着密度更大？',
          '不一定！若存在方向性强的键（如氢键），有序排列反而留出大量空隙，使晶体密度低于液态。'),
        seedStep('iw-3', 'melt-race', '横向收束：冰在 16 种晶体中的位置',
          '定位冰与干冰在热成像大比拼中的低温区，追问：同为分子晶体，为什么 H₂O 熔点远高于 H₂S 和干冰？',
          '同属分子晶体，为什么冰的熔点明显高于干冰和 H₂S？',
          '水分子间存在强氢键，克服分子间作用力所需能量远大于仅靠范德华力的干冰与 H₂S。'),
      ],
    },
  ];
}

function sanitizeLessons(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const lessons = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const title = String(item.title || '').trim().slice(0, 60);
    if (!title) continue;
    const steps = (Array.isArray(item.steps) ? item.steps : []).map((s) => makeStep(s)).filter(Boolean);
    lessons.push({
      id: String(item.id || nextId('lesson')),
      title,
      builtin: Boolean(item.builtin),
      aiGenerated: Boolean(item.aiGenerated),
      steps,
    });
  }
  return lessons.length ? lessons : null;
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
      const lessons = sanitizeLessons(parsed?.lessons);
      if (lessons) {
        const activeLessonId = lessons.some((l) => l.id === parsed.activeLessonId) ? parsed.activeLessonId : lessons[0].id;
        state = { lessons, activeLessonId };
      }
    } catch { /* ignore corrupted cache */ }
  }

  const save = () => { try { backend?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore quota */ } };
  const find = (id) => state.lessons.find((l) => l.id === id) || null;

  return {
    getState: () => ({ lessons: state.lessons, activeLessonId: state.activeLessonId }),
    getLessons: () => state.lessons,
    getActiveLesson: () => find(state.activeLessonId) || state.lessons[0],
    setActiveLesson(id) {
      if (!find(id)) return false;
      state.activeLessonId = id; save(); return true;
    },
    createLesson({ title = '新建晶体探究课例', steps, aiGenerated = false } = {}) {
      const normalizedSteps = Array.isArray(steps) && steps.length
        ? steps.map((s) => makeStep(s)).filter(Boolean)
        : [makeStep('compare-3d'), makeStep('hammer-3d')];
      const lesson = { id: nextId('lesson'), title: String(title || '').trim().slice(0, 60) || '新建晶体探究课例', builtin: false, aiGenerated: Boolean(aiGenerated), steps: normalizedSteps };
      state.lessons.push(lesson); state.activeLessonId = lesson.id; save(); return lesson;
    },
    duplicateLesson(id) {
      const src = find(id);
      if (!src) return null;
      const copy = { id: nextId('lesson'), title: `${src.title.slice(0, 52)}（副本）`, builtin: false, aiGenerated: false, steps: src.steps.map((s) => ({ ...s, id: nextId('step'), qa: s.qa ? { ...s.qa } : null })) };
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
    addStep(lessonId, stageInput) {
      const lesson = find(lessonId); const step = lesson ? makeStep(stageInput) : null;
      if (!step) return null;
      lesson.steps.push(step); save(); return step;
    },
    removeStep(lessonId, stepId) {
      const lesson = find(lessonId); const idx = lesson ? lesson.steps.findIndex((s) => s.id === stepId) : -1;
      if (idx < 0) return false;
      lesson.steps.splice(idx, 1); save(); return true;
    },
    reorderStep(lessonId, stepId, delta) {
      const lesson = find(lessonId); const idx = lesson ? lesson.steps.findIndex((s) => s.id === stepId) : -1;
      const target = idx + (delta > 0 ? 1 : -1);
      if (idx < 0 || target < 0 || target >= lesson.steps.length) return false;
      const [moved] = lesson.steps.splice(idx, 1);
      lesson.steps.splice(target, 0, moved); save(); return true;
    },
    updateStep(lessonId, stepId, patch = {}) {
      const step = find(lessonId)?.steps.find((s) => s.id === stepId);
      if (!step) return null;
      if (typeof patch.title === 'string' && patch.title.trim()) step.title = patch.title.trim().slice(0, 48);
      if (typeof patch.teacherNote === 'string') step.teacherNote = patch.teacherNote.trim().slice(0, 260);
      if (patch.qa !== undefined) step.qa = normalizeQa(patch.qa);
      save(); return step;
    },
    resetDefaults() {
      state = { lessons: createDefaultLessons(), activeLessonId: 'builtin-intro' };
      save(); return state.lessons;
    },
  };
}
