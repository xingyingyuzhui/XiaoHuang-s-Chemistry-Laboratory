'use strict';

const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../db/sqlite');
const { ensureQuizSchema } = require('../db/ensure-quiz-schema');
const { success, error } = require('../utils/response');

/**
 * 高中化学知识点目录（确定性分类用）
 * 每条规则：keyword 匹配题干/知识点字段 → 归入对应 topicId
 */
const KNOWLEDGE_CATALOG = [
  { id: 'substance-class', name: '物质的分类与变化', keywords: ['物质的分类', '混合物', '纯净物', '单质', '化合物', '氧化物', '酸', '碱', '盐', '胶体', '电解质', '非电解质'] },
  { id: 'amount', name: '物质的量', keywords: ['物质的量', '摩尔', '阿伏加德罗', '摩尔质量', '气体摩尔体积', '物质的量浓度', 'NA'] },
  { id: 'ion-reaction', name: '离子反应', keywords: ['离子反应', '离子方程式', '离子共存', '离子检验', '复分解'] },
  { id: 'redox', name: '氧化还原反应', keywords: ['氧化还原', '氧化剂', '还原剂', '化合价', '电子转移', '氧化性', '还原性'] },
  { id: 'periodic', name: '元素周期表与周期律', keywords: ['周期表', '周期律', '主族', '副族', '原子序数', '电子层', '同周期', '同主族', '电负性', '电离能'] },
  { id: 'structure', name: '原子结构与化学键', keywords: ['原子结构', '化学键', '共价键', '离子键', '金属键', '电子排布', '轨道', '杂化', 'σ键', 'π键'] },
  { id: 'metal', name: '金属及其化合物', keywords: ['钠', '铝', '铁', '铜', '金属', '合金', '焰色反应', '氢氧化钠', '氢氧化铝', '氧化铝', 'FeCl', 'Na₂O', 'NaOH'] },
  { id: 'nonmetal', name: '非金属及其化合物', keywords: ['硅', '氯', '硫', '氮', '碳', '卤素', '浓硫酸', '硝酸', '氨气', 'Cl₂', 'SO₂', 'NO₂', 'NH₃', 'HCl', 'SiO₂'] },
  { id: 'energy', name: '化学反应与能量', keywords: ['反应热', '焓变', '热化学方程式', '燃烧热', '中和热', '盖斯定律', '能量变化', '放热', '吸热'] },
  { id: 'rate-equilibrium', name: '化学反应速率与平衡', keywords: ['反应速率', '化学平衡', '平衡常数', '平衡移动', '勒夏特列', '转化率', '催化剂'] },
  { id: 'ion-balance', name: '水溶液中的离子平衡', keywords: ['电离平衡', '水解', 'pH', '酸碱指示剂', '缓冲', '溶度积', 'Ksp', '电离常数', '水的电离'] },
  { id: 'electrochem', name: '电化学基础', keywords: ['原电池', '电解', '电极', '阳极', '阴极', '电镀', '电解质', '燃料电池', '电化学腐蚀', '牺牲阳极'] },
  { id: 'organic-intro', name: '有机化合物通识', keywords: ['有机', '官能团', '同分异构', '碳链', '碳环', '烃'] },
  { id: 'hydrocarbon', name: '烃与卤代烃', keywords: ['烷烃', '烯烃', '炔烃', '苯', '甲苯', '卤代烃', '取代反应', '加成反应', '消去反应'] },
  { id: 'oxygen-organic', name: '烃的含氧衍生物', keywords: ['醇', '醛', '羧酸', '酯', '乙醇', '乙酸', '乙醛', '酯化', '氧化反应', '还原反应', '银镜反应'] },
  { id: 'polymer', name: '生命中的基础有机物', keywords: ['蛋白质', '糖类', '油脂', '氨基酸', '葡萄糖', '淀粉', '纤维素', '高分子', '聚合'] },
  { id: 'inorganic-synthesis', name: '无机综合与推断', keywords: ['无机推断', '转化关系', '框图', '工业流程'] },
  { id: 'organic-synthesis', name: '有机合成与推断', keywords: ['有机推断', '合成路线', '逆合成', '有机合成'] },
  { id: 'experiment', name: '实验探究与设计', keywords: ['实验', '操作', '装置', '试剂', '蒸馏', '过滤', '蒸发', '萃取', '滴定', '结晶', '检验', '鉴别', '制备', '收集', '干燥', '除杂'] },
  { id: 'stoichiometry', name: '化学计算综合', keywords: ['计算', '质量分数', '产率', '物质的量计算', '滴定计算'] },
  { id: 'material-structure', name: '物质结构与性质', keywords: ['晶体', '晶胞', '配位数', '氢键', '分子间作用力', '范德华力', '空间构型', 'VSEPR', '杂化轨道'] },
  { id: 'reaction-principle', name: '化学反应原理综合', keywords: ['反应原理', '盖斯', '热力学', '动力学', '平衡综合'] },
];

/**
 * 短且多义的关键词：单独出现时容易误分。
 * 仅当它们是某个更长关键词的子串时才生效（已被 longest-match 覆盖），
 * 或当 knowledge 字段本身包含时才单独命中。
 */
const SHORT_AMBIGUOUS = new Set(['酸', '碱', '盐', '碳', '铁', '铜', '钠', '铝', '硅', '氯', '硫', '氮', '醇', '醛', '酯', '烃', '计算', '检验']);

/**
 * 将一道题归类到知识点。
 * 策略：
 *  1. knowledge 字段优先：knowledge 非空且不像年份时，命中权重 ×2（等效长度加长）
 *  2. 最长关键词优先（避免「水解」抢「蛋白质水解」）
 *  3. 短歧义词（单字/两字）仅在 knowledge 命中或作为更长词的子串时生效
 */
function classifyQuestion(knowledge, stem) {
  const knowledgeStr = (knowledge || '').trim();
  const stemStr = stem || '';
  // knowledge 若像年份则不算有效 knowledge
  const knowledgeIsYear = /^\d{4}.*高考/.test(knowledgeStr) || /^\d{4}.*试卷/.test(knowledgeStr);
  const useKnowledgeBoost = knowledgeStr.length > 0 && !knowledgeIsYear;

  let bestId = 'uncategorized';
  let bestLen = 0;

  for (const cat of KNOWLEDGE_CATALOG) {
    for (const kw of cat.keywords) {
      // 短歧义词：仅当 knowledge 命中时才单独生效
      if (SHORT_AMBIGUOUS.has(kw)) {
        const inKnowledge = useKnowledgeBoost && knowledgeStr.includes(kw);
        const inStem = stemStr.includes(kw);
        if (!inKnowledge && inStem) continue; // stem 中的短歧义词跳过
      }

      // 检查是否在 text 中出现
      const text = `${knowledgeStr} ${stemStr}`;
      if (!text.includes(kw)) continue;

      // knowledge 命中时长度等效翻倍（加权）
      const effectiveLen = (useKnowledgeBoost && knowledgeStr.includes(kw)) ? kw.length * 2 : kw.length;

      if (effectiveLen > bestLen) {
        bestId = cat.id;
        bestLen = effectiveLen;
      }
    }
  }
  return bestId;
}

/**
 * 计算掌握度等级
 * 0 题 → 未开始
 * 正确率 < 40% → 起步
 * 正确率 40%~79% → 练习中
 * 正确率 >= 80% → 掌握
 */
function masteryLevel(total, correct) {
  if (total === 0) return 'unstarted';
  const rate = correct / total;
  if (rate < 0.4) return 'beginner';
  if (rate < 0.8) return 'practicing';
  return 'mastered';
}

const LEVEL_LABELS = {
  unstarted: '未开始',
  beginner: '起步',
  practicing: '练习中',
  mastered: '掌握',
};

/** 薄弱在前：起步 → 练习中 → 未开始 → 掌握 */
const LEVEL_ORDER = { beginner: 0, practicing: 1, unstarted: 2, mastered: 3 };

router.get('/', (_req, res) => {
  try {
    ensureQuizSchema();

    // 读取所有练习题项
    const items = query(
      `SELECT qi.knowledge, qi.stem, qi.is_correct, qi.chosen
       FROM quiz_items qi
       JOIN quiz_sessions qs ON qi.session_id = qs.id`
    );

    // 读取错题本
    const wrongItems = query(
      `SELECT knowledge, stem, dismissed FROM quiz_wrong_book`
    );

    // 汇总
    let totalQuestions = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    const topicMap = {};

    for (const item of items) {
      totalQuestions++;
      const correct = Number(item.is_correct) || 0;
      if (correct) totalCorrect++;

      const topicId = classifyQuestion(item.knowledge, item.stem);
      if (!topicMap[topicId]) {
        topicMap[topicId] = { total: 0, correct: 0, wrong: 0 };
      }
      topicMap[topicId].total++;
      if (correct) topicMap[topicId].correct++;
    }

    for (const w of wrongItems) {
      if (!Number(w.dismissed)) {
        totalWrong++;
        const topicId = classifyQuestion(w.knowledge, w.stem);
        if (!topicMap[topicId]) {
          topicMap[topicId] = { total: 0, correct: 0, wrong: 0 };
        }
        topicMap[topicId].wrong++;
      }
    }

    // 构建知识点列表
    const topics = KNOWLEDGE_CATALOG.map((cat) => {
      const stats = topicMap[cat.id] || { total: 0, correct: 0, wrong: 0 };
      return {
        id: cat.id,
        name: cat.name,
        total: stats.total,
        correct: stats.correct,
        wrong: stats.wrong,
        accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null,
        level: masteryLevel(stats.total, stats.correct),
        levelLabel: LEVEL_LABELS[masteryLevel(stats.total, stats.correct)],
      };
    });

    // 加入未分类
    const uncategorized = topicMap['uncategorized'] || { total: 0, correct: 0, wrong: 0 };
    if (uncategorized.total > 0) {
      topics.push({
        id: 'uncategorized',
        name: '综合/待归类',
        total: uncategorized.total,
        correct: uncategorized.correct,
        wrong: uncategorized.wrong,
        accuracy: Math.round((uncategorized.correct / uncategorized.total) * 100),
        level: masteryLevel(uncategorized.total, uncategorized.correct),
        levelLabel: LEVEL_LABELS[masteryLevel(uncategorized.total, uncategorized.correct)],
      });
    }

    // 按掌握度排序（薄弱在前）。用 ?? 而非 ||：beginner 的序号是 0，|| 会误当成缺省。
    topics.sort((a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9));

    // 薄弱：有练习且正确率 < 60%，或有未解决错题（含仅出现在错题本的条目）
    const weakTopics = topics.filter(
      (t) => (t.total > 0 && t.accuracy !== null && t.accuracy < 60) || t.wrong > 0,
    ).slice(0, 5);

    // 复习建议（确定性，不依赖 AI）
    const suggestions = [];
    const unstarted = topics.filter(t => t.level === 'unstarted');
    const weak = topics.filter(t => t.level === 'beginner');
    const practicing = topics.filter(t => t.level === 'practicing');

    if (totalQuestions === 0) {
      suggestions.push('还没有练习记录，试试"离线题库"或"智能出题"开始第一套练习吧。');
    } else {
      if (weak.length > 0) {
        suggestions.push(`以下知识点正确率较低，建议重点复习：${weak.map(t => t.name).join('、')}。`);
      }
      if (practicing.length > 0) {
        suggestions.push(`以下知识点正在巩固中，继续练习可以提升：${practicing.slice(0, 3).map(t => t.name).join('、')}。`);
      }
      if (totalWrong > 0) {
        suggestions.push(`错题本中有 ${totalWrong} 道未解决的错题，建议定期回顾。`);
      }
      if (unstarted.length > 0 && unstarted.length <= 5) {
        suggestions.push(`还有 ${unstarted.length} 个知识点未涉及：${unstarted.map(t => t.name).join('、')}。`);
      }
      if (weak.length === 0 && practicing.length === 0 && totalWrong === 0) {
        suggestions.push('各知识点掌握情况良好，可以尝试更高难度的练习。');
      }
    }

    success(res, {
      summary: {
        totalQuestions,
        totalCorrect,
        totalWrong,
        accuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
      },
      topics,
      weakTopics,
      suggestions,
    });
  } catch (err) {
    console.error('mastery map error', err);
    error(res, err.message || '知识地图加载失败');
  }
});

module.exports = router;
