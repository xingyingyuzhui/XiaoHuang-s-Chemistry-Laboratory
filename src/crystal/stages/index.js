/**
 * 课堂「晶体探究」统一 10 舞台调度器与元数据目录
 * 冻结契约：导出 STAGE_CATALOG (10 项) 与 mountCrystalStage(stageId, stageEl, actionbarEl, { onCaption })
 */

import { mountCompare3DStage } from './stage-compare-3d.js';
import { mountHammer3DStage } from './stage-hammer-3d.js';
import { mountIce3DStage } from './stage-ice-3d.js';
import { mountSelfFormDemo } from '../modules/basics/demo-selfform.js';
import { mountMeltingDemo } from '../modules/basics/demo-melting.js';
import { mountAnisotropyDemo } from '../modules/basics/demo-physics.js';
import { mountXrdDemo } from '../modules/basics/demo-xrd.js';
import { mountUnitCellDemo } from '../modules/basics/demo-unitcell.js';
import { createConductExp } from '../modules/properties/exp-conduct.js';
import { createMeltRaceExp } from '../modules/properties/exp-melt-race.js';

export const STAGE_CATALOG = [
  {
    id: 'compare-3d', title: '水晶 vs 石英玻璃', badge: '3D 光学', category: 'basics',
    summary: '水晶与石英玻璃同为 SiO₂，本质区别在于内部 Si-O 网络是否呈三维周期性长程有序排列。',
    qa: { question: '天然水晶与石英玻璃成分都是 SiO₂，为何前者呈规则六棱柱而后者无固定外形？', answer: '水晶内部 Si、O 原子呈周期性长程有序排列；石英玻璃仅短程有序、长程无序，故无规则晶面。' },
    quickQuestions: ['水晶和石英玻璃为何外形不同？', '什么是长程有序与短程有序？', '非晶体能转化为晶体吗？'],
  },
  {
    id: 'selfform', title: '晶体的自范性', badge: '宏观特征', category: 'basics',
    summary: '晶体在适宜条件下能自发呈现封闭规则多面体外形，缺角在饱和溶液中可优先自修复。',
    qa: { question: '把玻璃打磨成正方体就是晶体吗？缺角 NaCl 放入饱和食盐水会怎样？', answer: '打磨的玻璃不是晶体，因外形非自发形成；缺角 NaCl 会通过溶解-结晶平衡优先补齐缺口。' },
    quickQuestions: ['打磨成正方体的玻璃是晶体吗？', '缺角食盐为何优先补齐缺口？', '呈现自范性需要什么条件？'],
  },
  {
    id: 'melting-curve', title: '固定熔点对比', badge: '热学性质', category: 'basics',
    summary: '晶体在熔点处存在恒温吸热熔化平台；非晶体加热时逐渐软化，无固定熔点。',
    qa: { question: '海波在 48°C 熔化平台期持续吸热，为何温度计示数保持不变？', answer: '晶体微粒间作用力均匀，熔化时吸收的热量全部用于克服晶格束缚，平均动能不变故温度恒定。' },
    quickQuestions: ['海波 48°C 吸热为何温度不变？', '为何非晶体没有固定熔点？', '熔化平台吸收的热量去了哪？'],
  },
  {
    id: 'anisotropy', title: '各向异性导热', badge: '方向差异', category: 'basics',
    summary: '单晶沿不同晶向微粒间距不同，导热等物理性质呈各向异性；玻璃与多晶体宏观各向同性。',
    qa: { question: '为何烫针加热后云母片上熔斑呈椭圆、玻璃片上呈正圆？多晶体也有各向异性吗？', answer: '云母单晶不同方向微粒间距不同导致传热速率不同；玻璃与晶粒杂乱的多晶体宏观呈各向同性。' },
    quickQuestions: ['为何云母导热熔斑呈椭圆？', '多晶体为何表现为各向同性？', '晶体还有哪些各向异性？'],
  },
  {
    id: 'xray', title: 'X 射线衍射', badge: '最可靠鉴别', category: 'basics',
    summary: 'X 射线衍射是鉴别晶体与非晶体最可靠的方法：晶体产生锐利斑点与尖峰，非晶体仅呈弥散晕环。',
    qa: { question: '实验室里区分晶体与非晶体最可靠的科学依据是什么？', answer: 'X 射线衍射实验：晶体周期晶面满足布拉格方程 2d sinθ = nλ 产生尖锐衍射峰，非晶体仅呈宽化晕环。' },
    quickQuestions: ['X 射线衍射如何鉴别晶体？', '2d sinθ = nλ 各量含义？', '为何不能单凭外观判断晶体？'],
  },
  {
    id: 'unitcell-3d', title: '从晶体到晶胞', badge: '3D 过渡', category: 'basics',
    summary: '晶胞是描述晶体结构的基本重复单元，整块晶体由晶胞沿三维坐标轴无隙并置平移而成。',
    qa: { question: '为何晶胞拼接强调“无隙并置”？立方晶胞顶点和面心原子各贡献多少？', answer: '相邻晶胞无空隙且取向一致仅平移重复；顶点原子由 8 个晶胞共用（1/8），面心由 2 个共用（1/2）。' },
    quickQuestions: ['什么是晶胞的“无隙并置”？', 'FCC 晶胞顶点和面心各占几分之几？', '如何算出铜晶胞含 4 个原子？'],
  },
  {
    id: 'hammer-3d', title: '金属与食盐同时敲一下', badge: '3D 受力', category: 'properties',
    summary: '金属键无方向性使铜受力滑移不断裂（延展性）；离子晶体错位后同号离子正对相斥即碎裂（脆性）。',
    qa: { question: '为何铁锤敲击铜块会压扁展平，而敲击食盐晶体却会瞬间爆裂？', answer: '金属阳离子浸泡在自由电子海中，层间滑移仍被电子海维系；离子晶体错位后同号相斥立即沿解理面碎裂。' },
    quickQuestions: ['为何金属有延展性而食盐易碎？', '金属键无方向性是什么意思？', '共价晶体受力为何也很脆？'],
  },
  {
    id: 'conduct', title: '食盐三态导电', badge: '电学性质', category: 'properties',
    summary: '固态 NaCl 离子被固定在晶格中不导电；熔融态与水溶液释放自由离子定向迁移而导电。',
    qa: { question: '食盐由带电的 Na⁺ 和 Cl⁻ 组成，为何固态时不导电，熔化或溶于水后才能导电？', answer: '导电需要自由移动的带电微粒：固态离子被离子键束缚，熔融或水合后解离并向两极定向迁移。' },
    quickQuestions: ['固态食盐有离子为何不导电？', '熔融态与水溶液导电有何区别？', '共价化合物 HCl 熔融态导电吗？'],
  },
  {
    id: 'ice-3d', title: '冰为何浮在水上', badge: '3D 氢键笼', category: 'properties',
    summary: '结冰时水分子形成四面体氢键六方空心笼（ρ = 0.917 g/cm³）；升温至 4°C 破键坍缩排布最密。',
    qa: { question: '为何大多数固体沉于液底，冰却浮在水上且 4°C 液态水密度最大？', answer: '氢键具方向性与饱和性，使冰形成空隙巨大的六方笼；升温至 4°C 部分氢键断裂，分子坍缩填空致密度达 1.000 g/cm³。' },
    quickQuestions: ['为何冰的密度比液态水小？', '水为何在 4°C 时密度最大？', '一个水分子平均形成几个氢键？'],
  },
  {
    id: 'melt-race', title: '16 种晶体热成像升温大比拼', badge: '热成像', category: 'properties',
    summary: '同步升温对比分子、金属、离子、共价四类晶体熔点，揭示微粒间作用力强弱与熔沸点规律。',
    qa: { question: '熔点排序“共价 > 离子 > 分子”原因是什么？为何金属既有 -39°C 的汞也有 3422°C 的钨？', answer: '熔化需克服微粒间作用力：分子间力最弱，离子键与共价键强；金属键强弱取决于价电子数与原子半径，跨度极大。' },
    quickQuestions: ['四类晶体熔沸点总体规律？', '同为金属为何汞低而钨极高？', '如何比较 NaCl 与 MgO 熔点？'],
  },
];

const wrapBasics = (fn) => (stageEl, controlsEl, onCaption) =>
  fn({ stageEl, controlsEl, setCaption: (t) => onCaption?.(t || ''), setLegend() {} });

const wrapProps = (fn) => (stageEl, controlsEl, onCaption) =>
  fn(stageEl, controlsEl, (t) => onCaption?.(t || ''));

const wrap3D = (fn) => (stageEl, actionbarEl, onCaption) =>
  fn(stageEl, actionbarEl, { onCaption });

const MOUNTERS = {
  'compare-3d': wrap3D(mountCompare3DStage),
  selfform: wrapBasics(mountSelfFormDemo),
  'melting-curve': wrapBasics(mountMeltingDemo),
  anisotropy: wrapBasics(mountAnisotropyDemo),
  xray: wrapBasics(mountXrdDemo),
  'unitcell-3d': wrapBasics(mountUnitCellDemo),
  'hammer-3d': wrap3D(mountHammer3DStage),
  conduct: wrapProps(createConductExp),
  'ice-3d': wrap3D(mountIce3DStage),
  'melt-race': wrapProps(createMeltRaceExp),
};

export function mountCrystalStage(stageId, stageEl, actionbarEl, { onCaption } = {}) {
  if (!stageEl) return { pause() {}, resume() {}, resize() {}, destroy() {} };
  stageEl.innerHTML = '';
  const controlsHost = actionbarEl || document.createElement('div');
  controlsHost.innerHTML = '';

  const mountFn = MOUNTERS[stageId] || MOUNTERS['compare-3d'];
  let inst = mountFn(stageEl, controlsHost, onCaption);
  let destroyed = false;

  return {
    pause() { if (!destroyed) inst?.pause?.(); },
    resume() { if (!destroyed) inst?.resume?.(); },
    resize() { if (!destroyed) inst?.resize?.(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try { inst?.destroy?.(); } catch (err) { console.warn('[crystal-stages] destroy failed:', err); }
      inst = null;
      stageEl.innerHTML = '';
      if (actionbarEl) actionbarEl.innerHTML = '';
    },
  };
}
