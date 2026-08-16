# 内置 Agent 预设清单（Bundled Agent Presets）

所有预设存放在 `assets/agent-presets/<id>/`，由 `scripts/install-minimal-win-preset.js`
在 `npm start`（开发）与 `afterPack`（打包）时复制进内置 dsh 的
`config/agent-presets/`。WSL 托管模式启动/更新时会经 UNC 调用同一安装逻辑写入
WSL 内的 dsh 包；`scripts/sync-companion-plugins.js` 也会为 WSL / Linux 里另装的
dsh 同步这批预设（自动探测 `DSH_HOME/agent` 与 PATH 上的 dsh 命令，或 `--dsh-package`
指定包目录）。
目录名即 preset id（`[a-z0-9-]+`），显示名与描述在各目录的 `preset.yml` 中。

## 预设与上游来源

| id | 显示名 | 上游仓库 | 许可证 | 说明 |
|---|---|---|---|---|
| `minimal-win` | 极简模式_win | DSH Desktop 自研 | MIT | `pwsh` + `str_replace_editor` 极简预设 |
| `router-standard` | Router Standard (experimental) | [yjh051108/dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite)（preset 子模块 [yjh051108/dsh-router-standard](https://github.com/yjh051108/dsh-router-standard)） | MIT | 官方 API flash 方案：任务感知路由 |
| `anchored-standard` | Anchored Standard (experimental) | [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | MIT | 官方 API pro 方案：两阶段锚定 |
| `zero-anchored-standard` | Zero-Anchored Standard (experimental) | [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | MIT | 零工具锚定轮变体 |
| `whoami-standard` | Whoami Standard (experimental) | [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) | MIT | “你是谁”自介锚定变体 |
| `v4-flash-godmode-opencode-go` | Router Flash (opencode-go) | [SheberDavid/v4-flash-godmode-opencode-go](https://github.com/SheberDavid/v4-flash-godmode-opencode-go) | ⚠️ 仓库无 LICENSE 文件（见下方注意） | opencode-go flash：build/fix 内路由 |
| `warmupbetter` | Warmup Better | [0liveiraaa/myDshPresets](https://github.com/0liveiraaa/myDshPresets) | 上游附带 `LICENSE.deepseek-harness`（MIT，DeepSeek 版权） | opencode-go pro：长思考热身 |
| `warmupbetter-replay` | Warmup Better Replay | [0liveiraaa/myDshPresets](https://github.com/0liveiraaa/myDshPresets) | 同上 | 回放热身输出，省 token |

## 同步与更新

- 上游有更新时，把对应 `preset/` 目录（含 `agent.cordis.yml`、`preset.yml` 与
  引用的 `.mjs`/`.json`）覆盖到 `assets/agent-presets/<id>/`，并同步 LICENSE/NOTICE。
- 更新后运行 `node scripts/install-minimal-win-preset.js` 验证能安装进 dsh 包。
- 禁止修改 `agent.cordis.yml` 中引用的相对文件路径，除非同步调整文件名。

## 许可注意

- `router-standard` 与 `anchored-standard` 系列上游均为 MIT，LICENSE/NOTICE 已随
  每个预设目录分发。
- `v4-flash-godmode-opencode-go` 上游**未提供 LICENSE 文件**：源码内置是应项目
  要求执行；对外分发前请与作者确认许可，或移除该预设。
- `warmupbetter` / `warmupbetter-replay` 上游仅附 `LICENSE.deepseek-harness`
  （DeepSeek 项目 MIT 文本，非作者本人版权声明）；对外分发前同样建议与作者确认。
