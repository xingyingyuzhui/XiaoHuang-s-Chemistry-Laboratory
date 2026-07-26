const express = require('express');
const router = express.Router();
const { queryOne } = require('../../db/sqlite');
const { success, error, badRequest } = require('../../utils/response');
const { normalizeApiBase, normalizeModel } = require('../../utils/ai-config');
const { validateMoleculePayload, rejectComplexPrompt } = require('../../utils/molecule-validate');
const { callDeepSeekChat } = require('../../services/ai/chat-service');

router.post('/generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return badRequest(res, '请输入要生成的分子描述');
    }

    // 紫杉醇 / 阿莫西林等：LLM 编坐标必然失真，直接拒绝
    const complexReason = rejectComplexPrompt(prompt);
    if (complexReason) {
      return badRequest(res, complexReason);
    }

    // 从数据库读取 AI 设置
    const settingsRow = queryOne("SELECT value FROM settings WHERE key = 'ai'");
    let aiSettings = {};

    if (settingsRow) {
      try {
        aiSettings = JSON.parse(settingsRow.value);
      } catch (e) {
        console.warn('解析 AI 设置失败:', e);
      }
    }

    const apiKey = aiSettings.apiKey;
    if (!apiKey) {
      return badRequest(res, '请先在设置 → AI 中填写 DeepSeek API Key');
    }

    const { base: apiBase } = normalizeApiBase(aiSettings.apiBase);
    const model = normalizeModel(aiSettings.model);

    // System Prompt
    const systemPrompt = `你是高中化学教学助手，负责生成可用于 3D 球棍模型展示的**小分子**结构数据。
用户会用中文描述分子名称、化学式或用途。你必须只输出一个 JSON 对象，不要 Markdown 代码块，不要其它说明文字。

JSON 字段：
{
  "name": "中文名",
  "formula": "化学式（可用 unicode 下标如 H₂O，也可用 H2O）",
  "desc": "一两句中文教学说明",
  "atoms": [ { "el": "元素符号", "x": 数字, "y": 数字, "z": 数字 } ],
  "bonds": [ [原子索引i, 原子索引j], ... ],
  "physics": {
    "state": "常温状态（固态/液态/气态）",
    "density": "密度（如 1 g/cm³）",
    "meltingPoint": "熔点（如 0°C）",
    "boilingPoint": "沸点（如 100°C）"
  },
  "chemistry": {
    "acidity": "酸碱性（如 酸性/碱性/中性）",
    "solubility": "溶解性（如 易溶/微溶/难溶）",
    "reactivity": "化学活性（如 稳定/活泼/强氧化性）"
  }
}

规则（必须遵守）：
1. el 必须是合法元素符号（H, C, O, N, Cl, S, P, Na, Fe 等），首字母大写。
2. 坐标为埃(Å)量级，分子居中，**相邻成键原子间距约 1.0～1.8**，不要把所有原子堆在原点。
3. bonds 索引从 0 开始，必须在 atoms 范围内；单键写一次 [i,j]，双键写两次，三键写三次。
4. **原子总数 2～18 个**（含氢）。葡萄糖等可含氢到上限内；更大的分子禁止输出。
5. **禁止**输出紫杉醇、阿莫西林、蛋白质、聚合物等复杂药物/生物大分子的完整结构。
6. 若用户要的是复杂分子：不要硬编坐标，应改输出一个**高中可教的相关小分子**（如青霉素→简化内酰胺示例可改为「乙酸」或「苯」并在 desc 说明「原请求过复杂，已改为…」）。
7. physics 和 chemistry 用简洁中文。
8. 只输出 JSON。`;

    let content;
    try {
      const chat = await callDeepSeekChat({
        system: systemPrompt,
        user: `请为以下描述生成分子 JSON：\n${prompt.trim()}`,
        temperature: 0.3,
        max_tokens: 4096,
        kind: 'mol-generate',
      });
      content = chat.content;
    } catch (e) {
      const status = e.status || 502;
      if (status === 400) return badRequest(res, e.message);
      if (status === 429) {
        return res.status(429).json({
          success: false,
          message: e.message,
          data: null,
        });
      }
      return error(res, e.message || 'DeepSeek 请求失败', status >= 400 ? status : 502);
    }

    // 提取 JSON
    let parsed;
    try {
      parsed = JSON.parse(content.trim());
    } catch (e1) {
      let s = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      try {
        parsed = JSON.parse(s);
      } catch (e2) {
        const a = s.indexOf('{');
        const b = s.lastIndexOf('}');
        if (a >= 0 && b > a) {
          let jsonStr = fixJson(s.slice(a, b + 1));
          parsed = JSON.parse(jsonStr);
        } else {
          return error(res, '模型返回不是合法 JSON', 502);
        }
      }
    }

    // 验证 + 几何松弛 + 质量检查（fromAi 更严格）
    let validated;
    try {
      validated = validateMoleculePayload(parsed, {
        fromAi: true,
        strictGeometry: true,
        relax: true,
        maxAtoms: 24,
      });
    } catch (ve) {
      return badRequest(
        res,
        ve.message ||
          '生成的 3D 结构不可靠。请改用高中常见小分子（乙醇、苯、葡萄糖等）重试。',
      );
    }

    success(res, validated);
  } catch (err) {
    console.error('AI 生成分子失败:', err);
    error(res, err.message || 'AI 生成失败');
  }
});


module.exports = router;

