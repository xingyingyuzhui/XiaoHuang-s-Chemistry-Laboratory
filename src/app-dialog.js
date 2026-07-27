/**
 * 应用内统一弹窗（替代 window.alert / confirm / prompt）
 * 样式对齐现有 modal-panel，z-index 高于其它业务弹层。
 */

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @type {HTMLElement | null} */
let rootEl = null;
/** @type {Array<() => void>} */
const queue = [];
let busy = false;

function ensureRoot() {
  if (rootEl && document.body.contains(rootEl)) return rootEl;
  rootEl = document.createElement('div');
  rootEl.id = 'appDialogRoot';
  rootEl.className = 'app-dialog-root';
  rootEl.innerHTML = `
    <div class="app-dialog-backdrop" data-app-dialog-backdrop aria-hidden="true"></div>
    <div class="app-dialog-panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="appDialogTitle" aria-describedby="appDialogMessage">
      <div class="modal-head app-dialog-head">
        <h2 id="appDialogTitle">提示</h2>
        <button type="button" class="settings-close" data-app-dialog-x aria-label="关闭">×</button>
      </div>
      <div class="modal-body app-dialog-body">
        <p class="app-dialog-message" id="appDialogMessage"></p>
        <!-- 仅 mode=prompt 时显示；确认/提示框绝不出现输入框 -->
        <div class="app-dialog-prompt-wrap" id="appDialogPromptWrap" hidden>
          <label class="app-dialog-prompt-field">
            <span class="app-dialog-prompt-label">内容</span>
            <input type="text" class="app-dialog-input" id="appDialogInput" autocomplete="off" />
          </label>
        </div>
        <div class="settings-actions app-dialog-actions">
          <button type="button" class="btn primary" data-app-dialog-ok>确定</button>
          <button type="button" class="btn ghost" data-app-dialog-cancel>取消</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(rootEl);
  return rootEl;
}

/**
 * @param {{
 *   mode: 'alert' | 'confirm' | 'prompt',
 *   title?: string,
 *   message: string,
 *   okText?: string,
 *   cancelText?: string,
 *   danger?: boolean,
 *   defaultValue?: string,
 *   placeholder?: string,
 *   inputLabel?: string,
 * }} opts
 * @returns {Promise<boolean | string | null | void>}
 */
function showDialog(opts) {
  return new Promise((resolve) => {
    queue.push(() => runDialog(opts, resolve));
    drain();
  });
}

function drain() {
  if (busy) return;
  const next = queue.shift();
  if (!next) return;
  busy = true;
  next();
}

/**
 * @param {object} opts
 * @param {(v: any) => void} resolve
 */
function runDialog(opts, resolve) {
  const root = ensureRoot();
  const panel = root.querySelector('.app-dialog-panel');
  const backdrop = root.querySelector('.app-dialog-backdrop');
  const titleEl = root.querySelector('#appDialogTitle');
  const msgEl = root.querySelector('#appDialogMessage');
  const promptWrap = root.querySelector('#appDialogPromptWrap');
  const inputEl = root.querySelector('#appDialogInput');
  const okBtn = root.querySelector('[data-app-dialog-ok]');
  const cancelBtn = root.querySelector('[data-app-dialog-cancel]');
  const xBtn = root.querySelector('[data-app-dialog-x]');

  const mode = opts.mode || 'alert';
  const title =
    opts.title ||
    (mode === 'confirm' ? '请确认' : mode === 'prompt' ? '请输入' : '提示');

  titleEl.textContent = title;
  // 支持简单换行
  msgEl.innerHTML = escapeHtml(opts.message).replace(/\n/g, '<br>');

  const isPrompt = mode === 'prompt';
  const isConfirm = mode === 'confirm' || isPrompt;

  // 确认 / 提示：彻底隐藏输入区（不用 .field，避免 display:grid 冲掉 [hidden]）
  if (promptWrap) {
    promptWrap.hidden = !isPrompt;
    promptWrap.setAttribute('aria-hidden', isPrompt ? 'false' : 'true');
  }
  cancelBtn.hidden = !isConfirm;

  okBtn.textContent =
    opts.okText || (mode === 'alert' ? '知道了' : mode === 'confirm' ? '确定' : '确定');
  cancelBtn.textContent = opts.cancelText || '取消';
  okBtn.classList.toggle('is-danger', !!opts.danger);

  if (inputEl) {
    if (isPrompt) {
      inputEl.value = opts.defaultValue != null ? String(opts.defaultValue) : '';
      inputEl.placeholder = opts.placeholder || '';
      const label = root.querySelector('.app-dialog-prompt-label');
      if (label) label.textContent = opts.inputLabel || '内容';
    } else {
      inputEl.value = '';
      inputEl.placeholder = '';
    }
  }

  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    cleanup();
    root.classList.remove('is-open');
    panel.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    busy = false;
    resolve(value);
    // 下一帧再开下一个，避免同一 click 穿透
    requestAnimationFrame(() => drain());
  };

  const onOk = () => {
    if (isPrompt) finish(String(inputEl?.value ?? ''));
    else if (isConfirm) finish(true);
    else finish();
  };
  const onCancel = () => {
    if (isPrompt) finish(null);
    else if (isConfirm) finish(false);
    else finish();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
      // prompt 输入框回车提交
      if (isPrompt || mode === 'alert' || mode === 'confirm') {
        e.preventDefault();
        onOk();
      }
    }
  };

  okBtn.addEventListener('click', onOk);
  cancelBtn.addEventListener('click', onCancel);
  xBtn.addEventListener('click', onCancel);
  backdrop.addEventListener('click', onCancel);
  document.addEventListener('keydown', onKey, true);

  function cleanup() {
    okBtn.removeEventListener('click', onOk);
    cancelBtn.removeEventListener('click', onCancel);
    xBtn.removeEventListener('click', onCancel);
    backdrop.removeEventListener('click', onCancel);
    document.removeEventListener('keydown', onKey, true);
    okBtn.classList.remove('is-danger');
  }

  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  backdrop.classList.add('is-open');
  // 强制 reflow 再加 is-open，保证动效
  void panel.offsetWidth;
  panel.classList.add('is-open');

  requestAnimationFrame(() => {
    if (isPrompt) inputEl?.focus();
    else okBtn.focus();
  });
}

/**
 * @param {string} message
 * @param {{ title?: string, okText?: string }} [opts]
 * @returns {Promise<void>}
 */
export function appAlert(message, opts = {}) {
  return showDialog({
    mode: 'alert',
    message: String(message ?? ''),
    title: opts.title,
    okText: opts.okText || '知道了',
  });
}

/**
 * @param {string} message
 * @param {{ title?: string, okText?: string, cancelText?: string, danger?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export function appConfirm(message, opts = {}) {
  return showDialog({
    mode: 'confirm',
    message: String(message ?? ''),
    title: opts.title || '请确认',
    okText: opts.okText || '确定',
    cancelText: opts.cancelText || '取消',
    danger: !!opts.danger,
  });
}

/**
 * @param {string} message
 * @param {string} [defaultValue]
 * @param {{ title?: string, okText?: string, cancelText?: string, placeholder?: string, inputLabel?: string }} [opts]
 * @returns {Promise<string | null>}
 */
export function appPrompt(message, defaultValue = '', opts = {}) {
  return showDialog({
    mode: 'prompt',
    message: String(message ?? ''),
    title: opts.title || '请输入',
    okText: opts.okText || '确定',
    cancelText: opts.cancelText || '取消',
    defaultValue: defaultValue != null ? String(defaultValue) : '',
    placeholder: opts.placeholder,
    inputLabel: opts.inputLabel,
  });
}
