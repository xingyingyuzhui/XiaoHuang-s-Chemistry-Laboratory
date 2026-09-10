/**
 * AI 相关配置校验（防 apiBase 被改成外网盗 Key）
 *
 * DeepSeek 官方（2026-09）：推荐模型名 `deepseek-flash` = DeepSeek-V4.1-Flash
 * 旧名 deepseek-v4-flash / deepseek-v4-pro 仍可调用，但会路由到 Flash；此处统一规范化。
 * @see https://api-docs.deepseek.com/zh-cn/
 */

const DEFAULT_API_BASE = 'https://api.deepseek.com';

/** 设置里可选的模型（对外展示 / 白名单） */
const ALLOWED_MODELS = ['deepseek-flash'];

/** 默认：DeepSeek-V4.1-Flash */
const DEFAULT_MODEL = 'deepseek-flash';

/**
 * 历史模型名 → 当前正式名
 * （官方：旧 Flash / vision-exp 仍可用但已下线底层，请求由 V4.1-Flash 承接；
 *  Pro 亦计划路由到 Flash）
 */
const MODEL_ALIASES = {
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
  'deepseek-v4.1-flash': 'deepseek-flash',
  'deepseek-v4-pro': 'deepseek-flash',
};

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

/**
 * 规范化模型名：别名迁移 + 白名单；未知则回退默认
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeModel(raw) {
  let model = String(raw || DEFAULT_MODEL).trim();
  if (MODEL_ALIASES[model]) {
    model = MODEL_ALIASES[model];
  }
  return ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL;
}

module.exports = {
  DEFAULT_API_BASE,
  DEFAULT_MODEL,
  ALLOWED_MODELS,
  MODEL_ALIASES,
  ALLOWED_API_BASES,
  normalizeApiBase,
  normalizeModel,
};
