'use strict';

/**
 * 内置配平脚本
 * tip 尽量不写死最终系数（练习展示会再 sanitize）
 */

const BALANCE_BUILTIN = [
  {
    id: 'bal-h2o',
    title: '氢氧燃烧生成水',
    grade: '高一',
    difficulty: '入门',
    startEquation: 'H2 + O2 = H2O',
    targetEquation: '2H2 + O2 = 2H2O',
    species: {
      left: [{ formula: 'H2', coef: 1 }, { formula: 'O2', coef: 1 }],
      right: [{ formula: 'H2O', coef: 1 }],
    },
    steps: [
      {
        label: '观察未配平式',
        tip: '分别数一数左右 H、O 的原子个数。哪个元素左右不相等？可以从氧入手，也可以从氢入手。',
        action: 'explain',
        focus: null,
        expectedCoef: null,
      },
      {
        label: '调整水的系数',
        tip: '关注高亮的水分子：右边氧原子个数能否与左边 O₂ 对齐？试着改水的系数，使氧守恒。',
        action: 'set_coef',
        focus: { side: 'right', index: 0 },
        expectedCoef: 2,
      },
      {
        label: '调整氢气的系数',
        tip: '氧对齐后，再看氢：左边 H₂ 与右边水中的氢是否相等？改 H₂ 的系数使氢守恒。',
        action: 'set_coef',
        focus: { side: 'left', index: 0 },
        expectedCoef: 2,
      },
      {
        label: '检查守恒',
        tip: '再核对一遍：左右 H、O 原子数是否都相等？相等则配平完成。',
        action: 'check',
        focus: null,
        expectedCoef: null,
      },
    ],
  },
  {
    id: 'bal-fe-o2',
    title: '铁在氧气中燃烧',
    grade: '高一',
    difficulty: '基础',
    startEquation: 'Fe + O2 = Fe2O3',
    targetEquation: '4Fe + 3O2 = 2Fe2O3',
    species: {
      left: [{ formula: 'Fe', coef: 1 }, { formula: 'O2', coef: 1 }],
      right: [{ formula: 'Fe2O3', coef: 1 }],
    },
    steps: [
      {
        label: '观察未配平式',
        tip: '数 Fe、O 在左右的原子数。氧化物里铁、氧的下标会提示你「凑偶数」的思路。',
        action: 'explain',
        focus: null,
        expectedCoef: null,
      },
      {
        label: '先看铁',
        tip: '高亮的是铁单质。右边每个氧化物分子含几个 Fe？左边要怎么改系数才能先让铁的个数成比例？',
        action: 'set_coef',
        focus: { side: 'left', index: 0 },
        expectedCoef: 2,
      },
      {
        label: '再看氧化物',
        tip: '氧在氧化物中的下标是奇数时，常先把氧化物系数调整，使氧的总数变成偶数，再配 O₂。',
        action: 'set_coef',
        focus: { side: 'right', index: 0 },
        expectedCoef: 2,
      },
      {
        label: '调整氧气',
        tip: '氧化物系数定下后，数右边氧原子总数，再改 O₂ 的系数使氧守恒。',
        action: 'set_coef',
        focus: { side: 'left', index: 1 },
        expectedCoef: 3,
      },
      {
        label: '回查铁',
        tip: '氧对齐后，再回头看铁：左边 Fe 与右边氧化物中 Fe 是否相等？不相等就继续改 Fe 的系数。',
        action: 'set_coef',
        focus: { side: 'left', index: 0 },
        expectedCoef: 4,
      },
      {
        label: '检查守恒',
        tip: '最后核对 Fe、O 左右是否都守恒。若守恒，点「检查整式」确认。',
        action: 'check',
        focus: null,
        expectedCoef: null,
      },
    ],
  },
  {
    id: 'bal-ch4',
    title: '甲烷燃烧',
    grade: '高一',
    difficulty: '基础',
    startEquation: 'CH4 + O2 = CO2 + H2O',
    targetEquation: 'CH4 + 2O2 = CO2 + 2H2O',
    species: {
      left: [{ formula: 'CH4', coef: 1 }, { formula: 'O2', coef: 1 }],
      right: [{ formula: 'CO2', coef: 1 }, { formula: 'H2O', coef: 1 }],
    },
    steps: [
      {
        label: '观察未配平式',
        tip: '燃烧反应常按 C → H → O 的顺序想。先数碳、氢、氧各在左右有多少。',
        action: 'explain',
        focus: null,
        expectedCoef: null,
      },
      {
        label: '碳是否已齐',
        tip: '左边 CH₄ 与右边 CO₂ 的碳原子个数是否已经相等？若已相等，可先不动它们。',
        action: 'explain',
        focus: null,
        expectedCoef: null,
      },
      {
        label: '调整水的系数',
        tip: '看氢：左边甲烷里的氢与右边水中的氢是否相等？改水的系数使氢守恒。',
        action: 'set_coef',
        focus: { side: 'right', index: 1 },
        expectedCoef: 2,
      },
      {
        label: '调整氧气系数',
        tip: 'C、H 对齐后，数右边氧原子总数（来自 CO₂ 和水），再改 O₂ 的系数使氧守恒。',
        action: 'set_coef',
        focus: { side: 'left', index: 1 },
        expectedCoef: 2,
      },
      {
        label: '检查守恒',
        tip: '核对 C、H、O 三种元素左右是否都守恒。',
        action: 'check',
        focus: null,
        expectedCoef: null,
      },
    ],
  },
];

module.exports = { BALANCE_BUILTIN };
