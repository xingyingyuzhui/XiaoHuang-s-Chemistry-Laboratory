const express = require('express');
const router = express.Router();
const { query, queryOne, run } = require('../db/sqlite');
const { success, error, badRequest } = require('../utils/response');
const {
  DEFAULT_API_BASE,
  DEFAULT_MODEL,
  normalizeApiBase,
  normalizeModel,
} = require('../utils/ai-config');

const MAX_ICON_DATA_URL = 700 * 1024; // ~700KB

// 默认设置
const DEFAULT_SETTINGS = {
  brand: {
    title: '小黄的化学实验室',
    iconDataUrl: null,
  },
  theme: {
    id: 'default',
  },
  defaultPage: 'table',
  electronOrder: [],
  ai: {
    apiBase: DEFAULT_API_BASE,
    apiKey: '',
    model: DEFAULT_MODEL,
  },
};

const MASKED_KEY_PLACEHOLDER = '__MASKED_API_KEY__';

function maskApiKey(key) {
  if (!key) return MASKED_KEY_PLACEHOLDER;
  if (key.length < 10) return MASKED_KEY_PLACEHOLDER;
  return key.slice(0, 4) + '***' + key.slice(-2);
}

function isMaskedKey(key) {
  if (typeof key !== 'string' || !key) return false;
  if (key === MASKED_KEY_PLACEHOLDER) return true;
  return /^.{1,8}\*\*\*.{0,8}$/.test(key) && key.includes('***');
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return patch;
  }
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      base[k] &&
      typeof base[k] === 'object' &&
      !Array.isArray(base[k])
    ) {
      out[k] = deepMerge(base[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function readSettingObject(key, fallback) {
  const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return { ...fallback };
  try {
    const parsed = JSON.parse(row.value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return deepMerge(fallback, parsed);
    }
  } catch {
    /* ignore */
  }
  return { ...fallback };
}

function validateIconDataUrl(url) {
  if (url == null || url === '') return null;
  const s = String(url);
  if (s.length > MAX_ICON_DATA_URL) {
    throw new Error('图标过大（请压缩到约 500KB 以内）');
  }
  if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(s)) {
    throw new Error('图标格式无效（仅支持 png/jpeg/webp/gif data URL）');
  }
  return s;
}

/**
 * GET /api/settings
 */
router.get('/', (req, res) => {
  try {
    const rows = query('SELECT key, value FROM settings');
    const settings = {
      brand: { ...DEFAULT_SETTINGS.brand },
      theme: { ...DEFAULT_SETTINGS.theme },
      defaultPage: DEFAULT_SETTINGS.defaultPage,
      electronOrder: [...DEFAULT_SETTINGS.electronOrder],
      ai: { ...DEFAULT_SETTINGS.ai },
    };

    rows.forEach((row) => {
      try {
        const value = JSON.parse(row.value);
        if (row.key === 'brand' || row.key === 'theme' || row.key === 'ai') {
          settings[row.key] = deepMerge(settings[row.key], value);
        } else {
          settings[row.key] = value;
        }
      } catch (e) {
        console.warn(`解析设置失败: ${row.key}`, e);
      }
    });

    // 纠正非法 apiBase
    const { base } = normalizeApiBase(settings.ai?.apiBase);
    settings.ai.apiBase = base;
    settings.ai.model = normalizeModel(settings.ai?.model);

    if (settings.ai && settings.ai.apiKey) {
      settings.ai.apiKey = maskApiKey(settings.ai.apiKey);
    }

    success(res, settings);
  } catch (err) {
    console.error('获取设置失败:', err);
    error(res, '获取设置失败');
  }
});

/**
 * PUT /api/settings
 * 嵌套对象深合并；apiKey 脱敏占位保留旧值；apiBase 白名单
 */
router.put('/', (req, res) => {
  try {
    const patch = req.body;
    if (!patch || typeof patch !== 'object') {
      return badRequest(res, '无效的设置数据');
    }

    const keys = Object.keys(patch);
    for (const key of keys) {
      if (patch[key] === undefined) continue;

      if (key === 'ai' && patch.ai && typeof patch.ai === 'object') {
        const oldAi = readSettingObject('ai', DEFAULT_SETTINGS.ai);
        let nextAi = deepMerge(oldAi, patch.ai);

        // 脱敏 key 或未传 key：保留旧值
        if (
          patch.ai.apiKey === undefined ||
          patch.ai.apiKey === null ||
          isMaskedKey(patch.ai.apiKey)
        ) {
          nextAi.apiKey = oldAi.apiKey || '';
        }

        const { base, rejected } = normalizeApiBase(nextAi.apiBase);
        if (rejected) {
          console.warn('拒绝非法 apiBase，已回退默认:', nextAi.apiBase);
        }
        nextAi.apiBase = base;
        nextAi.model = normalizeModel(nextAi.model);

        upsertSetting('ai', nextAi);
        continue;
      }

      if (key === 'brand' && patch.brand && typeof patch.brand === 'object') {
        const oldBrand = readSettingObject('brand', DEFAULT_SETTINGS.brand);
        let nextBrand = deepMerge(oldBrand, patch.brand);
        if (Object.prototype.hasOwnProperty.call(patch.brand, 'iconDataUrl')) {
          nextBrand.iconDataUrl = validateIconDataUrl(patch.brand.iconDataUrl);
        }
        if (nextBrand.title != null) {
          nextBrand.title = String(nextBrand.title).slice(0, 80);
        }
        upsertSetting('brand', nextBrand);
        continue;
      }

      if (key === 'theme' && patch.theme && typeof patch.theme === 'object') {
        const oldTheme = readSettingObject('theme', DEFAULT_SETTINGS.theme);
        const nextTheme = deepMerge(oldTheme, patch.theme);
        upsertSetting('theme', nextTheme);
        continue;
      }

      if (key === 'electronOrder') {
        const order = Array.isArray(patch.electronOrder)
          ? patch.electronOrder.map(Number).filter((n) => Number.isFinite(n))
          : [];
        upsertSetting('electronOrder', order);
        continue;
      }

      if (key === 'defaultPage') {
        const page = String(patch.defaultPage || 'table');
        const allowed = ['table', 'molecule', 'molar', 'electron', 'ai'];
        upsertSetting(
          'defaultPage',
          allowed.includes(page) ? page : 'table',
        );
        continue;
      }

      // 其它未知 key：整值写入（兼容扩展）
      if (patch[key] !== null) {
        upsertSetting(key, patch[key]);
      }
    }

    success(res, null, '设置已保存');
  } catch (err) {
    console.error('保存设置失败:', err);
    if (err.message && /图标/.test(err.message)) {
      return badRequest(res, err.message);
    }
    error(res, '保存设置失败');
  }
});

function upsertSetting(key, value) {
  const existing = queryOne('SELECT key FROM settings WHERE key = ?', [key]);
  const json = JSON.stringify(value);
  if (existing) {
    run('UPDATE settings SET value = ? WHERE key = ?', [json, key]);
  } else {
    run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, json]);
  }
}

module.exports = router;
