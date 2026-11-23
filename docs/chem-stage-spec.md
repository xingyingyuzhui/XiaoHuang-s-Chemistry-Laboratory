# ChemStage 视觉规范与声明式舞台契约 (`ChemStageJSON` v1)

> 适用于「课堂 → 晶体探究」及所有 3D / 粒子 / 热学交互化学教学舞台。
> 所有前端引擎、课例壳层、AI 排课路由与校验器必须严格遵守本规范。

---

## 1. Stage-First Cinema UX 准则

1. **85%+ 视口归舞台**：进入「课堂 → 晶体探究」默认全画幅呈现单一深黑曜石影院舞台（`calc(100vh - 110px)`，`min-height: 540px`，圆角 `16px`），零多余装饰边框。
2. **禁止默认表单与双侧栏**：
   - 首屏严禁出现 3 栏 CMS 编辑表单、输入框、多级侧边栏或「复制 / 删除 / 恢复默认」按钮堆砌。
   - 备课编排与 AI 一键排课收纳于按需滑出的右侧 **Prep & AI 抽屉**（默认 `hidden`），点击顶栏 `备课 / AI` 弹出，点击遮罩或 `×` 立即收起，不挤占舞台空间。
3. **纯净影院视野**：顶栏不设常驻「提词」按钮或遮挡画布的提词横幅；课堂核心问答通过底部「拉下小黄」或备课抽屉按需查看。

---

## 2. 三区安全布局规则（Safe Zones）

舞台壳层严格划分为 3 个互不重叠的区域：

| 区域 | 定位与职责 | 硬约束 |
| --- | --- | --- |
| **Zone 1 · 顶部半透明栏** (`48px`) | 左：课例切换下拉；中：进度圆点 + 当前环节标题；右：仅 `备课 / AI` 胶囊按钮 | `rgba(9, 15, 29, 0.72)` + `backdrop-filter: blur(12px)`；禁止新增第三排工具栏 |
| **Zone 2 · 全高 3D / 热学舞台** (`flex: 1 1 0`) | 承载 WebGL / Canvas 实时渲染；底部边缘预留独立 `pointer-events: none` 字幕轨 | 双标本对比必须通过 `onDualLabels(left, right)` 写入 `grid-template-columns: 1fr 1fr; gap: 24px` 独立双栏，**严禁在画布半空中叠放浮动胶囊导致文字碰撞** |
| **Zone 3 · 底部单行玻璃控制坞** (`flex: 0 0 auto`) | 左：`‹ 上一步`；中：当前引擎 2–4 个核心交互按钮 (`actionbarEl`)；右：`下一步 ›`（支持 `←`/`→` 快捷键） | 必须单行呈现；状态遥测卡（如冰水密度）仅允许贴合右上安全角且 `pointer-events: none` |

CSS 规则必须位于 `layer(components)`，并保留 `#aiSectionCrystal[hidden], #aiSectionCrystal [hidden] { display: none !important; }`。

---

## 3. 统一 `ChemRenderKit` 3D PBR 美学规范

所有 3D 舞台必须共用 `src/crystal/stages/render-kit.js` 的 `createCinemaStage()`：

- **影院暗房基底**：透明 WebGL 画布（`alpha: true`, `ACESFilmicToneMapping`, `exposure: 1.08`, `SRGBColorSpace`, `DPR <= 2`）叠加深黑曜石径向渐变（`#13203a → #0b1222 → #070c17`）。
- **三点棚拍光 + PMREM 环境贴图**：`RoomEnvironment` (`environmentIntensity: 0.85`) + 暖白主光 `(6, 9, 7)` + 冰青轮廓光 `(-7, 4, -6)` + 柔和底补光 + 低透明度参考地环（`opacity: 0.16`）。
- **真实物理材质与 CPK 规范色**：
  - 金属：高金属度 PBR (`metalness: 0.78`, `roughness: 0.22`) + 柔和自由电子海光晕；
  - 玻璃 / 晶体：`MeshPhysicalMaterial` (`clearcoat`, 折射与锐利晶棱)；
  - CPK 色表：`C #475569`、`O #f43f5e`、`Si #38bdf8`、`H #f1f5f9`、`Cu #e0824a`、`Na #a78bfa`、`Cl #34d399`、`Cs #f59e0b`、`Fe #94a3b8`、`Al #cbd5e1`。
- **绝对禁止（视觉红线）**：
  - **严禁卡通玩具铁锤**（受力对比必须使用半透明发光剪切平面、3D 矢量箭头与晶面错位/同号斥力弧）；
  - **严禁扁平 2D 淡蓝方框**（晶体生长与自修复必须为真 3D 晶格与溶液微粒云）；
  - **严禁未对齐悬浮标签或文字互相重叠**。
- **资源清理**：每个引擎 `destroy()` 必须彻底释放 `PMREM`、几何体、材质、`OrbitControls`、`ResizeObserver` 与 `rAF`。

---

## 4. `ChemStageJSON` 五大参数化引擎契约

前端校验器 `src/crystal/stage-spec/schema.js`（ESM）与服务端校验器 `server/utils/chem-stage-schema.js`（CJS）保持严格等价。

`STAGE_TYPES = ['dual-3d-compare', 'lattice-stress', 'particle-field', 'thermal-phase', 'cell-extract']`

### 4.1 `dual-3d-compare`（双标本真 3D 宏观/微观对比）
```json
{
  "type": "dual-3d-compare",
  "left": { "label": "金刚石", "sublabel": "sp³ 正四面体共价网", "kind": "diamond" },
  "right": { "label": "石墨", "sublabel": "层状六方网 · 分子间力", "kind": "graphite" },
  "defaultMode": "micro"
}
```
- `kind` 白名单：`'quartz' | 'glass' | 'diamond' | 'graphite' | 'dryice' | 'sio2' | 'nacl' | 'cscl'`
- `defaultMode`（可选）：`'macro' | 'micro'`（默认 `'macro'`）

### 4.2 `lattice-stress`（真 3D 晶格剪切受力对比）
```json
{
  "type": "lattice-stress",
  "left": { "label": "金属铜 Cu", "sublabel": "自由电子海 · 滑移不断裂", "bondType": "metallic", "colorA": "#e0824a", "colorB": "#f5c07a" },
  "right": { "label": "食盐 NaCl", "sublabel": "正负离子交替 · 错位即碎裂", "bondType": "ionic", "colorA": "#a78bfa", "colorB": "#34d399" }
}
```
- `bondType` 白名单：`'metallic' | 'ionic' | 'covalent'`
- `colorA` / `colorB`（可选）：合法 `#rrggbb` 十六进制色值

### 4.3 `particle-field`（3D 粒子场 / 晶格动态机制）
```json
{
  "type": "particle-field",
  "mode": "crystal-growth",
  "label": "食盐晶体自发生长与自修复",
  "substance": "NaCl"
}
```
- `mode` 白名单：`'crystal-growth' | 'conductivity' | 'hbond-collapse'`
- `label` / `substance`（可选）：展示标题与化学式

### 4.4 `thermal-phase`（暗房热成像熔化赛 / 恒温熔化曲线）
```json
{
  "type": "thermal-phase",
  "view": "race",
  "substances": [
    { "formula": "NaCl", "name": "氯化钠", "category": "ionic", "mpC": 801 },
    { "formula": "KCl", "name": "氯化钾", "category": "ionic", "mpC": 770 },
    { "formula": "MgO", "name": "氧化镁", "category": "ionic", "mpC": 2852 },
    { "formula": "SiO₂", "name": "二氧化硅", "category": "covalent", "mpC": 1713 }
  ],
  "tempRange": [600, 3100]
}
```
- `view` 白名单：`'race' | 'curve'`
- `substances`：`'race'` 为 `2..16` 项，`'curve'` 为 `2` 项；每项含 `formula`、`name`、`category`（`'molecular' | 'metallic' | 'ionic' | 'covalent'`）、`mpC`（数值，范围 `-270..4000`）
- `tempRange`（可选）：`[minC, maxC]`（`minC < maxC`，缺省时由校验器自动推算合理温区）

### 4.5 `cell-extract`（3D 晶胞提取与无隙并置）
```json
{
  "type": "cell-extract",
  "crystalId": "cu",
  "label": "金属铜 FCC 晶胞提取与无隙并置"
}
```
- `crystalId`（可选，默认 `'cu'`）：`'cu' | 'nacl' | 'fe' | 'diamond'`

---

## 5. `LessonPlanJSON` 课例结构

`POST /api/ai/crystal-lesson` 响应体与前端 `normalizeLessonPlan()` 输出统一采用：

```json
{
  "id": "lesson-diamond-melting",
  "title": "碳单质结构与四类晶体熔点探究",
  "subtitle": "对比金刚石与石墨，并结合熔点赛归纳作用力规律",
  "isAi": true,
  "slides": [
    {
      "id": "slide-1",
      "title": "金刚石 vs 石墨 3D 微观结构",
      "cue": "先切微观视角旋转观察 sp³ 四面体网与层状六方网差异，再停顿提问硬度差异成因。",
      "stage": { "type": "dual-3d-compare", "left": { "label": "金刚石", "sublabel": "sp³ 正四面体共价网", "kind": "diamond" }, "right": { "label": "石墨", "sublabel": "层状六方网 · 分子间力", "kind": "graphite" }, "defaultMode": "micro" },
      "qa": { "question": "金刚石与石墨均由碳元素组成，为何物理性质差异悬殊？", "answer": "金刚石为三维共价网结构键能极大，石墨层间靠较弱范德华力结合易滑移。" },
      "quickQuestions": ["金刚石与石墨杂化方式有何不同？", "石墨为何既耐高温又能导电？"]
    }
  ]
}
```

---

## 6. 发版前视觉 QA 检查清单

- [ ] **首屏影院占比**：进入「课堂 → 晶体探究」首屏 ≥ 85% 面积为深黑曜石舞台，无默认表单、无双侧栏、无多余按钮。
- [ ] **Prep & AI 抽屉**：默认完全隐藏；打开后可平滑滑入并编辑环节 / 调用 AI 生成参数化课例，关闭后彻底离场。
- [ ] **零碰撞字幕**：`dual-3d-compare` 与 `lattice-stress` 左右标签位于独立双栏安全轨，在 `1280×720` 与 `1920×1080` 下均无重叠、无截断。
- [ ] **视觉红线核查**：`lattice-stress` 无卡通铁锤；`crystal-growth` 为真 3D 立方晶格与溶液微粒云，无 2D 蓝框。
- [ ] **自定义 AI 熔点赛**：输入含 2~4 种自定义晶体的主题，热成像舞台自动切换 `1×2` / `2×2` 网格并准确在各自 `mpC` 触发熔化闪光。
- [ ] **切换与释放**：连续切换全部 9 个预设与 AI 课例 10 次以上，无 WebGL 上下文泄露、无控制台报错。
