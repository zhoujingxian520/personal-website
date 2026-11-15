# 个人记事本与时间规划：实施方案

- 功能标识：notebook-planner；任务作用域：记事本规划。
- 更新日期：2026-11-15。
- 方案状态：已合并 T0 建档并完成 记事本规划/T1 的实现；T2—T4 未开始、未授权。
- 关联入口：[项目规范](../../AGENTS.md)、[项目概况](../PROJECT.md)、[功能记录](notebook-planner.md)、[全局进度](../PROGRESS.md)、[当前交接](../HANDOFF.md)。

## 1. 功能背景与目标

个人网站 `zhoujingxian` 当前承载项目展示、学习记录、六级写作知识库及预留模块，但缺少一套贴合日常个人使用的“记事本与时间规划”工具。使用者的真实使用习惯如下：

1. **大致不变的每日固定日常**：如作息、三餐、运动、固定工作/上课时段（可区分工作日、周末或自定义星期）。
2. **当前阶段的安排规范与主体任务**：一段时期内的核心目标、偏好深度学习时段（如上午优先）、主任务最小连续整块时长、休息间隔、晚间高强度截止时间以及若干主体任务及其总耗时/已完成进度。
3. **随时插入的突发小事**：临时出现的小任务或跑腿杂务，具备预估时长、紧急程度（今天必做/近期/顺手）、可选限定时间窗及场景标签（如 `@出门`、`@电脑`）。

本功能的目标是提供独立页面 `/notebook/`，让使用者在同一工作台中维护上述三类输入，一键由纯前端约束排程引擎生成合理的当日时间块安排——**在保护大块连续时间给阶段主体任务的同时，合理利用碎片空隙或边缘窗口安排突发小事**——并支持完成勾选联动进度、手动锁定微调、“从当前时刻重排”，以及基于浏览器 `localStorage` 的刷新恢复与 JSON/Markdown 导入导出备份。

## 2. 需求范围及非目标

### 核心需求

1. 沿用网站现有 Astro 静态架构、`Base.astro` 公共外壳、原生 CSS 暖色纸张/毛玻璃视觉体系与导航（顶部入口 + 左上角扇形导航）。
2. 维护三类结构化输入：固定日常表（`RoutineItem`）、阶段安排规范（`PhaseRuleConfig`）与主体任务（`MainTask`）、突发小事池（`SmallTask`）。
3. 纯 TypeScript 离线智能排程：自动生成分时段、带排程理由、带冲突与未排入原因说明的今日时间轴（`DailySchedulePlan`），支持“全天重排”与“从当前时刻重排”。
4. 交互控制：支持时间块完成勾选（主任务自动按已计入时长精准增减 `completedMinutes`）、锁定防重排、上下微调与手动时间编辑。
5. 纯前端数据安全：自动写入 `localStorage` 并在刷新后恢复；存储异常时降级为不破坏原存储的会话模式；支持完整 `.json` 备份导出/校验导入（含预览与覆盖/合并策略）及人类可读 `.md` 规划表导出。

### 非目标与排除项

- 不引入后端服务、数据库、Obsidian、外部运行时 AI API 或账号系统。
- 不修改 `src/content.config.ts` 现有内容集合契约（避免与并行开发中的 `AI Infra` 模块产生文件冲突），首期不依赖新增 Astro Markdown 集合即可完整运行。
- 不自动推演“用户已完成学习/掌握”，任务进度只来自用户显式勾选或编辑；初始空模板不包含虚构的个人已完成记录。
- 首期聚焦单日精细时间轴与阶段主任务进度看板，不扩展多日/跨周自动排班视图或在线协作。

## 3. 现有项目分析

已实际核对项目文档与源码：

- **技术栈与构建**：[package.json](../../package.json) 使用 Astro 7.4.8（`output: 'static'`）、原生 TypeScript、原生 CSS、`esbuild`、`parse5`，测试使用 Node.js 内置 `node:test` 与 TypeScript 类型擦除能力（兼容非 `enum`/无参数属性写法）。
- **公共外壳与导航**：[Base.astro](../../src/layouts/Base.astro) 提供 `.site-header`（`.header-right` 链接）与 `.radial-nav`（目前固定 4 项按 90° 四分之一圆分布），具体样式定义于 [global.css](../../src/styles/global.css)（`--ink`、`--muted`、`--accent`、`--paper`、`--line`、`.glass-card`）与 [pages.css](../../src/styles/pages.css)（`.subpage`），交互脚本在 [navigation.ts](../../src/scripts/navigation.ts)。
- **离线预览导出**：[export-preview.mjs](../../scripts/export-preview.mjs) 执行 `astro build` 后将 `outputs/网站预览` 中的 `<script type="module">` 经 `esbuild` 打包为 `iife`，把 `<link rel="stylesheet">` 内联并转换相对路径，同时校验全站内部链接与片段锚点。
- **工作区并行现状**：当前工作区保留了 `AI Infra` 专区在 `src/content.config.ts`、`src/pages/projects/index.astro` 等处的未提交改动，以及未提交的 `docs/PROGRESS.md`、`docs/HANDOFF.md`、`docs/features/README.md` 等全局文档。记事本功能所有新模块独立放在 `src/lib/notebook/`、`src/pages/notebook/`、`src/styles/notebook.css`、`src/scripts/notebook.ts` 与 `scripts/check-notebook-*.mjs`，避免触碰上述并行修改文件；Git 同步时逐文件暂存记事本专属改动。

## 4. 技术方案与设计决策

### 4.1 分层模块设计

1. **领域模型与存储校验层（`src/lib/notebook/types.ts`、`schema.ts`、`storage.ts`）**：
   - 定义 `schemaVersion: 1` 的完整 `NotebookData` 契约、`STORAGE_KEY = 'zhoujingxian.notebook.v1'`、时间字符串工具（`parseTimeToMinutes` / `formatMinutesToTime`）与严格运行时校验器 `validateNotebookData` / `parseNotebookJson`。
   - `NotebookStore` 参考站内 [infra-store.ts](../../src/scripts/infra-store.ts) 的稳健模式：读取损坏或写入配额失败时不破坏原 `localStorage` 数据，切换 `persistent = false` 并提示导出备份。
2. **智能排程引擎（`src/lib/notebook/scheduler.ts`）**：
   - 零 DOM 依赖纯函数 `generateDailySchedule(store, options)`，按四步分层装箱策略生成时间轴：
     1. **固定日常与保留块铺设**：按星期过滤启用日常；`from_now` 模式冻结早于当前刻度的历史块、已完成块与用户锁定块；合并重叠日常并输出警告。
     2. **连续空闲时间窗提取**：扣除已占用区间，切分 `morning` / `afternoon` / `evening` 空闲窗。
     3. **大块时间保护与主体任务分配（Big Rocks First）**：综合 `P0/P1/P2`、截止日期、每日目标缺口与偏好时段评分，仅写入满足 `minMainTaskBlockMinutes` 的连续空隙，超过 `maxMainTaskBlockMinutes` 自动插入 `breakBetweenBlocksMinutes` 休息，尊重 `highFocusCutoffTime` 与可选预留杂务窗口 `reserveErrandWindowMinutes`。
     4. **突发小事智能化插空与批处理**：优先填补“装不下主体任务”的天然短空隙，支持同 `contextTag` 小事批处理；若必须借用大空隙，强制贴近空隙起止边缘放置而不劈开中间段；对 `today_must` 紧急任务在冲突时可按最低优先级主体任务尾部让位并写入透明解释 `reason`。
3. **备份导入导出层（`src/lib/notebook/backup.ts`）**：
   - JSON 完整导出与导入校验预览（统计新增、冲突、覆盖策略 `replace | merge`），导入前记录内存/临时回退快照。
   - Markdown 导出器，生成结构清晰的日常表、阶段规范、主任务进度、小事池及今日时间规划表，便于本地归档或粘贴给外部 AI 分析。
4. **Astro 页面、样式与交互控制器（`src/pages/notebook/index.astro`、`src/styles/notebook.css`、`src/scripts/notebook.ts`、`Base.astro`、`global.css`）**：
   - 页面沿用 `Base.astro` 与 `.subpage` / `.glass-card`，桌面双栏（左侧输入与选项卡，右侧今日时间轴与统计），窄屏单栏切换；使用原生 `<dialog>` 承载导入导出备份弹窗。
   - 扩展 `Base.astro` 顶部导航与扇形导航（在 `global.css` 调整 5 项四分之一圆坐标并增加 `<symbol id="i-note">`）。
   - 保持对 `export-preview.mjs` 的 `esbuild` 打包与静态链接检查完全兼容。

### 4.2 关键技术决策对比

- **排程计算位置**：选择纯 TypeScript 客户端确定性引擎，而非调用运行时大模型 API，契合站点纯静态零 API 定位，响应瞬时且无密钥泄漏风险；通过 Markdown 导出保留与外部 AI 对话的桥梁。
- **数据落盘方式**：首期采用浏览器 `localStorage` + JSON/Markdown 导入导出，不改动 `src/content.config.ts`，既零耦合现有学习/项目内容集合，又支持刷新自动恢复。

## 5. MVP 规划

- **核心闭环**：打开 `/notebook/` → 录入固定日常、阶段规范与主体任务、突发小事 → 点击“生成今日安排”获得时间轴 → 勾选完成并观察主任务进度更新 → 刷新页面验证恢复 → 导出 JSON 备份再导入还原。
- **MVP 任务集合**：`记事本规划/T1`、`记事本规划/T2`、`记事本规划/T3`、`记事本规划/T4`（均包含对应单元测试、构建校验与离线预览集成）。
- **不属于 MVP**：跨多日自动周排班、与 Markdown 内容集合双向同步、云端同步或实时拖拽排序动画增强。
- **MVP 验收入口及通过条件**：见第 9 节集成测试。

## 6. 任务依赖关系

建议顺序：`T1 → T2 → T3 → T4`。

- `记事本规划/T1` 无前置代码依赖（依赖本方案确认）。
- `记事本规划/T2` 依赖 `T1` 的 `types.ts` 与 `schema.ts` 时间工具。
- `记事本规划/T3` 依赖 `T1` 的 `schema.ts` 校验与 `NotebookData` 结构。
- `记事本规划/T4` 依赖 `T1`、`T2`、`T3` 全部核心模块以及对 `Base.astro`、`global.css`、`export-preview.mjs` 的集成验证。

## 7. 详细执行计划

### 记事本规划/T1：建立方案记录、数据模型与本地存储层（含 T0 建档）

- **目标**：在仓库内固定记事本功能的实施方案与记录，并完成纯 TypeScript 数据契约、运行时校验器及防损坏 `localStorage` 存储层。
- **具体实现范围与实施步骤**：
  1. 新建仓库内方案与功能记录 `docs/features/notebook-planner-plan.md` 与 `docs/features/notebook-planner.md`，并在本地全局索引中登记（不提交并行开发中的未跟踪全局文档）。
  2. 实现 `src/lib/notebook/types.ts`（`STORAGE_KEY`、日常/阶段规范/主任务/突发小事/时间块/日计划/根数据契约）。
  3. 实现 `src/lib/notebook/schema.ts`（时间日期解析校验、空数据构造、`validateNotebookData`、`parseNotebookJson`）。
  4. 实现 `src/lib/notebook/storage.ts`（`NotebookStore` 读取、刷新恢复、`strict` 写入控制与损坏/配额异常会话降级）。
  5. 编写 `scripts/check-notebook-store.mjs` 单元测试。
- **允许修改的模块或文件**：仅新增 `docs/features/notebook-planner-plan.md`、`docs/features/notebook-planner.md`、`src/lib/notebook/types.ts`、`src/lib/notebook/schema.ts`、`src/lib/notebook/storage.ts`、`scripts/check-notebook-store.mjs`；本地同步 `docs/features/README.md`、`docs/PROGRESS.md`、`docs/HANDOFF.md`（不纳入 Git 提交）。
- **禁止涉及的范围**：不改动 `Base.astro`、`global.css`、`content.config.ts`、`AI Infra`、六级模块及现有构建脚本；不实施 T2 排程算法或 T4 页面。
- **前置任务与外部依赖**：无前置任务；使用 Node.js 内置测试运行器与 TS 类型擦除。
- **兼容要求**：不使用 TS `enum` 或构造函数参数属性；输入文本原样保留；存储异常不覆盖既有值。
- **属于 MVP**：是。
- **可观察的完成结果**：模型与存储模块可被 Node 原生测试与后续浏览器脚本直接导入，3 项测试全过，且不影响全站既有测试。
- **验收标准**：`node --test scripts/check-notebook-store.mjs` 全部通过；既有回归测试 `check-interactions.mjs`、`check-writing.mjs`、`check-categories.mjs` 通过；文档链接目标有效；专属 6 文件已提交并核对远端同步。
- **验证方法**：`node --test scripts/check-notebook-store.mjs`；`node --test scripts/check-interactions.mjs scripts/check-writing.mjs scripts/check-categories.mjs`；`git diff --cached --check`。
- **阶段验证限制及后续集成**：本阶段仅验证内存模拟 `Storage` 与模型往返，不涉及真实浏览器刷新或 UI 渲染（由 T4 承担）。
- **检查点**：更新功能记录与进度文档，提交推送专属文件并汇报，随后停步等待 T2 授权。

### 记事本规划/T2：纯 TypeScript 智能时间规划排程引擎

- **目标**：实现零 DOM 依赖的约束排程引擎，能把固定日常、阶段规范/主体任务与突发小事合理编排为每日时间轴。
- **具体实现范围与实施步骤**：
  1. 实现 `src/lib/notebook/scheduler.ts`（`generateDailySchedule`、日常重叠合并、空闲时段切分、主任务整块保护分配、小事填碎片/贴边/批处理、`today_must` 协商让位、`from_now` 模式保留已完成与锁定块）。
  2. 编写 `scripts/check-notebook-scheduler.mjs` 单元测试覆盖日常筛选、重叠告警、不碎裂主任务整块、时间窗小事、批处理合并、`from_now` 重排与无空隙降级说明。
- **允许修改的模块或文件**：`src/lib/notebook/scheduler.ts`、`scripts/check-notebook-scheduler.mjs`、功能记录与本地进度文档。
- **禁止涉及的范围**：不修改 `storage.ts` 存储格式（除非必要向后兼容扩展）、不修改页面与导航外壳。
- **前置任务与外部依赖**：依赖 `记事本规划/T1`。
- **兼容要求**：输出严格符合 `DailySchedulePlan` 契约，可被 `validateNotebookData` 校验通过。
- **属于 MVP**：是。
- **可观察的完成结果**：给定不同组合的日常、规范、主任务和突发小事，能稳定产出不重叠且理由清晰的 `blocks` 与 `unscheduledTasks`。
- **验收标准**：`node --test scripts/check-notebook-scheduler.mjs` 全部通过，且 T1 测试继续通过。
- **验证方法**：执行单元测试覆盖常规场景、边界时间与冲突场景。
- **阶段验证限制及后续集成**：仅模型层输入输出验证，不覆盖交互微调与浏览器 DOM 展示（由 T4 接入）。
- **检查点**：记录验证结果并更新文档，等待用户验收与 T3 授权。

### 记事本规划/T3：JSON 备份导入导出与 Markdown 规划表导出

- **目标**：提供完整数据备份、带预览与冲突选择的导入合并、以及人类可读的 Markdown 规划导出能力。
- **具体实现范围与实施步骤**：
  1. 实现 `src/lib/notebook/backup.ts`（`exportBackupJson`、`previewBackupImport`、`mergeBackupData`、`exportNotebookMarkdown`）。
  2. 编写 `scripts/check-notebook-backup.mjs` 单元测试验证全量导出、错误 JSON 拒绝、`replace`/`merge` 两种导入策略及 Markdown 结构输出。
- **允许修改的模块或文件**：`src/lib/notebook/backup.ts`、`scripts/check-notebook-backup.mjs`、功能记录与本地进度文档。
- **禁止涉及的范围**：不改动页面 UI 与全局样式。
- **前置任务与外部依赖**：依赖 `记事本规划/T1`（并与 `T2` 的 `DailySchedulePlan` 协同渲染 Markdown 日程表）。
- **兼容要求**：严格拒绝未知 `schemaVersion` 或非法字段；纯文本字段原样输出。
- **属于 MVP**：是。
- **可观察的完成结果**：备份往返不丢数据，Markdown 文本清晰包含日常、阶段规范、主任务进度、小事池及日程表。
- **验收标准**：`node --test scripts/check-notebook-backup.mjs` 全部通过；T1/T2 既有测试通过。
- **验证方法**：运行备份单元测试与回归测试。
- **阶段验证限制及后续集成**：仅测试字符串/对象序列化与合并逻辑，真实文件选择与下载触发在 T4 浏览器验证。
- **检查点**：更新文档并汇报，等待用户验收与 T4 授权。

### 记事本规划/T4：Astro 独立页面、原生 CSS、导航集成与交互控制器

- **目标**：将记事本接入现有网站外壳与导航，完成全部前端交互、离线导出兼容与端到端验收。
- **具体实现范围与实施步骤**：
  1. 在 `src/layouts/Base.astro` 增加 `/notebook/` 顶部与扇形导航项及 `<symbol id="i-note">`；在 `src/styles/global.css` 调整 5 项扇形菜单四分之一圆展开坐标（保持窄屏与无障碍焦点兼容）。
  2. 新增 `src/pages/notebook/index.astro`（复用 `Base.astro` 与 `.subpage`）、`src/styles/notebook.css`（沿用站点 `--ink`、`--paper`、`--accent`、`.glass-card` 等视觉变量）、`src/scripts/notebook.ts`（完整状态流、CRUD、排程触发、块锁定/完成联动 `creditedMinutes`、上下微调、`<dialog>` 备份弹窗）。
  3. 更新 `package.json` 测试入口（如需）与文档，执行 `npm.cmd run build`、`npm.cmd run update:notes` 离线目录生成检查，并在本机浏览器实测全流程与响应式排版。
- **允许修改的模块或文件**：`src/layouts/Base.astro`、`src/styles/global.css`、`src/pages/notebook/index.astro`、`src/styles/notebook.css`、`src/scripts/notebook.ts`、必要说明文档。
- **禁止涉及的范围**：不修改 `AI Infra` 模块与六级写作知识库数据/配色文件。
- **前置任务与外部依赖**：依赖 `T1`、`T2`、`T3`。
- **兼容要求**：严格兼容 `scripts/export-preview.mjs` 的 `esbuild` `iife` 打包与静态链接校验；不依赖外部 CDN 或后端。
- **属于 MVP**：是。
- **可观察的完成结果**：`/notebook/` 可从网站导航直达，视觉与主站统一，桌面/窄屏布局良好，全套交互与导入导出闭环可工作。
- **验收标准**：全部记事本及既有自动测试通过；`npm.cmd run update:notes` 构建与离线导出链接检查通过；本机 HTTP 浏览器实测录入、排程、刷新恢复、完成联动、导入导出及 375px 窄屏无横向溢出，错误日志为空。
- **验证方法**：自动测试 + `npm.cmd run update:notes` + 本机浏览器端到端检查（并记录 `file://` 离线行为实测边界）。
- **阶段验证限制及后续集成**：最终端到端浏览器及离线预览验证。
- **检查点**：汇总全功能实现、限制与验证结果，完成文档与索引同步，汇报停步。

## 8. 子任务验收与验证索引

| 任务编号 | 独立验证部分 | 后续集成责任任务 |
| --- | --- | --- |
| `记事本规划/T1` | 数据模型校验、`localStorage` 读写恢复与损坏/配额异常单测 | `T4`（真实浏览器持久化与刷新验收） |
| `记事本规划/T2` | 排程引擎算法与边界条件单测 | `T4`（UI 触发排程与微调联动） |
| `记事本规划/T3` | JSON 导入导出、冲突合并与 Markdown 导出单测 | `T4`（文件下载/选择弹窗端到端验收） |
| `记事本规划/T4` | Astro 构建、`update:notes` 离线导出链接校验及浏览器全流程验收 | 当前为 MVP 收官任务 |

## 9. MVP 集成测试

- **前置条件**：`T1—T4` 全部实现且单元测试全绿，执行 `npm.cmd run update:notes` 成功生成 `outputs/网站预览/index.html`。
- **端到端流程**：
  1. 启动本机预览，从首页导航及扇形菜单进入 `/notebook/`，检查样式、导航与控制台无报错。
  2. 新增 3 条固定日常（含工作日规则）、设置阶段规范（上午深度工作 + 主任务最小 60 分钟）、添加 2 个主体任务与 3 条突发小事（含 1 条 `today_must` 限时窗），点击“生成今日安排”。
  3. 核对主任务未被小事切碎、短空隙被利用且每块均有理由说明；勾选主任务块确认 `completedMinutes` 累加，取消勾选确认回退；锁定 1 个时间块后点击“从当前时刻重排”，确认锁定块位置不变。
  4. 刷新页面确认状态恢复；导出 `.json` 备份与 `.md` 规划表；清空状态后重新导入 `.json`（预览冲突后确认恢复）验证完整还原。
  5. 检查 375px 窄屏下无横向溢出，导航菜单可正常开关。

## 10. 最终集成与回归测试

- 运行全站既有测试：`check:interactions`、`check:writing`、`check:categories`，以及记事本 3 组测试。
- 校验 `Base.astro` 与 `global.css` 调整后的 5 项扇形菜单在首页、项目页、学习页、知识库页及新记事本页的视觉、键盘 `Tab`/`Esc` 焦点闭环和窄屏表现无回归。
- 验证 `outputs/网站预览/` 离线导出完整目录及相对链接检查零报错（`file://` 下直接双击打开时的 `localStorage` 行为需人工实测并如实标注）。

## 11. 潜在风险及注意事项

1. **扇形菜单扩展空间**：`global.css` 原仅针对 4 项设置 `--x`/`--y` 偏移，在 `T4` 扩展为 5 项时须重新均匀分配 0°–90° 角度并兼顾 320px/375px 窄屏标签不重叠。
2. **并行开发工作区隔离**：仓库当前存在未提交的 `AI Infra` 与全局文档改动；任何提交与推送均必须精确逐文件暂存，禁止 `git add -A` 或触碰他人工作成果。
3. **`file://` 存储差异**：不同浏览器在 `file://` 本地直接打开时的 `localStorage` 隔离策略与 `http://127.0.0.1` 不同，正式日常使用推荐通过本机预览服务（`npm.cmd run dev`/`preview`），离线预览需在 `T4` 实测后如实写明边界。

## 12. 交付给执行模型的实施说明

- 新对话恢复只依赖 `AGENTS.md`、`docs/PROJECT.md`、`docs/PROGRESS.md`、`docs/HANDOFF.md`、本方案及 [功能记录](notebook-planner.md)。
- 严格执行“单任务授权、实现、验证、更新文档、仅提交本次专属变更并停步汇报”的工作流；未获明确授权不得自动继续下一个子任务。
- 不得把代码存在或单测通过替代浏览器端到端验收；所有未执行的测试须如实列为未验证项。
