function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseJsonSafe(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

/** 选项下标：保留 0，区分未作答 */
function parseChosen(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseAnswer(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function domainError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = {
  uid,
  parseJsonSafe,
  parseChosen,
  parseAnswer,
  domainError,
};
