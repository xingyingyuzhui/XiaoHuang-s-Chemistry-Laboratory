# Electron 前后端版本锁 — 实施计划

> **For agentic workers:** 用 `executing-plans` / `subagent-driven-development` 按 Phase 逐步落地；每 Phase 独立可合并，带测试门禁。

**Goal:** 杜绝 Electron 桌面版出现「界面是新功能、内嵌后端却是旧路由」导致的 `接口不存在: POST /api/ai/reaction` 等 silent 404；启动时或首屏即给出可操作的修复指引（重启 / 重装），并在打包阶段拦截不一致产物。

**Non-goal:** 追究用户是覆盖安装还是混用 Portable；Win NSIS 安装脚本优化为 P4 可选增强。

**Architecture:** 构建时生成单一 **`build-manifest.json`**（版本 + buildId + capabilities）；同一份 manifest 随前端进 `public/`，随后端进 `resources/server/`；Electron 主进程在开窗前做 **manifest 三方一致性校验**（磁盘 server manifest ↔ HTTP `/api/health` ↔ HTTP `/build-manifest.json`）；前端启动做 **轻量二次校验** 并在 AI 功能入口展示友好阻断。

**Tech stack:** 现有 Vite build、`scripts/stage-electron-server.js`、`electron/main.cjs`、Express `/api/health`、Node test runner。

---

## 问题与对策（一句话）

| 现象 | 对策 |
| --- | --- |
| 内嵌 `public/` 与 `routes/` 不是同一次构建 | build 时写 manifest，启动比对 buildId |
| 用户 `%LOCALAPPDATA%` 旁残留可写 `public/` 覆盖内置前端 | Electron 模式优先 bundled `public/`（见 P1） |
| 404 信息无法指导用户 | capabilities + 专用错误文案 + 关于页 buildId |
| 打包 stage 漏路由 | stage 冒烟 POST 关键 AI 路由（非 404 即过） |

---

## Manifest 契约（单一真相源）

**文件:** `build-manifest.json`（构建产物，不入库源码）

```json
{
  "appVersion": "3.0.6",
  "buildId": "106ff2a-20260902T094500Z",
  "buildTime": "2026-09-02T09:45:00.000Z",
  "gitSha": "106ff2a",
  "platform": "electron",
  "capabilities": {
    "aiGenerate": true,
    "aiReaction": true,
    "aiQuiz": true,
    "aiBalance": true,
    "aiStoich": true,
    "aiLab": true,
    "aiTip": true
  }
}
```

**规则:**

- `buildId` = `${gitSha}-${buildTime}`（git 不可用时用 `nogit-${timestamp}`）
- `capabilities` 由 **服务端路由注册表** 在启动时填充/校验，写入 `/api/health` 响应；manifest 文件里的 capabilities 为 build 时静态声明，启动时 server 再 verify 实际挂载
- 前端、后端、Electron 主进程只认 **buildId 完全一致**；`appVersion` 不一致但 buildId 一致 → 警告；buildId 不一致 → **硬失败**

---

## Phase 地图

| Phase | 主题 | 退出标准 |
| --- | --- | --- |
| **P0** | Manifest 生成 + health 扩展 | build 产出 manifest；`/api/health` 返回 buildId + capabilities |
| **P1** | Electron 启动版本锁 + public 优先级 | 不一致时弹窗并退出；Electron 不读 userData 旧 public |
| **P2** | 前端启动校验 + AI 入口友好阻断 | mismatch 显示重装指引；反应面板不再裸 404 |
| **P3** | Stage 路由冒烟 + 测试 | `npm test` 覆盖 manifest 与 POST 冒烟；打 Win 包前失败即停 |
| **P4** | Win 安装增强（可选） | NSIS 安装前杀进程；关于页显示 buildId |

---

## P0 — Manifest 生成 + `/api/health` 扩展

### 新增 / 修改文件

| Path | Role |
| --- | --- |
| `scripts/write-build-manifest.mjs` | **Create:** 读 `package.json` + `git rev-parse`，写 manifest 到指定目录 |
| `vite.config.js` | **Modify:** `closeBundle` 调 manifest 脚本 → `dist/build-manifest.json` |
| `server/scripts/copy-frontend.js` | **Modify:** 复制后断言 `public/build-manifest.json` 存在 |
| `scripts/stage-electron-server.js` | **Modify:** stage 完成后把 manifest 写入 `stageServer/build-manifest.json`（与 public 内一致） |
| `server/routes/capabilities.js` | **Create:** 导出 `CAPABILITIES` 常量 + `listMountedAiRoutes(app)` 辅助 |
| `server/index.js` | **Modify:** `/api/health` 增加 `appVersion`, `buildId`, `capabilities`, `publicDir`（仅 dev） |
| `test/build-manifest.test.cjs` | **Create:** manifest schema、capabilities 键齐全 |

### 步骤

- [ ] **Step 1:** 定义 `CAPABILITIES` 与路由映射表（`aiReaction` → `POST /api/ai/reaction` 等），集中在一处维护
- [ ] **Step 2:** 实现 `write-build-manifest.mjs`，支持 `--out <dir>`
- [ ] **Step 3:** Vite build 结束时写入 `dist/build-manifest.json`
- [ ] **Step 4:** `copy-frontend.js` / stage 脚本保证 manifest 双份一致（`public/` 与 server 根各一份）
- [ ] **Step 5:** 扩展 `/api/health` 读取 server 根 `build-manifest.json`（缺失时 dev 模式降级为 `{ buildId: 'dev' }`）
- [ ] **Step 6:** 测试：`npm test` + 本地 `npm run build` 后断言 manifest 存在且含 `aiReaction: true`

### 提交

```
feat(build): add build-manifest and extend /api/health with capabilities
```

---

## P1 — Electron 启动版本锁 + bundled public 优先

### 背景：`getPublicDir()` 风险

当前 `server/paths.js` 若发现 `userData/public/index.html` 存在，会 **覆盖** 内置 `server/public`。Electron 升级后若 userData 残留旧前端，可能出现前后端能力不一致。Electron/pkg 模式应 **优先 snapshot 内 public**。

### 新增 / 修改文件

| Path | Role |
| --- | --- |
| `server/paths.js` | **Modify:** `isElectron() \|\| isPkg()` 时优先 `getSnapshotRoot()/public`；仅当 env `CHEM_LAB_WRITABLE_PUBLIC=1` 才允许 userData 覆盖 |
| `electron/version-lock.cjs` | **Create:** `readManifest(path)`, `fetchHealth(port)`, `assertBundleConsistency({ serverManifest, health, publicManifest })` |
| `electron/main.cjs` | **Modify:** `startBackend()` 后、`createWindow()` 前调用 version-lock；失败 → `dialog.showMessageBox` + `app.quit()` |
| `test/electron-version-lock.test.cjs` | **Create:** 纯函数测试：一致通过、buildId 不一致拒绝、缺 manifest dev 降级 |

### 主进程校验流程

```
startBackend()
  → read resources/server/build-manifest.json     (A)
  → GET http://127.0.0.1:port/api/health          (B)
  → GET http://127.0.0.1:port/build-manifest.json (C)
  → assert A.buildId === B.buildId === C.buildId
  → assert B.capabilities.aiReaction === true
  → createWindow()
```

**用户可见文案（Win 简体）:**

> 程序文件不完整或版本不一致，部分功能（如 AI 添加反应）无法使用。  
> 请完全退出应用（任务管理器确认无残留进程）后，卸载并重新安装最新版 v3.0.6。  
> buildId: …

### 步骤

- [ ] **Step 1:** 调整 `getPublicDir()` 优先级（Electron/pkg 默认可写 public 不覆盖）
- [ ] **Step 2:** 实现 `electron/version-lock.cjs`（无 Electron 依赖，可单测）
- [ ] **Step 3:** 接入 `main.cjs` bootstrap；dev 模式（非 packaged）跳过硬锁，仅 warn
- [ ] **Step 4:** 测试 + 手工：`npm run pack:electron` 后本地解包目录启动，篡改 manifest 应弹窗退出

### 提交

```
fix(electron): enforce frontend/backend buildId lock at startup
```

---

## P2 — 前端启动校验 + AI 入口友好阻断

### 新增 / 修改文件

| Path | Role |
| --- | --- |
| `src/boot/version-check.js` | **Create:** `checkBundleVersion()`：fetch manifest + health，返回 `{ ok, buildId, missingCapabilities[] }` |
| `src/main.js` | **Modify:** DOMContentLoaded 后异步调用；失败时顶部 non-blocking banner |
| `src/molecule/reactions.js` | **Modify:** `generateAiReaction()` 前检查 `aiReaction`；不可用则 status 显示重装指引，不发请求 |
| `src/api/client.js` | **Modify:** 404 且 path 含 `/ai/` 时，append「可能是桌面版未更新，请重装」 |
| `src/settings.js` | **Modify:** 关于区增加「构建 buildId」（只读，来自 health） |

### 步骤

- [ ] **Step 1:** 实现 `version-check.js`（dev 5173 代理下同样有效）
- [ ] **Step 2:** main 启动 banner；设置页展示 buildId
- [ ] **Step 3:** 反应 AI 入口软阻断 + client 404 文案增强
- [ ] **Step 4:** 手工：模拟 health 缺 `aiReaction` → 按钮不请求、有指引

### 提交

```
feat(ui): surface build mismatch and block AI reaction when capability missing
```

---

## P3 — Stage 路由冒烟 + 测试门禁

### 修改文件

| Path | Role |
| --- | --- |
| `scripts/stage-electron-server.js` | **Modify:** smoke 阶段启动临时 listen，对路由表 POST（空 body 期望 **400** 或 **502**，禁止 **404**） |
| `test/electron-stage.test.cjs` | **Modify:** 断言 smoke 脚本含 `/api/ai/reaction` |
| `test/ai-routes-contract.test.cjs` | **Create:** 对 `app` supertest：关键 AI 路由非 404 |
| `package.json` | **Modify:** `dist:win` / `dist:electron` 前 implicit 依赖 stage 冒烟（已有 stage 步骤，确保失败 exit 1） |

### 必测路由（POST, 空/最小 body）

- `/api/ai/generate`
- `/api/ai/reaction`
- `/api/ai/tip`
- `/api/ai/balance`
- `/api/ai/quiz/generate`

### 步骤

- [ ] **Step 1:** stage smoke HTTP 探测（复用 `listenWithRetry` 或轻量 `http.request`）
- [ ] **Step 2:** `ai-routes-contract.test.cjs` 进 `npm test`
- [ ] **Step 3:** CI / 本地：`npm run stage:electron && npm test` 全绿

### 提交

```
test(electron): stage smoke rejects missing AI routes including /api/ai/reaction
```

---

## P4 — Win 安装增强（可选，建议同一发版做）

| 项 | 做法 |
| --- | --- |
| 安装前杀进程 | `electron-builder.yml` → `nsis.customInit` / `customInstall` 调 `taskkill /IM "小黄的化学实验室.exe" /F`（失败忽略） |
| 安装后提示 | 首次启动 version-lock 通过则无需；失败已有弹窗 |
| Portable 说明 | README：勿与 Setup 并存；Portable 不写 userData public |
| Releases | 仅推荐 Setup；Portable 标注「高级/免安装」 |

---

## 验收清单（整项完成定义）

- [ ] **Electron 打包版**：故意删除 `resources/server/routes/ai/chemistry.js` 后 stage 冒烟 **失败**，打不出包
- [ ] **Electron 打包版**：正常 `dist:win` 安装后，设置页可见 buildId；`/api/health` 与 `/build-manifest.json` buildId 一致
- [ ] **模拟不一致**：篡改 `build-manifest.json` 之一 → 启动弹窗，不进入主界面
- [ ] **3D 分子 → AI 添加反应**：capabilities 正常时生成预览成功（或缺 API Key 报业务错误，非 404）
- [ ] **开发模式** `npm run dev` + `server dev`：不弹 Electron 硬锁；health 含 capabilities
- [ ] **`npm test`** 全通过；`npm run build` 成功

---

## 风险与边界

| 风险 | 缓解 |
| --- | --- |
| git 不可用导致 buildId 漂移 |  fallback `nogit-${Date.now()}`，CI 必须设 `GIT_SHA` |
| 用户合法热替换 public（未来） | 仅 `CHEM_LAB_WRITABLE_PUBLIC=1` 开启；默认关闭 |
| dev 频繁改代码 buildId 变 | 非 packaged Electron / 纯 Node dev：`buildId: 'dev'`，跳过硬锁 |
| 多语言弹窗 | P1 先中文；文案进 `electron/i18n` 可后续抽 |

---

## 建议执行顺序与工时

| 顺序 | Phase | 预估 |
| --- | --- | --- |
| 1 | P0 | 0.5d |
| 2 | P1 | 0.5d |
| 3 | P3 | 0.5d（与 P1 可部分并行） |
| 4 | P2 | 0.5d |
| 5 | P4 | 0.25d（可选） |

**发版:** 完成后 bump **3.0.7**，Release Notes 写明「修复桌面版 AI 反应等接口因版本不一致 404；新增启动自检」。

---

## 不在本计划内

- 小黄的教室 monorepo 同步（可另开移植 task，复用同一 manifest 模块）
- pkg 便携 exe 单独产品线的 UI 弹窗（health 扩展仍受益）
- 自动更新 / delta 更新（长期项）
