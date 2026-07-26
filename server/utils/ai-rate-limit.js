/**
 * AI 通用限流（generate / quiz / stoich / balance / reaction 等）
 * 1 小时窗口内合计上限，防局域网盗刷
 */

const { queryOne, run } = require('../db/sqlite');

const WINDOW_MS = 60 * 60 * 1000;
const MAX_CALLS = 120; // 每小时 120 次成功占位

function countInWindow(now = Date.now()) {
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
  // sql.js 的 last_insert_rowid() 在部分运行模式会返回 0；此处插入与读取之间
  // 没有异步边界，读取当前最大 id 可以稳定拿到本次预约。
  const idRow = queryOne('SELECT MAX(id) AS id FROM ai_global_calls');
  return { allowed: true, reservationId: idRow?.id ?? null };
}

function releaseGlobalAiCall(reservationId) {
  if (reservationId == null) return;
  try {
    run('DELETE FROM ai_global_calls WHERE id = ?', [reservationId]);
  } catch {
    /* ignore */
  }
}

module.exports = {
  MAX_CALLS,
  WINDOW_MS,
  reserveGlobalAiCall,
  releaseGlobalAiCall,
  countInWindow,
};
