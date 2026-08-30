# warmupbetter-replay — 首轮重放热身（OpenCode Go · pro）

- **上游**：[0liveiraaa/myDshPresets](https://github.com/0liveiraaa/myDshPresets)，取自其 `warmupbetter-replay/` 子目录。
- **许可证**：同 `../warmupbetter/README.md` 所述——上游无独立 LICENSE 文件，README 声明修改部分按 MIT，目录附 `LICENSE.deepseek-harness`（DeepSeek MIT 文本），与上游逐字一致。

## 机制

`warmupbetter` 的省 token 变体：首轮不调真实模型，直接重放 `replay.json` 中预录的热身思维链与回复，下一轮起以全量 Standard 目录继续。

## 相对上游的适配偏差（2026-08-31 快照核对）

- **persona 工作区锚**：与 `warmupbetter` 相同，`agent.cordis.yml` 的 persona 加了桌面端工作区锚（`{{cwd}}`）；核心重放逻辑（`warmup-replay.mjs`）与预录数据（`replay.json`）均与上游逐字一致（仅行尾差异）。
- `preset.yml` 显示名/描述与上游一致。

本预设与 `warmupbetter` 本体互为补充：本体真热身（效果更完整）、replay 重放（更快更省）；两者均内置可选。
