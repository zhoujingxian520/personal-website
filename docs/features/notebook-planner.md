# 个人记事本与时间规划

更新日期：2026-11-15

## 基本信息

- 功能标识：notebook-planner（任务作用域：`记事本规划`）。
- 目标与场景：为 `zhoujingxian` 个人网站新增纯前端记事本与智能时间规划页（计划路由 `/notebook/`），将每日固定日常、阶段安排规范与主体任务、突发小事整理为结构化规划表，离线生成合理时间轴并支持刷新恢复及 JSON/Markdown 备份。
- 当前边界：沿用 Astro 静态站点、原生 TypeScript、原生 CSS 与浏览器 `localStorage`，不引入数据库、后端或运行时 AI API；不修改现有 `src/content.config.ts`。当前已完成 `记事本规划/T1—T4` 的核心代码与本机 HTTP 浏览器实测，仅剩余 `update:notes` 离线目录导出重建及 `file://` 离线实测待补齐。全局状态摘要见 [PROGRESS](../PROGRESS.md)。

## 功能设计

功能拆分为四个互不耦合的纯前端层级：

1. **领域模型与存储校验层（T1）**：在 `src/lib/notebook/types.ts`、`schema.ts`、`storage.ts` 中定义 `schemaVersion: 1` 的 `NotebookData` 契约，包含 `RoutineItem`（固定日常）、`PhaseRuleConfig`（阶段安排规范）、`MainTask`（阶段主体任务）、`SmallTask`（突发小事）及 `DailySchedulePlan`（时间轴块集合）。通过严格的运行时字段与起止时间校验拦截损坏数据；`NotebookStore` 在读取损坏或写入配额受限时保留原存储不动并降级为可导出的会话模式。
2. **纯 TypeScript 智能排程引擎（T2）**：铺设当日固定日常与保留块、提取连续空闲窗、优先为阶段主体任务分配并保护大块时间、智能穿插或同场景批处理突发小事（支持 `today_must` 紧急让位），支持 `from_now` 从当前时刻重排与透明的冲突/未排入说明。
3. **备份与 Markdown 导出（T3）**：支持无损 JSON 备份导出、导入校验预览（含覆盖/合并策略）及人类可读五大章节 Markdown 规划表导出。
4. **Astro 页面、样式与导航接入（T4）**：复用 [Base 布局](../../src/layouts/Base.astro) 与 [global.css](../../src/styles/global.css) 暖色纸张/毛玻璃视觉体系接入 `/notebook/`，兼容顶部导航、5 项扇形菜单及 [export-preview.mjs](../../scripts/export-preview.mjs) 打包规范。

## 实现情况

已完成 `记事本规划/T1—T4` 全部前端与算法模块：

| 主要文件 | 职责 |
| --- | --- |
| [实施方案](notebook-planner-plan.md) | 按项目 12 节模板整理的完整规划、MVP 范围与 T1—T4 任务拆分 |
| [types.ts](../../src/lib/notebook/types.ts) | `STORAGE_KEY` 及日常、阶段规范、主任务、突发小事、时间轴块、根存储对象 TypeScript 契约 |
| [schema.ts](../../src/lib/notebook/schema.ts) | 时间/日期解析格式化、空数据初始化、`validateNotebookData` 与 `parseNotebookJson` 运行时校验 |
| [storage.ts](../../src/lib/notebook/storage.ts) | `NotebookStore` 本地持久化读取、最新状态同步、严格写入及损坏/配额降级保护 |
| [scheduler.ts](../../src/lib/notebook/scheduler.ts) | `generateDailySchedule` 四步分层装箱排程算法与 `from_now` 重排支持 |
| [backup.ts](../../src/lib/notebook/backup.ts) | `exportBackupJson`、`previewBackupImport`、`mergeBackupData` 与 `exportNotebookMarkdown` |
| [Base.astro](../../src/layouts/Base.astro)、[global.css](../../src/styles/global.css) | 接入 `/notebook/` 顶部导航入口与 5 项四分之一圆扇形菜单坐标 |
| [notebook/index.astro](../../src/pages/notebook/index.astro)、[notebook.css](../../src/styles/notebook.css)、[notebook.ts](../../src/scripts/notebook.ts) | 独立记事本工作台页面、暖色纸张/毛玻璃样式及前端交互控制器 |
| 单元测试 | [check-notebook-store.mjs](../../scripts/check-notebook-store.mjs)、[check-notebook-scheduler.mjs](../../scripts/check-notebook-scheduler.mjs)、[check-notebook-backup.mjs](../../scripts/check-notebook-backup.mjs) |

未验证边界：本轮已完成本地开发预览（`http://127.0.0.1:4321/notebook/`）浏览器实测与 `npm.cmd run build`（15 页），尚未运行 `npm.cmd run update:notes` / `export-preview` 重建 `outputs/网站预览` 离线目录、尚未实测 `file://` 直接打开及真实本地文件导入弹窗操作。

## 任务与验收

原始方案与拆分见 [实施方案](notebook-planner-plan.md)。

| 任务编号 | 状态 | 实现与验证证据 |
| --- | --- | --- |
| 记事本规划/T0（已并入 T1） | 已完成 | 已建立本功能记录与 12 节实施方案，文档相对链接核对通过 |
| 记事本规划/T1 | 已完成 | `check-notebook-store.mjs` 3/3 通过；并在 T4 浏览器实测中验证刷新后 `localStorage` 完整恢复 |
| 记事本规划/T2 | 已完成 | `check-notebook-scheduler.mjs` 3/3 通过；并在 T4 浏览器中验证示例排程、突发小事插空与批处理效果 |
| 记事本规划/T3 | 已实现待文件导入手测 | `check-notebook-backup.mjs` 2/2 通过；浏览器端验证备份弹窗与 Markdown 预览输出，真实文件选择导入待手测 |
| 记事本规划/T4 | 已实现待离线导出验收 | `npm.cmd run build`（15 页）通过；`http://127.0.0.1:4321/notebook/` 浏览器实测通过；`update:notes` 与 `file://` 离线验收待补齐 |

### 记事本规划/T2—T4 验证日志（2026-11-15）

- **单元测试**：`node --test scripts/check-notebook-store.mjs scripts/check-notebook-scheduler.mjs scripts/check-notebook-backup.mjs` 共 **8 项通过**（`pass 8, fail 0`）。
- **既有回归测试**：`node --test scripts/check-interactions.mjs scripts/check-writing.mjs scripts/check-categories.mjs` 共 **22 项通过**（`pass 22, fail 0`）。
- **静态构建**：`$env:ASTRO_TELEMETRY_DISABLED='1'; npm.cmd run build` 成功构建 **15 页**（含 `/notebook/index.html`），六级内置 DOM/链接校验通过。
- **本机浏览器实测（`http://127.0.0.1:4321/notebook/`）**：
  - 零控制台/页面异常，顶部导航显示「记事本」。
  - 点击「载入示例模板」成功生成固定日常（3h 45m）、主体任务（3h 30m）、突发小事（45m）时间轴；新增突发小事「打印实验报告」（15m，今天必做）并「加入并立即重排」后自动嵌入 `16:45-17:00`。
  - 勾选 `08:15-10:15` 主体任务块完成状态，左侧「阶段与主任务」进度条实时从 `0 / 300 分钟 (0%)` 同步至 `120 / 300 分钟 (40%)`；刷新页面后任务、时间轴与进度完整恢复。
  - 打开「备份与导出」弹窗核对 Markdown 五大章节预览；`375×800` 窄屏实测 `scrollWidth=360 <= 375` 无横向溢出，5 项扇形菜单展开关闭正常。
- **未验证项**：未运行 `npm.cmd run export-preview` / `update:notes` 离线目录重建、未实测 `file://` 打开及浏览器本地文件选择上传还原。
