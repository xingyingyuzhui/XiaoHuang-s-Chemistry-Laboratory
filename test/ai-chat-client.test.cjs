const test = require('node:test');
const assert = require('node:assert/strict');

const {
  requestChatCompletion,
} = require('../server/services/ai/chat-client');

test('AI client aborts an unresponsive provider request with a timeout error', async () => {
  await assert.rejects(
    requestChatCompletion({
      apiKey: 'test-key',
      apiBase: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      system: 'system',
      user: 'user',
      timeoutMs: 5,
      fetchImpl(_url, options) {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      },
    }),
    (error) => error.status === 504 && /超时/.test(error.message),
  );
});

test('AI client returns content and turns provider errors into a safe gateway error', async () => {
  const success = await requestChatCompletion({
    apiKey: 'test-key',
    apiBase: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    system: 'system',
    user: 'user',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '  化学答案  ' } }] }),
    }),
  });
  assert.deepEqual(success, { content: '化学答案', model: 'deepseek-v4-flash' });

  await assert.rejects(
    requestChatCompletion({
      apiKey: 'test-key',
      apiBase: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      system: 'system',
      user: 'user',
      fetchImpl: async () => ({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ error: { message: 'provider limit' } }),
      }),
    }),
    (error) => error.status === 502 && /429/.test(error.message),
  );
});
