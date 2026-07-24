# Electron 桌面端（路线 A）

内嵌 Express + 系统窗口，数据在 `userData`，**没有黑色控制台**，用户直接双击用。

## 和路线 B（pkg 便携 exe）对比

| | 路线 A Electron | 路线 B pkg |
|--|--|--|
| 体积 | 解压约 250MB+（Chromium）；安装包压缩后通常约 90–120MB | 约 44MB 单文件 |
| 体验 | 独立窗口、无控制台 | 黑窗口 + 浏览器 |
| 数据目录 | 系统 userData | exe 同目录 `data/` |

业务代码共用 `server/`，前端仍先 Vite 构建进 `server/public`。

## 开发

```bash
npm --prefix server install
npm run electron:dev              # 构建前端后开窗口
npm run electron:dev:skip-build   # 已有 public 时跳过构建
```

## 打包（尽量小）

打包前会跑 `stage:electron`：只装 production 依赖、sql.js 只留 `sql-asm.js`。

```bash
npm run pack:electron   # 本机解包目录 → dist-electron/（看体积）
npm run dist:mac        # macOS dmg
npm run dist:win        # Windows NSIS（建议在 Win 或配好环境后打）
```

配置见根目录 `electron-builder.yml`：`compression: maximum`、仅 `zh-CN`/`en-US` 语言包。

> 体积下限主要是 Chromium，再压也压不过路线 B；若只求轻量分发继续用 `npm run build:exe`。
