/**
 * 化学小知识：本地库积累 + 1h 内 AI 调用次数限制
 * 不向客户端暴露剩余次数
 */

const { query, queryOne, run } = require('../db/sqlite');

const WINDOW_MS = 60 * 60 * 1000; // 1 小时
const MAX_AI_CALLS_PER_WINDOW = 20;
const MAX_STORED_TIPS = 200;

const SEED_TIPS = [
  '可乐能除水垢，是因为其中的磷酸能与碳酸钙反应，把壶底的水垢慢慢溶解掉。',
  '不锈钢不易生锈，主要靠表面一层极薄的铬氧化物膜，把铁和空气、水隔开。',
  '切完洋葱爱流泪，是因为洋葱破损后释放的含硫气体刺激了眼睛。',
  '加碘盐里的碘多是碘酸钾；受潮、暴晒会损失，所以盐罐最好密封避光。',
  '铅笔芯其实是石墨和黏土，并不是铅；石墨质软、能留下痕迹才好写字。',
  '胃药里常见的小苏打是碳酸氢钠，能和过多的胃酸中和，暂时缓解不适。',
  '钻石和铅笔芯的主要成分都是碳，只是原子排列方式不同，性质天差地别。',
  '肥皂能去油，是因为一端亲水、一端亲油，把油污包裹成小液滴冲走。',
  '铁锈主要是含水氧化铁；铁在潮湿空气中更易锈，所以要保持干燥或涂层保护。',
  '柠檬能让茶水变浅，是因为酸性会改变茶中色素分子的颜色表现。',
];

let seeded = false;

function ensureTablesAndSeed() {
  // init.sql 已建表；这里幂等补种子
  if (seeded) return;
  try {
    run(
      `CREATE TABLE IF NOT EXISTS chem_tips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL DEFAULT 'seed',
        created_at INTEGER NOT NULL
      )`,
    );
    run(
      `CREATE TABLE IF NOT EXISTS ai_tip_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        called_at INTEGER NOT NULL
      )`,
    );
  } catch {
    /* ignore */
  }

  const now = Date.now();
  for (const content of SEED_TIPS) {
    try {
      run(
        `INSERT OR IGNORE INTO chem_tips (content, source, created_at) VALUES (?, 'seed', ?)`,
        [content, now],
      );
    } catch {
      /* ignore */
    }
  }
  seeded = true;
}

/**
 * 过去 1 小时内成功调模型次数
 */
function countAiCallsInWindow(now = Date.now()) {
  ensureTablesAndSeed();
  const since = now - WINDOW_MS;
  // 顺便清理更早的记录
  try {
    run(`DELETE FROM ai_tip_calls WHERE called_at < ?`, [since - WINDOW_MS]);
  } catch {
    /* ignore */
  }
  const row = queryOne(
    `SELECT COUNT(*) AS c FROM ai_tip_calls WHERE called_at >= ?`,
    [since],
  );
  return Number(row?.c || 0);
}

/**
 * 是否允许再调模型（不返回剩余次数）
 */
function canCallModel(now = Date.now()) {
  return countAiCallsInWindow(now) < MAX_AI_CALLS_PER_WINDOW;
}

/**
 * 记录一次成功的模型调用
 */
function recordAiCall(now = Date.now()) {
  ensureTablesAndSeed();
  run(`INSERT INTO ai_tip_calls (called_at) VALUES (?)`, [now]);
}

/**
 * 规范化 tip 文本
 */
function normalizeTip(raw) {
  let tip = String(raw || '')
    .replace(/^["'「『]|["'」』]$/g, '')
    .replace(/^\d+[\.、．]\s*/, '')
    .trim();

  if (!tip || tip.length < 6) return '';

  if (tip.length > 120) {
    const cut = tip.slice(0, 120);
    const lastStop = Math.max(
      cut.lastIndexOf('。'),
      cut.lastIndexOf('！'),
      cut.lastIndexOf('？'),
    );
    tip = lastStop > 20 ? cut.slice(0, lastStop + 1) : `${cut}…`;
  }
  return tip;
}

/**
 * 模型成功返回后写入本地库（去重）；超上限时删最旧的 AI 条
 */
function saveAiTip(content) {
  ensureTablesAndSeed();
  const tip = normalizeTip(content);
  if (!tip) return null;

  const now = Date.now();
  try {
    run(
      `INSERT OR IGNORE INTO chem_tips (content, source, created_at) VALUES (?, 'ai', ?)`,
      [tip, now],
    );
  } catch (e) {
    console.warn('保存 AI 小知识失败', e);
  }

  // 控制总量：优先删最旧的 ai 来源
  try {
    const total = queryOne(`SELECT COUNT(*) AS c FROM chem_tips`);
    let overflow = Number(total?.c || 0) - MAX_STORED_TIPS;
    while (overflow > 0) {
      const old = queryOne(
        `SELECT id FROM chem_tips WHERE source = 'ai' ORDER BY created_at ASC LIMIT 1`,
      );
      if (!old) break;
      run(`DELETE FROM chem_tips WHERE id = ?`, [old.id]);
      overflow -= 1;
    }
  } catch {
    /* ignore */
  }

  return tip;
}

/**
 * 从本地库随机取一条
 */
function pickLocalTip(exclude = '') {
  ensureTablesAndSeed();
  const rows = query(`SELECT content FROM chem_tips`);
  let list = rows.map((r) => r.content).filter(Boolean);
  if (!list.length) list = [...SEED_TIPS];

  if (exclude && list.length > 1) {
    const filtered = list.filter((t) => t !== exclude);
    if (filtered.length) list = filtered;
  }

  const i = Math.floor(Math.random() * list.length);
  return list[i];
}

module.exports = {
  WINDOW_MS,
  MAX_AI_CALLS_PER_WINDOW,
  ensureTablesAndSeed,
  canCallModel,
  recordAiCall,
  normalizeTip,
  saveAiTip,
  pickLocalTip,
  countAiCallsInWindow,
};
