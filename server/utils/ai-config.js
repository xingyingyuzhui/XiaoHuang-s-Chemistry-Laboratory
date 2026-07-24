/**
 * AI 相关配置校验（防 apiBase 被改成外网盗 Key）
 */

const DEFAULT_API_BASE = 'https://api.deepseek.com';
const ALLOWED_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'];
const DEFAULT_MODEL = 'deepseek-v4-flash';

/** 允许的 API 根地址（规范化后精确匹配或前缀） */
const ALLOWED_API_BASES = [
  'https://api.deepseek.com',
  'https://api.deepseek.com/v1',
];

/**
 * 规范化并校验 apiBase；非法则回退默认
 * @param {unknown} raw
 * @returns {{ base: string, rejected: boolean }}
 */
function normalizeApiBase(raw) {
  let base = String(raw || '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) {
    return { base: DEFAULT_API_BASE, rejected: false };
  }
  // 仅 https
  if (!/^https:\/\//i.test(base)) {
    return { base: DEFAULT_API_BASE, rejected: true };
  }
  const lower = base.toLowerCase();
  const ok = ALLOWED_API_BASES.some(
    (a) => lower === a || lower.startsWith(`${a}/`),
  );
  if (!ok) {
    return { base: DEFAULT_API_BASE, rejected: true };
  }
  return { base, rejected: false };
}

function normalizeModel(raw) {
  const model = String(raw || DEFAULT_MODEL).trim();
  return ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL;
}

module.exports = {
  DEFAULT_API_BASE,
  DEFAULT_MODEL,
  ALLOWED_MODELS,
  ALLOWED_API_BASES,
  normalizeApiBase,
  normalizeModel,
};
