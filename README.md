# 我的世界 · 首页交互预览

这是一个 Astro 静态网站，包含绘梨衣封面、打字欢迎语、左上角扇形导航、项目卡片、学习手记和技能树预留位置。

## 先看效果

先运行 `npm.cmd run export-preview`，再打开当前项目的 `outputs/首页预览.html`。图片、样式和交互均已嵌入文件，不需要服务器或联网。它是导出时的快照，修改源码后需重新导出。

想修改内容并实时查看，双击 `启动预览.cmd`，然后在浏览器打开终端显示的地址。关闭窗口即可停止。首次使用需安装 Node.js（要求 22.23.4 或更高；当前使用 24.18.0）及下载依赖。

也可以在此目录运行：

```powershell
$env:ASTRO_TELEMETRY_DISABLED='1'
npm.cmd ci
npm.cmd run dev
```

## 修改站名、欢迎语和背景

打开 `src/site.config.ts` 修改 `name` 和 `welcome`。

封面为 `public/images/cover.webp`；原始上传图片也保存在同一目录。正文背景目前留空，使用中性色占位。收到之前第一张图后，将它放进 `public/images/`，把配置中的 `background` 改成对应路径，例如 `/images/background.webp`。页面会自动启用背景图、模糊与遮罩。

## 用 Markdown 管理内容

- 项目：`src/content/projects/`。
- 学习：`src/content/learning/`。

复制现有 `.md` 文件并改名即可增加记录；删除不需要的示例文件即可移除。文件开头两条 `---` 之间是信息，后面是可以自由编辑的正文。真实内容将 `demo` 改成 `false`。

项目示例：

```markdown
---
title: 我的项目
description: 一句话介绍这个项目
status: 进行中
tags: [工具, 学习]
order: 1
demo: false
---
## 项目介绍

这里写具体内容。
```

项目状态支持“计划中、进行中、已完成”，可增加 `link: https://...` 提供真实项目链接。`order` 越小越靠前。

学习记录还需填写 `topic` 和字符串格式的日期 `updated: '2026-11-11'`，状态支持“计划中、学习中、已完成”。学习列表按 `order` 排序，日期不会自动更改。新加“计划中”的记录可在“全部”中查看。

修改保存后，本地开发预览会更新。状态或格式写错时构建会给出提示，修正对应文件即可。

## 技能树留在哪里

`src/components/SkillTree.astro` 是独立占位组件，首页锚点为 `#skill-tree`。配置中的 `skillTree.enabled` 可同时开关入口与区域；`implemented` 只标记实现状态，不会自动生成技能树。

以后可替换组件内部内容，保留锚点。`skillTree.href` 可将导航指向未来独立页面。当前没有后台 API 或技能树存储逻辑。

## 导出与上线准备

```powershell
npm.cmd run export-preview
```

该命令会先构建，再更新当前项目中的 `outputs/首页预览.html`。常规静态构建产物在 `dist/`，以后可上传至静态托管平台；本次没有部署或购买服务。

如果以后更换正文背景图，离线预览会将它一并嵌入。不要直接编辑生成的 HTML，修改源码或 Markdown 后重新导出。

## 已知限制

内容目前是明确标注的示例，第一张正文背景图尚待补充。技能树只预留位置，完整文章页面不在第一版范围内。

## 内容模板与工作文档

从 `docs/templates/项目模板.md` 或 `docs/templates/学习记录模板.md` 复制文件到相应内容目录，修改文件名和字段即可。模板目录本身不会生成页面。日期和状态需人工维护；项目链接为可选项。

- [项目工作计划](项目工作计划.md)：任务和验收清单。
- [项目进度总结](项目进度总结.md)：实际完成状态。
- [第二阶段验证记录](docs/第二阶段验证记录.md)：本次检查结果和待验证项。

当前仓库根目录就是源码目录。`outputs/`、`dist/`、`node_modules/`、`.astro/` 均为本地生成目录，不提交 Git。修改 Markdown 后，开发预览会更新；离线 HTML 需要重新导出。

## 动态文字回归检查

运行 `npm.cmd run check:interactions`。使用当前 Node.js 自带的 TypeScript 类型移除能力和测试工具，不增加依赖。检查覆盖打字循环、后台暂停恢复和减少动态效果；不替代真实浏览器的视觉验收。
