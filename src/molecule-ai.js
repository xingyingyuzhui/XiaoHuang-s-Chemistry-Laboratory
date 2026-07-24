/**
 * AI 生成分子弹窗模块
 * 负责 AI 生成分子的弹窗逻辑
 */

import { aiApi, moleculeApi } from './api/client.js';
import { renderMolList, loadMolecule, setMolEditMode } from './molecule-list.js';

const $ = (sel) => document.querySelector(sel);

/**
 * 将化学式中的数字转为 Unicode 下标
 */
function formulaToSubscript(formula) {
  if (!formula) return '';
  const subDigits = '₀₁₂₃₄₅₆₇₈₉';
  return formula.replace(/(\d+)/g, (match) => {
    return match.split('').map(d => subDigits[parseInt(d)] || d).join('');
  });
}

// DOM 元素
const genBackdrop = $('#genMolBackdrop');
const genModal = $('#genMolModal');
const genPrompt = $('#genMolPrompt');
const genStatus = $('#genMolStatus');
const btnGenSubmit = $('#btnGenMolSubmit');
const btnGenCancel = $('#btnGenMolCancel');
const btnGenClose = $('#btnGenMolClose');
const btnAddMolecule = $('#btnAddMolecule');

/**
 * 打开生成弹窗
 */
export function openGenModal() {
  genPrompt.value = '';
  genStatus.textContent = '';
  genStatus.classList.remove('is-ok', 'is-err');
  genBackdrop?.classList.add('is-open');
  genModal?.classList.add('is-open');
  genBackdrop?.setAttribute('aria-hidden', 'false');
  genModal?.setAttribute('aria-hidden', 'false');
  genPrompt?.focus();
}

/**
 * 关闭生成弹窗
 */
export function closeGenModal() {
  genBackdrop?.classList.remove('is-open');
  genModal?.classList.remove('is-open');
  genBackdrop?.setAttribute('aria-hidden', 'true');
  genModal?.setAttribute('aria-hidden', 'true');
  if (btnGenSubmit) {
    btnGenSubmit.disabled = false;
    btnGenSubmit.textContent = '生成并保存';
  }
}

/**
 * 处理生成请求
 */
async function handleGenerate() {
  const prompt = genPrompt?.value?.trim() || '';
  if (!prompt) {
    genStatus.textContent = '请输入分子描述';
    genStatus.classList.add('is-err');
    return;
  }

  btnGenSubmit.disabled = true;
  btnGenSubmit.textContent = '生成中…';
  genStatus.textContent = '正在调用 DeepSeek…';
  genStatus.classList.remove('is-ok', 'is-err');

  try {
    // 调用 AI 生成
    const data = await aiApi.generate(prompt);

    // 生成唯一 ID
    const id = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    // 构造分子对象
    const mol = {
      id,
      name: data.name,
      formula: formulaToSubscript(data.formula),
      desc: data.desc,
      atoms: data.atoms,
      bonds: data.bonds,
      physics: data.physics || {},
      chemistry: data.chemistry || {}
    };

    // 保存到数据库
    await moleculeApi.add(mol);

    // 刷新列表并加载
    await renderMolList();
    await loadMolecule(id);

    genStatus.textContent = '已生成并保存';
    genStatus.classList.add('is-ok');
    window.setTimeout(() => closeGenModal(), 450);
  } catch (err) {
    genStatus.textContent = err.message || String(err);
    genStatus.classList.add('is-err');
    btnGenSubmit.disabled = false;
    btnGenSubmit.textContent = '生成并保存';
  }
}

/**
 * 初始化 AI 生成弹窗
 */
export function initMoleculeAI() {
  // 绑定添加按钮
  btnAddMolecule?.addEventListener('click', () => openGenModal());

  // 绑定取消/关闭按钮
  btnGenCancel?.addEventListener('click', () => closeGenModal());
  btnGenClose?.addEventListener('click', () => closeGenModal());
  genBackdrop?.addEventListener('click', () => closeGenModal());

  // 绑定提交按钮
  btnGenSubmit?.addEventListener('click', () => handleGenerate());
}
