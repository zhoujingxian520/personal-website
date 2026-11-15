# 个人记事本与时间规划

更新日期：2026-11-15

## 基本信息

- 功能标识：notebook-planner（任务作用域：`记事本规划`）。
- 目标与场景：为 `zhoujingxian` 个人网站新增纯前端记事本与智能时间规划页（计划路由 `/notebook/`），将每日固定日常、阶段安排规范与主体任务、突发小事整理为结构化规划表，离线生成合理时间轴并支持刷新恢复及 JSON/Markdown 备份。
- 当前边界：沿用 Astro 静态站点、原生 TypeScript、原生 CSS 与浏览器 `localStorage`，不引入数据库、后端或运行时 AI API；不修改现有 `src/content.config.ts`。当前已完成 `记事本规划/T1`（含 T0 方案建档与数据存储校验层），`T2—T4` 尚未开始与授权。全局状态摘要见 [PROGRESS](../PROGRESS.md)。

## 功能设计

功能拆分为四个互不耦合的纯前端层级：

1. **领域模型与存储校验层（T1）**：在 `src/lib/notebook/types.ts`、`schema.ts`、`storage.ts` 中定义 `schemaVersion: 1` 的 `NotebookData` 契约，包含 `RoutineItem`（固定日常）、`PhaseRuleConfig`（阶段安排规范）、`MainTask`（阶段主体任务）、`SmallTask`（突发小事）及 `DailySchedulePlan`（时间轴块集合）。通过严格的运行时字段与起止时间校验拦截损坏数据；`NotebookStore` 在读取损坏或写入配额受限时保留原存储不动并降级为可导出的会话模式。
2. **纯 TypeScript 智能排程引擎（T2，待实施）**：铺设当日固定日常与保留块、提取连续空闲窗、优先为阶段主体任务分配并保护大块时间、智能穿插或批处理突发小事，支持 `from_now` 重排与透明的冲突/未排入说明。
3. **备份与 Markdown 导出（T3，待实施）**：支持无损 JSON 备份导出、导入校验预览（覆盖/合并策略）及人类可读 Markdown 规划表导出。
4. **Astro 页面、样式与导航接入（T4，待实施）**：复用 [Base 布局](../../src/layouts/Base.astro) 与 [global.css](../../src/styles/global.css) 暖色纸张/毛玻璃视觉体系接入 `/notebook/`，兼容 [export-preview.mjs](../../scripts/export-preview.mjs) 离线打包。

## 实现情况

当前已实现范围仅限 `记事本规划/T1`：

| 主要文件 | 职责 |
| --- | --- |
| [实施方案](notebook-planner-plan.md) | 按项目 12 节模板整理的完整规划、MVP 范围与 T1—T4 任务拆分 |
| [types.ts](../../src/lib/notebook/types.ts) | `STORAGE_KEY` 及日常、阶段规范、主任务、突发小事、时间轴块、根存储对象 TypeScript 契约 |
| [schema.ts](../../src/lib/notebook/schema.ts) | 时间/日期解析格式化、空数据初始化、`validateNotebookData` 与 `parseNotebookJson` 运行时校验 |
| [storage.ts](../../src/lib/notebook/storage.ts) | `NotebookStore` 本地持久化读取、最新状态同步、严格写入及损坏/配额降级保护 |
| [check-notebook-store.mjs](../../scripts/check-notebook-store.mjs) | 覆盖时间工具、往返恢复、非法输入拦截与存储失败降级的 3 项 Node 单元测试 |

未实现范围及当前限制：智能排程算法（`T2`）、备份导入导出器（`T3`）、Astro 页面/CSS/导航接入及浏览器端操作验收（`T4`）尚未开发；当前测试基于内存模拟 `Storage` 接口验证，尚未在真实浏览器和 `outputs/网站预览` 离线环境中验证。

## 任务与验收

原始方案与拆分见 [实施方案](notebook-planner-plan.md)。

| 任务编号 | 状态 | 实现与验证证据 |
| --- | --- | --- |
| 记事本规划/T0（已并入 T1） | 已完成（随 T1 建档） | 已在仓库建立本功能记录与 12 节实施方案，文档相对链接核对通过 |
| 记事本规划/T1 | 已实现待浏览器端验收（数据层模型单测通过） | `node --test scripts/check-notebook-store.mjs` 3/3 通过；`check:interactions`、`check:writing`、`check:categories` 共 22 项既有测试通过；80 处文档相对链接通过；浏览器实际持久化恢复待 `T4` 集成后实测 |
| 记事本规划/T2 | 未开始、未授权 | 待 `T1` 确认后由用户单独授权 |
| 记事本规划/T3 | 未开始、未授权 | 依赖 `T1` 并与 `T2` 协同，未授权 |
| 记事本规划/T4 | 未开始、未授权 | 依赖 `T1—T3`，负责页面接入与全流程浏览器/离线验收 |

### 记事本规划/T1 验证日志（2026-11-15）

- `node --test scripts/check-notebook-store.mjs`：3 项通过（`pass 3, fail 0`），覆盖时间/日期校验与边界报错、中英文与特殊文本纯文本往返保存恢复、非法字段/时间倒置/重复 ID/未知版本拦截、以及读取损坏和配额报错时保留原存储并降级导出。
- 既有回归测试：`node --test scripts/check-interactions.mjs scripts/check-writing.mjs scripts/check-categories.mjs` 共 22 项通过（`pass 22, fail 0`）。
- 文档链接检查：相关 5 份文档共 80 处相对链接目标核对通过（`missing=0`）。
- 限制：尚无前端页面渲染与真实浏览器 `localStorage` 操作测试（归 `记事本规划/T4`）；本轮未运行 `astro build` 或 `update:notes`（尚未接入 Astro 页面路由）。后续建议先确认 `T1` 交付并单独授权 `记事本规划/T2`（纯 TS 智能时间规划排程引擎）。
