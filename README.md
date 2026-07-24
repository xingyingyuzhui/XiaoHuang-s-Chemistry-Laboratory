# 小黄的化学实验室

面向中学化学教学与自学的本地应用。

包含：**元素周期表**、**3D 分子**、**计算**、**电子排布**、**课堂**。

数据保存在本机 SQLite。AI 功能使用 DeepSeek API（需自行填写 Key）。

**当前版本：v2.0.0**

---

## 下载安装（推荐）

发布页：[Releases · v2.0.0](https://github.com/xingyingyuzhui/XiaoHuang-s-Chemistry-Laboratory/releases/tag/v2.0.0)

| 文件 | 平台 | 说明 |
|------|------|------|
| `XiaoHuang-ChemLab-Setup-2.0.0.exe` 或同目录 NSIS 产物 | Windows x64 | **Electron 安装包**（无黑色控制台） |
| `XiaoHuang-ChemLab-2.0.0-mac-arm64.dmg` | macOS Apple 芯片 | Electron 安装盘（M1/M2/M3/M4） |
| `XiaoHuang-ChemLab.exe` | Windows x64 | 路线 B 轻量便携包（有黑色控制台 + 浏览器） |

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
- 分区配色与图例同源，随主题变化
- 金属与非金属分界线开关
- 左侧详情：电子排布 + 课堂提示

### 2. 3D 分子

- 内置常见中学分子球棍模型（Three.js）
- 点选化学键说明；简介含类别 / 用途 / 性质要点
- 右上角「反应」：内置高中常见反应示意动画 + AI 添加
- AI 生成分子（适合小分子；复杂药物会拦截）

### 3. 计算

- **摩尔质量**：化学式计算与分元素明细
- **配平方程**：本地配平 + 守恒校验，可选 AI 建议
- **分步计量**：AI 分步化学计量（需 API Key）

### 4. 电子排布

- 1～36 号元素玻尔多壳层 3D 示意
- 列表可拖拽排序并持久化

### 5. 课堂

- 智能出题 / 错题本 / 练习导出
- 随机点名（名单导入、卡牌轮转）
- 实验探究脚本（步骤含键变化说明）

### 6. 界面主题

设置 → 主题：默认 / 文具 / 试剂架 / 黑板 / 像素

### 7. 其它

- 设置：品牌、主题、默认页、DeepSeek API
- 课间小知识：点击左上角品牌图标
- AI 限流（约每小时）：提示/解答各 20 次；小知识 40 次；全局约 120 次

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
# Windows Electron 安装包（本机需可打 win 包 / Wine）
npm run dist:win

# macOS Apple 芯片 dmg
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
- **AI**：DeepSeek Chat Completions（服务端代理；apiBase 白名单）

主要接口：

- `/api/molecules` — 分子  
- `/api/settings` — 品牌、主题、默认页、AI  
- `/api/ai` — 分子生成、小知识、出题 / 提示 / 解答、反应 / 配平 / 计量  
- `/api/quiz` — 练习场次、错题本、出题快照  
- `/api/reactions` — 化学反应  
- `/api/students` — 课堂点名名单  

---

## 版本

| 版本 | 说明 |
|------|------|
| 1.0.0 | 五大模块、AI 课堂、SQLite、Windows 便携包 |
| 1.1.0 | Electron；多主题；Win 安装包 + Mac arm64 dmg |
| **2.0.0** | 课堂（点名/实验）；计算（配平/计量）；反应示意；安全与限流加固；周期表布局统一 |

---

## 许可证

见 [LICENSE](./LICENSE)。
