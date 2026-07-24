/**
 * 设置抽屉：系统（品牌 / 主题切换 / 默认页）+ AI（模型 API）
 * 主题：{ id } → html[data-theme]，样式在 styles/themes/<id>/
 */

import { settingsApi } from './api/client.js';
import { THEME_CATALOG, normalizeTheme, DEFAULT_THEME_ID } from './theme/catalog.js';
import { applyTheme } from './theme/apply.js';

/** 图标文件大小上限：500KB */
export const BRAND_ICON_MAX_BYTES = 500 * 1024;

export const DEFAULT_BRAND = {
  title: '小黄的化学实验室',
  iconDataUrl: null,
};

export const DEFAULT_ICON_SRC = '/brand-avatar.png';

/** @deprecated 旧版色值主题；新代码请用 theme.id */
export const DEFAULT_THEME = { id: DEFAULT_THEME_ID };

export const DEFAULT_SETTINGS = {
  brand: { ...DEFAULT_BRAND },
  theme: { id: DEFAULT_THEME_ID },
  defaultPage: 'table',
  /** 电子排布列表顺序（元素 z）；[] 表示使用默认 */
  electronOrder: [],
  ai: {
    apiBase: 'https://api.deepseek.com',
    apiKey: '',
    model: 'deepseek-v4-flash',
  },
};

const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);

// 缓存的设置
let cachedSettings = null;

/** 预览色（设置卡片小色块，与主题 token 大致对应） */
const THEME_PREVIEW = {
  default: ['#3b82f6', '#f0f4f8', '#ffffff'],
  stationery: ['#c23b22', '#f2e9dc', '#1f6f6a'],
  reagent: ['#b45309', '#e9e6e0', '#c9a227'],
};

/**
 * 加载设置（从 API 或缓存）
 */
export async function loadSettings() {
  if (cachedSettings) return cachedSettings;

  try {
    const settings = await settingsApi.get();
    cachedSettings = {
      brand: {
        title: settings.brand?.title || DEFAULT_BRAND.title,
        iconDataUrl: settings.brand?.iconDataUrl || null,
      },
      theme: normalizeTheme(settings.theme),
      defaultPage: ['table', 'molecule', 'molar', 'electron', 'ai'].includes(settings.defaultPage)
        ? settings.defaultPage
        : 'table',
      electronOrder: Array.isArray(settings.electronOrder)
        ? settings.electronOrder.map(Number).filter((n) => Number.isFinite(n))
        : [],
      ai: {
        apiBase: settings.ai?.apiBase || DEFAULT_SETTINGS.ai.apiBase,
        apiKey: settings.ai?.apiKey || '',
        model: ALLOWED_MODELS.has(settings.ai?.model)
          ? settings.ai.model
          : DEFAULT_SETTINGS.ai.model,
      },
    };
    return cachedSettings;
  } catch (err) {
    console.error('加载设置失败:', err);
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/**
 * 部分更新设置（只 PUT 变更字段，避免冲掉 electronOrder 等）
 * @param {Record<string, unknown>} patch
 */
export async function saveSettings(patch) {
  try {
    await settingsApi.update(patch);
    if (cachedSettings) {
      cachedSettings = {
        ...cachedSettings,
        brand: patch.brand
          ? { ...cachedSettings.brand, ...patch.brand }
          : cachedSettings.brand,
        theme: patch.theme
          ? normalizeTheme({ ...cachedSettings.theme, ...patch.theme })
          : cachedSettings.theme,
        defaultPage:
          patch.defaultPage !== undefined ? patch.defaultPage : cachedSettings.defaultPage,
        electronOrder:
          patch.electronOrder !== undefined
            ? patch.electronOrder
            : cachedSettings.electronOrder,
        ai: patch.ai ? { ...cachedSettings.ai, ...patch.ai } : cachedSettings.ai,
      };
    }
    return true;
  } catch (err) {
    console.error('保存设置失败:', err);
    throw err;
  }
}

/** 仅更新缓存中的 electronOrder（列表拖拽后） */
export function patchCachedElectronOrder(order) {
  if (cachedSettings) {
    cachedSettings.electronOrder = Array.isArray(order) ? order : [];
  }
}

export { applyTheme };

/**
 * 应用品牌
 */
export function applyBrand(brand) {
  const b = { ...DEFAULT_BRAND, ...brand };
  const titleEl = document.getElementById('appBrandTitle');
  const iconEl = document.getElementById('appBrandIcon');
  if (titleEl) titleEl.textContent = b.title;
  if (iconEl) iconEl.src = b.iconDataUrl || DEFAULT_ICON_SRC;
  document.title = b.title || '小黄的化学实验室';
}

/**
 * 读取文件为 DataURL
 */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 渲染主题选择卡片
 * @param {HTMLElement | null} root
 * @param {string} activeId
 * @param {(id: string) => void} onPick
 */
function renderThemePicker(root, activeId, onPick) {
  if (!root) return;
  root.innerHTML = '';
  THEME_CATALOG.forEach((meta) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-card' + (meta.id === activeId ? ' is-active' : '');
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', meta.id === activeId ? 'true' : 'false');
    btn.dataset.themeId = meta.id;

    const swatch = document.createElement('span');
    swatch.className = 'theme-card-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    (THEME_PREVIEW[meta.id] || THEME_PREVIEW.default).forEach((hex) => {
      const i = document.createElement('i');
      i.style.background = hex;
      swatch.appendChild(i);
    });

    const name = document.createElement('span');
    name.className = 'theme-card-name';
    name.textContent = meta.name;

    const desc = document.createElement('span');
    desc.className = 'theme-card-desc';
    desc.textContent = meta.description;

    btn.append(swatch, name, desc);
    btn.addEventListener('click', () => onPick(meta.id));
    root.appendChild(btn);
  });
}

/**
 * 初始化设置 UI
 */
export async function initSettingsUI({ onDefaultPageChange } = {}) {
  const $ = (sel) => document.querySelector(sel);

  const btnOpen = $('#btnSettings');
  const backdrop = $('#settingsBackdrop');
  const drawer = $('#settingsDrawer');
  const btnClose = $('#btnSettingsClose');

  const brandIconPreview = $('#brandIconPreview');
  const brandIconInput = $('#brandIconInput');
  const brandTitleInput = $('#brandTitleInput');
  const btnSaveBrand = $('#btnSaveBrand');
  const btnResetBrand = $('#btnResetBrand');
  const brandStatus = $('#brandStatus');

  const themePicker = $('#themePicker');
  const themeStatus = $('#themeStatus');
  const defaultPage = $('#settingDefaultPage');
  const defaultPageStatus = $('#defaultPageStatus');

  const apiBase = $('#aiApiBase');
  const apiKey = $('#aiApiKey');
  const apiModel = $('#aiModel');
  const btnSaveAi = $('#btnSaveAi');
  const aiStatus = $('#aiStatus');

  let pendingIconDataUrl = null;

  function setStatus(el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.className = 'settings-status ' + (ok ? 'is-ok' : 'is-err');
    setTimeout(() => {
      el.textContent = '';
      el.className = 'settings-status';
    }, 2800);
  }

  function syncBrandInputs(brand) {
    if (brandTitleInput) brandTitleInput.value = brand.title;
    if (brandIconPreview) brandIconPreview.src = brand.iconDataUrl || DEFAULT_ICON_SRC;
  }

  async function onThemePick(nextId) {
    try {
      applyTheme({ id: nextId });
      await saveSettings({ theme: { id: nextId } });
      syncThemePicker({ id: nextId });
      const label = THEME_CATALOG.find((t) => t.id === nextId)?.name || nextId;
      setStatus(themeStatus, `已切换为「${label}」`, true);
    } catch (err) {
      setStatus(themeStatus, '保存失败: ' + err.message, false);
    }
  }

  function syncThemePicker(theme) {
    const { id } = normalizeTheme(theme);
    renderThemePicker(themePicker, id, onThemePick);
  }

  async function openDrawer() {
    cachedSettings = null;
    const settings = await loadSettings();
    syncBrandInputs(settings.brand);
    syncThemePicker(settings.theme);
    if (defaultPage) defaultPage.value = settings.defaultPage;
    if (apiBase) apiBase.value = settings.ai.apiBase;
    if (apiKey) apiKey.value = settings.ai.apiKey;
    if (apiModel) apiModel.value = settings.ai.model;
    pendingIconDataUrl = null;

    backdrop?.classList.add('is-open');
    drawer?.classList.add('is-open');
    backdrop?.setAttribute('aria-hidden', 'false');
    drawer?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('settings-open');
  }

  function closeDrawer() {
    backdrop?.classList.remove('is-open');
    drawer?.classList.remove('is-open');
    backdrop?.setAttribute('aria-hidden', 'true');
    drawer?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('settings-open');
  }

  btnOpen?.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer?.classList.contains('is-open')) closeDrawer();
  });

  brandIconInput?.addEventListener('change', async () => {
    const file = brandIconInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus(brandStatus, '请选择图片文件', false);
      return;
    }
    if (file.size > BRAND_ICON_MAX_BYTES) {
      setStatus(brandStatus, '图片过大（限 500KB）', false);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > BRAND_ICON_MAX_BYTES * 1.4) {
        setStatus(brandStatus, '编码后过大', false);
        return;
      }
      pendingIconDataUrl = dataUrl;
      if (brandIconPreview) brandIconPreview.src = dataUrl;
    } catch {
      setStatus(brandStatus, '读取文件失败', false);
    }
  });

  btnSaveBrand?.addEventListener('click', async () => {
    const title = brandTitleInput?.value?.trim();
    if (!title) {
      setStatus(brandStatus, '标题不能为空', false);
      return;
    }
    try {
      const settings = await loadSettings();
      const brand = {
        title: title.slice(0, 32),
        iconDataUrl: pendingIconDataUrl || settings.brand.iconDataUrl,
      };
      await saveSettings({ brand });
      applyBrand(brand);
      pendingIconDataUrl = null;
      setStatus(brandStatus, '已保存', true);
    } catch (err) {
      setStatus(brandStatus, '保存失败: ' + err.message, false);
    }
  });

  btnResetBrand?.addEventListener('click', async () => {
    try {
      const brand = { ...DEFAULT_BRAND };
      await saveSettings({ brand });
      applyBrand(brand);
      syncBrandInputs(brand);
      pendingIconDataUrl = null;
      setStatus(brandStatus, '已恢复默认', true);
    } catch (err) {
      setStatus(brandStatus, '重置失败: ' + err.message, false);
    }
  });

  defaultPage?.addEventListener('change', async () => {
    try {
      await saveSettings({ defaultPage: defaultPage.value });
      onDefaultPageChange?.(defaultPage.value);
      setStatus(defaultPageStatus, '已保存', true);
    } catch (err) {
      setStatus(defaultPageStatus, '保存失败: ' + err.message, false);
    }
  });

  btnSaveAi?.addEventListener('click', async () => {
    const model = apiModel?.value;
    if (!ALLOWED_MODELS.has(model)) {
      setStatus(aiStatus, '不支持的模型', false);
      return;
    }
    try {
      const ai = {
        apiBase: apiBase?.value?.trim() || DEFAULT_SETTINGS.ai.apiBase,
        apiKey: apiKey?.value?.trim() || '',
        model,
      };
      await saveSettings({ ai });
      setStatus(aiStatus, '已保存', true);
    } catch (err) {
      setStatus(aiStatus, '保存失败: ' + err.message, false);
    }
  });

  const settings = await loadSettings();
  applyTheme(settings.theme);
  applyBrand(settings.brand);

  return {
    getSettings: () => loadSettings(),
    openDrawer,
    closeDrawer,
    getDefaultPage: async () => {
      const s = await loadSettings();
      return s.defaultPage;
    },
  };
}
