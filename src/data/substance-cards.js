/**
 * 课标向物质补充说明（类别 / 用途 / 性质要点 / 注意）
 * 与内置分子 id 一一对应；有则并入左上角简介
 */

/** @type {Record<string, { category:string, uses:string, caution:string, point?:string }>} */
export const SUBSTANCE_CARDS = {
  h2: {
    category: '单质 · 非金属气体',
    uses: '清洁能源、冶金还原、有机加氢',
    caution: '易燃易爆，点燃前必须验纯',
    point: '常见还原剂；H—H 单键',
  },
  o2: {
    category: '单质 · 非金属气体',
    uses: '助燃、呼吸、医疗供氧',
    caution: '助燃，遇油脂等需注意安全',
    point: '常见氧化剂；O=O 双键',
  },
  n2: {
    category: '单质 · 非金属气体',
    uses: '保护气、合成氨原料',
    caution: '常温很稳定，不易反应',
    point: 'N≡N 三键牢固，化学性质稳定',
  },
  cl2: {
    category: '单质 · 卤素',
    uses: '消毒、有机氯化',
    caution: '有毒、黄绿色刺激性气体',
    point: '强氧化剂；Cl—Cl 单键',
  },
  o3: {
    category: '单质 · 氧的同素异形体',
    uses: '杀菌、吸收紫外线（臭氧层）',
    caution: '强氧化性，浓度高时有害',
    point: '弯曲形，氧化性强于氧气',
  },
  h2o: {
    category: '化合物 · 氧化物',
    uses: '溶剂、生命必需、工业冷却',
    caution: '纯水几乎不导电，有电解质才导电',
    point: '极性分子；O—H 键，可形成氢键',
  },
  h2o2: {
    category: '化合物 · 过氧化物',
    uses: '消毒、漂白',
    caution: '不稳定，见光易分解',
    point: '含 O—O 过氧键，易放氧',
  },
  hcl: {
    category: '化合物 · 酸',
    uses: '实验室试剂、工业酸洗',
    caution: '腐蚀性；气体遇水汽呈白雾',
    point: '强酸；H—Cl 极性共价键',
  },
  h2s: {
    category: '化合物 · 氢化物',
    uses: '化学分析、还原剂',
    caution: '有毒，臭鸡蛋气味',
    point: '弱酸；弯曲形，类似水',
  },
  nh3: {
    category: '化合物 · 氢化物',
    uses: '化肥、制冷、实验室制气',
    caution: '刺激性气味，溶于水放热',
    point: '碱性气体；三角锥，N—H 键',
  },
  co: {
    category: '化合物 · 氧化物',
    uses: '还原剂、燃料气',
    caution: '无色无味剧毒，注意通风',
    point: '可作还原剂；C 与 O 以三键结合',
  },
  co2: {
    category: '化合物 · 酸性氧化物',
    uses: '灭火、饮料、光合作用原料',
    caution: '高浓度可使人窒息',
    point: '直线形 O=C=O；不支持燃烧',
  },
  so2: {
    category: '化合物 · 酸性氧化物',
    uses: '漂白、防腐',
    caution: '刺激性气味，污染空气',
    point: '漂白性；弯曲形，酸雨成因之一',
  },
  so3: {
    category: '化合物 · 酸性氧化物',
    uses: '制硫酸中间体',
    caution: '强腐蚀，遇水剧烈反应',
    point: '平面形；与水生成硫酸',
  },
  no: {
    category: '化合物 · 氮氧化物',
    uses: '工业中间体、生物信号',
    caution: '有毒，易被氧化为 NO₂',
    point: '奇电子分子，易与 O₂ 反应',
  },
  no2: {
    category: '化合物 · 氮氧化物',
    uses: '制硝酸相关',
    caution: '红棕色有毒，刺激性强',
    point: '弯曲形；酸雨成因之一',
  },
  nacl: {
    category: '化合物 · 盐',
    uses: '食用、工业氯碱原料',
    caution: '过量摄入不利健康',
    point: '典型离子化合物；Na⁺ 与 Cl⁻',
  },
  ch4: {
    category: '有机 · 烷烃',
    uses: '天然气主要成分、燃料',
    caution: '易燃；与空气混合遇火可能爆炸',
    point: '饱和烃；正四面体，C—H 单键',
  },
  c2h6: {
    category: '有机 · 烷烃',
    uses: '燃料、有机合成原料',
    caution: '易燃',
    point: '含 C—C 单键，可发生取代',
  },
  c2h4: {
    category: '有机 · 烯烃',
    uses: '塑料原料、有机合成、催熟',
    caution: '易燃；双键易加成',
    point: '含 C=C 双键，可加成、加聚',
  },
  c2h2: {
    category: '有机 · 炔烃',
    uses: '气焊、有机合成',
    caution: '易燃；三键活泼',
    point: '含 C≡C 三键，可多步加成',
  },
  ch3oh: {
    category: '有机 · 醇',
    uses: '工业溶剂、燃料',
    caution: '有毒，可致失明，不可饮用',
    point: '含羟基 —OH；C—O 单键',
  },
  ethanol: {
    category: '有机 · 醇',
    uses: '消毒、溶剂、燃料',
    caution: '易燃；工业酒精不可饮用',
    point: '含羟基 —OH；可氧化、酯化',
  },
  hcho: {
    category: '有机 · 醛',
    uses: '防腐、有机合成',
    caution: '有毒，刺激性强',
    point: '含羰基 C=O；平面结构',
  },
  ch3cooh: {
    category: '有机 · 羧酸',
    uses: '食醋主要成分、化工原料',
    caution: '浓溶液有腐蚀性',
    point: '弱酸；含羧基 —COOH',
  },
  benzene: {
    category: '有机 · 芳香烃',
    uses: '有机溶剂与合成原料',
    caution: '有毒，实验室注意通风',
    point: '大 π 键稳定，易取代、难加成',
  },
};

export function getSubstanceCard(moleculeId) {
  if (!moleculeId) return null;
  return SUBSTANCE_CARDS[moleculeId] || null;
}
