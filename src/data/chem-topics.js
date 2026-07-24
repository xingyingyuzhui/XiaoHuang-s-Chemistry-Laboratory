/**
 * 高中化学章节/主题（智能出题用）
 * grade: 1 高一 · 2 高二 · 3 高三
 */

export const GRADES = [
  { id: 1, label: '高一' },
  { id: 2, label: '高二' },
  { id: 3, label: '高三' },
];

/** @type {Array<{ id: string, grade: number, label: string }>} */
export const CHEM_TOPICS = [
  // 高一
  { id: 'g1-substance', grade: 1, label: '物质的分类与变化' },
  { id: 'g1-amount', grade: 1, label: '物质的量' },
  { id: 'g1-ion', grade: 1, label: '离子反应' },
  { id: 'g1-redox', grade: 1, label: '氧化还原反应' },
  { id: 'g1-periodic', grade: 1, label: '元素周期表与周期律' },
  { id: 'g1-structure', grade: 1, label: '原子结构与化学键' },
  { id: 'g1-metal', grade: 1, label: '金属及其化合物' },
  { id: 'g1-nonmetal', grade: 1, label: '非金属及其化合物' },
  // 高二
  { id: 'g2-energy', grade: 2, label: '化学反应与能量' },
  { id: 'g2-rate', grade: 2, label: '化学反应速率与平衡' },
  { id: 'g2-electrolyte', grade: 2, label: '水溶液中的离子平衡' },
  { id: 'g2-electrochem', grade: 2, label: '电化学基础' },
  { id: 'g2-organic-intro', grade: 2, label: '有机化合物通识' },
  { id: 'g2-hydrocarbon', grade: 2, label: '烃与卤代烃' },
  { id: 'g2-oxygen', grade: 2, label: '烃的含氧衍生物' },
  { id: 'g2-polymer', grade: 2, label: '生命中的基础有机物' },
  // 高三
  { id: 'g3-review-inorg', grade: 3, label: '无机综合与推断' },
  { id: 'g3-review-org', grade: 3, label: '有机合成与推断' },
  { id: 'g3-experiment', grade: 3, label: '实验探究与设计' },
  { id: 'g3-stoich', grade: 3, label: '化学计算综合' },
  { id: 'g3-structure', grade: 3, label: '物质结构与性质' },
  { id: 'g3-principle', grade: 3, label: '化学反应原理综合' },
  { id: 'g3-gaokao', grade: 3, label: '高考真题风格综合' },
];

export const DIFFICULTIES = [
  {
    id: 'basic',
    label: '初级',
    desc: '基础概念与生活常识',
  },
  {
    id: 'medium',
    label: '中级',
    desc: '课本知识点课后题级别',
  },
  {
    id: 'hard',
    label: '高级',
    desc: '高考常见设问与综合',
  },
];

export const REVEAL_MODES = [
  { id: 'immediate', label: '选完即显示对错' },
  { id: 'submit', label: '交卷后统一显示' },
];

export function topicsForGrades(gradeIds) {
  const set = new Set(gradeIds.map(Number));
  return CHEM_TOPICS.filter((t) => set.has(t.grade));
}
