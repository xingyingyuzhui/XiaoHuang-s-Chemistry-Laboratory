/**
 * 分子列表管理模块
 * 负责分子卡片列表的渲染、拖拽排序、编辑模式
 */

import { moleculeApi } from './api/client.js';
import { createMoleculeViewer } from './molecule3d.js';
import { refreshMolarPresets } from './molar-ui.js';

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

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// DOM 元素
const molList = $('#moleculeList');
const molTitle = $('#moleculeTitle');
const molDesc = $('#moleculeDesc');
const btnAddMolecule = $('#btnAddMolecule');
const btnEditMolecules = $('#btnEditMolecules');
const btnLabelToggle = $('#molLabelToggle');

// 状态
let molEditMode = false;
let currentMolId = null;
let dragSrcId = null;
let molViewer = null;
let molStarted = false;

/**
 * 确保 3D 查看器已初始化
 */
export function ensureMolViewer() {
  if (molViewer) return molViewer;
  molViewer = createMoleculeViewer($('#mol-root'));
  return molViewer;
}

/**
 * 获取 3D 查看器实例
 */
export function getMolViewer() {
  return molViewer;
}

/**
 * 渲染分子卡片列表
 */
export async function renderMolList() {
  if (!molList) return;
  try {
    const list = await moleculeApi.getList();

    molList.innerHTML = list
      .map(
        (m) => `
      <div
        class="mol-card${currentMolId === m.id ? ' is-active' : ''}${molEditMode ? ' is-editing' : ''}"
        data-id="${escapeHtml(m.id)}"
        draggable="${molEditMode ? 'true' : 'false'}"
      >
        <button type="button" class="mol-card-del" data-del="${escapeHtml(m.id)}" title="删除" aria-label="删除 ${escapeHtml(m.name)}">×</button>
        <button type="button" class="mol-btn mol-card-main" data-id="${escapeHtml(m.id)}">
          <strong>${escapeHtml(formulaToSubscript(m.formula))}</strong>
          <span>${escapeHtml(m.name)}</span>
        </button>
      </div>
    `
      )
      .join('');

    // 绑定点击事件
    molList.querySelectorAll('.mol-card-main').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (molEditMode) return;
        loadMolecule(btn.dataset.id);
      });
    });

    // 绑定删除事件
    molList.querySelectorAll('.mol-card-del').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!molEditMode) return;
        const id = btn.dataset.del;
        if (!id) return;
        if (!window.confirm('确定删除该分子卡片？')) return;

        try {
          await moleculeApi.delete(id);
          if (currentMolId === id) {
            currentMolId = null;
            const newList = await moleculeApi.getList();
            const first = newList[0];
            if (first) loadMolecule(first.id);
            else {
              molTitle.textContent = '—';
              molDesc.textContent = '列表为空，可点击 ＋ 用 AI 生成分子';
              molViewer?.load?.(null);
            }
          }
          await renderMolList();
        } catch (err) {
          console.error('删除分子失败:', err);
          alert('删除失败: ' + err.message);
        }
      });
    });

    if (molEditMode) bindMolDrag();

    // 摩尔质量页示例与 3D 分子库化学式同步
    refreshMolarPresets(list).catch((e) =>
      console.warn('同步摩尔示例如失败', e),
    );
  } catch (err) {
    console.error('获取分子列表失败:', err);
    molList.innerHTML = `<p class="hint" style="padding:0.5rem;color:#b91c1c">加载失败：${escapeHtml(err.message || '请确认后端已启动')}</p>`;
  }
}

/**
 * 绑定拖拽排序
 */
function bindMolDrag() {
  const cards = [...molList.querySelectorAll('.mol-card')];
  cards.forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      dragSrcId = card.dataset.id;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragSrcId);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      dragSrcId = null;
      cards.forEach((c) => c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const from = dragSrcId || e.dataTransfer.getData('text/plain');
      const to = card.dataset.id;
      if (!from || !to || from === to) return;

      try {
        const list = await moleculeApi.getList();
        const order = list.map((m) => m.id);
        const fi = order.indexOf(from);
        const ti = order.indexOf(to);
        if (fi < 0 || ti < 0) return;

        order.splice(fi, 1);
        order.splice(ti, 0, from);
        await moleculeApi.reorder(order);
        await renderMolList();
      } catch (err) {
        console.error('排序失败:', err);
      }
    });
  });
}

/**
 * 设置编辑模式
 */
export function setMolEditMode(on) {
  molEditMode = on;
  if (btnEditMolecules) {
    btnEditMolecules.textContent = on ? '保存' : '编辑';
    btnEditMolecules.classList.toggle('is-active', on);
  }
  molList.classList.toggle('is-edit-mode', on);
  renderMolList();
}

/**
 * 加载分子到 3D 查看器
 */
export async function loadMolecule(id) {
  try {
    ensureMolViewer();
    const m = await moleculeApi.getById(id);
    if (!m) return;

    currentMolId = id;
    molViewer.load(m);
    if (molTitle) molTitle.textContent = `${m.name}（${formulaToSubscript(m.formula)}）`;
    if (molDesc) molDesc.textContent = m.desc;

    const molProps = document.getElementById('moleculeProps');
    if (molProps) {
      let propsHtml = '';

      if (m.physics && Object.keys(m.physics).length > 0) {
        propsHtml += `
          <div class="mol-props-section">
            <h4>物理性质</h4>
            <ul>
              <li>状态：${escapeHtml(m.physics.state || '未知')}</li>
              <li>密度：${escapeHtml(m.physics.density || '未知')}</li>
              <li>熔点：${escapeHtml(m.physics.meltingPoint || '未知')}</li>
              <li>沸点：${escapeHtml(m.physics.boilingPoint || '未知')}</li>
            </ul>
          </div>
        `;
      }

      if (m.chemistry && Object.keys(m.chemistry).length > 0) {
        propsHtml += `
          <div class="mol-props-section">
            <h4>化学性质</h4>
            <ul>
              <li>酸碱性：${escapeHtml(m.chemistry.acidity || '未知')}</li>
              <li>溶解性：${escapeHtml(m.chemistry.solubility || '未知')}</li>
              <li>化学活性：${escapeHtml(m.chemistry.reactivity || '未知')}</li>
            </ul>
          </div>
        `;
      }

      molProps.innerHTML = propsHtml;
    }
    
    await renderMolList();
  } catch (err) {
    console.error('加载分子失败:', err);
  }
}

/**
 * 初始化分子列表
 */
export function initMoleculeList() {
  // 绑定编辑按钮
  btnEditMolecules?.addEventListener('click', async () => {
    if (molEditMode) {
      setMolEditMode(false);
    } else {
      setMolEditMode(true);
    }
  });

  // 绑定标签切换按钮
  if (btnLabelToggle) {
    btnLabelToggle.addEventListener('click', () => {
      if (molViewer) {
        molViewer.toggleLabels();
        btnLabelToggle.setAttribute(
          'aria-pressed',
          btnLabelToggle.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'
        );
      }
    });
  }

  // 渲染列表
  renderMolList();
}
