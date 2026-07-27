# 小黄的化学实验室 · mimo 同步文档（v3.0.2）

> **用途**：把当前产品/代码状态同步给 mimo（或其它协作者），便于接着做功能或评审，不必再从零摸仓库。  
> **日期**：2026-07-27  
> **仓库**：https://github.com/xingyingyuzhui/XiaoHuang-s-Chemistry-Laboratory  
> **分支 / 提交**：`main` @ `3e36ed3`  
> **发布页**：https://github.com/xingyingyuzhui/XiaoHuang-s-Chemistry-Laboratory/releases/tag/v3.0.2  
> **维护入口**：`Agents.md` → `skills/xiaohuang-project-maintenance/SKILL.md`

---

## 1. 一句话现状

本地中学化学桌面/Web 应用（Vite SPA + Express/sql.js + Electron）。**v3.0.2 已发布**：实验探究可编辑、安全导入、共享校验、AI 草稿、侧栏抽屉等已合入 `main` 并打 Win/Mac 安装包。**不做云同步**（产品明确暂缓）。

---

## 2. 版本与产物

| 项 | 值 |
|----|-----|
| 版本 | **3.0.2**（根 `package.json` + `server/package.json` 已对齐） |
| 测试基线 | `npm test` → **62 pass**（发版时） |
| Windows | `XiaoHuang-ChemLab-Setup-3.0.2.exe` ≈ 76.7 MB（未签名） |
| macOS | `XiaoHuang-ChemLab-3.0.2-mac-arm64.dmg` ≈ 91.5 MB（未签名，Apple 芯片） |
| 安装包体积 | 与 3.0.0/3.0.1 同量级；主体是 Electron 运行时，不是业务被裁掉 |

**未签名说明**：Win SmartScreen / mac 隐私与安全性「仍要打开」属预期。

---

## 3. 本阶段已完成（相对 3.0.1 及课堂大改）

### 3.1 实验探究（重点）

| 能力 | 说明 |
|------|------|
| 列表 + 脚本编辑 | 左侧列表；脚本页即编辑页；步骤可增删/拖拽排序 |
| 预习 | 一页一步 + 四选一；进度存 `localStorage`（`lab-prestudy-progress`） |
| AI 生成草稿 | `POST /api/ai/lab` → 弹窗 → 进脚本页确认保存 |
| 导入/导出 | 实验包 `xiaohuang-lab-pack` v1；**永不覆盖**已有 id |
| 冲突策略 | 新 id + 标题加「（导入）」；强制 `source=custom` |
| 校验 | `server/utils/lab-schema.js`：创建/更新/导入/AI 共用；**不造占位教学内容** |
| 种子 | `ensureLabsSeeded` **只补缺失内置 id**，不覆盖用户改过的行 |
| 编辑 source | 任意 PUT → `source=custom`；`reset` / `reset-builtin` 才写回 builtin |
| 排序 | `POST /api/labs/reorder` 必须全量 id、无重复 |

### 3.2 课堂其它（此前已合入、仍有效）

- 离线测验、掌握度图、错题本、备课包（lesson packs）
- 离线题库 ESM/CJS 同步脚本：`npm run sync:offline-bank`
- 内置实验 seed 同步脚本：`npm run sync:labs-seed`（改 builtin 内容时用）

### 3.3 横切 UX

- **侧栏抽屉**：周期表详情窄条、分子/电子/课堂等多页左侧列表可收起（`src/side-drawer.js`）
- **化学符号软键盘**：方程式输入（`src/chem-keypad.js`）
- BGM / 乱斗等小修（见 commit 历史）

### 3.4 结构拆分（实验模块）

```
src/ai-classroom/
  lab-model.js   # 纯数据：草稿↔payload、导入文案、localStorage 键
  lab-views.js   # 纯 HTML 模板（无事件）
  lab-shell.js   # 控制器：状态、API、绑定
  lesson-packs.js
  offline-quiz.js / mastery-map.js / wrong-book.js / quiz-config.js
```

服务端：

```
server/routes/labs.js
server/seed/import-labs.js      # ensure / importLabsSafe / reset
server/seed/labs-builtin.js     # 内置实验内容
server/utils/lab-schema.js      # validateLab / validatePrestudy / validatePredict
server/routes/lesson-packs.js   # 内嵌 labs 合并走 importLabsSafe
server/routes/ai/chemistry.js   # 含 /lab 生成（校验失败 502，不垫选项）
```

---

## 4. 关键数据契约

### 4.1 实验对象（API / 库表 `lab_experiments`）

```text
id, title, type, equation, safety, phenomena,
steps_json, prestudy_json, sort_order, source ('builtin'|'custom'),
created_at, updated_at
```

**prestudy**（可 null）：

```js
{
  objective?: string,
  reagents?: string[],
  apparatus?: string[],
  steps?: [{
    label: string,
    tip?: string,
    risk?: string,
    predict?: {
      question: string,          // 非空
      options: [string×4],       // 四项均非空
      answer: 0|1|2|3,
      explanation?: string
    }
  }],
  summary?: string
}
```

**禁止**：用「未命名步骤」「（请填写题目）」「选项A」等占位补齐后当合格内容入库。

### 4.2 实验包格式

```js
{
  format: 'xiaohuang-lab-pack',
  version: 1,
  exportedAt: ISO,
  labs: [ /* 上表字段子集 */ ]
}
```

备课包 `xiaohuang-lesson-pack` 的 `contents.labs` 导入同一安全策略。

### 4.3 前端 API 入口

- 客户端：`src/api/client.js` → `labsApi` / `lessonPackApi` / `offlineQuizApi` / `masteryApi` / `aiApi.labGenerate`
- 路由挂载：`server/index.js`（`/api/labs` 等）

---

## 5. 保护路径与习惯

| 路径 | 处理 |
|------|------|
| `server/data/` | **用户运行时数据**，勿提交、勿当源码改 |
| `dist/` `server/public/` `dist-electron/` `.electron-stage/` `dist-exe/` | 生成物，勿当业务源提交 |
| `.mimocode/` | 已 gitignore，勿提交 |
| Electron stage | `scripts/stage-electron-server.js` 只拷 `db/routes/seed/utils/public` + 生产依赖；**体积裁剪是长期策略，不是 3.0.2 新砍功能** |

发版清单见：`skills/xiaohuang-project-maintenance/references/verification.md`（Release 段）。

---

## 6. 已知问题 / 后续可做（**不含云同步**）

按优先级建议，**未开工的请与产品确认再做**：

| 优先级 | 项 | 说明 |
|--------|----|------|
| P1 | Electron stage 是否漏拷 `server/services` | AI 路由 `require('../../services/ai/...')`；当前 stage 的 `COPY_DIRS` 未见 `services`。**请打包环境实测 AI**；若失效，在 stage 脚本补上 `services` 并回归 |
| P2 | 预习进度仅本机 localStorage | 明确不做云同步；跨设备靠导入导出实验内容，不靠进度同步 |
| P2 | lab-shell 仍偏大（~900 行） | model/views 已拆；列表/拖拽可再拆如需 |
| P3 | 代码签名 | Win/Mac 均未签名 |
| 产品 | AI 教学深度 | 生成草稿 → 校验 → 保存已通；更深课设另议 |

历史课堂实现细节（题库/掌握度等）可参考：`docs/classroom-implementation-report.md`（部分数字以 **3.0.2 / 62 tests** 为准覆盖旧基线）。

---

## 7. 本地命令速查

```bash
# 开发（根目录 + server 各一）
npm run dev
npm --prefix server run dev

# 质量
npm test
npm run build

# 数据同步脚本
npm run sync:offline-bank   # 离线题库 ESM → CJS seed
npm run sync:labs-seed      # 内置实验 seed 生成（若改 builtin 源）

# 桌面包
npm run dist:win            # NSIS Setup exe
npm run dist:mac            # arm64 dmg
```

---

## 8. 建议手测路径（给接手人）

1. 实验探究：打开内置「制氧气」→ 预习做题 → 切脚本改一步 → 保存 → 列表 `source` 变为自定义语义（UI 若无标，API 上为 custom）  
2. 导出实验包 → 再导入同文件 → 应 **新增 + 改名（导入）**，原 id 内容不变  
3. 新建实验：步骤开预测题但选项留空 → 保存应被拒（前后端）  
4. AI 生成：填描述 → 草稿进脚本 → 检查后保存  
5. 侧栏抽屉 / 方程式软键盘在分子或实验脚本页点一下  
6. （打包后）桌面版 AI 是否仍可用 → 关联第 6 节 stage/`services` 项  

---

## 9. 近期相关提交（便于 git 浏览）

```
3e36ed3  release: v3.0.2 lab explore safety, UX, and classroom polish
deac6c0  feat: expand classroom with offline quiz, mastery, prestudy, and lesson packs
adb65f6  refactor: split classroom and AI route modules
1048927  release: v3.0.1 molecule properties fix
```

v3.0.2 变更面：实验库 API + seed + schema、lab-shell 三件套、lesson-packs 安全合并、chemistry AI lab、side-drawer/chem-keypad、labs/lab-model 测试、README 下载与版本历史。

---

## 10. 给 mimo 的协作约定（建议）

1. **先读**本文件 + `skills/xiaohuang-project-maintenance/SKILL.md`，再改跨层代码。  
2. 动 API 时走：`src/api/client.js` → `server/routes/*` → DB/工具 → 响应形状。  
3. 动实验数据：一律走 `validateLab` / `importLabsSafe`，禁止「假数据补齐」。  
4. 不要提交 `server/data/`、生成目录、`.mimocode/`。  
5. 需要发版：根与 server 版本一起升，README 下载名与版本历史同步，`npm test` + `dist:win`/`dist:mac`，再打 GitHub Release。  
6. 产品已拍板：**先不做云同步**；进度/多端同步类需求先挡掉或记 backlog。

---

*文档路径：`docs/mimo-handoff-v3.0.2.md`。若状态变更，优先改本节日期与第 2、3、6 节，或另开 `mimo-handoff-vX.Y.Z.md`。*
