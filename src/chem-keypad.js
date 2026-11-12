/**
 * 化学符号 Unicode 软键盘
 * 聚焦目标输入框时显示，点键插入光标处。
 */

/** @type {{ label: string, keys: string[] }[]} */
export const CHEM_KEYPAD_ROWS = [
  {
    label: '下标',
    keys: ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'],
  },
  {
    label: '上标',
    keys: ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '⁺', '⁻'],
  },
  {
    label: '符号',
    keys: ['→', '⇌', '↔', '△', 'Δ', '·', '↑', '↓', '°', '+', '='],
  },
  {
    label: '片段',
    keys: ['(s)', '(l)', '(g)', '(aq)', 'e⁻', '²⁺', '³⁺', '²⁻'],
  },
];

/** 在 input/textarea 光标处插入文本 */
export function insertAtCursor(input, text) {
  if (!input) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const value = input.value;
  input.value = value.slice(0, start) + text + value.slice(end);
  const pos = start + text.length;
  input.setSelectionRange(pos, pos);
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * @param {string} [idSuffix] 同一页多个键盘时区分 id
 */
export function renderChemKeypadHtml(idSuffix = '') {
  const sid = idSuffix ? `-${idSuffix}` : '';
  const rows = CHEM_KEYPAD_ROWS.map((row) => {
    const keys = row.keys
      .map(
        (k) =>
          `<button type="button" class="chem-key" data-chem-insert="${escapeAttr(k)}" aria-label="插入 ${escapeAttr(k)}">${escapeAttr(k)}</button>`,
      )
      .join('');
    return `<div class="chem-keypad-row"><span class="chem-keypad-label">${row.label}</span><div class="chem-keypad-keys">${keys}</div></div>`;
  }).join('');
  return `<div class="chem-keypad" id="chemKeypad${sid}" hidden>
    <div class="chem-keypad-head">
      <span>化学符号</span>
      <button type="button" class="chem-keypad-close" data-chem-keypad-close aria-label="关闭符号键盘">收起</button>
    </div>
    ${rows}
  </div>`;
}

/**
 * 把软键盘挂到 input/textarea 上（键盘 DOM 须为 input 同级或后续兄弟，或放在 wrapper 内）
 * @param {HTMLInputElement|HTMLTextAreaElement} input
 * @param {HTMLElement} keypad
 * @param {{ onInsert?: (value: string) => void }} [opts]
 */
export function bindChemKeypad(input, keypad, opts = {}) {
  if (!input || !keypad) return () => {};

  // 不再「聚焦即弹出、失焦即收起」：键盘在文档流里，自动开合会把下方按钮顶来顶去，
  // 点「计算」时按钮会在点击瞬间跳走。改为输入框右侧的「符号」按钮显式开合。
  let wrap = input.parentElement;
  if (!wrap?.classList.contains('chem-input-wrap')) {
    wrap = document.createElement('span');
    wrap.className = 'chem-input-wrap';
    if (input instanceof HTMLTextAreaElement) wrap.classList.add('is-textarea');
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
  }
  let toggle = wrap.querySelector('.chem-keypad-toggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'chem-keypad-toggle';
    toggle.textContent = '符号';
    toggle.title = '化学符号键盘（· → ↑ ↓ ⇌ 上下标）';
    wrap.appendChild(toggle);
  }
  if (keypad.id) toggle.setAttribute('aria-controls', keypad.id);

  const sync = () => {
    toggle.setAttribute('aria-expanded', keypad.hidden ? 'false' : 'true');
    toggle.classList.toggle('is-on', !keypad.hidden);
  };
  const show = () => {
    keypad.hidden = false;
    sync();
  };
  const hide = () => {
    keypad.hidden = true;
    sync();
  };
  sync();

  // 按住按钮不抢走输入框焦点（光标位置保留，插入符号仍在原处）
  const keepFocus = (e) => e.preventDefault();
  toggle.addEventListener('mousedown', keepFocus);
  const onToggle = () => {
    if (keypad.hidden) show();
    else hide();
    input.focus();
  };
  toggle.addEventListener('click', onToggle);
  keypad.addEventListener('mousedown', keepFocus);

  const onKeyClick = (e) => {
    const btn = e.target.closest('[data-chem-insert]');
    if (!btn || !keypad.contains(btn)) return;
    const text = btn.getAttribute('data-chem-insert') || '';
    if (!text) return;
    insertAtCursor(input, text);
    opts.onInsert?.(input.value);
  };
  keypad.addEventListener('click', onKeyClick);

  const closeBtn = keypad.querySelector('[data-chem-keypad-close]');
  closeBtn?.addEventListener('click', hide);

  return () => {
    toggle.removeEventListener('mousedown', keepFocus);
    toggle.removeEventListener('click', onToggle);
    keypad.removeEventListener('mousedown', keepFocus);
    keypad.removeEventListener('click', onKeyClick);
    closeBtn?.removeEventListener('click', hide);
  };
}

/**
 * 在容器内为指定选择器的输入框各挂一个软键盘（插入在 field 标签内、输入框后）
 * @param {ParentNode} root
 * @param {string} inputSelector
 * @param {{ onInsert?: (input: HTMLElement, value: string) => void }} [opts]
 */
export function mountChemKeypads(root, inputSelector, opts = {}) {
  if (!root) return;
  const inputs = root.querySelectorAll(inputSelector);
  inputs.forEach((input, i) => {
    if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return;
    if (input.dataset.chemKeypadBound === '1') return;
    input.dataset.chemKeypadBound = '1';

    let keypad = input.parentElement?.querySelector('.chem-keypad');
    if (!keypad) {
      const wrap = document.createElement('div');
      wrap.innerHTML = renderChemKeypadHtml(`m${i}-${Date.now().toString(36)}`);
      keypad = wrap.firstElementChild;
      // 插在 input 后面
      input.insertAdjacentElement('afterend', keypad);
    }
    bindChemKeypad(input, keypad, {
      onInsert: (value) => opts.onInsert?.(input, value),
    });
  });
}
