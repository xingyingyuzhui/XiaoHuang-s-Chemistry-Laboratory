# 配平结果展示约定（`=` + 状态符号）— 完整实施计划

> **For agentic workers:** 严格按 Phase 顺序落地；每 Phase 独立可测、可回滚。改引擎契约，**禁止**在各 UI 各自发明 format/annotate 规则。

**Goal:** 配平结果统一中学课本写法——中间 **`=`**；输入通常不写 ↑↓，**配平成功后再标注**常见气体 ↑ / 沉淀 ↓。本地宽白名单保底；**AI 建议**路径再合并模型标注。系数与守恒始终以本地引擎为准。

**Non-goal / 本轮明确不做:**

- 不重写配平求解算法（brute-force / maxCoef）
- 不改实验探究 / 3D 反应 / 离线题库的剧本文案（不走配平引擎）
- 不批量改 builtin 配平种子加 ↑↓
- 不改 `src/molar.js`（摩尔质量独立解析器）
- 不在 P0 同时改课堂 hero / schema（避免身份键与存盘连环坏）

**Plan path:** `docs/superpowers/plans/2026-09-09-equation-format-state-markers.md`

---

## 0. 背景与现状（调查摘要）

### 0.1 用户诉求

| 问题 | 期望 |
| --- | --- |
| 结果中间是 `→` | 应为 **`=`** |
| 气体/沉淀符号 | 上课输入一般不写；**配平后生成**；贴近课本多标 |
| AI 配平 | 用 AI 时要**更强**的状态标注能力，不能只靠白名单 |
| 其它配平处 | 课堂分步配平等同类问题一并治理（分 Phase） |

### 0.2 现状代码

| 位置 | 行为 |
| --- | --- |
| `src/equation-balance.js` · `formatEq` | 写死 `→`；↑↓ 若在输入中会「碰巧」留在 `formula` 字符串 |
| `src/molar-ui.js` | 本地/AI 都最终走 `balanceEquation`；AI 先 `→`→`=` 再本地重跑 |
| `balance-model.js` · `buildEquation` | 又一套写死 `→` |
| `balance-views.js` | 练习大箭头 HTML 写死 `→` |
| AI `generateBalance` | prompt 要求 `→`，不要求 ↑↓ |
| `server/utils/eq-sides.js` | 解析镜像，**无** format/annotate |
| `balance-script-schema.js` | `FORMULA_SAFE_RE` **拒绝** ↑↓；存盘只留 `{formula,coef}` |
| 实验/3D/题库 | 作者手写 ↑↓，**不经**本引擎 |

### 0.3 依赖面（会受影响的调用方）

```
src/equation-balance.js
  ├─ molar-ui.js          （计算·配平）
  └─ balance-model.js
       ├─ balance-shell.js
       └─ balance-views.js

server/utils/eq-sides.js
  └─ balance-script-schema.js
       ├─ routes/balance-scripts.js
       └─ seed/import-balance-scripts.js
```

---

## 1. 产品 / 教学约定

| 项 | 约定 |
| --- | --- |
| 输入 | 化学式 + 系数；**通常不写** ↑↓ |
| 结果分隔符 | 统一 **`=`** |
| 状态符号时机 | **配平成功后**标注 |
| 标注范围 | 仅**生成物**；反应物不加 |
| 已有标记 | 用户/上游已写的 `marker` **不覆盖** |
| `H2O` | **不加** ↑ |
| 本地 | 课本向**宽白名单**（离线保底） |
| AI | 「AI 建议」：系数本地权威；marker = AI∪白名单合并 |
| 文案 | 结果区可注「状态符号为课本示意」 |

---

## 2. 目标架构

```
输入式子
  → parseSpecies
       · 尾部 ↑/↓ → marker 字段
       · formula 永不含 ↑↓
       · 原子计数只看 formula
  → balance 系数（现有算法，不变）
  → annotateLocal(right)          // 宽白名单，仅空 marker
  → [AI 路径] mergeAiMarkers(...) // AI 合法 marker 优先，否则白名单
  → formatEquation(sep='=')       // 唯一拼串：pretty(formula)+marker
```

### 2.1 数据契约

```ts
// 内部 / 可选持久化
{ coef: number, formula: string /* 无↑↓ */, marker: '' | '↑' | '↓', counts?: object }
```

### 2.2 铁律（防回归）

1. **`formula` 永不含 ↑↓**；比较等价 / 步骤对齐 / 守恒 **忽略 marker**  
2. 只有 `formatEquation` 负责展示拼接与 `=`  
3. 旧数据 dual-read：`formula` 尾部 ↑↓ → 拆到 `marker`  
4. 禁止在 `molar-ui` / `balance-views` 各自写 annotate 列表  

---

## 3. 本地白名单（贴近课本，偏宽）

引擎内常量（首版内联；P3 可外置）。

**气体 ↑（仅生成物）：**  
`H2 O2 N2 Cl2 F2 Br2 I2`  
`CO2 CO NO NO2 N2O SO2 SO3 H2S NH3 HCl HF HBr HI`  
`CH4 C2H4 C2H2 PH3 O3`  
**排除：** `H2O`

**沉淀 ↓（仅生成物）：**  
`AgCl AgBr AgI Ag2S Ag2CO3`  
`BaSO4 BaCO3 Ba3(PO4)2`  
`CaCO3 CaSO4 CaC2O4 MgCO3`  
`PbSO4 PbI2 PbS`  
`Cu(OH)2 Fe(OH)2 Fe(OH)3 Al(OH)3 Zn(OH)2 Mg(OH)2 Mn(OH)2`  
`CuS FeS ZnS CdS`

匹配：规范化 ASCII formula（去下标）；仅 `right`；`marker` 已非空则跳过。

---

## 4. AI 能力（计算页「AI 建议」）

### 4.1 目标流水线（`runBalanceAi`）

1. 调 `POST /api/ai/balance`  
2. 本地 `balanceEquation`（系数 + 白名单 annotate）  
3. `mergeAiMarkers(aiEquation, localSides)`：  
   - 物种对齐用**无标记 formula**  
   - 仅合并**生成物**上的 ↑/↓  
   - AI 合法 marker 优先，否则保留本地白名单  
   - 丢弃反应物上的 AI 乱标  
4. `formatEquation` → 结果区 + 可选写回输入框  
5. 守恒校验用最终式（无需脆弱的单次 `replace('→','=')`）

### 4.2 Prompt（`generateBalance`）

```
配平后用 = 连接左右。
输入通常不写气体/沉淀符号；请在生成物上按中学习惯补 ↑（气体）或 ↓（沉淀）。
反应物不要加 ↑↓；H2O 一般不加。
只输出 JSON：{ "equation": "...", "steps": ["..."] }
```

### 4.3 降级

| 情况 | 行为 |
| --- | --- |
| 无 Key / 超时 / 非 JSON | 等同本地配平（白名单标注） |
| AI 只给系数不给 ↑↓ | 白名单补齐 |
| AI 给反应物加 ↑ | 合并时丢弃 |

---

## 5. Phase 完整清单

### P0 — 引擎契约 + 单测（计算页自然受益）

**目标:** 本地配平输出 `=` + 课本向标注；不破坏课堂存盘。

| 步骤 | 内容 | 文件 |
| --- | --- | --- |
| P0.1 | 补表征测试（改前锁现行为：含 `→`、无自动 ↑） | `test/equation-balance-format.test.cjs` |
| P0.2 | `parseSpecies`：尾部 ↑↓ → `marker`；formula 纯净；拒绝非尾部乱符（收紧跳过逻辑） | `src/equation-balance.js` |
| P0.3 | `equationsEquivalent` / 相关比较忽略 marker | 同上 |
| P0.4 | `STATE_GAS` / `STATE_PPT` + `annotateLocal` | 同上 |
| P0.5 | `formatEquation(sep='=')` 替换 `formatEq`；`balanceEquation` 成功后 annotate 再 format | 同上 |
| P0.6 | `eq-sides.js` 同步 parse（至少 `marker` 字段与剥离规则），parity 保持绿 | `server/utils/eq-sides.js`, `test/eq-sides-parity.test.cjs` |
| P0.7 | `molar-ui` 结果直接用引擎字符串；conservation 用最终式（可兼容仍含 `→` 的过渡） | `src/molar-ui.js` |
| P0.8 | 更新/扩展单测至 P0 期望；`npm test` 全绿 | tests |

**P0 不做:** AI prompt/merge、课堂 UI、schema、`FORMULA_SAFE_RE`。

**退出标准:**

- [ ] `H2+O2=H2O` → `2H₂ + O₂ = 2H₂O`（水无 ↑）  
- [ ] 高锰酸钾类 → 含 `O₂↑`，中间 `=`  
- [ ] `CaCO3+HCl=…+CO2` → `CO₂↑`；石灰水类 → `CaCO₃↓`  
- [ ] 输入已有 `CO2↑` → 不重复  
- [ ] 反应物不加标  
- [ ] `npm test` 通过；课堂现有 builtin 练习仍可完成  

---

### P1 — 计算页 AI 合并

**目标:** 点「AI 建议」时标注能力 ≥ 本地白名单，系数仍守恒。

| 步骤 | 内容 | 文件 |
| --- | --- | --- |
| P1.1 | 导出 `mergeMarkersFromEquation`（或同等 API） | `equation-balance.js` |
| P1.2 | 改 `generateBalance` prompt | `server/services/ai/chemistry-service.js` |
| P1.3 | 重写 `runBalanceAi`：本地权威 + merge + format；去掉脆弱 replace 权宜 | `molar-ui.js` |
| P1.4 | 单测：merge 优先 AI、丢弃反应物乱标、AI 失败降级 | tests |
| P1.5 | 结果区可选小字「状态符号为课本示意」 | `molar-ui.js` / CSS |

**退出标准:**

- [ ] 无 Key：行为 = 本地配平  
- [ ] 有 Key：系数守恒；生成物标注不少于纯本地  
- [ ] 输入框/结果均为 `=` 式  

---

### P2 — 课堂分步配平对齐

**目标:** 练习展示与计算一致用 `=`；保存/导入支持 marker，且练习可完成。

| 步骤 | 内容 | 文件 |
| --- | --- | --- |
| P2.1 | `buildEquation` 改为调引擎 `formatEquation`（默认是否 annotate：练习过程用**已存 marker**，不对打字过程狂标；目标式展示可 annotate-on-read 另议——默认：**练习不自动 annotate 活系数**，只 format 已有 marker；与「结果页标注」区分） | `balance-model.js` |
| P2.2 | 练习 hero 箭头 `→` → `=`；展示 `formatFormula(formula)+marker` | `balance-views.js` |
| P2.3 | schema：`formula` 仍禁嵌入 ↑↓；新增可选 `marker`；`normalizedSpecies` 持久化 marker；equation 字符串经引擎 dual-read | `balance-script-schema.js` |
| P2.4 | `eq-sides` 补 format/annotate 与前端 parity（若 P0 未做完） | `eq-sides.js`, parity tests |
| P2.5 | 更新 `balance-model` / schema 测试；手工过三条 builtin 练习 | tests |

**P2 练习策略（定稿）:**

- 练习进行中：按脚本 species 的 coef 变化；**不**每步自动补 ↑↓（避免干扰「改系数」认知）  
- 目标式/完成态：可用 format 显示已存 marker；教师目标式若需标注，保存前由引擎 annotate 一次写入 species.marker（可选开关，默认：保存目标式时 annotate 一次）

**退出标准:**

- [ ] 练习区中间为 `=`  
- [ ] 带 `marker:'↑'` 的脚本可保存、导入、练习完成  
- [ ] 旧脚本（无 marker）行为与现在一致  
- [ ] focus / localStorage 系数恢复正常  

---

### P3 — 可选增强

| 步骤 | 内容 |
| --- | --- |
| P3.1 | 设置项：「配平结果标注气体/沉淀符号」默认开 |
| P3.2 | 白名单外置 JSON，便于增补 |
| P3.3 | （低优先）课堂 AI 生成脚本草稿同样走 merge 标注再存 marker |

---

## 6. 风险与缓解

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| `formula` 含 `O2↑` → 练习永不能完成 / 步骤对不齐 | **高** | 身份键无标记；比较忽略 marker |
| schema 拒 ↑↓ 且丢掉 marker | **高** | 仅 P2 改；P0 不动课堂存盘 |
| 仅改一端 parse → parity 红 | **中** | P0 双端同步剥离规则 |
| `parseFormula` 跳过未知字符吃下标 | **中** | 仅尾部 marker；非法应收紧 |
| AI 再本地配平冲掉标注 | **中** | P1 merge 流水线 |
| 白名单误标 | **中** | 示意文案；P3 可关 |
| `=` 替换 `→` | **低** | 内部已归一；测试几乎不断言 `→` 输出 |
| localStorage / focus | **低** | index 存系数，不改顺序 |

---

## 7. 测试矩阵

### 7.1 P0

| 用例 | 期望 |
| --- | --- |
| `balanceEquation('H2+O2=H2O')` | `=`；水无 ↑ |
| 高锰酸类（配平后） | `O₂↑`；`=` |
| `CaCO3+HCl=CaCl2+H2O+CO2` | `CO₂↑` |
| `CO2+Ca(OH)2=CaCO3+H2O` | `CaCO₃↓` |
| 输入 `CO2↑` | marker 一次，不 `↑↑` |
| 反应物为 `O2` | 左侧无 ↑ |
| `equationsEquivalent` 忽略 marker 与 `→`/`=` | true |
| client/server `speciesFromEquation` | deepEqual（含 marker） |
| 课堂 builtin 练习完成 | 仍 true |

### 7.2 P1

| 用例 | 期望 |
| --- | --- |
| AI 失败 | = 本地 |
| AI 带回 `O2↑` | 合并保留 |
| AI 给反应物 ↑ | 丢弃 |
| 最终 UI | `=` + 守恒 ok |

### 7.3 P2

| 用例 | 期望 |
| --- | --- |
| 保存 `{formula:'O2', marker:'↑'}` | 通过 |
| 旧 pack 仅 formula | 仍通过 |
| hero / buildEquation | `=` |
| `isPracticeFinished` builtins | true |

### 7.4 不作本需求 pass/fail

- 实验种子 `O₂↑`、题库 LaTeX、`molar.js`、electron-stage 日志箭头  

---

## 8. 提交 / 发版建议

| Phase | 建议 commit 信息 |
| --- | --- |
| P0 | `feat(chem): format balanced equations with = and state markers` |
| P1 | `feat(chem): merge AI state markers into local balance results` |
| P2 | `feat(classroom): align balance practice with equation format contract` |
| P3 | `feat(settings): optional toggle for equation state markers` |

发版：可随 **3.0.9**（或下一小版本）一次带上 P0+P1；P2 可同发或紧随。Win Electron 需完整 `dist:win` + Release（记得 `electron-builder` files 清单）。

---

## 9. 执行顺序（总览）

```
P0 引擎 + 单测 + 计算本地展示
    ↓
P1 计算 AI prompt + merge
    ↓
P2 课堂 buildEquation / UI / schema
    ↓
P3 设置开关 / 白名单外置（可选）
```

**下一步:** 用户确认本计划后，从 **P0.1 表征测试** 开始实现。
