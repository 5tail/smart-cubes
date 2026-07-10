# Changelog

本檔案記錄各 Phase 的進度（SPEC §10.4 進度錨）。格式參考
[Keep a Changelog](https://keepachangelog.com/)，版號遵循 [SemVer](https://semver.org/)。

## [Unreleased]

### Phase 0 — 骨架

- tsup + vitest + TypeScript strict 專案設定；`npm run build` 產出 ESM(.js) / CJS(.cjs) / `.d.ts`。
- `src/core/types.ts`：完整實作 SPEC 第 3 節統一介面合約
  （`CubeEvent`、`SmartCube`、`MacProvider`、`ConnectOptions`、`TimestampFitter`）。
- `src/index.ts`：公開進入點，匯出核心型別。
- `CLAUDE.md`：專案簡介、build/test 指令、架構規則，並逐條抄入 SPEC 第 9 節工作守則與第 10.3 節執行層護欄。
- `NOTICE.md` 骨架：列出 csTimer / gan-web-bluetooth 等移植來源與致謝。
- `BACKLOG.md`：待辦與範圍外事項記錄。
- `demo/`：Vite + 純 TypeScript 展示頁骨架，連線按鈕 + 事件 log 區（先接假資料）。
- GitHub Pages workflow：demo 自動部署。
