const express = require('express');
const router = express.Router();
const { query, queryOne, run } = require('../db/sqlite');
const { success, error } = require('../utils/response');

// 默认设置
const DEFAULT_SETTINGS = {
  brand: {
    title: '小黄的化学实验室',
    iconDataUrl: null
  },
  theme: {
    accent: '#3b82f6',
    bg: '#f0f4f8',
    card: '#ffffff',
    text: '#1e293b'
  },
  defaultPage: 'table',
  /** 电子排布列表顺序（元素序数 z 数组）；空则前端用默认顺序 */
  electronOrder: [],
  ai: {
    apiBase: 'https://api.deepseek.com',
    apiKey: '',
    model: 'deepseek-v4-flash'
  }
};

/**
 * API Key 脱敏
 * 规则：显示前4位 + *** + 后2位
 */
function maskApiKey(key) {
  if (!key || key.length < 10) return '***';
  return key.slice(0, 4) + '***' + key.slice(-2);
}

/**
 * 检查是否是脱敏后的 key
 */
function isMaskedKey(key) {
  return key && key.includes('***');
}

/**
 * GET /api/settings
 * 获取设置（apiKey 脱敏）
 */
router.get('/', (req, res) => {
  try {
    // 从数据库读取所有设置
    const rows = query('SELECT key, value FROM settings');

    // 合并默认设置
    const settings = { ...DEFAULT_SETTINGS };
    rows.forEach(row => {
      try {
        const value = JSON.parse(row.value);
        if (row.key === 'brand' || row.key === 'theme' || row.key === 'ai') {
          settings[row.key] = { ...settings[row.key], ...value };
        } else {
          settings[row.key] = value;
        }
      } catch (e) {
        console.warn(`解析设置失败: ${row.key}`, e);
      }
    });

    // 对 apiKey 进行脱敏
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
 * 更新设置
 */
router.put('/', (req, res) => {
  try {
    const newSettings = req.body;

    if (!newSettings || typeof newSettings !== 'object') {
      return error(res, '无效的设置数据', 400);
    }

    // 处理 AI 设置中的 apiKey
    if (newSettings.ai) {
      // 如果 apiKey 是脱敏的（包含 ***），则保留数据库中原来的值
      if (isMaskedKey(newSettings.ai.apiKey)) {
        const existingAi = queryOne("SELECT value FROM settings WHERE key = 'ai'");
        if (existingAi) {
          try {
            const oldAi = JSON.parse(existingAi.value);
            newSettings.ai.apiKey = oldAi.apiKey || '';
          } catch (e) {
            newSettings.ai.apiKey = '';
          }
        } else {
          newSettings.ai.apiKey = '';
        }
      }
    }

    // 更新设置
    Object.entries(newSettings).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        // 检查是否已存在
        const existing = queryOne('SELECT key FROM settings WHERE key = ?', [key]);
        if (existing) {
          run('UPDATE settings SET value = ? WHERE key = ?', [JSON.stringify(value), key]);
        } else {
          run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
        }
      }
    });

    success(res, null, '设置已保存');
  } catch (err) {
    console.error('保存设置失败:', err);
    error(res, '保存设置失败');
  }
});

module.exports = router;
