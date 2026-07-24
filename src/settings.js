/**
 * 设置抽屉：系统（品牌 / 主题色 / 默认页）+ AI（模型 API）
 * 使用后端 API 存储设置
 */

import { settingsApi } from './api/client.js';

/** 图标文件大小上限：500KB */
export const BRAND_ICON_MAX_BYTES = 500 * 1024;

export const DEFAULT_BRAND = {
  title: '小黄的化学实验室',
  iconDataUrl: null,
};

export const DEFAULT_ICON_SRC = '/brand-avatar.png';

export const DEFAULT_THEME = {
  accent: '#3b82f6',
  bg: '#f0f4f8',
  card: '#ffffff',
  text: '#1e293b',
};

export const DEFAULT_SETTINGS = {
  brand: { ...DEFAULT_BRAND },
  theme: { ...DEFAULT_THEME },
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

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return { r: 59, g: 130, b: 246 };
}

function mixHex(hex, whiteAmount) {
  const { r, g, b } = hexToRgb(hex);
  const m = (c) => Math.round(c + (255 - c) * whiteAmount);
  const to = (c) => c.toString(16).padStart(2, '0');
  return `#${to(m(r))}${to(m(g))}${to(m(b))}`;
}

function darkenHex(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const m = (c) => Math.round(c * (1 - amount));
  const to = (c) => c.toString(16).padStart(2, '0');
  return `#${to(m(r))}${to(m(g))}${to(m(b))}`;
}

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
      theme: { ...DEFAULT_THEME, ...(settings.theme || {}) },
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
    // 合并进缓存，不全量替换
    if (cachedSettings) {
      cachedSettings = {
        ...cachedSettings,
        ...patch,
        brand: patch.brand
          ? { ...cachedSettings.brand, ...patch.brand }
          : cachedSettings.brand,
        theme: patch.theme
          ? { ...cachedSettings.theme, ...patch.theme }
          : cachedSettings.theme,
        ai: patch.ai ? { ...cachedSettings.ai, ...patch.ai } : cachedSettings.ai,
        electronOrder: Array.isArray(patch.electronOrder)
          ? patch.electronOrder
          : cachedSettings.electronOrder,
      };
    }
  } catch (err) {
    console.error('保存设置失败:', err);
    throw err;
  }
}

/** 外部模块（如电子列表）更新缓存中的 electronOrder */
export function patchCachedElectronOrder(order) {
  if (!cachedSettings) return;
  cachedSettings.electronOrder = Array.isArray(order) ? [...order] : [];
}

/** 强制下次 loadSettings 重新拉后端 */
export function invalidateSettingsCache() {
  cachedSettings = null;
}

/**
 * 应用主题色
 */
export function applyTheme(theme) {
  const t = { ...DEFAULT_THEME, ...theme };
  const root = document.documentElement.style;
  root.setProperty('--accent', t.accent);
  root.setProperty('--accent-soft', mixHex(t.accent, 0.88));
  root.setProperty('--bg-body', t.bg);
  root.setProperty('--card-bg', t.card);
  root.setProperty('--text-primary', t.text);
  root.setProperty('--text-muted', mixHex(t.text, 0.35));
  root.setProperty('--text-secondary', mixHex(t.text, 0.5));
  root.setProperty('--border', mixHex(t.text, 0.82));
  root.setProperty('--border-soft', mixHex(t.text, 0.9));
  root.setProperty('--btn-primary', t.accent);
  root.setProperty('--btn-primary-hover', darkenHex(t.accent, 0.12));
  root.setProperty('--btn-primary-border', darkenHex(t.accent, 0.18));
}

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
 * 初始化设置 UI
 */
export async function initSettingsUI({ onDefaultPageChange } = {}) {
  const $ = (sel) => document.querySelector(sel);

  // DOM 元素
  const btnOpen = $('#btnSettings');
  const backdrop = $('#settingsBackdrop');
  const drawer = $('#settingsDrawer');
  const btnClose = $('#btnSettingsClose');

  // 品牌
  const brandIconPreview = $('#brandIconPreview');
  const brandIconInput = $('#brandIconInput');
  const brandTitleInput = $('#brandTitleInput');
  const btnSaveBrand = $('#btnSaveBrand');
  const btnResetBrand = $('#btnResetBrand');
  const brandStatus = $('#brandStatus');

  // 主题：色块仅示意，右侧 #hex 可编辑并确认保存
  const swatchAccent = $('#swatchAccent');
  const swatchBg = $('#swatchBg');
  const swatchCard = $('#swatchCard');
  const swatchText = $('#swatchText');
  const hexAccent = $('#hexAccent');
  const hexBg = $('#hexBg');
  const hexCard = $('#hexCard');
  const hexText = $('#hexText');
  const defaultPage = $('#settingDefaultPage');
  const btnSaveTheme = $('#btnSaveTheme');
  const btnResetTheme = $('#btnResetTheme');
  const themeStatus = $('#themeStatus');
  const defaultPageStatus = $('#defaultPageStatus');

  const HEX_RE = /^#([0-9a-fA-F]{6})$/;

  // AI
  const apiBase = $('#aiApiBase');
  const apiKey = $('#aiApiKey');
  const apiModel = $('#aiModel');
  const btnSaveAi = $('#btnSaveAi');
  const aiStatus = $('#aiStatus');

  let pendingIconDataUrl = null;

  // 工具函数
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

  function setSwatch(el, hex) {
    if (!el) return;
    if (HEX_RE.test(hex)) el.style.background = hex;
  }

  function syncThemeInputs(theme) {
    const t = { ...DEFAULT_THEME, ...theme };
    if (hexAccent) hexAccent.value = t.accent;
    if (hexBg) hexBg.value = t.bg;
    if (hexCard) hexCard.value = t.card;
    if (hexText) hexText.value = t.text;
    setSwatch(swatchAccent, t.accent);
    setSwatch(swatchBg, t.bg);
    setSwatch(swatchCard, t.card);
    setSwatch(swatchText, t.text);
  }

  function normalizeHex(raw, fallback) {
    let s = String(raw || '').trim();
    if (!s.startsWith('#')) s = `#${s}`;
    if (HEX_RE.test(s)) return s.toLowerCase();
    return fallback;
  }

  function readThemeFromInputs() {
    return {
      accent: normalizeHex(hexAccent?.value, DEFAULT_THEME.accent),
      bg: normalizeHex(hexBg?.value, DEFAULT_THEME.bg),
      card: normalizeHex(hexCard?.value, DEFAULT_THEME.card),
      text: normalizeHex(hexText?.value, DEFAULT_THEME.text),
    };
  }

  /** 输入时同步左侧色块；合法色值时即时预览主题 */
  function onHexInput(hexInput, swatch) {
    let v = hexInput.value.trim();
    if (v && !v.startsWith('#')) {
      v = `#${v}`;
      hexInput.value = v;
    }
    if (HEX_RE.test(v)) {
      setSwatch(swatch, v);
      applyTheme(readThemeFromInputs());
      hexInput.classList.remove('is-invalid');
    } else {
      hexInput.classList.add('is-invalid');
    }
  }

  // 打开/关闭抽屉
  async function openDrawer() {
    cachedSettings = null; // 清除缓存，强制从后端重新获取
    const settings = await loadSettings();
    syncBrandInputs(settings.brand);
    syncThemeInputs(settings.theme);
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

  // 绑定事件
  btnOpen?.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer?.classList.contains('is-open')) closeDrawer();
  });

  // 品牌图标选择
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

  // 保存品牌（仅 PATCH brand）
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

  // 重置品牌
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

  // 编辑 #hex → 更新左侧色块 + 实时预览
  const hexSwatchPairs = [
    [hexAccent, swatchAccent],
    [hexBg, swatchBg],
    [hexCard, swatchCard],
    [hexText, swatchText],
  ];
  hexSwatchPairs.forEach(([hexInput, swatch]) => {
    hexInput?.addEventListener('input', () => onHexInput(hexInput, swatch));
  });

  // 确认保存主题（仅 PATCH theme）
  btnSaveTheme?.addEventListener('click', async () => {
    const theme = readThemeFromInputs();
    const raws = [hexAccent, hexBg, hexCard, hexText].map((el) => el?.value?.trim() || '');
    const invalid = raws.some((v) => {
      let s = v.startsWith('#') ? v : `#${v}`;
      return !HEX_RE.test(s);
    });
    if (invalid) {
      setStatus(themeStatus, '请输入合法色值，如 #3b82f6', false);
      return;
    }
    try {
      await saveSettings({ theme });
      applyTheme(theme);
      syncThemeInputs(theme);
      setStatus(themeStatus, '已确认配色', true);
    } catch (err) {
      setStatus(themeStatus, '保存失败: ' + err.message, false);
    }
  });

  // 重置主题
  btnResetTheme?.addEventListener('click', async () => {
    try {
      const theme = { ...DEFAULT_THEME };
      await saveSettings({ theme });
      applyTheme(theme);
      syncThemeInputs(theme);
      setStatus(themeStatus, '已恢复默认', true);
    } catch (err) {
      setStatus(themeStatus, '重置失败: ' + err.message, false);
    }
  });

  // 默认页
  defaultPage?.addEventListener('change', async () => {
    try {
      await saveSettings({ defaultPage: defaultPage.value });
      onDefaultPageChange?.(defaultPage.value);
      setStatus(defaultPageStatus, '已保存', true);
    } catch (err) {
      setStatus(defaultPageStatus, '保存失败: ' + err.message, false);
    }
  });

  // 保存 AI 设置（仅 PATCH ai）
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

  // 初始化：加载并应用设置
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
