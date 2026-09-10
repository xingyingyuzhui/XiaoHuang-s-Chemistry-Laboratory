/**
 * DeepSeek 模型名规范化（V4.1 Flash / deepseek-flash）
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_MODEL,
  ALLOWED_MODELS,
  normalizeModel,
} = require('../server/utils/ai-config');

test('default model is deepseek-flash (V4.1 Flash)', () => {
  assert.equal(DEFAULT_MODEL, 'deepseek-flash');
  assert.deepEqual(ALLOWED_MODELS, ['deepseek-flash']);
});

test('normalizeModel keeps deepseek-flash', () => {
  assert.equal(normalizeModel('deepseek-flash'), 'deepseek-flash');
});

test('normalizeModel migrates legacy V4 names to deepseek-flash', () => {
  assert.equal(normalizeModel('deepseek-v4-flash'), 'deepseek-flash');
  assert.equal(normalizeModel('deepseek-v4-pro'), 'deepseek-flash');
  assert.equal(normalizeModel('deepseek-v4-flash-vision-exp'), 'deepseek-flash');
  assert.equal(normalizeModel('deepseek-v4.1-flash'), 'deepseek-flash');
});

test('normalizeModel falls back for unknown models', () => {
  assert.equal(normalizeModel('gpt-4o'), 'deepseek-flash');
  assert.equal(normalizeModel(''), 'deepseek-flash');
  assert.equal(normalizeModel(null), 'deepseek-flash');
});
