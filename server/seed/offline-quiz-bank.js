/**
 * 离线基础练习库 — 高考化学选择题（只读）
 *
 * 单一数据源：server/seed/offline-quiz-bank.json
 * 数据来源：AGIEval v1.1 (https://github.com/ruixiangcui/AGIEval)
 * 数据集：gaokao-chemistry  文件：data/v1_1/gaokao-chemistry.jsonl
 *
 * ⚠ 数据中的 stem / options 为 AGIEval 原始数据的逐字副本，未经任何改写、清洗或补全。
 *   options 数组每项保留原始前缀（如 "(A)…"），UI 渲染层通过数组下标 0/1/2/3 显示选项标记。
 *   含 \begin{tabular} 的题干已转为 HTML <table>，LaTeX 数学公式由 chem-text.js 渲染。
 *
 * sourceQuestionId 格式：agieval-gaochem-line-<JSONL行号>
 */
'use strict';

const OFFLINE_QUESTIONS = require('./offline-quiz-bank.json');
const OFFLINE_QUIZ_VERSION = '3.0.0';
const OFFLINE_QUIZ_BANK_SIZE = OFFLINE_QUESTIONS.length;

module.exports = {
  OFFLINE_QUIZ_VERSION,
  OFFLINE_QUIZ_BANK_SIZE,
  OFFLINE_QUESTIONS,
};
