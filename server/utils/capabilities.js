/**
 * AI / 关键 API 能力注册表（build-manifest 与 runtime 探测共用）
 */

const CAPABILITY_ROUTE_SPECS = {
  aiGenerate: { method: 'POST', path: '/api/ai/generate' },
  aiReaction: { method: 'POST', path: '/api/ai/reaction' },
  aiQuiz: { method: 'POST', path: '/api/ai/quiz/generate' },
  aiBalance: { method: 'POST', path: '/api/ai/balance' },
  aiStoich: { method: 'POST', path: '/api/ai/stoich' },
  aiLab: { method: 'POST', path: '/api/ai/lab' },
  aiTip: { method: 'POST', path: '/api/ai/tip' },
};

const CAPABILITY_KEYS = Object.keys(CAPABILITY_ROUTE_SPECS);

function getDefaultCapabilities() {
  return Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, true]));
}

module.exports = {
  CAPABILITY_ROUTE_SPECS,
  CAPABILITY_KEYS,
  getDefaultCapabilities,
};
