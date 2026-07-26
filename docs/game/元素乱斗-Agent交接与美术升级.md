# 元素乱斗 · Agent 交接文档（玩法 + UX + 炉石级美术升级）

> **文档目的**：交给另一位 Agent / 美术向同事，在**不推翻现有玩法骨架**的前提下，把「元素乱斗」做到 **有创意、可玩、美术达到炉石传说量级的观感**（卡牌插画、UI 壳层、动效、反馈）。
> **当前仓库**：小黄的化学实验室（Vite + 原生 JS + 多主题 CSS）
> **版本语境**：v2.0 产品内新增 Tab，非独立 App
> **文档日期**：2026-07-26

---

## 0. 一句话产品定位

**元素乱斗**是化学实验室内的 **卡牌小游戏页**：用**真实元素属性**做决策，而不是纯数值皮肤。
第一可玩模式是 **周期律乱斗（模式乙，UNO 风压牌）**；**元素大乱斗（模式甲，配方/实验室）**仅大厅预留。

目标体验对标：

| 维度 | 对标 | 说明 |
|------|------|------|
| 卡牌观感 | **炉石传说** | 厚重边框、插画、稀有感、悬停与出牌冲击 |
| 操作清晰度 | 炉石 / 杀戮尖塔 | 谁可出、为何可出、当前规则一眼懂 |
| 教学内容 | 本产品 | 序数 / 电负性 / 半径 必须「玩得到」，不能只当 flavor |
| 主题 | 本产品 5 套皮肤 | 默认 / 文具 / 试剂架 / 黑板 / 像素 —— 美术要**能染色或提供变体**，不能只死磕一张暗黑奇幻图 |

**注意**：对标炉石是 **美术完成度与反馈质感**，不是抄炉石规则、不是做集换式抽卡氪金。

---

## 1. 给下一任 Agent 的任务书（优先级）

### P0（必须）

1. **重做卡牌视觉系统**（边框、底板、插画位、字体层级、可出/不可出态）。
2. **补齐炉石级交互反馈**：悬停预览、出牌轨迹/砸桌、FLIP 过场、胜负结算屏。
3. **出一套可落地的美术资产规范**（尺寸、命名、透明通道、主题适配策略）。
4. **按本文「生图需求」产出/接入插画**（至少：大厅英雄图、牌背、FLIP 牌、若干代表元素立绘、UI 装饰）。
5. **保持模式乙规则可玩**；不破坏顶栏 Tab、主题切换、与主站共存。

### P1（强烈建议）

6. 手牌扇形、对手牌背堆叠、桌面「毡面/实验台」氛围升级。
7. 维度切换（Z / χ / r）的**独立过场动画**与图标体系。
8. 音效开关（可选，默认关或极轻）。
9. 模式甲入口的**概念视觉**（仍可不可玩，但要像预告片）。

### P2（可后置）

10. 模式甲玩法实现。
11. 联网/双人。
12. 完整 118 元素立绘（第一阶段只需 **核心 24～36 元素 + 通用模板**）。

### 明确不在本次范围

- 登录鉴权、付费抽卡、构筑天梯。
- 把主站改成游戏 Launcher。
- 机理级氧化还原计算、开放式任意反应判定。
- 安卓 / Flutter 移植。

---

## 2. 项目上下文（小黄的化学实验室）

| 项 | 内容 |
|----|------|
| 仓库路径 | 本地一般为 `teacher/`；GitHub：`XiaoHuang-s-Chemistry-Laboratory` |
| 技术 | 前端 Vite + 原生 ES Module；后端 Express + sql.js；桌面 Electron |
| 顶栏模块 | 元素周期表 · 3D 分子 · 计算 · 电子排布 · **元素乱斗** · 课堂 |
| 主题 | `html[data-theme=default\|stationery\|reagent\|blackboard\|pixel]` |
| 设计语言 | 中学实验室 / 教材感；多主题 token 在 `src/styles/themes/*/tokens.css` |
| 开发启动 | 后端 `cd server && npm start`（:3000）；前端 `npm run dev`（:5173） |

**乱斗页不要强依赖后端**（当前纯前端逻辑）。资产用静态路径即可（如 `public/battle/` 或 `src/assets/battle/`）。

---

## 3. 玩法规则（必须保留的「化学核」）

### 3.1 模式总览

| 模式 | 名称 | 状态 | 核心 |
|------|------|------|------|
| **甲** | 元素大乱斗 | **预留** | 白名单配方 + 条件牌，合法才得分（实验室叙事） |
| **乙** | 周期律乱斗 | **已实现可玩** | 压更强元素；FLIP 改比较维度；先出完手牌赢 |

设计原则（历史共识，勿推翻）：

- **借约束，不抄壳**：可借鉴 UNO/炉石的交互节奏，但主化学约束是 **属性比较 / 合法配方**。
- **主模式（若将来做甲）** 不以「纯比大小」为唯一循环；**乙** 就是比大小 + FLIP，定位为副玩法/短局。
- **不做** 氧化数手算、开放式任意反应。
- **可印刷判定**：逻辑上离开软件也能裁定（便于验规则）。

### 3.2 模式乙 · 周期律乱斗（当前实现细则）

**人数**：1 人 vs 简易 AI（可保留；双人热座可后做）。
**牌堆**：约 28 种常见元素 × 2 张 + **FLIP × 4**（见 `src/data/battle-cards.js`）。
**手牌**：各 7 张；开局翻 1 张元素作顶牌。
**默认维度**：原子序数 **Z**，数值大者强。
**出牌**：必须打出 **当前维度下强度 > 顶牌** 的元素，压到牌堆顶。
**FLIP**：

- 手中有 FLIP 且本局限次未用尽时可打出；
- 切换维度为 **Z / 电负性 χ / 原子半径 r** 之一；
- **每名玩家每局限 2 次**；
- FLIP **不占用「压牌」那一次成功出牌**（当前实现：切维度后仍是你的回合可继续出牌）。

**抽牌/过**：仅当没有可出元素时；抽 1 后仍不能出则过。连续双方都过 → 清顶牌，需 **任意元素开新叠**。
**胜利**：先把手牌出完。

**元素牌字段**（教学必须可见或可查）：

- 符号、中文名、Z
- 电负性（Pauling 近似；稀有气体可为 0/—）
- 原子半径（pm 量级教学近似）
- 分区 block：`s | p | d | ds | f | noble`（用于配色）

**AI**：会选「刚好压过」的最小牌；无牌可出时尝试 FLIP 找能出的维度；否则抽/过。

### 3.3 模式甲 · 元素大乱斗（预留，美术可先做预告）

一句话：**桌上配方目标 → 交齐元素（+ 条件）→ 合法得分**。
回合草案：抽 1 → 可选条件牌 → 完成配方或弃 1。
事故文案（验纯/倒吸等）服务教学，不是随机扣血。
**本次 Agent 可不实现逻辑**，但大厅卡片与预告 KV 要像「即将上线」。

---

## 4. 代码与文件地图（现状）

| 路径 | 职责 |
|------|------|
| `index.html` | Tab「元素乱斗」`data-tab="battle"`；`#panel-battle` |
| `src/main.js` | panels.battle、initElementBattle、默认页 battle |
| `src/settings.js` / `server/routes/settings.js` | 默认页允许 `battle` |
| `src/element-battle.js` | 大厅 + 模式乙状态机 + 整页 innerHTML 渲染 + AI |
| `src/data/battle-cards.js` | 元素数据、牌堆、维度、强度比较 |
| `src/styles/_element-battle.css` | 乱斗专用样式与动效 |
| `src/styles/index.css` | `@import` battle CSS |
| `src/styles/themes/*/skin.css` | 各主题少量覆盖（像素厚框等） |
| `src/styles/themes/*/tokens.css` | 色板 token（`--accent` `--zone-*` 等） |

**架构特点（给重构参考）**：

- 目前为 **整页 `innerHTML` 重绘**，动效靠 class（`anim-slam` / `anim-flip-y` / 发牌 `--i`）。
- 升级美术时建议：
  - **资产与 DOM 结构分离**（卡牌组件模板稳定：插画层 / 框 / 字）；
  - 出牌动效用 **不整页重绘** 或 **FLIP 前后保留手牌 DOM**，避免动画被砍；
  - 或引入轻量层：手牌 DOM diff、顶牌独立节点。

---

## 5. 当前 UX / 动效 / 美术 · 已有与缺口

### 5.1 已有（可保留思路）

- 大厅双模式卡片（甲预留 / 乙可玩）。
- 对局布局：**上对手 · 中桌面 · 下手牌**。
- 可出牌高亮抬起；差值 hint；FLIP 弹层；Toast；规则折叠。
- 轻量 CSS 动效：发牌、砸桌、维度滑块、胜负遮罩。
- 主题 token 染色；分区渐变底板。

### 5.2 缺口（为何「还不够」、为何不够炉石）

| 问题 | 表现 | 炉石级应有 |
|------|------|------------|
| **无角色/场景插画** | 纯 CSS 几何 + emoji | 每张牌有插画或强模板；桌面有场景 |
| **牌框廉价** | 圆角矩形+细线 | 多层边框、金属/木质/试剂瓶标签质感、厚度 |
| **缺少「砸下去」的物理感** | 简单 scale | 运动模糊残影、桌面震动、粒子（火焰/电/墨） |
| **信息层级弱** | 字挤在小牌上 | 大符号+插画主视觉；属性用镶嵌条/宝石位 |
| **FLIP 不够史诗** | 按钮+弹层 | 专属卡面翻转、全屏维度符文切换 |
| **结算廉价** | 简单 modal | 全屏插画、印章、粒子、再来一局 CTA |
| **主题适配未设计** | 靠 color-mix | 每主题至少：滤镜方案或 2 套框（明亮/暗色/像素） |
| **音频缺失** | 无 | 出牌/FLIP/胜利短音（可关） |

### 5.3 UX 仍建议改进的点

1. **新手第一局**：3 步高亮引导（点高亮牌 → 看维度条 → 试 FLIP）。
2. **顶牌与手牌对比**：瞄准线/箭头「这张为何可压」。
3. **FLIP 剩余次数**可视化成 2 颗宝石，不要只靠数字。
4. **历史战报**可折叠，默认只 Toast。
5. **重开/回大厅**防误触已有 confirm，可保留。
6. **性能**：手牌 >10 时减少 blur/阴影层数。

---

## 6. 炉石级美术目标（具体可验收）

### 6.1 品质标尺（验收时打开炉石截图对比）

- [ ] 卡牌在 120% 缩放下仍显「厚」与「贵」，不是扁平后台按钮。
- [ ] 插画区有明确焦点（元素拟人 / 物质意象 / 微观美学，三选一并统一）。
- [ ] 出牌瞬间用户有「打出去了」的爽感（动画 ≥ 300ms 有设计，不是闪一下）。
- [ ] 大厅进入对局有 **过场**（哪怕 0.6s 牌桌推进）。
- [ ] 像素主题下不是「糊图」，而是 **专属像素框或清晰降采样策略**。

### 6.2 推荐美术方向（选定后全文统一）

请 **三选一为主方向**（可混合 20% 点缀，不可五方向混战）：

| 方向 ID | 名称 | 描述 | 适配主题 |
|---------|------|------|----------|
| **A** | 试剂奇幻 | 炉石式卡框 + 化学试剂/晶体/火焰意象；略奇幻但不黑暗暴力 | 默认/试剂架/黑板 |
| **B** | 教材神话 | 干净的博物插画 + 烫金学科感；像「会动的教材卡」 | 默认/文具 |
| **C** | 像素炼金 | 16–32bit 像素角色元素精灵 + 厚像素框 | 像素主题主用，其他主题用 A/B |

**推荐默认主方向：A 试剂奇幻**，并为 **pixel** 提供 C 的框与缩略策略。

### 6.3 卡牌组件结构（请按此做 PSD/Spine/静态分层）

```
[battle-card]
  ├─ frame-outer          外框（主题可换色）
  ├─ frame-inner          内金边/墨边
  ├─ art                  插画层（固定比例裁切）
  ├─ art-shade            下部渐变遮罩保证字可读
  ├─ banner-name          名称条
  ├─ gem-z / gem-en / gem-r   三维属性镶嵌（当前维度点亮）
  ├─ cost-or-z-badge      左上 Z
  ├─ block-pip            分区色点
  └─ fx-idle              稀有气流/气泡（CSS 或 APNG）
```

**手牌尺寸建议**：逻辑坐标宽 100–120 CSS px；**导出插画**按 2x/3x：
- 插画安全区：**512×512** 或 **512×700**（竖版更炉石）。
- 牌背：**512×700**。
- UI 大图按 2x 屏。

### 6.4 动效清单（炉石感）

| 事件 | 建议表现 | 时长 |
|------|----------|------|
| 发牌 | 从牌库飞入扇形 | 0.5–0.8s stagger |
| 悬停可出 | 上浮 + 描边光 + 轻微 3D tilt | 0.15s |
| 出牌 | 弧线飞向中央 + 砸桌 + 屏幕微震 2px | 0.4–0.55s |
| 非法点击 | 震动 + 红闪 + Toast | 0.35s |
| FLIP | 手牌翻面飞出 → 全屏符文轮盘选维度 → 顶牌翻面刷新数值高亮 | 0.7–1.0s |
| 维度切换 | 桌面色温变化；属性条点亮对应 gem | 0.35s |
| 清叠 | 顶牌碎裂/溶解入弃牌 | 0.4s |
| 胜利 | 全屏暗角 + 徽章砸下 + 粒子 | 0.8s |
| 失败 | 柔和收束，鼓励再来 | 0.5s |

尊重 `prefers-reduced-motion`：改为淡入淡出。

---

## 7. 生图需求（给 Imagine / Midjourney / 即梦 等）

> 下列 prompt 为 **中英可混** 的工作提示；请统一 **seed 策略** 与 **角色/框体一致性**。
> 输出放入建议目录：`public/battle/`（或 `src/assets/battle/`），并在本文表格登记文件名。

### 7.1 总风格锚点（每张图都带上）

**中文锚点**：

> 中学化学教育向卡牌游戏美术，品质对标炉石传说卡牌插画，精致边框与厚重材质，清晰可读，无血腥无恐怖无色情，适合 12+ 校园场景；微距材质、体积光、细腻笔触。

**English anchor**：

> Collectible card game illustration quality comparable to Hearthstone, premium frame-ready art, educational middle-school chemistry theme, no gore no horror no NSFW, readable silhouette, rich materials, volumetric light, polished digital painting.

### 7.2 资产清单与 Prompt

#### （1）大厅 KV / 英雄图 — `hub-hero.png`（建议 1920×1080 或 1600×900）

**用途**：元素乱斗大厅背景或顶图。
**画面**：实验台中央摊开发光的元素卡牌，背景虚化的周期表光幕，玻璃器皿与晶体，左侧预留 UI 安全区。
**Prompt**：

```
Hearthstone-quality key art for a chemistry card game menu, wooden lab bench, glowing elemental trading cards floating, soft bokeh periodic table light in background, glass beakers crystals copper still, magical but school-friendly, cinematic lighting, rich detail, 16:9, no text no logo no watermark
```

#### （2）牌背 — `card-back.png`（512×700）

**用途**：对手手牌、牌库。
**画面**：对称图案，中央原子轨道徽记或「小黄」简笔实验室纹章，可染色。
**Prompt**：

```
Hearthstone-style playing card back design, vertical 2:3, ornate border, centered atom orbital crest, chemistry motifs (flask, hex pattern) subtle, symmetrical, luxurious material gold and deep teal, no letters, clean center emblem, game asset
```

**变体**：`card-back-pixel.png` 像素风厚描边版给 pixel 主题。

#### （3）卡框模板（无插画）— `frame-element.png` / `frame-flip.png`（512×700，透明底）

**用途**：程序叠在插画上。
**要求**：透明 PNG，中间 **挖空** 或提供「插画窗口蒙版」说明。
**Prompt**：

```
UI game card frame only, transparent center for artwork, Hearthstone-like ornate border, chemistry lab materials (brass, enamel, glass rim), vertical 2:3, PNG with alpha, no character art inside, four corner gems empty
```

FLIP 框用更炫的火焰/光谱边缘：

```
Special spell card frame, transparent center, Hearthstone legendary-like glow, prism spectrum edge, chemistry lightning and flame motifs, vertical 2:3, PNG alpha, no text
```

#### （4）FLIP 全卡插画 — `card-art-flip.png`（512×512 或 512×700）

**画面**：三棱镜折光 / 维度沙漏 / 三枚悬浮符文（Z、χ、r 不要写字母也可后加）。
**Prompt**：

```
Spell card art for changing game rules, prism splitting light into three paths, floating runes, alchemy energy, Hearthstone spell illustration quality, centered composition, no text
```

#### （5）代表元素立绘（第一期最少 12 张，优先下列）

每张：**主体清晰、竖构图、留上下暗角给字**。命名：`card-art-{symbol}.png`（如 `card-art-O.png`）。

| symbol | 意象建议 | Prompt 要点 |
|--------|----------|-------------|
| H | 轻盈氢气球/质子星火 | lightest element, ethereal gas flame |
| C | 金刚石/石墨双面 | diamond and graphite duality |
| N | 冷焰/空气矛 | cold blue inert strength |
| O | 燃烧之息/双原子 | vibrant oxygen flame breath |
| F | 黄绿色苛性辉光 | dangerous beauty, yellow-green glow, not gore |
| Na | 金属光泽+水反应意象（艺术化） | soft silvery metal, water sparks stylized |
| Cl | 黄绿气体精灵 | chlorine spirit elegant not scary |
| Fe | 锻造之星 | iron forge core, sturdy |
| Cu | 紫红金属 | copper sheen crystalline |
| Au | 金色荣耀 | gold legendary feel |
| I | 紫晶烟 | violet iodine vapor elegant |
| He | 气球冷光 | inert cheerful glow |

**统一前缀 Prompt**：

```
Hearthstone card portrait art of the chemical element {Name} ({Symbol}), anthropomorphic or iconic substance spirit, educational fantasy, centered character, rich background bokeh, vertical composition, no text no atomic number glyphs, high detail
```

**批量一致性**：固定 `style reference` / 同一 seed 系列；人脸或精灵比例统一。

#### （6）通用元素模板底图 — `card-art-generic-{block}.png`

对未画专属立绘的元素：按 block 使用 6 张通用（s/p/d/ds/f/noble），程序叠符号大字。
Prompt 例：

```
Abstract Hearthstone-quality background art for s-block alkali metals, soft metallic gradients, lab crystal shapes, no text, vertical, paintable behind large letter overlay
```

#### （7）桌面场景 — `table-felt.png`（1920×1080，可平铺或居中）

```
Top-down card game table mat, alchemy lab desk, subtle green felt or dark wood with leather pad, engraved periodic ornaments, soft vignette, empty center for cards, Hearthstone board mood, 16:9, no cards no hands
```

#### （8）维度符文图标 — `dim-z.png` `dim-en.png` `dim-r.png`（256×256）

```
Game UI icon, embossed medallion, symbol for atomic number / electronegativity / atomic radius, alchemy style, circular, readable at 32px, transparent PNG
```

#### （9）胜 / 负结算 — `result-win.png` `result-lose.png`（1024×1024）

```
Victory emblem for chemistry card game, golden flask laurel, Hearthstone victory screen prop, no text
Defeat emblem soft blue book and broken flask stylized friendly, no text
```

#### （10）模式甲预告 — `mode-a-teaser.png`（1024×1024）

```
Coming soon card game mode key art, recipe potions and balanced scales, checklist of reagents as cards, warm lab light, Hearthstone quality, no text
```

### 7.3 生图后处理清单

- [ ] 统一对比度与黑场，避免一张灰一张爆。
- [ ] 插画 **下部 25%** 压暗，保证白/黑字都可读。
- [ ] 去水印；检查无乱码文字。
- [ ] 导出 WebP + PNG 双份（WebP 优先加载）。
- [ ] 文件体积：单张插画建议 < 300KB（WebP）。
- [ ] 建立 `public/battle/manifest.json` 列出 symbol→url 映射。

### 7.4 主题适配策略（生图时就要想）

| 主题 | 策略 |
|------|------|
| default | 原画 + CSS 轻染色 |
| stationery | 增加纸质滤镜 / 略暖 |
| reagent | 铜绿、标签纸叠加 |
| blackboard | 降饱和 + 粉笔描边叠加（CSS 也可） |
| pixel | **不要强行像素化写实图**；用 pixel 框 + 缩小最近邻 或 单独像素资产 |

---

## 8. 工程接入建议（给实现 Agent）

### 8.1 目录建议

```
public/battle/
  hub-hero.webp
  card-back.webp
  frame-element.webp
  frame-flip.webp
  card-art-flip.webp
  card-art/O.webp
  card-art/H.webp
  ...
  card-art/_generic/s.webp
  dim-z.webp
  dim-en.webp
  dim-r.webp
  table-felt.webp
  result-win.webp
  result-lose.webp
  mode-a-teaser.webp
  manifest.json
```

### 8.2 渲染结构建议（替换纯 CSS 色块）

```html
<div class="bc" data-block="p" data-playable="true">
  <div class="bc-art" style="background-image:url(...)"></div>
  <div class="bc-frame"></div>
  <div class="bc-z">8</div>
  <div class="bc-symbol">O</div>
  <div class="bc-name">氧</div>
  <div class="bc-gems">...</div>
</div>
```

### 8.3 动画实现建议

- 出牌：**克隆节点** `position:fixed` 做飞行动画，终点再 `render` 顶牌。
- 避免每次操作全量 `innerHTML`（或仅重绘手牌区/顶牌区）。
- 粒子用 CSS/`canvas` 小库二选一，控制在 30 个以内。

### 8.4 与主题联动

- 框体用 `mask-image` + `background: var(--accent)` 可染色金属边。
- 或 `frame-element.png` 为 **灰度 + 多重混合模式**。
- `pixel` 主题切换 class `battle-skin-pixel` 换框与关闭 blur。

---

## 9. 文案与教学约束（改美术时别踩）

- 语气：俏皮、实验室、**不嘲讽学生**。
- 事故/失败文案温和。
- 元素拟人避免地域/性别刻板。
- 氯、氟可「危险美」，但不要恐怖尸骸。
- 对外称「教学示意数值」，半径/电负性允许近似。

---

## 10. 验收清单（下一任 Agent 做完请自测）

### 功能

- [ ] Tab「元素乱斗」可进；乙模式完整可玩至胜负。
- [ ] FLIP 限次、维度切换、开新叠、抽/过逻辑正确。
- [ ] 甲模式仍有入口（可仍为即将开放）。
- [ ] 设置默认页 `battle` 仍可用。
- [ ] 5 套主题切换无炸版、无不可读白字。

### 美术 / UX

- [ ] 主要界面无大块「程序员灰盒」。
- [ ] 至少接入：牌背、框、FLIP 图、12 张元素图或通用模板。
- [ ] 出牌/FLIP/胜利 动画可感知。
- [ ] 可出牌与不可出牌 1 秒内可辨。
- [ ] 移动宽度 900px 以下可玩（可简化扇形）。

### 性能

- [ ] 对局中 Chrome 笔记本帧率可接受（动画时不长期 <30fps）。
- [ ] 首进乱斗资源可懒加载。

---

## 11. 给「生图 Agent」的独立任务包（可复制）

```
你是美术向 Agent。请为「小黄的化学实验室 · 元素乱斗」生成炉石传说品质的卡牌与 UI 资产。

必读：本仓库 docs/game/元素乱斗-Agent交接与美术升级.md 第 6–7 节。

交付：
1) public/battle/ 下完整资产 + manifest.json
2) 一份 ASSETS.md：文件名、用途、prompt、是否透明
3) 一致性说明（主风格选 A 试剂奇幻）

优先级：
牌背 > 元素框 > FLIP 卡 > hub-hero > 12 元素立绘 > 桌面 > 维度图标 > 胜负章

约束：
校园向 12+；无血腥色情；无乱码文字；竖版卡 2:3；WebP 优先。
```

---

## 12. 给「实现 Agent」的独立任务包（可复制）

```
你是前端实现 Agent。请升级「元素乱斗」的 UX 与美术接入，品质对标炉石传说的卡牌手感。

必读：docs/game/元素乱斗-Agent交接与美术升级.md

代码入口：
- src/element-battle.js
- src/data/battle-cards.js
- src/styles/_element-battle.css

要求：
1) 保留模式乙规则与模式甲预留
2) 卡牌 DOM 支持插画+框分层；从 public/battle 读图
3) 出牌飞行动画（尽量避免粗暴全量重绘打断）
4) FLIP 过场更史诗
5) 5 主题可读；pixel 有降级方案
6) 不引入沉重框架；可增加少量资源文件

完成后列出改动文件与自测步骤（localhost:5173 → 元素乱斗）。
```

---

## 13. 参考与竞品（灵感，勿抄资产）

- 炉石传说：卡框厚度、出牌曲线、法术 vis。
- 杀戮尖塔：清晰可点、稀有色。
- 本产品：周期表分区色 `--zone-*`、课堂/3D 页的圆角与按钮体系。
- 规则调研历史：Ion（中和计分）、Periodic Chaos（FLIP 维度）、Chemical Chaos（配方）—— 乙模式接近后者的「短平快属性压制」。

---

## 14. 联系决策点（若 Agent 需人拍板）

1. 主风格 **A 试剂奇幻 / B 教材神话 / C 像素炼金**？默认建议 **A + pixel 用 C 框**。
2. 元素是 **拟人精灵** 还是 **纯物质意象**？（建议：主物质意象 + 轻微拟灵，免角色崩坏）
3. 是否允许轻微音效？
4. 模式甲是否在本迭代做可玩逻辑？（建议否，先美术预告）

---

## 15. 附录 · 当前模式乙元素池（实现参考）

见 `src/data/battle-cards.js`：`H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Fe Cu Zn Br Kr Ag I Au` 等；每元素 2 张；FLIP 4 张。

维度定义：

- `z`：原子序数，higherWins
- `en`：电负性，higherWins（0 视为极弱/—）
- `radius`：半径 pm，higherWins

---

**文档结束。** 下一任 Agent 请先通读第 1、3、6、7、10 节再动刀；生图与实现可并行，以 `manifest.json` 交汇。
