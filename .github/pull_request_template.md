<!--
PR 标题规范：[类型] 简述（关联 issue）
类型：feat / fix / refactor / perf / docs / test / chore / build
示例：[fix] 更新检测 null 版本兜底（#92）
-->

## 变更概述

<!-- 背景 / 动机 / 要解决的问题；关联 issue 用 Closes #N -->

## 变更内容

- [ ] 功能实现 / bug 修复说明
- [ ] 涉及文件范围

## 测试与验证（必填）

> 不满足以下清单的 PR 不会被 review。请在合并前逐项完成并勾选。

- [ ] 已按测试规范补充或更新测试（`scripts/test/` 下 `unit-*.test.js` 或 `desktop-*.test.js`；**bug 修复必须带回归用例**）
- [ ] 本地已通过语法预检：`node scripts/check-syntax.js`
- [ ] 本地已通过全量单测：`npm test`（附实测的 `tests / pass / fail / skipped` 四项计数；**`skipped` 比改动前增加必须说明原因** —— 靠 `skip` 遮住的守卫等于关掉的报警器）
- [ ] 已手动启动应用验证相关功能路径（仓库根没有 npm start 脚本；跑桌面壳：`cd dsh-tauri/src-tauri/src/app && cargo run`）

## 影响面

- [ ] 破坏性变更（breaking change，请说明兼容策略）
- [ ] 需要更新 CHANGELOG.md
- [ ] 涉及 UI 变更（请在下方附图）
- [ ] 涉及平台：Windows / macOS / Linux

## Review 提示

<!-- 需要 reviewer 重点关注的文件 / 逻辑 / 风险点 -->

## 截图（涉及 UI 时必填）