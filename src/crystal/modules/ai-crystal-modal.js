/**
 * 模块 02 · 「+ AI 生成晶胞」弹窗
 * 支持 3 个一键预设或自定义化学式/高考题干，调用 aiApi.generateCrystal 生成 3D 晶胞。
 */

import { aiApi } from '../../api/client.js';

export const CUSTOM_CRYSTALS_KEY = 'chem-lab-custom-crystals';

export function loadCustomCrystals(validCats) {
  try {
    const parsed = JSON.parse(window.localStorage?.getItem(CUSTOM_CRYSTALS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && c.id && Array.isArray(c.atoms) && c.atoms.length > 0)
      .map((c) => ({ ...c, isCustom: true, category: validCats?.has(c.category) ? c.category : 'mixed' }));
  } catch {
    return [];
  }
}

export function saveCustomCrystals(list) {
  try {
    window.localStorage?.setItem(CUSTOM_CRYSTALS_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('[crystal] save custom crystals failed:', err);
  }
}

const PRESETS = [
  {
    label: '钙钛矿 CaTiO₃',
    prompt: '钙钛矿 CaTiO3 立方晶胞',
  },
  {
    label: '铜金合金 Cu₃Au',
    prompt: '铜金合金 Cu3Au 立方晶胞',
  },
  {
    label: '高考陌生晶胞：顶点A、面心B、体心C，a=420pm',
    prompt: '高考陌生晶胞：某立方晶胞顶点为A、面心为B、体心为C，棱长 a=420pm',
  },
];

function isMissingKeyError(err) {
  const msg = String(err?.message || '');
  return /key|密钥|未配置|api\s*key/i.test(msg);
}

/**
 * 创建 AI 生成晶胞弹窗控制器
 * @param {{ onCreated?: (crystal: object) => void }} [opts]
 */
export function createAiCrystalModal({ onCreated } = {}) {
  const modalEl = document.createElement('div');
  modalEl.className = 'crystal-ai-modal';
  modalEl.hidden = true;
  modalEl.innerHTML = `
    <div class="crystal-ai-backdrop" data-modal-close></div>
    <div class="crystal-ai-dialog" role="dialog" aria-modal="true" aria-labelledby="crystal-ai-modal-title">
      <div class="crystal-ai-dialog-head">
        <div>
          <h3 id="crystal-ai-modal-title" class="crystal-ai-dialog-title">AI 生成 3D 晶胞</h3>
          <p class="crystal-ai-dialog-sub">输入化学式、合金结构或高考题干，自动构建可切开、可拼接的 3D 晶胞并本地校验均摊数与密度。</p>
        </div>
        <button type="button" class="crystal-inspector-close" data-modal-close aria-label="关闭弹窗">×</button>
      </div>

      <div class="crystal-ai-presets-wrap">
        <span class="crystal-ai-presets-label">一键示例</span>
        <div class="crystal-ai-presets">
          ${PRESETS.map(
            (p, idx) => `<button type="button" class="crystal-ai-preset" data-preset="${idx}">${p.label}</button>`,
          ).join('')}
        </div>
      </div>

      <form class="crystal-ai-modal-form">
        <label class="crystal-ai-field-label" for="crystal-ai-prompt">晶胞描述或化学式</label>
        <textarea
          id="crystal-ai-prompt"
          class="crystal-ai-textarea"
          rows="3"
          placeholder="例如：立方晶胞顶点为A、面心为B、体心为C，棱长420pm；或直接输入 CaTiO3、AlN、FeS2"
        ></textarea>
        <div class="crystal-ai-feedback" aria-live="polite" hidden></div>
        <div class="crystal-ai-dialog-foot">
          <button type="button" class="crystal-btn crystal-btn-ghost" data-modal-close>取消</button>
          <button type="submit" class="crystal-btn crystal-btn-primary" data-submit>生成 3D 晶胞</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modalEl);

  const formEl = modalEl.querySelector('.crystal-ai-modal-form');
  const textareaEl = modalEl.querySelector('#crystal-ai-prompt');
  const feedbackEl = modalEl.querySelector('.crystal-ai-feedback');
  const submitBtn = modalEl.querySelector('[data-submit]');
  const presetBtns = modalEl.querySelectorAll('.crystal-ai-preset');
  const closeEls = modalEl.querySelectorAll('[data-modal-close]');

  let isOpen = false;
  let busy = false;
  let reqSeq = 0;

  function setFeedback(type, text, showKeyTip = false) {
    if (!text) {
      feedbackEl.hidden = true;
      feedbackEl.className = 'crystal-ai-feedback';
      feedbackEl.innerHTML = '';
      return;
    }
    feedbackEl.hidden = false;
    feedbackEl.className = `crystal-ai-feedback is-${type}`;
    feedbackEl.textContent = text;
    if (showKeyTip) {
      const tip = document.createElement('span');
      tip.className = 'crystal-ai-feedback-tip';
      tip.textContent = '请在页面右上角「设置」中配置 DeepSeek API Key 后重试。';
      feedbackEl.appendChild(tip);
    }
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    textareaEl.disabled = busy;
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? '生成校验中…' : '生成 3D 晶胞';
    presetBtns.forEach((b) => { b.disabled = busy; });
  }

  function open() {
    isOpen = true;
    modalEl.hidden = false;
    setFeedback('', '');
    requestAnimationFrame(() => textareaEl.focus());
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    reqSeq += 1;
    setBusy(false);
    setFeedback('', '');
    modalEl.hidden = true;
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    if (busy) return;
    const prompt = textareaEl.value.trim();
    if (!prompt) {
      setFeedback('error', '请先输入晶胞化学式或题干描述，或点击上方示例。');
      textareaEl.focus();
      return;
    }

    setBusy(true);
    setFeedback('loading', '正在调用 AI 构建晶胞并本地校验周期展开、均摊数与密度…');
    const seq = ++reqSeq;

    try {
      const res = await aiApi.generateCrystal(prompt);
      if (seq !== reqSeq) return;
      const crystal = res?.data && !res?.atoms ? res.data : res;
      if (!crystal || !Array.isArray(crystal.atoms) || !crystal.atoms.length) {
        throw new Error('返回的晶胞数据不完整，请尝试补充晶系与原子占位信息。');
      }
      setBusy(false);
      close();
      onCreated?.(crystal);
    } catch (err) {
      if (seq !== reqSeq) return;
      setBusy(false);
      setFeedback('error', err?.message || '晶胞生成失败，请稍后重试。', isMissingKeyError(err));
    }
  }

  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = PRESETS[Number(btn.dataset.preset)];
      if (!item || busy) return;
      textareaEl.value = item.prompt;
      setFeedback('', '');
      textareaEl.focus();
    });
  });

  closeEls.forEach((el) => el.addEventListener('click', close));
  formEl.addEventListener('submit', handleSubmit);

  textareaEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSubmit(e);
    }
  });

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && isOpen) {
      e.stopPropagation();
      close();
    }
  };
  window.addEventListener('keydown', onKeyDown, true);

  return {
    open,
    close,
    destroy() {
      reqSeq += 1;
      window.removeEventListener('keydown', onKeyDown, true);
      modalEl.remove();
    },
  };
}
