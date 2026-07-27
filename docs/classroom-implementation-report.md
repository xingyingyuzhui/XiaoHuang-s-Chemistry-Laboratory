# 课堂功能实现报告

> 项目：小黄的化学实验室（`/Users/qin/Desktop/teacher`）
> 日期：2026-07-27
> 基线：`npm test` 49 pass / `npm run build` 通过 / `npm run build:frontend` 已同步 `server/public`

---

## 一、完成内容

### P0-A. 预习互动覆盖全部 5 个实验

所有实验脚本均可在"交互式预习"模式下操作。

| labId | 标题 | 步骤数 | 侧重知识点 |
|-------|------|--------|------------|
| `lab-o2` | 实验室制氧气（高锰酸钾） | 5 | 气密性检查、棉花作用、试管口方向、验满、防倒吸 |
| `lab-h2` | 氢气燃烧与验纯 | 4 | 收集方法、验纯必要性、爆鸣含义、产物水珠 |
| `lab-co2` | 实验室制二氧化碳 | 4 | 不用稀硫酸原因、气密性、向上排空气法、石灰水检验 |
| `lab-neutralize` | 酸碱中和 | 4 | 酚酞颜色、滴加操作、终点判定、中和本质 H⁺+OH⁻ |
| `lab-ester` | 乙酸乙酯化 | 4 | 加料顺序（浓硫酸）、酯化机理、可逆与产率、防倒吸 |

配置 schema：

```js
{
  objective: string,
  reagents: string[],
  apparatus: string[],
  steps: [{
    label: string,
    tip: string,
    predict?: { question: string, options: [×4], answer: 0|1|2|3, explanation: string },
    risk?: string,
  }],
  summary: string,
}
```

涉及文件：`src/data/lab-prestudy-config.js`

测试：`test/lab-prestudy.test.cjs` — 5 条（结构校验、全覆盖、null 返回、配置引用、ID 一致性）

---

### P0-B. 离线题库单源 + 生成脚本

**问题**：`src/data/offline-quiz-bank.js`（ESM）和 `server/seed/offline-quiz-bank.js`（CJS）内容相同但无生成管线，MD5 因格式不同。

**方案**：

- 新增 `scripts/sync-offline-quiz-bank.mjs`：动态 import ESM 源，`JSON.stringify` 序列化写出 CJS seed
- `package.json` 新增 `"sync:offline-bank"` 脚本
- seed 文件头已标注"auto-generated, do not hand-edit"
- 新增 drift 测试：按 `sourceQuestionId` 对齐后逐字段比较 `stem` / `answer` / `options`

使用方式：

```bash
npm run sync:offline-bank
```

涉及文件：`scripts/sync-offline-quiz-bank.mjs`、`package.json`、`test/offline-quiz.test.cjs`

---

### P1-A. 知识地图分类减误分

**问题**：短且多义的关键词（如"酸"、"铁"）在 stem 中单独出现时容易误分到错误知识点。

**方案**：

1. **短歧义词黑名单**（`SHORT_AMBIGUOUS`）：酸/碱/盐/碳/铁/铜/钠/铝/硅/氯/硫/氮/醇/醛/酯/烃/计算/检验
   - 仅当 knowledge 字段包含时才单独生效
   - stem 中单独出现时跳过（避免被更短关键词抢占）
2. **knowledge 字段加权**：命中时长度等效翻倍（×2），优先于 stem
3. **年份 knowledge 识别**：knowledge 像 `2010年高考` 时不加权

涉及文件：`server/routes/mastery.js`、`test/mastery-map.test.cjs`

测试新增 2 条：短歧义词不误分、knowledge 字段加权

---

## 二、测试结果

```
$ npm test

✔ 49 tests, 0 failures
```

全部测试文件及条数：

| 测试文件 | 条数 | 覆盖范围 |
|----------|------|----------|
| `test/mastery-map.test.cjs` | 7 | 空数据、正确率、排序、薄弱、最长匹配、短歧义、knowledge 加权 |
| `test/lesson-packs.test.cjs` | 5 | CRUD、导出导入往返、格式校验、同名冲突、敏感字段排除 |
| `test/lab-prestudy.test.cjs` | 5 | 结构校验、全覆盖、null 返回、配置引用、ID 一致性 |
| `test/offline-quiz.test.cjs` | 8 | 题库元数据、HTML 表格、ESM/CJS 同步、list/generate/submit/years |
| 其它既有测试 | 24 | 分子、设置、AI、battle、安全头、数据库锁等 |

---

## 三、构建结果

```
$ npm run build
✓ 108 modules transformed. built in 785ms

$ npm run build:frontend
前端已复制到 .../server/public
```

产物：`dist/` + `server/public/` 已同步。

---

## 四、修改文件清单

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/ai-classroom/mastery-map.js` | 知识地图前端模块 |
| `src/ai-classroom/lab-prestudy.js` | 交互式预习前端模块 |
| `src/ai-classroom/lesson-packs.js` | 备课包前端模块 |
| `src/data/lab-prestudy-config.js` | 实验互动配置数据（5 个实验） |
| `server/routes/mastery.js` | 知识地图 API（`/api/mastery`） |
| `server/routes/lesson-packs.js` | 备课包 API（`/api/lesson-packs`） |
| `scripts/sync-offline-quiz-bank.mjs` | 离线题库 ESM→CJS 同步脚本 |
| `test/mastery-map.test.cjs` | 知识地图测试（7 条） |
| `test/lab-prestudy.test.cjs` | 实验预习测试（5 条） |
| `test/lesson-packs.test.cjs` | 备课包测试（5 条） |

### 修改文件

| 文件 | 变更 |
|------|------|
| `server/index.js` | 挂载 `/api/mastery`、`/api/lesson-packs` |
| `src/ai-classroom.js` | 导入 3 个新模块；新增 3 个导航项；实验模式切换逻辑 |
| `src/api/client.js` | 新增 `masteryApi`、`lessonPackApi` 客户端 |
| `index.html` | 新增知识地图/实验预习/备课包 3 个 section + 实验模式切换 tabs |
| `src/styles/_ai-classroom.css` | 新增实验模式切换、预习步骤、知识地图、备课包样式（约 390 行） |
| `package.json` | +`sync:offline-bank` script |
| `test/offline-quiz.test.cjs` | +drift 检测测试 |
| `test/mastery-map.test.cjs` | +短歧义词、knowledge 加权测试 |

### 未修改（按计划）

- `README.md`（本轮未改，按用户要求）
- `server/data/*.db`（用户数据，不动）
- `dist/`、`server/public/`（构建产物，由 build 脚本生成）

---

## 五、架构速查

```
浏览器
  index.html 区块
    → src/ai-classroom.js  装配 createXxxController
      → src/ai-classroom/*.js   UI 逻辑
      → src/api/client.js       fetch /api/*
      → src/data/*              纯数据

Express (server/index.js)
  /api/offline-quiz  → server/routes/offline-quiz.js  + server/seed/offline-quiz-bank.js
  /api/mastery       → server/routes/mastery.js       + quiz_items / quiz_wrong_book
  /api/lesson-packs  → server/routes/lesson-packs.js  + lesson_packs SQLite 表
  /api/quiz          → 既有智能出题（共用 session / wrong_book）
```

---

## 六、遗留项（按优先级）

| 优先级 | 项目 | 状态 |
|--------|------|------|
| P1-B | 知识地图指标口径文案说明 | 待做（需产品确认文案） |
| P1-C | 备课包体验打磨（年级分组、导入后自动跳转） | 待做 |
| P2-A | 离线试卷持久化（`offlinePapers` 仅内存 Map） | 默认建议先做 UI 友好错误文案 |
| P2-B | 侧栏信息架构调整 | 需产品确认后再改 |

---

## 七、手动冒烟清单

1. **离线题库**：切换年份 → 预览数量变化 → 开始练习 → 交卷 → 侧栏错题角标增加
2. **知识地图**：有数据时薄弱在前；错题本有题时对应知识点有「错题」计数
3. **预习**：5 个实验均可用"交互式预习"模式走完，有解析和总结，进度写入 localStorage
4. **备课包**：新建 → 勾选知识点+实验 → 保存 → 详情显示 → 导出/导入
