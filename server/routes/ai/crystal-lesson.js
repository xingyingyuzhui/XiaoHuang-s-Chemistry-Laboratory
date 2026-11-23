'use strict';

/**
 * 晶体探究 · AI 参数化排课路由：POST /api/ai/crystal-lesson
 * 由 DeepSeek 生成符合 ChemStageJSON / LessonPlanJSON 规范的互动课例，并经严格白名单校验与清洗。
 */

const express = require('express');
const router = express.Router();
const { success, error, badRequest } = require('../../utils/response');
const { callDeepSeekChat } = require('../../services/ai/chat-service');
const { parseModelJson } = require('../../services/ai/response-parser');
const {
  STAGE_TYPES, COMPARE_KINDS, BOND_TYPES, PARTICLE_MODES, THERMAL_VIEWS, CELL_CRYSTAL_IDS,
  DEFAULT_FALLBACK_SLIDES, clean, validateChemStage, normalizeLessonPlan,
} = require('../../utils/chem-stage-schema');

function clampCount(val, fallback = 4) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.min(6, Math.max(2, Math.round(n))) : fallback;
}

function mapAiError(res, err, fallback) {
  const status = err?.status || 502;
  if (status === 400) return badRequest(res, err.message || '请求参数或 AI 配置无效');
  if (status === 429) return error(res, err.message || 'AI 请求过于频繁，请稍后再试', 429);
  return error(res, err?.message || fallback, status >= 400 ? status : 502);
}

/** 校验单张 AI 舞台是否满足严格核心枚举白名单；轻微缺字段交由 validateChemStage 安全补全 */
function sanitizeAiStage(rawStage) {
  if (!rawStage || typeof rawStage !== 'object') return null;
  const type = String(rawStage.type || '').trim();
  if (!STAGE_TYPES.includes(type)) return null;

  if (type === 'dual-3d-compare') {
    const lk = String(rawStage.left?.kind || '').trim();
    const rk = String(rawStage.right?.kind || '').trim();
    if (!COMPARE_KINDS.includes(lk) || !COMPARE_KINDS.includes(rk)) return null;
  } else if (type === 'lattice-stress') {
    const lb = String(rawStage.left?.bondType || '').trim();
    const rb = String(rawStage.right?.bondType || '').trim();
    if (!BOND_TYPES.includes(lb) || !BOND_TYPES.includes(rb)) return null;
  } else if (type === 'particle-field') {
    if (!PARTICLE_MODES.includes(String(rawStage.mode || '').trim())) return null;
  } else if (type === 'thermal-phase') {
    if (rawStage.view != null && !THERMAL_VIEWS.includes(String(rawStage.view).trim())) return null;
  } else if (type === 'cell-extract') {
    if (rawStage.crystalId != null && !CELL_CRYSTAL_IDS.includes(String(rawStage.crystalId).trim())) return null;
  }

  return validateChemStage(rawStage);
}

function normalizeCrystalLesson(raw, opts = {}) {
  if (!raw || typeof raw !== 'object') throw new Error('AI 课例返回数据无效');
  const targetCount = clampCount(opts.targetCount, 4);
  const fallbackTopic = clean(opts.fallbackTopic, 48);
  const title = clean(raw.title, 60) || (fallbackTopic ? `AI 课例 · ${fallbackTopic}` : 'AI 晶体探究课例');
  const subtitle = clean(raw.subtitle || raw.summary, 160);
  const rawSlides = Array.isArray(raw.slides) ? raw.slides : (Array.isArray(raw.steps) ? raw.steps : []);

  const seenKeys = new Set();
  const kept = [];
  for (const item of rawSlides) {
    if (kept.length >= 6) break;
    if (!item || typeof item !== 'object') continue;
    const stageIn = item.stage && typeof item.stage === 'object' ? item.stage : item;
    const stage = sanitizeAiStage(stageIn);
    if (!stage) continue;
    const key = JSON.stringify(stage);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    kept.push({
      id: clean(item.id, 40) || `slide-${kept.length + 1}`,
      title: clean(item.title, 48),
      cue: clean(item.cue || item.teacherNote || item.summary, 240),
      stage,
      qa: item.qa,
      quickQuestions: item.quickQuestions,
    });
  }

  let usedFallback = false;
  if (kept.length < 2) {
    usedFallback = true;
    const desired = Math.max(2, Math.min(targetCount, 4));
    for (const fb of DEFAULT_FALLBACK_SLIDES) {
      if (kept.length >= desired) break;
      const key = JSON.stringify(fb.stage);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      kept.push({ id: `slide-${kept.length + 1}`, title: fb.title, cue: fb.cue, stage: fb.stage });
    }
  }

  const plan = normalizeLessonPlan(
    { id: clean(raw.id, 48) || `ai-lesson-${Date.now().toString(36)}`, title, subtitle, isAi: true, slides: kept },
    { fallbackTopic, isAi: true },
  );
  return { ...plan, usedFallback };
}

function buildSystemPrompt(stepCount) {
  return `你是「小黄的化学实验室」高中化学教研员，请围绕教师课题设计 ${stepCount} 个互动教学环节，只输出合法 JSON 对象（严禁 Markdown 代码块）。

每个环节的 stage 必须且只能是以下 5 种参数化 ChemStageJSON 之一：
1) dual-3d-compare（双标本 3D 对比）：
   {"type":"dual-3d-compare","left":{"label":"名称","sublabel":"结构特征","kind":"quartz|glass|diamond|graphite|dryice|sio2|nacl|cscl"},"right":{...},"defaultMode":"macro|micro"}
2) lattice-stress（3D 晶格剪切受力对比）：
   {"type":"lattice-stress","left":{"label":"名称","sublabel":"力学特征","bondType":"metallic|ionic|covalent","colorA":"#e0824a","colorB":"#f5c07a"},"right":{...}}
3) particle-field（3D 粒子场机制）：
   {"type":"particle-field","mode":"crystal-growth|conductivity|hbond-collapse","label":"标题","substance":"化学式"}
4) thermal-phase（热成像相变赛或熔化曲线）：
   {"type":"thermal-phase","view":"race|curve","substances":[{"formula":"NaCl","name":"氯化钠","category":"molecular|metallic|ionic|covalent","mpC":801}],"tempRange":[minC,maxC]}
   说明：view="race" 时按教师点名的物质定制 2~16 种真实相变温度（mpC 范围 -270..4000；常压下直接升华的物质如干冰 CO₂ 于 -78.5℃ 升华，请附 "subl":true 并在思考题中写明升华点而非熔点）；view="curve" 时给 2 种物质（晶体 vs 非晶体）。
5) cell-extract（3D 晶胞提取并置）：
   {"type":"cell-extract","crystalId":"cu|nacl|fe|diamond","label":"标题"}

示例：若教师要求「对比金刚石和石墨，再对比 NaCl、KCl、MgO、SiO₂ 熔点」，应输出：
- 环节 1：dual-3d-compare（left.kind="diamond", right.kind="graphite", defaultMode="micro"）
- 环节 2：thermal-phase（view="race", substances 包含 NaCl 801℃、KCl 770℃、MgO 2852℃、SiO₂ 1713℃）

严格按以下 LessonPlanJSON 输出：
{"title":"课例标题","subtitle":"一句话教学目标","slides":[{"title":"环节标题","cue":"教师操作提词与停顿提问","stage":{...},"qa":{"question":"核心思考题","answer":"简明解析"},"quickQuestions":["追问1","追问2"]}]}`;
}

router.post('/crystal-lesson', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const topic = clean(body.topic, 160);
    if (!topic) return badRequest(res, '请填写本节课的主题或教学重点');

    const stepCount = clampCount(body.stepCount, 4);
    let content;
    try {
      const chat = await callDeepSeekChat({
        system: buildSystemPrompt(stepCount),
        user: `请围绕以下主题编排 ${stepCount} 个参数化晶体探究舞台：\n${topic}`,
        temperature: 0.45,
        max_tokens: 2200,
        kind: 'crystal-lesson',
      });
      content = chat.content;
    } catch (err) {
      return mapAiError(res, err, 'DeepSeek 一键排课失败');
    }

    let parsed;
    try {
      parsed = parseModelJson(content);
    } catch {
      return error(res, '模型返回课例格式异常，请重试', 502);
    }

    try {
      return success(res, normalizeCrystalLesson(parsed, { fallbackTopic: topic, targetCount: stepCount }));
    } catch (ve) {
      return error(res, ve.message || '生成的课例内容无效', 502);
    }
  } catch (err) {
    console.error('AI 晶体排课失败:', err);
    return error(res, err.message || 'AI 晶体排课失败', 502);
  }
});

router.normalizeCrystalLesson = normalizeCrystalLesson;
router.STAGE_TYPES = STAGE_TYPES;

module.exports = router;
