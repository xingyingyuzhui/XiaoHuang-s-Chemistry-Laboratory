/**
 * 课堂 · 实验探究脚本
 * 步骤中补充化学键变化（中学表述）
 */

export const LAB_SCRIPTS = [
  {
    id: 'lab-o2',
    title: '实验室制氧气（高锰酸钾）',
    type: '气体制备',
    equation: '2 KMnO₄ △→ K₂MnO₄ + MnO₂ + O₂↑',
    safety: '试管口略向下倾斜；加热后先撤导管再停热，防倒吸。',
    steps: [
      {
        label: '组装装置',
        tip: '大试管、导管、集气瓶，检查气密性',
      },
      {
        label: '装药品',
        tip: '高锰酸钾铺平，管口放一团棉花',
      },
      {
        label: '加热分解',
        tip: 'K—O 等键在加热下重组：Mn 的化合价变化，释放 O₂（O=O 双键分子）',
      },
      {
        label: '收集与验满',
        tip: '排水法或向上排空气法；带火星木条复燃说明有 O₂',
      },
      {
        label: '结束',
        tip: '先撤导管，再移走酒精灯，防止倒吸',
      },
    ],
    phenomena: '有气体放出；带火星木条复燃',
  },
  {
    id: 'lab-h2',
    title: '氢气燃烧与验纯',
    type: '性质实验',
    equation: '2 H₂ + O₂ 点燃→ 2 H₂O',
    safety: '点燃前必须验纯；不纯可能爆鸣。',
    steps: [
      {
        label: '收集氢气',
        tip: '排水法或向下排空气法；H—H 单键分子较轻',
      },
      {
        label: '验纯',
        tip: '拇指堵住管口靠近火焰，听声音是否尖锐爆鸣',
      },
      {
        label: '点燃燃烧',
        tip: 'H—H、O=O 键断裂重组，形成 H—O 键，得到水分子',
      },
      {
        label: '观察产物',
        tip: '冷碟子罩火焰上方可有水珠；键型由单质键变为极性共价 O—H',
      },
    ],
    phenomena: '淡蓝色火焰；可能有水雾',
  },
  {
    id: 'lab-co2',
    title: '实验室制二氧化碳',
    type: '气体制备',
    equation: 'CaCO₃ + 2 HCl → CaCl₂ + H₂O + CO₂↑',
    safety: '盐酸勿溅皮肤；装置气密性要好。',
    steps: [
      {
        label: '药品',
        tip: '大理石（或石灰石）+ 稀盐酸',
      },
      {
        label: '发生反应',
        tip: '碳酸根与 H⁺ 作用，C—O 骨架重组生成直线形 O=C=O（二氧化碳）',
      },
      {
        label: '收集',
        tip: '向上排空气法（CO₂ 密度大于空气）',
      },
      {
        label: '检验',
        tip: '通入澄清石灰水：CO₂ 与 Ca(OH)₂ 生成 CaCO₃ 沉淀而变浑浊',
      },
    ],
    phenomena: '有气泡；石灰水变浑浊',
  },
  {
    id: 'lab-neutralize',
    title: '酸碱中和',
    type: '中和',
    equation: 'HCl + NaOH → NaCl + H₂O',
    safety: '强酸强碱腐蚀；用指示剂判断终点。',
    steps: [
      {
        label: '取碱液',
        tip: '锥形瓶中放 NaOH 溶液，加酚酞',
      },
      {
        label: '滴加酸',
        tip: '酸式滴定管缓缓滴入盐酸；H—Cl 在水中以 H⁺、Cl⁻ 形式参与',
      },
      {
        label: '中和成键',
        tip: '本质：H⁺ 与 OH⁻ 结合生成 H—O 键，形成水分子',
      },
      {
        label: '终点',
        tip: '红色刚好褪去且半分钟不恢复；溶液中主要为 Na⁺、Cl⁻',
      },
    ],
    phenomena: '酚酞由红变无色',
  },
  {
    id: 'lab-ester',
    title: '乙酸乙酯化',
    type: '有机',
    equation: 'CH₃COOH + C₂H₅OH ⇌ CH₃COOC₂H₅ + H₂O',
    safety: '浓硫酸腐蚀；加热注意防暴沸；通风。',
    steps: [
      {
        label: '加料',
        tip: '乙醇、乙酸，再缓缓加浓硫酸',
      },
      {
        label: '加热酯化',
        tip: '酸脱羟基、醇脱氢：形成酯基中的 C—O 单键，并生成水',
      },
      {
        label: '键的变化',
        tip: '羧酸的 C—OH 与醇的 O—H 发生缩合，产物含 —COO— 酯键',
      },
      {
        label: '分层收集',
        tip: '上层有香味油状液体；反应可逆，产率受条件影响',
      },
    ],
    phenomena: '有香味；油层浮于液面',
  },
];
