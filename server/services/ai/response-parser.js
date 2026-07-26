/** 仅做保守修复，避免全局替换破坏合法 JSON。 */
function fixJson(raw) {
  let fixed = String(raw || '').trim();
  fixed = fixed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return fixed.replace(/,\s*([\]}])/g, '$1');
}

/** 从模型文字中提取 JSON 对象或数组。 */
function parseModelJson(content) {
  let text = String(content || '').trim();
  try {
    return JSON.parse(text);
  } catch {
    /* continue */
  }
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    /* continue */
  }
  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return JSON.parse(fixJson(text.slice(objectStart, objectEnd + 1)));
  }
  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return JSON.parse(text.slice(arrayStart, arrayEnd + 1));
  }
  throw new Error('模型返回不是合法 JSON');
}

function normalizeQuizQuestions(raw, expectCount) {
  let list = raw;
  if (raw && Array.isArray(raw.questions)) list = raw.questions;
  if (!Array.isArray(list)) throw new Error('题目列表无效');

  const out = [];
  for (let index = 0; index < list.length; index += 1) {
    const question = list[index] || {};
    const stem = String(question.stem || question.question || '').trim();
    let options = question.options;
    if (!Array.isArray(options)) {
      options = [question.A, question.B, question.C, question.D].filter(
        (item) => item != null,
      );
    }
    options = options.map((item) => String(item ?? '').trim()).filter(Boolean);
    if (options.length > 4) options = options.slice(0, 4);
    while (options.length < 4) options.push(`选项${options.length + 1}`);

    let answer = question.answer;
    if (typeof answer === 'string') {
      const match = answer.trim().toUpperCase().match(/^[A-D]/);
      answer = match ? match[0].charCodeAt(0) - 65 : Number(answer);
    }
    answer = Number(answer);
    if (!Number.isInteger(answer) || answer < 0 || answer > 3 || !stem) {
      continue;
    }
    out.push({
      id: String(question.id || `q${index + 1}`),
      stem,
      options,
      answer,
      knowledge: String(question.knowledge || question.topic || '').trim(),
      hint: String(question.hint || '').trim(),
      explain: String(question.explain || question.explanation || '').trim(),
    });
  }

  if (!out.length) throw new Error('未生成有效题目');
  return expectCount > 0 && out.length > expectCount
    ? out.slice(0, expectCount)
    : out;
}

module.exports = {
  fixJson,
  parseModelJson,
  normalizeQuizQuestions,
};
