/**
 * AI 通用限流（generate / quiz / stoich / balance / reaction 等）
 * 1 小时窗口内合计上限，防局域网盗刷
 */

const { queryOne, run, exec } = require('../db/sqlite');

const WINDOW_MS = 60 * 60 * 1000;
const MAX_CALLS = 120; // 每小时 120 次成功占位

function ensureTable() {
  try {
    exec(`CREATE TABLE IF NOT EXISTS ai_global_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL DEFAULT 'any',
      called_at INTEGER NOT NULL
    )`);
    exec(
      `CREATE INDEX IF NOT EXISTS idx_ai_global_calls_at ON ai_global_calls(called_at)`,
    );
  } catch {
    /* ignore */
  }
}

function countInWindow(now = Date.now()) {
  ensureTable();
  const since = now - WINDOW_MS;
  try {
    run(`DELETE FROM ai_global_calls WHERE called_at < ?`, [since - WINDOW_MS]);
  } catch {
    /* ignore */
  }
  const row = queryOne(
    `SELECT COUNT(*) AS c FROM ai_global_calls WHERE called_at >= ?`,
    [since],
  );
  return Number(row?.c || 0);
}

/**
 * @returns {{ allowed: boolean, message?: string }}
 */
function reserveGlobalAiCall(kind = 'any') {
  ensureTable();
  const now = Date.now();
  if (countInWindow(now) >= MAX_CALLS) {
    return {
      allowed: false,
      message: `AI 调用本小时次数已达上限（${MAX_CALLS} 次），请稍后再试`,
    };
  }
  run(`INSERT INTO ai_global_calls (kind, called_at) VALUES (?, ?)`, [
    String(kind || 'any').slice(0, 40),
    now,
  ]);
  return { allowed: true };
}

function releaseLastGlobalAiCall() {
  try {
    ensureTable();
    run(
      `DELETE FROM ai_global_calls WHERE id = (SELECT id FROM ai_global_calls ORDER BY id DESC LIMIT 1)`,
    );
  } catch {
    /* ignore */
  }
}

module.exports = {
  MAX_CALLS,
  WINDOW_MS,
  reserveGlobalAiCall,
  releaseLastGlobalAiCall,
  countInWindow,
};
