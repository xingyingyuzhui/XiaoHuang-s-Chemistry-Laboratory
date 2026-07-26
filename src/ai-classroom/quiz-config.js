import {
  GRADES,
  CHEM_TOPICS,
  DIFFICULTIES,
  REVEAL_MODES,
  topicsForGrades,
} from '../data/chem-topics.js';

/** 课堂出题配置的渲染与标签转换，不持有页面其它状态。 */
export function createQuizConfigController({
  select,
  escapeHtml,
  getConfig,
  setConfig,
}) {
  const update = (updater) => setConfig(updater(getConfig()));

  function renderGradeChips() {
    const box = select('#quizGrades');
    if (!box) return;
    const config = getConfig();
    box.innerHTML = GRADES.map(
      (grade) =>
        `<button type="button" class="quiz-chip${config.grades.includes(grade.id) ? ' is-on' : ''}" data-grade="${grade.id}">${grade.label}</button>`,
    ).join('');
    box.querySelectorAll('[data-grade]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = Number(button.dataset.grade);
        const current = getConfig();
        let grades = current.grades;
        if (grades.includes(id)) {
          if (grades.length === 1) return;
          grades = grades.filter((value) => value !== id);
        } else {
          grades = [...grades, id].sort();
        }
        const allowed = new Set(topicsForGrades(grades).map((topic) => topic.id));
        update(() => ({
          ...current,
          grades,
          topics: current.topics.filter((idValue) => allowed.has(idValue)),
        }));
        renderGradeChips();
        renderTopicChips();
      });
    });
  }

  function renderTopicChips() {
    const box = select('#quizTopics');
    if (!box) return;
    const config = getConfig();
    const topics = topicsForGrades(config.grades);
    if (!topics.length) {
      box.innerHTML = '<span class="quiz-status">请先选择年级</span>';
      return;
    }
    box.innerHTML = topics
      .map(
        (topic) =>
          `<button type="button" class="quiz-topic${config.topics.includes(topic.id) ? ' is-on' : ''}" data-topic="${topic.id}">${escapeHtml(topic.label)}</button>`,
      )
      .join('');
    box.querySelectorAll('[data-topic]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.topic;
        const current = getConfig();
        update(() => ({
          ...current,
          topics: current.topics.includes(id)
            ? current.topics.filter((value) => value !== id)
            : [...current.topics, id],
        }));
        renderTopicChips();
      });
    });
  }

  function renderDifficultyChips() {
    const box = select('#quizDifficulty');
    if (!box) return;
    const config = getConfig();
    box.innerHTML = DIFFICULTIES.map(
      (difficulty) =>
        `<button type="button" class="quiz-chip${config.difficulty === difficulty.id ? ' is-on' : ''}" data-diff="${difficulty.id}" title="${escapeHtml(difficulty.desc)}">${difficulty.label}</button>`,
    ).join('');
    box.querySelectorAll('[data-diff]').forEach((button) => {
      button.addEventListener('click', () => {
        update((current) => ({ ...current, difficulty: button.dataset.diff }));
        renderDifficultyChips();
      });
    });
  }

  function renderRevealChips() {
    const box = select('#quizReveal');
    if (!box) return;
    const config = getConfig();
    box.innerHTML = REVEAL_MODES.map(
      (mode) =>
        `<button type="button" class="quiz-chip${config.reveal === mode.id ? ' is-on' : ''}" data-reveal="${mode.id}">${mode.label}</button>`,
    ).join('');
    box.querySelectorAll('[data-reveal]').forEach((button) => {
      button.addEventListener('click', () => {
        update((current) => ({ ...current, reveal: button.dataset.reveal }));
        renderRevealChips();
      });
    });
  }

  function bindCount() {
    const range = select('#quizCount');
    const label = select('#quizCountLabel');
    if (!range || !label) return;
    range.value = String(getConfig().count);
    label.textContent = String(getConfig().count);
    range.addEventListener('input', () => {
      const count = Math.min(10, Math.max(1, Number(range.value) || 5));
      update((current) => ({ ...current, count }));
      label.textContent = String(count);
    });
  }

  return {
    renderGradeChips,
    renderTopicChips,
    renderDifficultyChips,
    renderRevealChips,
    bindCount,
    gradeLabels: () =>
      GRADES.filter((grade) => getConfig().grades.includes(grade.id)).map(
        (grade) => grade.label,
      ),
    topicLabels: () =>
      getConfig().topics.map(
        (id) => CHEM_TOPICS.find((topic) => topic.id === id)?.label || id,
      ),
    diffLabel: () =>
      DIFFICULTIES.find((item) => item.id === getConfig().difficulty)?.label ||
      getConfig().difficulty,
    defaultTopics: () => topicsForGrades(getConfig().grades).slice(0, 2).map((topic) => topic.id),
  };
}
