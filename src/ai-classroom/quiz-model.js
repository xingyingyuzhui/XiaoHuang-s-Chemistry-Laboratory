/**
 * 课堂出题 · 领域模型（无 DOM）
 * paper / 交卷 / 提示解析 fetch / 摘要 / Markdown 导出行
 */

export function isRateLimitedError(err) {
  return err?.status === 429 || err?.payload?.limited === true;
}

/**
 * @param {object} deps
 * @param {object} deps.aiApi
 * @param {object} deps.quizApi
 * @param {() => { grades: number[], difficulty: string, topics: string[], count: number, reveal: string }} deps.getConfig
 * @param {() => string[]} deps.getGradeLabels
 * @param {() => string[]} deps.getTopicLabels
 * @param {() => string} deps.getDiffLabel
 */
export function createQuizModel({
  aiApi,
  quizApi,
  getConfig,
  getGradeLabels,
  getTopicLabels,
  getDiffLabel,
}) {
  /** @type {Array<any>} */
  let paper = [];
  let submitted = false;
  /** 交卷请求进行中，防连点 */
  let submitting = false;
  let lastSessionId = null;
  /** 出题快照 id：交卷时交给服务端按标准答案判分 */
  let currentPaperId = null;
  let expandedResultIdx = null;

  function getPaper() {
    return paper;
  }

  function setPaper(next) {
    paper = next;
  }

  function getSubmitted() {
    return submitted;
  }

  function setSubmitted(value) {
    submitted = Boolean(value);
  }

  function isSubmitting() {
    return submitting;
  }

  function getCurrentPaperId() {
    return currentPaperId;
  }

  function getLastSessionId() {
    return lastSessionId;
  }

  function getExpandedResultIdx() {
    return expandedResultIdx;
  }

  function setExpandedResultIdx(value) {
    expandedResultIdx = value;
  }

  function resetSession() {
    submitted = false;
    submitting = false;
    paper = [];
    lastSessionId = null;
    expandedResultIdx = null;
  }

  function normalizeQuestions(list) {
    return list
      .map((q, i) => {
        const ans = Number(q.answer);
        if (!Number.isInteger(ans) || ans < 0 || ans > 3) return null;
        const options = (q.options || []).slice(0, 4);
        if (options.length < 4) return null;
        return {
          id: q.id || `q${i + 1}`,
          stem: q.stem,
          options,
          answer: ans,
          knowledge: q.knowledge || '',
          hint: q.hint || '',
          explain: q.explain || '',
          chosen: null,
          usedHint: false,
          usedExplain: false,
        };
      })
      .filter(Boolean);
  }

  /**
   * API 出题 + 规范化 paper。校验失败 / API 失败抛 Error。
   * @returns {Promise<{ paper: Array<any>, paperId: string|null }>}
   */
  async function generate() {
    const config = getConfig();
    if (!config.grades.length) {
      throw new Error('请至少选择一个年级');
    }
    if (!config.topics.length) {
      throw new Error('请至少选择一个章节/主题');
    }

    const data = await aiApi.quizGenerate({
      grades: getGradeLabels(),
      difficulty: config.difficulty,
      topics: getTopicLabels(),
      count: config.count,
    });

    const list = data?.questions || [];
    if (!list.length) throw new Error('未生成题目');

    const next = normalizeQuestions(list);
    if (!next.length) throw new Error('生成的题目无效，请重试');

    paper = next;
    currentPaperId = data?.paperId || null;
    submitted = false;
    submitting = false;
    lastSessionId = null;
    expandedResultIdx = null;

    return { paper, paperId: currentPaperId };
  }

  function scorePaper() {
    let correct = 0;
    let answered = 0;
    paper.forEach((q) => {
      if (q.chosen !== null) {
        answered += 1;
        if (q.chosen === q.answer) correct += 1;
      }
    });
    return { correct, answered, total: paper.length };
  }

  function buildSubmitPayload() {
    const config = getConfig();
    const items = paper.map((q, i) => ({
      id: q.id || `q${i + 1}`,
      stem: q.stem,
      options: q.options,
      answer: Number(q.answer),
      knowledge: q.knowledge,
      hint: q.hint,
      explain: q.explain,
      chosen: q.chosen === null || q.chosen === undefined ? null : Number(q.chosen),
      usedHint: Boolean(q.usedHint),
      usedExplain: Boolean(q.usedExplain),
    }));
    return {
      paperId: currentPaperId,
      grades: getGradeLabels(),
      difficulty: getDiffLabel(),
      topics: getTopicLabels(),
      reveal: config.reveal,
      items,
    };
  }

  /**
   * 交卷：计分 + 入库。调用方负责 UI。
   * @returns {Promise<{ correct: number, answered: number, total: number, saveOk: boolean, error?: Error }>}
   */
  async function submitSession() {
    if (!paper.length || submitting) {
      return { correct: 0, answered: 0, total: paper.length, saveOk: false, skipped: true };
    }
    submitting = true;
    submitted = true;
    expandedResultIdx = null;

    const { correct, answered, total } = scorePaper();
    let saveOk = false;
    let error;
    try {
      const saved = await quizApi.saveSession(buildSubmitPayload());
      lastSessionId = saved?.id || null;
      saveOk = true;
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      console.error('保存练习场次失败', err);
    } finally {
      submitting = false;
    }

    return { correct, answered, total, saveOk, error };
  }

  /**
   * 本场 AI 分析报告（含可选落库）。UI 文案由调用方写 DOM。
   * @returns {Promise<{ text: string }>}
   */
  async function summary() {
    const letters = ['A', 'B', 'C', 'D'];
    const results = paper.map((q) => ({
      answered: q.chosen !== null,
      correct: q.chosen !== null && q.chosen === q.answer,
      knowledge: q.knowledge,
      chosenLabel: q.chosen === null ? null : letters[q.chosen],
      answerLabel: letters[q.answer],
      usedHint: q.usedHint,
      usedExplain: q.usedExplain,
    }));

    const data = await aiApi.quizSummary({
      difficulty: getDiffLabel(),
      topics: getTopicLabels(),
      results,
    });
    const text = data?.text || '暂无报告内容';
    if (lastSessionId && data?.text) {
      quizApi.saveSummary(lastSessionId, data.text).catch(() => {});
    }
    return { text };
  }

  async function fetchHint(q, forceRemote = false) {
    if (!forceRemote && (q.hint || '').trim()) return q.hint.trim();
    const data = await aiApi.quizHint({
      stem: q.stem,
      options: q.options,
      knowledge: q.knowledge,
    });
    const text = (data?.text || '').trim();
    if (text) q.hint = text;
    return text || '先找出题干关键词，再联系对应概念，排除明显不合理的选项。';
  }

  async function fetchExplain(q, forceRemote = false) {
    if (!forceRemote && false) {
      /* always can use remote for regenerate */
    }
    const data = await aiApi.quizExplain({
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      knowledge: q.knowledge,
      explain: q.explain,
    });
    const text =
      (data?.text || '').trim() ||
      q.explain ||
      `正确答案是 ${String.fromCharCode(65 + q.answer)}。`;
    q.explain = text;
    return text;
  }

  /** Markdown 导出行（不含 Blob / 下载） */
  function buildExportMarkdownLines() {
    const lines = [
      '# 课堂练习导出',
      '',
      `导出时间：${new Date().toLocaleString()}`,
      `题量：${paper.length}`,
      '',
    ];
    paper.forEach((q, i) => {
      lines.push(`## ${i + 1}. ${q.stem || q.question || ''}`);
      (q.options || []).forEach((opt, j) => {
        const mark = String.fromCharCode(65 + j);
        lines.push(`- ${mark}. ${opt}`);
      });
      if (submitted || q.answer != null) {
        const ans = typeof q.answer === 'number' ? String.fromCharCode(65 + q.answer) : q.answer;
        lines.push(`- **答案**：${ans ?? ''}`);
      }
      if (q.explain) lines.push(`- **解析**：${q.explain}`);
      lines.push('');
    });
    return lines;
  }

  return {
    getPaper,
    setPaper,
    getSubmitted,
    setSubmitted,
    isSubmitting,
    getCurrentPaperId,
    getLastSessionId,
    getExpandedResultIdx,
    setExpandedResultIdx,
    resetSession,
    generate,
    scorePaper,
    buildSubmitPayload,
    submitSession,
    summary,
    fetchHint,
    fetchExplain,
    isRateLimitedError,
    buildExportMarkdownLines,
  };
}
