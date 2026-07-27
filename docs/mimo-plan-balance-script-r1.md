# 课堂 · 分步配平（脚本式）— 需求与实施计划（给 mimo）

> **给**：mimo / 实现代理  
> **日期**：2026-07-27  
> **产品范围**：**R1 可教可用**（见 §6）；R2/R3 仅规划不实施  
> **仓库**：小黄的化学实验室 · 工作区以当前 `main` 为准  
> **维护入口**：先读 `skills/xiaohuang-project-maintenance/SKILL.md`  
> **明确不做**：云同步、全班实时同步、仅靠 AI 判对、改动 `server/data/` 用户库、手改 `dist/` / `server/public/` / 安装包产物  

---

## 0. 一句话目标

在「课堂」侧栏新增 **「分步配平」**，交互形态对齐 **实验探究**：

- **教师**：预先编写配平脚本（起式、目标配平式、分步讲解；可选预测题）。  
- **学生/大屏**：一页一步走流程，改系数或只读讲解，**本地引擎**校验守恒与目标式。  
- **AI（R1 可不做）**：辅助生成草稿或讲解，**不得作为对错唯一依据**。

与计算页「配平方程」区分：**计算页 = 工具一键结果**；**本功能 = 教学脚本**。

---

## 1. 背景与可复用资产

| 能力 | 路径 | 复用方式 |
|------|------|----------|
| 实验探究 UI 范式 | `src/ai-classroom/lab-shell.js`、`lab-model.js`、`lab-views.js` | 列表 + 预习/脚本双 Tab、编辑/拖拽、导入导出思路 |
| Lab API / 安全导入 | `server/routes/labs.js`、`server/seed/import-labs.js`、`lab-schema.js` | CRUD、source、永不覆盖导入、校验拒绝占位 |
| 本地配平 + 守恒 | `src/equation-balance.js`（`balanceEquation`、`checkConservation`） | **最终判对铁律** |
| 计算页配平 UI | `src/molar-ui.js` | 参考结果展示；**不要把脚本塞进计算页** |
| AI 配平建议 | `POST /api/ai/balance`（`server/routes/ai/chemistry.js`） | R2 草稿/讲解；保存前必须本地再校验 |
| 化学键盘 | `src/chem-keypad.js` | 系数/方程式输入 |
| 课堂导航 | `src/ai-classroom.js` → `AI_SECTIONS` | 新增一节 `balance` |
| Electron stage | `scripts/stage-electron-server.js` | 新 `routes` 会进 COPY；**勿漏新目录**（参照 services 秒退事故） |

---

## 2. 产品需求

### 2.1 用户故事

1. **教师**：我能为一道未配平式写好分步讲解脚本并保存，下次上课直接打开演示。  
2. **学生/自学**：我按步骤看到「先看谁、改哪个系数、为什么」，做完后系统告诉我整式是否守恒且与目标一致。  
3. **教师（严格模式，R1 可选开关）**：学生必须填对当前步 `expectedCoef` 才能下一步。  
4. **默认宽松**：可「下一步」跳过填空，只读 tip（适合大屏灌输）。

### 2.2 导航与信息架构

- 课堂侧栏新增一项：  
  - `id: 'balance'`  
  - `title: '分步配平'`  
  - `desc: '脚本演示 · 逐步学配平'`  
- 主区布局对齐实验探究：  
  - **左**：脚本列表（标题、难度角标、进度）  
  - **右**：`练习 | 脚本` 两个 Tab（命名可用「练习」「脚本」，与 lab 的「预习|脚本」同构）

### 2.3 练习模式（学生向）R1

| 能力 | 要求 |
|------|------|
| 展示 | 起式 `startEquation`；物种顺序固定，**只改整数系数**（默认空或 1，产品选一种并写死） |
| 步进 | 一页一步：`label`、`tip`、可选 `focus` 高亮某物种 |
| 输入 | 当前步若 `action === 'set_coef'`，焦点物种显示数字输入 + 软键盘 |
| 校验 | 见 §4；错误红字提示，不崩溃 |
| 完成 | 最后一步或「检查整式」：与 `targetEquation` 等价（系数约分后一致）且 `checkConservation` 通过 |
| 进度 | `localStorage` 键如 `balance-script-progress`（结构自定，换脚本隔离） |
| AI | **R1 不做** |

### 2.4 脚本模式（教师向）R1

| 能力 | 要求 |
|------|------|
| 列表 | 内置 + 自定义；编辑态删除/排序（可简化为仅删除，排序 R2） |
| 字段 | 标题、起式、目标式、步骤数组（label、tip、focus、action、expectedCoef 可选） |
| 保存 | 经 schema 校验；任意改内置 → `source=custom`（同 lab） |
| 重置 | 内置项可 `reset` 回 seed（同 lab 模式） |
| AI 生成草稿 | **R1 不做** |

### 2.5 非目标（R1）

- 导入/导出 pack、备课包挂接  
- 预测题 predict、掌握度/错题本写入  
- 离子方程式、氧化还原半反应扩展  
- 云同步、多端进度  
- 替换或删除计算页配平工具  

---

## 3. 数据模型

### 3.1 表 `balance_scripts`（SQLite）

```sql
CREATE TABLE IF NOT EXISTS balance_scripts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  grade TEXT DEFAULT '',
  difficulty TEXT DEFAULT '',
  start_equation TEXT NOT NULL,
  target_equation TEXT NOT NULL,
  species_json TEXT NOT NULL,   -- 见下
  steps_json TEXT NOT NULL,     -- 见下
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT DEFAULT 'custom', -- builtin | custom
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

初始化：在 `server/db/init.sql` 或运行时 `CREATE TABLE IF NOT EXISTS`（与 labs 一致选一种，**推荐 ensure 时建表**）。

### 3.2 `species_json`

从起式解析并固化，避免学生改化学式：

```js
{
  left:  [{ formula: "Fe", coef: 1 }, { formula: "O2", coef: 1 }],
  right: [{ formula: "Fe2O3", coef: 1 }]
}
```

- `formula`：物种化学式（无系数，可用 Unicode 下标或 ASCII，**全库统一**；推荐存 ASCII，展示时格式化）。  
- 初始 `coef`：练习开始时的系数（通常全 1）。

保存时：若教师只填了 `startEquation`/`targetEquation`，服务端或前端用 `equation-balance` 的解析逻辑拆 species；**target 必须能通过守恒校验**。

### 3.3 `steps_json`

```js
[
  {
    label: "观察未配平式",
    tip: "先数 Fe、O 原子个数，确定谁先配。",
    action: "explain",           // explain | set_coef | check
    focus: null,                 // 或 { side: "left"|"right", index: number }
    expectedCoef: null,          // set_coef 时可选；严格模式用
    // R2: predict, aiHintPrompt
  },
  {
    label: "配平铁",
    tip: "氧化物中 Fe 为 2，反应物 Fe 系数取 4…",
    action: "set_coef",
    focus: { side: "left", index: 0 },
    expectedCoef: 4
  },
  {
    label: "检查守恒",
    tip: "核对左右 Fe、O 是否相等。",
    action: "check",
    focus: null,
    expectedCoef: null
  }
]
```

约束：

- `steps.length`：1～12  
- `label` 非空  
- `action=set_coef` 时 `focus` 必填且 index 落在 species 范围内  
- 不接受空 tip 占位「请填写」之类（与 lab-schema 精神一致）

### 3.4 包格式（R2，R1 可只定义不实现）

```js
{
  format: "xiaohuang-balance-pack",
  version: 1,
  exportedAt: ISO,
  scripts: [ /* 上表字段子集 */ ]
}
```

导入：**永不覆盖**已有 id；冲突新 id +「（导入）」；强制 `custom`。

### 3.5 内置样例（R1 至少 3 条）

写在 `server/seed/balance-builtin.js`，`ensureBalanceScriptsSeeded` 只 insert 缺失 id：

| 建议 id | 主题 | 起式示例 |
|---------|------|----------|
| `bal-h2o` | 氢氧燃烧 | `H2 + O2 → H2O` |
| `bal-fe-o2` | 铁生锈/燃烧示意 | `Fe + O2 → Fe2O3` |
| `bal-ch4` | 甲烷燃烧 | `CH4 + O2 → CO2 + H2O` |

每条需完整 `steps`（中文 tip），`targetEquation` 必须本地守恒。

---

## 4. 校验与判对规则（铁律）

1. **目标式** `targetEquation` 保存前：  
   - 可解析；  
   - `checkConservation` 为 true，或与 `balanceEquation(start)` 结果在约分后等价。  
2. **练习结束「整式检查」**：  
   - 将学生当前左右系数套到 species 上拼成式子；  
   - `checkConservation` 通过；  
   - 与 target 各物种系数在 **约分到最简** 后一致（允许整体倍数？**R1 建议要求最简一致**，避免 2/4/6 与 1/2/3 争议——或接受整数倍并在文案说明；**默认：约分后完全一致**）。  
3. **单步 `expectedCoef`**（宽松模式可跳过）：填了则 `Number` 比较。  
4. **禁止**用 AI 返回的 equation 直接当 saved target 而不过本地校验。

复用：`src/equation-balance.js` 导出函数；若缺「约分比较」工具函数，在同文件 **新增纯函数** `equationsEquivalent(a, b)` 并单测。

---

## 5. API 设计（R1）

前缀：`/api/balance-scripts`  
挂载：`server/index.js`  
客户端：`src/api/client.js` → `balanceScriptsApi`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | `{ scripts, builtinCount }` |
| GET | `/:id` | 单条 |
| POST | `/` | 创建，body 经 schema，`source=custom` |
| PUT | `/:id` | 更新，任意改 → `source=custom` |
| DELETE | `/:id` | 删除 |
| POST | `/:id/reset` | 仅 builtin 可重置 |
| POST | `/reorder` | 可选 R1；若做则全量 ids 校验（同 labs） |

**R1 可不做**：`/export`、`/import`、`/reset-builtin`  bulk。

响应形状与项目一致：`{ success, data, message }`。

---

## 6. 前端模块拆分（禁止单文件 1000+ 行堆料）

| 文件 | 职责 |
|------|------|
| `src/ai-classroom/balance-shell.js` | 控制器：列表、练习/脚本模式、API |
| `src/ai-classroom/balance-model.js` | 草稿↔payload、进度读写、拼装当前方程字符串 |
| `src/ai-classroom/balance-views.js` | 纯 HTML（列表、练习页、编辑页） |
| `src/chem/...` 或沿用 `equation-balance.js` | 等价性/守恒 |
| `src/styles/_balance-script.css` | 样式；在 `index.css` `@import` |
| `index.html` | `#aiSectionBalance` 容器、列表/详情骨架 |
| `src/ai-classroom.js` | `AI_SECTIONS` + controller 初始化 + section 切换 |

交互参考 `lab-shell`：`createBalanceShellController({ select, escapeHtml, balanceScriptsApi, aiApi? })`。

---

## 7. 实施阶段（mimo 必须按序）

### Phase 0 — 测试与契约

1. 读 `equation-balance.js` 公开 API，补 `equationsEquivalent`（若需要）+ 单测。  
2. 写 `test/balance-script-schema.test.cjs`（或并入 server 测试）：非法 title/steps/target 不守恒 → reject。  
3. **先失败测试再实现**。

### Phase 1 — 后端

1. `server/utils/balance-script-schema.js`  
2. `server/seed/balance-builtin.js` + `import-balance-scripts.js`（ensure 只补缺失）  
3. `server/routes/balance-scripts.js` + `index.js` 挂载  
4. `test/balance-scripts.test.cjs`：seed、CRUD、改 builtin→custom、reset  

### Phase 2 — 前端练习闭环

1. HTML section + 导航  
2. model + views + shell：列表、练习步进、系数输入、整式检查  
3. 进度 localStorage  
4. 软键盘挂到系数框  

### Phase 3 — 前端脚本编辑

1. 新建/编辑/保存/删除  
2. 内置 reset  
3. 保存前本地校验 target  

### Phase 4 — 验收

1. `npm test` 全绿  
2. `npm run build` 通过  
3. 手测 §9  

**R1 明确不做 AI 按钮**；预留 `aiApi` 注入即可。

---

## 8. 测试要求

| 测试文件 | 覆盖 |
|----------|------|
| `test/balance-script-schema.test.cjs` | 校验边界 |
| `test/balance-scripts.test.cjs` | API/seed/安全 source |
| 扩展 equation-balance 测试 | 守恒、等价约分 |
| 可选 module-boundaries | shell 被 classroom 引用 |

禁止：无测直接合大块 UI。

---

## 9. 手工验收路径

1. `npm --prefix server run dev` + 根目录 `npm run dev`。  
2. 课堂 → **分步配平** → 见 ≥3 条内置。  
3. 打开 `bal-fe-o2`（或实际 id）练习：逐步看 tip，改系数，完成检查通过。  
4. 故意填错系数 → 提示错误，不白屏。  
5. 脚本 Tab：改 tip 保存 → 列表 source 为自定义语义；reset 恢复。  
6. 切换到计算页配平工具仍可用（回归）。  
7. 刷新页面后进度是否按设计恢复或清空（按实现写进 README 注释即可）。

---

## 10. Definition of Done（R1）

- [ ] 课堂可见「分步配平」入口  
- [ ] 内置 ≥3 脚本，ensure 不覆盖用户修改  
- [ ] 练习可走完并本地判对  
- [ ] 教师可新建/编辑/删除自定义脚本  
- [ ] schema 拒绝坏数据；target 不守恒不可存  
- [ ] `npm test` / `npm run build` 通过  
- [ ] 未提交 `server/data/`、生成目录  
- [ ] 回复中附：文件列表、测试结果、手测结果、已知限制  

---

## 11. R2 / R3（本任务不实施，仅防范围蔓延）

| 阶段 | 内容 |
|------|------|
| R2 | 导入导出 pack、步骤 predict、AI 生成草稿与本步讲解、列表拖拽排序 |
| R3 | 逐步元素计数表、掌握度挂钩、离子/氧化还原 |

---

## 12. 风险

| 风险 | 缓解 |
|------|------|
| 复杂式本地配不平 | 内置只用小系数式；教师手写 target 并校验守恒 |
| 与 lab 代码复制膨胀 | model/views/shell 三分；可抄结构不抄糊成一文件 |
| Electron 打包漏文件 | 只加 routes 下文件；services 已在 stage |
| 系数倍数争议 | R1 规定约分后与 target 一致 |

---

## 13. 协作约定（mimo）

1. 先读本文件 + 项目 SKILL。  
2. Phase 0→1→2→3→4，**先测后码**。  
3. 判对只信 `equation-balance` 本地逻辑。  
4. 文案中学语气；不把 AI 当标准答案。  
5. 完成后输出变更清单与测试摘要。  

---

## 14. 参考锚点

```
src/ai-classroom.js          — AI_SECTIONS、selectSection
src/ai-classroom/lab-shell.js — 交互范式
src/equation-balance.js      — balanceEquation / checkConservation
src/molar-ui.js              — 配平工具 UI 参考
server/routes/labs.js        — API 形态
server/utils/lab-schema.js   — 校验风格
scripts/stage-electron-server.js — 打包目录
```

---

*文档路径：`docs/mimo-plan-balance-script-r1.md`。实现以本文件为准；若与口头讨论冲突，以「R1 范围 + 铁律」优先。*
