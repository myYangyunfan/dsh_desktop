# warmupbetter — 首轮长 COT 热身（OpenCode Go · pro）

- **上游**：[0liveiraaa/myDshPresets](https://github.com/0liveiraaa/myDshPresets)，取自其 `warmupbetter/` 子目录。
- **许可证**：上游无独立 LICENSE 文件；上游 README「参考与许可」声明「基于 DeepSeek Harness 的 Standard/Minimal preset 修改，MIT 许可」，并随目录附 `LICENSE.deepseek-harness`（DeepSeek Harness 的 MIT 文本，Copyright (c) 2026 DeepSeek——即派生自官方预设部分的授权文本，非上游作者署名）。目录内该文件与上游逐字一致。

## 机制

标准能力 + Minimal 固定系统提示，会话首个模型请求前插入一轮「热身轮」：要求模型尽量拉长思维链并列出自检清单，为真实请求热身。

## 相对上游的适配偏差（2026-08-31 快照核对）

- **persona 工作区锚**：`agent.cordis.yml` 的 persona 文本加了桌面端工作区锚（`Workspace: {{cwd}}` + 默认工作位置约定），与官方预设的桌面适配一致（桌面 commit fee93fbf 引入）；上游为纯 Minimal 固定文本。核心热身机制（`warmup-bootstrap.mjs`）与上游逐字一致（仅行尾差异）。
- `preset.yml` 显示名/描述与上游一致。

上游后续把首轮状态描述收紧为「PURE Minimal state」，机制不变；同步上游时注意保留本地工作区锚。
