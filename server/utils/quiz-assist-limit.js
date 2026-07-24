/**
 * AI 提示 / AI 解答：各自 1 小时内最多 10 次
 * reserve：先占位再调模型，失败可 release，降低并发超限
 */

const { queryOne, run, exec } = require('../db/sqlite');

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_KIND = 20;
const KINDS = new Set(['hint', 'explain']);

function ensureTable() {
  try {
    exec(`CREATE TABLE IF NOT EXISTS ai_quiz_assist_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      called_at INTEGER NOT NULL
    )`);
    exec(
      `CREATE INDEX IF NOT EXISTS idx_ai_quiz_assist_kind_at
       ON ai_quiz_assist_calls(kind, called_at)`,
    );
  } catch {
    /* ignore */
  }
}

function formatResetRemaining(ms) {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) {
    return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分钟`;
  }
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h} 小时 ${rm} 分` : `${h} 小时`;
}

function deniedPayload(kind, used, since, now) {
  const oldest = queryOne(
    `SELECT MIN(called_at) AS t FROM ai_quiz_assist_calls WHERE kind = ? AND called_at >= ?`,
    [kind, since],
  );
  const oldestAt = Number(oldest?.t || since);
  const resetInMs = Math.max(0, oldestAt + WINDOW_MS - now);
  const resetLabel = formatResetRemaining(resetInMs);
  const label = kind === 'hint' ? 'AI 提示' : 'AI 解答';
  return {
    allowed: false,
    used,
    limit: MAX_PER_KIND,
    resetInMs,
    resetLabel,
    message: `${label}本小时次数已用完（${MAX_PER_KIND} 次），约 ${resetLabel} 后重置`,
  };
}

/**
 * 原子占位：通过则插入一条 called_at，返回 reservationId
 * @param {'hint'|'explain'} kind
 */
function reserveCall(kind) {
  ensureTable();
  if (!KINDS.has(kind)) {
    return { allowed: true, reservationId: null };
  }
  const now = Date.now();
  const since = now - WINDOW_MS;

  try {
    exec(`DELETE FROM ai_quiz_assist_calls WHERE called_at < ?`, [since - WINDOW_MS]);
  } catch {
    /* ignore */
  }

  const row = queryOne(
    `SELECT COUNT(*) AS c FROM ai_quiz_assist_calls WHERE kind = ? AND called_at >= ?`,
    [kind, since],
  );
  const used = Number(row?.c || 0);
  if (used >= MAX_PER_KIND) {
    return deniedPayload(kind, used, since, now);
  }

  // 占位（先记次，失败再删）
  run(`INSERT INTO ai_quiz_assist_calls (kind, called_at) VALUES (?, ?)`, [kind, now]);
  const idRow = queryOne(`SELECT last_insert_rowid() AS id`);
  const reservationId = idRow?.id ?? null;

  return {
    allowed: true,
    used: used + 1,
    limit: MAX_PER_KIND,
    reservationId,
  };
}

/**
 * 模型调用失败时释放占位
 */
function releaseCall(reservationId) {
  if (reservationId == null) return;
  try {
    run(`DELETE FROM ai_quiz_assist_calls WHERE id = ?`, [reservationId]);
  } catch (e) {
    console.warn('releaseCall failed', e.message);
  }
}

/** @deprecated 兼容旧调用：等同成功后的 no-op（已在 reserve 时记次） */
function recordCall() {
  /* reserved already */
}

function checkLimit(kind) {
  ensureTable();
  if (!KINDS.has(kind)) return { allowed: true };
  const now = Date.now();
  const since = now - WINDOW_MS;
  const row = queryOne(
    `SELECT COUNT(*) AS c FROM ai_quiz_assist_calls WHERE kind = ? AND called_at >= ?`,
    [kind, since],
  );
  const used = Number(row?.c || 0);
  if (used < MAX_PER_KIND) return { allowed: true, used, limit: MAX_PER_KIND };
  return deniedPayload(kind, used, since, now);
}

module.exports = {
  WINDOW_MS,
  MAX_PER_KIND,
  checkLimit,
  reserveCall,
  releaseCall,
  recordCall,
  formatResetRemaining,
};
