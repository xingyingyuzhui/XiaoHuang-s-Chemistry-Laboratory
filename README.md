# 小黄的化学实验室

面向中学化学教学与自学的本地应用。

包含：**元素周期表**、**3D 分子**、**摩尔质量**、**电子排布**、**AI 课堂**。

数据保存在本机 SQLite。AI 功能使用 DeepSeek API（需自行填写 Key）。

**当前版本：v1.1.0**

---

## 下载安装（推荐）

发布页：[Releases · v1.1.0](https://github.com/xingyingyuzhui/XiaoHuang-s-Chemistry-Laboratory/releases/tag/v1.1.0)

| 文件 | 平台 | 说明 |
|------|------|------|
| `XiaoHuang-ChemLab-Setup-1.1.0.exe` | Windows x64 | **Electron 安装包**（无黑色控制台，桌面快捷方式） |
| `XiaoHuang-ChemLab-1.1.0-mac-arm64.dmg` | macOS Apple 芯片 | Electron 安装盘（M1/M2/M3/M4） |
| `XiaoHuang-ChemLab.exe` | Windows x64 | 路线 B 轻量便携包（约 44MB，有黑色控制台 + 浏览器） |

### Electron 版（Win 安装包 / Mac dmg）

1. 安装或打开应用（窗口内直接使用，无需另开浏览器）
2. 数据目录：
   - Windows：`%AppData%\xiaohuang-chem-lab\data\`
   - macOS：`~/Library/Application Support/xiaohuang-chem-lab/data/`
3. 设置中填写 DeepSeek API Key

**说明**：未做代码签名。Windows 可能提示 SmartScreen →「仍要运行」；macOS 可能提示无法验证开发者 → 系统设置 → 隐私与安全性 → 仍要打开，或右键 App → 打开。

### 便携 exe（路线 B）

1. 双击 `XiaoHuang-ChemLab.exe`，**不要关闭黑色控制台**
2. 用控制台里的地址打开页面（如 `http://127.0.0.1:3000`）
3. 数据在 exe 同目录 `data/`

---

## 功能介绍

### 1. 元素周期表

- 标准 18 族 × 7 周期主表，含镧系 / 锕系
- 族标、周期标、s/p/d/ds/f 分区配色（与图例同源，随主题变化）
- 金属与非金属分界线开关
- 点选元素，详情区展示基本信息与电子排布

### 2. 3D 分子

- 内置常见中学分子球棍模型（Three.js）
- 旋转、缩放、慢转、视角复位；可开关原子标签
- 首次进入默认加载列表第一项
- 侧栏列表排序 / 删除；AI 按描述生成分子
- 3D 画布背景跟随主题

### 3. 摩尔质量

- 化学式计算摩尔质量与分元素明细
- 支持括号、结晶水；示例与 3D 分子库同步

### 4. 电子排布

- 前 18 号元素玻尔多壳层 3D 示意
- 列表可拖拽排序并持久化

### 5. AI 课堂

- 智能出题：年级、章节、难度、题量、对错显示策略
- 提示 / 解答限流；练习记录与 AI 评分缓存
- 错题本：答错或使用过 AI 解答收录，做对后移出

### 6. 界面主题（v1.1）

设置 → **主题** 一键切换（非自定义色值）：

| 主题 | 气质 |
|------|------|
| 默认 | 教材浅色 · 清爽蓝 |
| 文具 | 校刊纸张 · 红泥章 |
| 试剂架 | 石灰柜 · 紫铜扣 |
| 黑板 | 墨绿板 · 粉笔黄 |
| 像素 | 厚描边 · 色块阴影 |

主题采用分层结构：`src/theme/catalog.js` + `src/styles/themes/<id>/`（tokens + skin）。

### 7. 其它

- 设置：品牌标题 / 图标、主题、默认启动页、DeepSeek API
- 课间小知识：点击左上角品牌图标
- AI 提示 / 解答限流：各约每小时 10 次

---

## 开发运行

需要 Node.js 18+。

```bash
npm install
npm --prefix server install

# 终端 1：后端
cd server && npm start

# 终端 2：前端
npm run dev
```

浏览器打开：http://localhost:5173/  
（`/api` 由 Vite 代理到后端 3000）

### 打包

```bash
# Windows Electron 安装包 + 便携（本机需可打 win 包）
npm run dist:win

# 仅 macOS（当前配置默认 arm64 dmg）
npm run dist:mac

# 路线 B：Windows 轻量单文件 exe
npm run build:exe
```

产物目录：`dist-electron/`（Electron）、`dist-exe/`（pkg 便携）。均不入库。

---

## 技术架构

- **前端**：Vite、原生 ES Module、Three.js  
- **后端**：Express  
- **数据库**：sql.js（SQLite 文件）  
- **桌面**：Electron（内嵌 Express）  
- **AI**：DeepSeek Chat Completions（服务端代理）

主要接口：

- `/api/molecules` — 分子  
- `/api/settings` — 品牌、主题 id、默认页、AI、电子列表顺序  
- `/api/ai` — 分子生成、小知识、出题 / 提示 / 解答 / 评分  
- `/api/quiz` — 练习场次、错题本  

数据文件：

- 开发：`server/data/chem-lab.db`  
- Electron：用户目录 `…/xiaohuang-chem-lab/data/`  
- 便携 exe：程序旁 `data/`  

---

## 项目结构

```
├── index.html / src/          前端（含 theme/ 与 styles/themes/）
├── electron/                  Electron 主进程
├── server/                    Express + SQLite
├── scripts/stage-electron-server.js
├── electron-builder.yml
├── dist-electron/             桌面安装包输出（不入库）
├── dist-exe/                  便携 exe 输出（不入库）
└── package.json
```

---

## 版本

| 版本 | 说明 |
|------|------|
| 1.0.0 | 五大模块、AI 课堂、SQLite、Windows 便携包 |
| **1.1.0** | Electron 桌面端；多主题（默认/文具/试剂架/黑板/像素）；高分屏与 3D 背景/分区色修复；Win 安装包 + Apple 芯片 dmg |

---

## 许可证

见 [LICENSE](./LICENSE)。
