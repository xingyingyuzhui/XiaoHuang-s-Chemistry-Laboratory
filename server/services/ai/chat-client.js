const DEFAULT_TIMEOUT_MS = 30_000;

function providerError(status, detail, fallback) {
  const short = String(detail || '').trim().slice(0, 200);
  const error = new Error(
    `DeepSeek 请求失败（${status}）：${short || fallback || '服务暂不可用'}`,
  );
  error.status = 502;
  return error;
}

async function readFailureDetail(response) {
  try {
    const body = await response.json();
    return body?.error?.message || JSON.stringify(body);
  } catch {
    try {
      return await response.text();
    } catch {
      return response.statusText;
    }
  }
}

/**
 * 调用 OpenAI-compatible Chat Completions 接口。
 * 保持此模块与 Express、数据库和限流解耦，便于为超时及供应商错误做回归测试。
 */
async function requestChatCompletion({
  apiKey,
  apiBase,
  model,
  system,
  user,
  temperature = 0.8,
  max_tokens = 256,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== 'function') {
    const error = new Error('当前运行环境不支持网络请求');
    error.status = 500;
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens,
        thinking: { type: 'disabled' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw providerError(
        response.status,
        await readFailureDetail(response),
        response.statusText,
      );
    }

    const body = await response.json();
    const content =
      body?.choices?.[0]?.message?.content ||
      body?.choices?.[0]?.message?.reasoning_content ||
      '';
    return { content: String(content).trim(), model };
  } catch (cause) {
    if (controller.signal.aborted || cause?.name === 'AbortError') {
      const error = new Error('AI 服务响应超时，请稍后重试');
      error.status = 504;
      throw error;
    }
    if (cause?.status) throw cause;
    const error = new Error('AI 服务连接失败，请检查网络后重试');
    error.status = 502;
    error.cause = cause;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  requestChatCompletion,
};
