const { queryOne } = require('../../db/sqlite');
const { normalizeApiBase, normalizeModel } = require('../../utils/ai-config');
const {
  reserveGlobalAiCall,
  releaseGlobalAiCall,
} = require('../../utils/ai-rate-limit');
const { requestChatCompletion } = require('./chat-client');

/** 读取本地设置、预约全局额度并调用模型。 */
async function callDeepSeekChat({
  system,
  user,
  temperature = 0.8,
  max_tokens = 256,
  kind = 'chat',
  skipGlobalLimit = false,
}) {
  let reservationId = null;
  if (!skipGlobalLimit) {
    const limit = reserveGlobalAiCall(kind);
    if (!limit.allowed) {
      const error = new Error(limit.message || 'AI 调用过于频繁');
      error.status = 429;
      throw error;
    }
    reservationId = limit.reservationId;
  }
  try {
    const row = queryOne("SELECT value FROM settings WHERE key = 'ai'");
    let settings = {};
    try {
      settings = row ? JSON.parse(row.value) : {};
    } catch {
      /* 保持默认设置并在下方给出缺少 Key 的提示 */
    }
    if (!settings.apiKey) {
      const error = new Error('请先在设置 → AI 中填写 DeepSeek API Key');
      error.status = 400;
      throw error;
    }
    const { base: apiBase } = normalizeApiBase(settings.apiBase);
    return await requestChatCompletion({
      apiKey: settings.apiKey,
      apiBase,
      model: normalizeModel(settings.model),
      system,
      user,
      temperature,
      max_tokens,
    });
  } catch (error) {
    releaseGlobalAiCall(reservationId);
    throw error;
  }
}

module.exports = { callDeepSeekChat };
