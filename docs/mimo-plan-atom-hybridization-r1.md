# 3D 分子 · 点击原子显示杂化方式 — R1 执行计划与落地说明

> **给**：mimo / 实现代理  
> **日期**：2026-07-27  
> **产品范围**：R1（按产品确认「按你的想法来」）  
> **仓库**：小黄的化学实验室 · `main`  
> **维护入口**：先读 `skills/xiaohuang-project-maintenance/SKILL.md`  
> **不做**：云同步、量子化学计算、轨道 3D 云图、全库手写杂化字段  

---

## 0. 一句话目标

在 **3D 分子**页，用户**点击某个原子球**时，高亮该原子，并在现有「化学键」信息卡同区域展示该原子的 **中学简化杂化方式（sp / sp² / sp³ 等）** 与简短教学说明；点击空白取消；与现有**点键**交互并存。

---

## 1. 背景与现状

### 1.1 已有能力

| 能力 | 位置 |
|------|------|
| 分子数据 `atoms: [{el,x,y,z}]`, `bonds: [i,j][]` | `src/data/molecules.js` |
| Three.js 球棍 + 点键 raycast | `src/molecule3d.js` |
| 键信息卡 UI | `index.html` → `#molBondCard` |
| 键选中回调 → 填卡 | `src/molecule-list.js` → `onBondSelected` |
| 键卡样式 | `src/styles/_molecule-3d.css` |
| 反应播放时隐藏/压低 info | `.stage-3d.rxn-playing .mol-bond-card` |

### 1.2 缺口

- 原子 mesh **没有** `userData.atomIndex`，raycast **只打 bondMeshes**
- **没有**杂化推断模块
- 信息卡标题写死「化学键」，未支持「原子」态

---

## 2. 产品规格（R1）

### 2.1 交互

| 操作 | 结果 |
|------|------|
| 点击 **原子球** | 高亮该原子；信息卡展示杂化；清除键高亮 |
| 点击 **化学键** | 保持现有键信息；清除原子高亮 |
| 点击 **空白** | 清除键/原子高亮；隐藏信息卡 |
| 点击信息卡 **关闭** | 同上清空 |
| **反应动画播放中** | 不响应点选（或点选无效），与现有键选一致 |

**Raycast 优先级**：同一点击若同时可能命中原子与键 → **优先原子**（球半径更大，用户点 C 时常先碰到键）。

### 2.2 信息卡字段（原子模式）

复用 `#molBondCard` 容器（或改名为更中性的「选中详情」，见 §4 HTML），展示：

| 字段 | 示例 | DOM 建议 |
|------|------|----------|
| 标题区 | `C · sp³` | `#molBondTitle` 或统一 `#molSelectTitle` |
| 副标题/类型 | `四面体 · 4 个 σ 方向` | `#molBondKind` |
| 说明 | 中学文案，见 §3.4 | `#molBondTip` |
| 卡片 h3 | `原子杂化` / `化学键`（随模式切换） | 卡内 `<h3>` |

### 2.3 展示范围（R1）

| 元素 | 行为 |
|------|------|
| **H** | 不给出 sp 杂化；文案：**「氢：1s，中学一般不讨论杂化」** |
| **C / N / O / B / P / S / 卤素** 等常见中心 | 推断 sp / sp² / sp³ 或「不适用」 |
| **金属**（Na, K, Mg, Ca, Fe, Al 等） | **「本示意模型不讨论杂化」** |
| 推断失败 / 数据异常 | **「未能判断（示意坐标/键表不足）」**，不崩溃 |

文案必须带 **「中学简化」** 语义，与现有键说明语气一致。

### 2.4 非目标（R1 禁止）

- 不手写全库 `hybrid` 字段（R3 再考虑覆盖表）
- 不做杂化轨道 3D 可视化
- 不改 API / 不改 SQLite 分子表结构（前端纯展示即可；自定义分子同样走推断）
- 不做设置开关（默认开启即可）

---

## 3. 算法规格（核心 · 必须单测）

### 3.1 新建纯模块

**路径**：`src/chem/hybridization.js`（推荐）或 `src/data/hybridization.js`  
**要求**：无 DOM、无 Three；输入分子拓扑 + 原子下标，输出结构化结果。

```ts
// 概念类型（实现用 JSDoc 即可）
type HybridType = 'sp' | 'sp2' | 'sp3' | 'none' | 'na' | 'unknown';

type HybridResult = {
  atomIndex: number;
  el: string;
  hybrid: HybridType;          // 程序枚举
  hybridLabel: string;         // 展示：sp / sp² / sp³ / — 
  geometry: string;            // 直线 / 平面三角 / 四面体 / — 
  sigmaDirs: number;           // σ 方向数 = 去重邻居数
  lonePairs: number | null;    // 推断的孤对，无法估计则为 null
  electronPairs: number | null;// sigmaDirs + lonePairs
  reason: string;              // 一句话依据
  tip: string;                 // 教学说明（中学简化）
  label: string;               // 如 "C · sp³"
  source: 'inferred';          // R1 固定 inferred
};
```

### 3.2 拓扑预处理

给定 `molecule = { atoms, bonds }`：

1. 构建邻接表 `adj: number[][]`（无向；`bonds` 中 `[i,j]` 双向加入）。
2. **键级 `order[i][j]`**：同一对原子在 `bonds` 中出现次数（1/2/3…），与现有 `makeBond` 逻辑一致。
3. 对原子 `i`：  
   - `neighbors = adj[i]` 去重  
   - `sigmaDirs = neighbors.length`（重键只占 **1 个方向**）

### 3.3 价电子与孤对（高中简化表）

```js
const VALENCE_E = {
  H: 1, B: 3, C: 4, N: 5, O: 6, F: 7,
  Si: 4, P: 5, S: 6, Cl: 7, Br: 7, I: 7,
  // 未列出 → 不估孤对
};
const METALS = new Set(['Na','K','Mg','Ca','Fe','Al']);
```

对中心原子 `el`：

1. 若 `el === 'H'` → `hybrid: 'none'`，直接返回 §2.3 文案。  
2. 若 `METALS.has(el)` → `hybrid: 'na'`。  
3. 若 `sigmaDirs === 0` → `unknown`。  
4. **成键电子粗算**（示意）：  
   - 对每个邻居，该方向上「算进中心原子的成键电子」≈ `order`（单键 1、双键 2、三键 3）——中学离子/配位不细分。  
   - `bondingElectrons ≈ sum(order to each neighbor)`  
5. **孤对**：  
   - `V = VALENCE_E[el]`；若无表 → `lonePairs = null`，改用「仅用 σ 方向数」规则（§3.4 回退）。  
   - `lonePairs = clamp( round((V - bondingElectrons) / 2), 0, 4 )`  
   - 异常（负数等）→ clamp 后仍离谱则 `lonePairs = null`。

### 3.4 杂化映射

**主路径**（有 `lonePairs`）：

```
electronPairs = sigmaDirs + lonePairs
2 → sp
3 → sp2
4 → sp3
其他 → unknown
```

**回退路径**（无价电子表或 lonePairs 为 null）——仅用几何/σ 方向（有机中心常见够用）：

```
sigmaDirs === 2 → sp
sigmaDirs === 3 → sp2
sigmaDirs === 4 → sp3
else → unknown
```

**双键/三键一致性检查（软规则）**：

- 若原子参与 **三键**（任一 order≥3）且 `sigmaDirs===2` → 强化 sp。  
- 若参与 **双键**（order===2）且 `sigmaDirs===3` → 强化 sp2。  
- 与上表冲突时：**以 σ 方向 + 孤对主路径为准**，tip 中可提「含 π 键」。

### 3.5 几何文案映射

| hybrid | geometry |
|--------|----------|
| sp | 直线（约 180°） |
| sp2 | 平面三角（约 120°） |
| sp3 | 四面体（约 109.5°） |
| none / na / unknown | — |

### 3.6 文案模板（中文，实现时可微调但语义保留）

- **sp³**：`中学简化：该原子约 4 个电子对区，采取 sp³ 杂化，形成四面体取向的 σ 键（可含孤对）。`  
- **sp²**：`中学简化：约 3 个 σ 方向，sp² 杂化，未杂化 p 轨道参与 π 键（双键）。`  
- **sp**：`中学简化：约 2 个 σ 方向，sp 杂化，两枚 p 轨道参与 π 键（三键或累积双键示意）。`  
- **H**：`氢原子用 1s 轨道成键，中学一般不讨论杂化。`  
- **na**：`当前为金属/离子示意结构，本教学模型不讨论杂化。`  
- **unknown**：`根据现有键表无法稳定判断杂化（示意结构或配位特殊），请以课本为准。`

`reason` 示例：`σ方向 4 + 孤对 0 → 4 电子对 → sp³`。

### 3.7 黄金用例（单测必须全过）

用 **内置分子 id** 或构造最小 `{atoms,bonds}` 夹具：

| 分子 | 原子 | 期望 hybridLabel |
|------|------|------------------|
| 甲烷 `ch4`（确认 id） | 中心 C | sp³ |
| 乙烯 `c2h4` | 任一 C | sp² |
| 乙炔 `c2h2` | 任一 C | sp |
| 水 `h2o` | O | sp³ |
| 氨 `nh3` | N | sp³ |
| 任意 | H | none（不显示 sp） |
| 二氧化碳 `co2` | C | sp |
| 甲醛或类似（若有） | 羰基 C | sp² |

实现前用 `grep` / 读 `molecules.js` **核对真实 id**（如 `methane` vs `ch4`），测试里用真实 id 或自建最小 fixture，**不要依赖错误 id**。

---

## 4. UI / 前端落地

### 4.1 HTML（`index.html`）

在现有 `#molBondCard` 上扩展，**最小改动**推荐：

```html
<div class="mol-bond-card" id="molBondCard" hidden>
  <h3 id="molSelectHeading">化学键</h3>
  <p class="mol-bond-title" id="molBondTitle">—</p>
  <p class="mol-bond-kind" id="molBondKind"></p>
  <p class="mol-bond-tip" id="molBondTip">点击 3D 中的原子或化学键查看说明</p>
  <button type="button" class="btn ghost btn-sm" id="molBondClose">关闭</button>
</div>
```

- 默认提示改为「原子或化学键」。  
- `h3` 加 id，便于切换「化学键」/「原子杂化」。

### 4.2 `molecule3d.js`

1. 维护 `atomMeshes: THREE.Mesh[]`（与 atoms 下标对齐）。  
2. 创建原子时：  
   `mesh.userData = { isAtom: true, atomIndex: i };`  
   保存 `baseScale` 或基础 emissive 便于还原。  
3. `onPointerClick`：  
   - raycast `atomMeshes` 与 `bondMeshes`；  
   - **若有原子命中 → 走原子**；否则键；都无 → clear 全部 + handler(null)。  
4. 原子高亮：略放大 `scale` 1.12 或 emissive 提亮；清除时还原。  
5. API：  
   - 保留 `setOnBondSelect` **或** 扩展为更通用：  
     - **推荐**：新增 `setOnAtomSelect(fn)`，与 bond 并列；  
     - list 层同时注册。  
   - 原子回调 payload = `HybridResult`（由 list 调推断，或 3d 内调纯函数均可；**优先 list 调纯函数**，3d 只传 `{ atomIndex }` 或完整 result）。  

**推荐职责**：

- `molecule3d`：拾取 + 高亮 + 回调 `{ type:'atom', atomIndex }` / `{ type:'bond', ...describeBond }` / `null`  
- **更好统一**：回调统一为 `setOnSelection(fn)`，payload：  
  `{ kind:'atom', atomIndex }` | `{ kind:'bond', ...bondInfo }` | `null`  

R1 为减少破坏：可 **保留** `setOnBondSelect`，**新增** `setOnAtomSelect`；点击原子时 `bondSelectHandler(null)` 且 `atomSelectHandler(result)`，点击键时相反。

6. `loadMolecule` 时清除选中状态。  
7. `stop`/销毁时移除 click 监听逻辑保持现有。

### 4.3 `molecule-list.js`

1. `ensureMolViewer` 后：  
   `molViewer.setOnAtomSelect?.(onAtomSelected)`  
   `molViewer.setOnBondSelect?.(onBondSelected)`  
2. `onAtomSelected(info)`：  
   - 无 info → 隐藏卡（与 bond 相同）；  
   - 有 → 调 `inferHybridization(currentMolecule, info.atomIndex)`（若 3d 未算好）；  
   - 填卡：heading=原子杂化，title=label，kind=geometry + 可选 reason 短句，tip=tip。  
3. `onBondSelected`：heading 改回「化学键」。  
4. 关闭按钮：清除原子+键选中（需 viewer 暴露 `clearSelection()`）。  
5. 切换分子 `loadMolecule`：关卡 + clearSelection。

### 4.4 样式

- 复用 `.mol-bond-card`；如需区分可加 `.mol-bond-card.is-atom`。  
- 原子高亮色建议与键的玫红区分（如主题 `--stamp` / 琥珀），避免混淆。  
- 确认 `.stage-3d.rxn-playing .mol-bond-card` 仍适用。

---

## 5. 文件清单

| 文件 | 动作 |
|------|------|
| `src/chem/hybridization.js` | **新建** 推断 + 文案 |
| `test/hybridization.test.cjs` | **新建** 黄金用例 |
| `src/molecule3d.js` | 改：atom userData、raycast、高亮、回调 |
| `src/molecule-list.js` | 改：onAtomSelected、关卡、clear |
| `index.html` | 改：提示文案、h3 id |
| `src/styles/_molecule-3d.css` | 小改：可选 is-atom |
| `test/module-boundaries.test.cjs` | 可选：入口存在性 |

**禁止**：手改 `dist/`、`server/public/`、`server/data/`、安装包产物。

---

## 6. 实现步骤（给 mimo 的顺序）

### Phase 0 — 测试夹具与失败测试

1. 读 `src/data/molecules.js`，确认甲烷/乙烯/乙炔/水/氨的 **真实 id** 与 C/O/N 下标。  
2. 写 `test/hybridization.test.cjs`（先 fail）：  
   - 上述黄金用例  
   - H → none  
   - 空 bonds / 越界 index → 不抛、unknown  
3. **不要**在未写测试时直接改 3d。

### Phase 1 — 纯推断模块

1. 实现 `inferHybridization(molecule, atomIndex)`。  
2. `npm test` 中 hybridization 相关全绿。

### Phase 2 — 3D 拾取与高亮

1. atomMeshes + userData。  
2. 点击优先级原子 > 键 > 空。  
3. `clearSelection()` 公共方法。  
4. 反应播放中：若已有禁用逻辑则复用；否则在 `onPointerClick` 开头检测 `container.closest('.rxn-playing')` 或 stage class。

### Phase 3 — UI 接线

1. HTML 文案 + heading id。  
2. list 双回调填卡。  
3. 关卡/换分子清理。

### Phase 4 — 验收与回归

1. `npm test` 全绿。  
2. `npm run build` 通过。  
3. 手工路径 §7。

---

## 7. 手工验收路径

1. 启动：`server npm run dev` + 根目录 `npm run dev`，打开 Vite。  
2. 进入 **3D 分子**。  
3. 选 **甲烷**（或库中名）：点中心 C → 卡显示 **sp³**；点 H → 不讨论杂化。  
4. 选 **乙烯**：点 C → **sp²**。  
5. 选 **乙炔**：点 C → **sp**。  
6. 选 **水**：点 O → **sp³**。  
7. 点一根键 → 键信息；再点原子 → 杂化信息；点空白或关闭 → 卡隐藏。  
8. 打开反应面板播放（若有）→ 点选不应捣乱。  
9. 切换左侧分子 → 旧高亮与卡消失。

---

## 8. 验收标准（Definition of Done）

- [ ] `inferHybridization` 黄金用例测试全过  
- [ ] 点击原子可稳定打开杂化说明，布局不挤坏（勿引入 `display:flex` 盖 `[hidden]` 类问题）  
- [ ] 点键行为与 R1 前一致  
- [ ] 无新依赖；默认入口仍按需加载 Three（不把 hybridization 塞进 main 静态大图即可，随 molecule 动态包走）  
- [ ] `npm test`、`npm run build` 通过  
- [ ] 不提交生成目录与 `server/data/`  

---

## 9. 风险与后续

| 风险 | 缓解 |
|------|------|
| 苯、臭氧、CO 等特殊结构推断不准 | R1 接受「unknown」或 sp² 简化；R3 白名单覆盖 |
| AI 生成分子键表不完整 | unknown + 不崩溃 |
| 点选与轨道控件冲突 | 沿用 click；勿在 pointerdown 抢拖拽 |
| 与键卡 DOM 复用导致文案串台 | 模式切换时写全 title/kind/tip/heading |

**R2（本任务不做）**：几何图示、设置开关、标签旁常驻 sp³。  
**R3**：`atom.hybrid` 覆盖表、苯/臭氧特例。

---

## 10. 给 mimo 的约束（协作）

1. **先测后码**：Phase 0 → 1 → 2 → 3。  
2. 纯函数与 UI 分离；禁止在 `molecule3d.js` 写大段价电子表（放 `hybridization.js`）。  
3. 文案保持「中学简化」，禁止宣称量子精确。  
4. 完成后在 PR/回复中附：改动文件列表、`npm test` 结果、手工路径结果、已知不准的分子列表。  
5. 若发现分子 id 与文档示例不一致，**以源码为准**并在测试中写清。

---

## 11. 参考代码锚点

```
src/molecule3d.js
  - describeBond / onPointerClick / bondMeshes / setOnBondSelect
src/molecule-list.js
  - ensureMolViewer / onBondSelected / molBondClose
index.html
  - #molBondCard
src/data/molecules.js
  - atoms / bonds 结构
```

---

*文档路径：`docs/mimo-plan-atom-hybridization-r1.md`。实现完成前请勿删；R2 另开文档。*
