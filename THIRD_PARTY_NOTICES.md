# 第三方开源组件声明 / THIRD-PARTY NOTICES

> DSH Desktop（本项目）许可证：**MIT**，见 [LICENSE](LICENSE)。
> 本文件声明本项目使用、引用或分发的第三方开源组件及其许可证。各组件的完整许可证文本以其各自源仓库为准。
> 本清单基于 `dsh-desktop` 的实际安装依赖树（`node_modules`）、内置插件目录（`assets/plugins`）与内置预设目录（`assets/agent-presets`）汇总，共 772 个唯一的 `包名@版本`。

---

## 1. 运行时直接依赖（Runtime Dependencies）

### 1.1 第三方基础库

| 组件 | 版本 | 许可证 | 来源 |
|---|---|---|---|
| electron | 43.4.0 | MIT | https://github.com/electron/electron |
| electron-builder | 26.15.3 | MIT | https://github.com/electron-userland/electron-builder |
| koffi | 3.1.5 | MIT | https://github.com/Koromix/koffi |
| schemastery | 3.18.0 | MIT | https://github.com/shigma/schemastery |
| ws | 8.21.3 | MIT | https://github.com/websockets/ws |
| zod | 4.4.3 | MIT | https://github.com/colinhacks/zod |
| zstddec | 0.2.0 | MIT AND BSD-3-Clause | https://github.com/donmccurdy/zstddec |

### 1.2 DeepSeek 官方核心（@deepseek-ai）

均来自 https://github.com/deepseek-ai/deepseek-harness ，许可证 **MIT**：

| 组件 | 版本 |
|---|---|
| @deepseek-ai/dsh | 0.1.0-rc.6 |
| @deepseek-ai/cordis-plugin-group | 1.0.1 |
| @deepseek-ai/dsh-anonymous-user-id | 0.1.0-rc.6 |
| @deepseek-ai/dsh-atomic-write | 0.1.0-rc.6 |
| @deepseek-ai/dsh-bash-local | 0.1.0-rc.6 |
| @deepseek-ai/dsh-code-runtime | 0.1.0-rc.6 |
| @deepseek-ai/dsh-compaction | 0.1.0-rc.6 |
| @deepseek-ai/dsh-fs | 0.1.0-rc.6 |
| @deepseek-ai/dsh-invariants | 0.1.0-rc.6 |
| @deepseek-ai/dsh-output-retention | 0.1.0-rc.6 |
| @deepseek-ai/dsh-sandbox | 0.1.0-rc.6 |
| @deepseek-ai/dsh-scope | 0.1.0-rc.6 |
| @deepseek-ai/dsh-session-telemetry | 0.1.0-rc.6 |
| @deepseek-ai/dsh-session-title-llm | 0.1.0-rc.6 |
| @deepseek-ai/dsh-shell | 0.1.0-rc.6 |
| @deepseek-ai/dsh-spill | 0.1.0-rc.6 |
| @deepseek-ai/dsh-subagent-in-process-driver | 0.1.0-rc.6 |
| @deepseek-ai/dsh-subprocess | 0.1.0-rc.6 |
| @deepseek-ai/dsh-timeout | 0.1.0-rc.6 |
| @deepseek-ai/dsh-workflow | 0.1.0-rc.6 |

## 2. 内置 dsh 配套插件（Bundled dsh Plugins，随安装包分发）

### 2.1 第三方社区插件

| 组件 | 版本 | 许可证 | 来源 |
|---|---|---|---|
| dsh-better-sidebar | 0.12.2 | MIT | https://github.com/omdsh-dev/DSH-better-sidebar |
| @dsh-external/dsh-super-injector | 0.3.1 | BSD-3-Clause | https://github.com/dsh-external (社区 @dsh-external scope) |
| @dsh-external/dsh-vision | 0.1.0 | BSD-3-Clause | https://github.com/dsh-external (社区 @dsh-external scope) |
| dsh-navbar | 0.3.0 | MIT | https://github.com/vlln/dsh-navbar |
| harness-pet | 0.1.0 | MIT | https://github.com/cakeni/harness-pet |
| zat-dsh-engine | 0.4.0 | MIT | https://github.com/mishibeikejie/zat-dsh-engine |

### 2.2 DeepSeek 官方配套插件（@deepseek-ai/dsh-*，MIT）

均来自 https://github.com/deepseek-ai/deepseek-harness ：

| 组件 | 版本 |
|---|---|
| @deepseek-ai/dsh-balance | 0.1.0 |
| @deepseek-ai/dsh-client-file-changes | 0.1.0 |
| @deepseek-ai/dsh-conversation-tweaks | 0.1.0 |
| @deepseek-ai/dsh-file-changes | 0.1.0 |
| @deepseek-ai/dsh-float-window | 0.1.0 |
| @deepseek-ai/dsh-prompt-custom | 0.1.0 |
| @deepseek-ai/dsh-terminal-tab | 0.1.0 |
| @deepseek-ai/dsh-third-party-thinking | 0.1.0 |
| @deepseek-ai/dsh-wsl-settings | 0.1.0 |

## 3. 内置 Agent 预设（Bundled Agent Presets，第三方来源）

随安装包分发的 agent 预设（位于 `dsh-desktop/assets/agent-presets/`），来自以下第三方社区仓库。这些预设均基于 DeepSeek Harness 官方 Standard/Minimal 预设改编，采用 MIT 许可证（其中 `v4-flash-godmode-opencode-go` 基于上游 `dsh-router-standard` 的 MIT 代码改编）。

| 预设 | 用途 | 许可证 | 来源仓库 |
|---|---|---|---|
| `router-standard` | 任务感知路由（spec 计划 / react 执行） | MIT | https://github.com/yjh051108/dsh-routing-suite |
| `anchored-standard` | 首轮锚定 + 工具延迟展开 | MIT | https://github.com/xiaobright/dsh-anchored-standard |
| `zero-anchored-standard` | 零工具锚定轮 + 后续展开 | MIT | https://github.com/xiaobright/dsh-anchored-standard |
| `v4-flash-godmode-opencode-go` | opencode-go V4 Flash 引导（神模式） | MIT | https://github.com/SheberDavid/v4-flash-godmode-opencode-go |
| `warmupbetter` | 首轮真实模型长 COT 热身 | MIT | https://github.com/0liveiraaa/myDshPresets |
| `warmupbetter-replay` | 首轮重放预录 COT | MIT | https://github.com/0liveiraaa/myDshPresets |

> 另有 `minimal-win`（基于官方极简模式的 Windows PowerShell 适配）与 `whoami-standard`（实验性）为本项目内置预设，基于 DeepSeek Harness 官方预设衍生，非第三方来源。

## 4. 内置运行时（Bundled Runtime）

| 组件 | 许可证 | 说明 |
|---|---|---|
| Node.js | MIT（含 ISC/BSD 等组件） | 便携版内置 `node.exe` 运行时，目标机器无需预装 Node.js |
| npm CLI | Artistic-2.0 | 内置 npm 命令行，用于插件安装与官方 dsh overlay 更新 |

## 5. 兼容但非内置的社区插件（经 zat-dsh-engine 插件市场由用户自行安装）

本项目未打包以下插件，仅对其写入的自定义会话事件做了兼容性补丁（修复 `SessionFormatUnsupportedError`）：

| 组件 | 作者 | 说明 |
|---|---|---|
| dsh-agent-teams | NanmiCoder | 多智能体协作 |
| dsh-message-edit | Moeblack | 分支式消息编辑 / 重新生成 |
| dsh-web-search-exa | — | 网页搜索 |

---

## 6. 完整依赖清单（Full Dependency List，含间接依赖，按字母排序）

> 共 772 个 `包名@版本`。许可证字段取自各包 `package.json` 的 `license` 声明；标注为组合表达式（如 `MIT AND BSD-3-Clause`）者以其 SPDX 含义为准。

| 组件 | 版本 | 许可证 | 来源 |
|---|---|---|---|
| @anthropic-ai/sdk | 0.91.1 | MIT | https://github.com/anthropics/anthropic-sdk-typescript |
| @aws-crypto/sha256-browser | 5.2.0 | Apache-2.0 | git@github.com:aws/aws-sdk-js-crypto-helpers |
| @aws-crypto/sha256-js | 5.2.0 | Apache-2.0 | git@github.com:aws/aws-sdk-js-crypto-helpers |
| @aws-crypto/supports-web-crypto | 5.2.0 | Apache-2.0 | git@github.com:aws/aws-sdk-js-crypto-helpers |
| @aws-crypto/util | 5.2.0 | Apache-2.0 | git@github.com:aws/aws-sdk-js-crypto-helpers |
| @aws-sdk/client-bedrock-runtime | 3.1048.0 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/core | 3.977.7 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/credential-provider-env | 3.972.68 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/credential-provider-http | 3.972.70 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/credential-provider-ini | 3.973.13 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/credential-provider-login | 3.972.75 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/credential-provider-node | 3.972.79 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/credential-provider-process | 3.972.68 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/credential-provider-sso | 3.973.12 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/credential-provider-web-identity | 3.972.74 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/eventstream-handler-node | 3.972.32 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/middleware-eventstream | 3.972.27 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/middleware-websocket | 3.972.50 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/nested-clients | 3.997.42 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/signature-v4-multi-region | 3.996.44 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/token-providers | 3.1048.0 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/token-providers | 3.1108.0 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/types | 3.974.3 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/util-locate-window | 3.965.9 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws-sdk/xml-builder | 3.972.38 | Apache-2.0 | https://github.com/aws/aws-sdk-js-v3 |
| @aws/lambda-invoke-store | 0.3.0 | Apache-2.0 | https://github.com/awslabs/aws-lambda-invoke-store |
| @babel/code-frame | 7.29.7 | MIT | https://github.com/babel/babel |
| @babel/helper-validator-identifier | 7.29.7 | MIT | https://github.com/babel/babel |
| @babel/runtime | 7.29.7 | MIT | https://github.com/babel/babel |
| @deepseek-ai/cordis | 4.0.1 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/cordis-plugin-group | 1.0.1 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/cordis-plugin-hmr | 1.0.16 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/cordis-plugin-include | 1.0.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/cordis-plugin-loader | 1.0.2 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/cordis-plugin-timer | 1.1.3 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/cosmokit | 1.8.2 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-agent | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-agent-default-model | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-agent-instructions | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-agent-loop | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-agent-presets | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-agent-tool-presentation | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-anonymous-user-id | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-api-gateway | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-api-remotes | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-app-boot | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-atomic-write | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-attachment | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-attachment-local | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-balance | 0.1.0 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-base | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-bash-local | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-bash-sandbox | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-brand | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-connection | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-file-changes | 0.1.0 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-hmr | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-locale | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-modules | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-runtime | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-schema-form | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-agent-preset | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-attachment | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-commands | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-conversation | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-cordis | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-deliverables | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-directory-picker-browse | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-directory-picker-native | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-goal | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-input-trigger | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-jobs | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-layout | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-message-feedback | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-model-selection | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-permission-presets | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-plan | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-primitives | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-settings | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-settings-general | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-settings-models | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-settings-plugin-inventory | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-settings-plugins | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-sidebar | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-skill | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-slots | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-subagent | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-theme | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-tool | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-trajectory | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-user-questions | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-workflow-run | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-ui-workspace | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-web | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-client-web-react | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-cmdline | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-code-runtime | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-code-runtime-worker-thread | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-command-compact | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-command-feedback | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-command-goal | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-commands | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-compaction | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-compaction-basic | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-compaction-tool-result-pruner | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-conversation-tweaks | 0.1.0 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-cordis-client-runner | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-cordis-host-runner | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-credentials | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-credentials-local | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-file-changes | 0.1.0 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-float-window | 0.1.0 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-fs | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-fs-local | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-fs-observation-policy | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-fs-sandbox | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-goal | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-goal-round-driver | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-headless | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-home-paths | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-host-apiproxy | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-host-directory-picker | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-host-directory-picker-auto | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-host-directory-picker-browse | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-host-directory-picker-native | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-host-frontend-static | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-host-plugin-inventory | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-host-webserver | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-invariants | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-jobs | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-jobs-local | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-launch-environment | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-llm | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-llm-deepseek | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-llm-pi-ai | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-llm-retry | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-mcp-client | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-message-feedback | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-native-command | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-openclaw-bridge | 0.6.0 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-output-retention | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-permission-presets | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-persona | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-plan-mode | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-prompt-custom | 0.1.0 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-pwsh-local | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-pwsh-sandbox | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-repeat-tool-reminder | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-sandbox | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-sandbox-local | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-sandbox-policy | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-sandbox-windows-acl | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-schedule | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-scope | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-checkpoint-policy | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-log-export | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-persistence | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-persistence-jsonl | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-projection | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-projection-cache | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-query | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-query-sqlite | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-reference | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-stats | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-telemetry | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-telemetry-otel | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-title | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-title-first-prompt-llm | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-session-title-llm | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-settings | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-settings-file | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-shell | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-shell-env | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-skill | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-skill-badge | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-skill-filesystem | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-spill | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-spill-local | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-spill-policy | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-storage | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-storage-domain | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-storage-json | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-subagent | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-subagent-fork-in-process | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-subagent-in-process-driver | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-subagent-spawn-in-process | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-subprocess | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-subprocess-local | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-system-prompt | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-terminal | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-terminal-bash | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-terminal-tab | 0.1.0 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-third-party-thinking | 0.1.0 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-time-context | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-timeout | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tmux-context | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-token-meter | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-ask-user | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-bash | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-bash-persistent | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-call-timeout-policy | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-cordis | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-fs | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-fs-search | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-goal | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-jobs | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-pwsh | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-ralph | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-skill | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-str-replace-editor | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-subagent | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-subagent-control | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-subagent-report | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-todo | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-web | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tool-workflow | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-tools | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-typert-loader | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-typert-protocol | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-typert-registry | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-user-approval | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-user-questions | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-web | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-web-app | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-web-frontend | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-web-search-deepseek | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-workflow | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-workflow-worker-thread | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-workspace | 0.1.0-rc.6 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/dsh-wsl-settings | 0.1.0 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @deepseek-ai/node-addon-landlock-run | 0.1.1 | BSD-3-Clause | https://github.com/deepseek-harness/deepseek-harness |
| @deepseek-ai/schemastery | 3.18.1 | MIT | https://github.com/deepseek-ai/deepseek-harness |
| @dsh-external/dsh-super-injector | 0.3.1 | BSD-3-Clause | https://github.com/dsh-external (社区 @dsh-external scope) |
| @dsh-external/dsh-vision | 0.1.0 | BSD-3-Clause | https://github.com/dsh-external (社区 @dsh-external scope) |
| @earendil-works/pi-ai | 0.82.1 | MIT | https://github.com/earendil-works/pi |
| @electron-internal/extract-zip | 1.0.5 | BSD-2-Clause | https://github.com/electron/extract-zip |
| @electron/asar | 3.4.1 | MIT | https://github.com/electron/asar |
| @electron/fuses | 1.8.0 | MIT | https://github.com/electron/fuses |
| @electron/get | 3.1.0 | MIT | https://github.com/electron/get |
| @electron/get | 5.1.0 | MIT | https://github.com/electron/get |
| @electron/notarize | 2.5.0 | MIT | https://github.com/electron/notarize |
| @electron/osx-sign | 1.3.3 | BSD-2-Clause | https://github.com/electron/osx-sign |
| @electron/rebuild | 4.2.0 | MIT | https://github.com/electron/rebuild |
| @electron/universal | 2.0.3 | MIT | https://github.com/electron/universal |
| @electron/windows-sign | 1.2.2 | BSD-2-Clause | https://github.com/electron/windows-sign |
| @emnapi/runtime | 1.11.3 | MIT | https://github.com/toyobayashi/emnapi |
| @google/genai | 1.52.0 | Apache-2.0 | https://github.com/googleapis/js-genai |
| @hono/node-server | 2.1.0 | MIT | https://github.com/honojs/node-server |
| @img/colour | 1.1.0 | MIT | https://github.com/lovell/colour |
| @img/sharp-wasm32 | 0.35.3 | Apache-2.0 AND LGPL-3.0-or-later AND MIT | https://github.com/lovell/sharp |
| @img/sharp-win32-x64 | 0.35.3 | Apache-2.0 AND LGPL-3.0-or-later | https://github.com/lovell/sharp |
| @isaacs/fs-minipass | 4.0.1 | ISC | https://github.com/npm/fs-minipass |
| @joplin/turndown-plugin-gfm | 1.0.67 | MIT | https://github.com/laurent22/joplin-turndown-plugin-gfm |
| @koromix/koffi-win32-x64 | 3.1.5 | MIT | https://github.com/Koromix/koffi |
| @malept/cross-spawn-promise | 2.0.0 | Apache-2.0 | https://github.com/malept/cross-spawn-promise |
| @malept/flatpak-bundler | 0.4.0 | MIT | https://github.com/malept/flatpak-bundler |
| @mistralai/mistralai | 2.2.6 | Apache-2.0 | https://github.com/mistralai/client-ts |
| @mixmark-io/domino | 2.2.0 | BSD-2-Clause | https://github.com/mixmark-io/domino |
| @modelcontextprotocol/sdk | 1.30.0 | MIT | https://github.com/modelcontextprotocol/typescript-sdk |
| @noble/hashes | 1.4.0 | MIT | https://github.com/paulmillr/noble-hashes |
| @noble/hashes | 2.3.0 | MIT | https://github.com/paulmillr/noble-hashes |
| @opentelemetry/api | 1.9.0 | Apache-2.0 | open-telemetry/opentelemetry-js |
| @opentelemetry/api | 1.9.1 | Apache-2.0 | open-telemetry/opentelemetry-js |
| @opentelemetry/api-logs | 0.220.0 | Apache-2.0 | open-telemetry/opentelemetry-js |
| @opentelemetry/core | 2.10.0 | Apache-2.0 | open-telemetry/opentelemetry-js |
| @opentelemetry/core | 2.9.0 | Apache-2.0 | open-telemetry/opentelemetry-js |
| @opentelemetry/exporter-logs-otlp-http | 0.220.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/otlp-exporter-base | 0.220.0 | Apache-2.0 | open-telemetry/opentelemetry-js |
| @opentelemetry/otlp-transformer | 0.220.0 | Apache-2.0 | open-telemetry/opentelemetry-js |
| @opentelemetry/resources | 2.10.0 | Apache-2.0 | open-telemetry/opentelemetry-js |
| @opentelemetry/resources | 2.9.0 | Apache-2.0 | open-telemetry/opentelemetry-js |
| @opentelemetry/sdk-logs | 0.220.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/sdk-metrics | 2.9.0 | Apache-2.0 | open-telemetry/opentelemetry-js |
| @opentelemetry/sdk-trace | 2.9.0 | Apache-2.0 | open-telemetry/opentelemetry-js |
| @opentelemetry/semantic-conventions | 1.43.0 | Apache-2.0 | open-telemetry/opentelemetry-js |
| @peculiar/asn1-schema | 2.8.0 | MIT | https://github.com/PeculiarVentures/asn1-schema |
| @peculiar/json-schema | 1.1.12 | MIT | https://github.com/PeculiarVentures/json-schema |
| @peculiar/utils | 2.0.3 | MIT | https://github.com/PeculiarVentures/pvtsutils |
| @peculiar/webcrypto | 1.7.1 | MIT | https://github.com/PeculiarVentures/webcrypto |
| @protobufjs/aspromise | 1.1.2 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/base64 | 1.1.2 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/codegen | 2.0.5 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/eventemitter | 1.1.1 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/fetch | 1.1.1 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/float | 1.0.2 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/path | 1.1.2 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/pool | 1.1.0 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/utf8 | 1.1.2 | BSD-3-Clause | https://github.com/protobufjs/protobuf.js |
| @shikijs/core | 4.4.3 | MIT | https://github.com/shikijs/shiki |
| @shikijs/engine-javascript | 4.4.3 | MIT | https://github.com/shikijs/shiki |
| @shikijs/engine-oniguruma | 4.4.3 | MIT | https://github.com/shikijs/shiki |
| @shikijs/langs | 4.4.3 | MIT | https://github.com/shikijs/shiki |
| @shikijs/primitive | 4.4.3 | MIT | https://github.com/shikijs/shiki |
| @shikijs/themes | 4.4.3 | MIT | https://github.com/shikijs/shiki |
| @shikijs/types | 4.4.3 | MIT | https://github.com/shikijs/shiki |
| @shikijs/vscode-textmate | 10.0.2 | MIT | https://github.com/shikijs/vscode-textmate |
| @sindresorhus/is | 4.6.0 | MIT | sindresorhus/is |
| @smithy/core | 3.32.0 | Apache-2.0 | https://github.com/smithy-lang/smithy-typescript |
| @smithy/credential-provider-imds | 4.5.0 | Apache-2.0 | https://github.com/smithy-lang/smithy-typescript |
| @smithy/fetch-http-handler | 5.7.0 | Apache-2.0 | https://github.com/smithy-lang/smithy-typescript |
| @smithy/is-array-buffer | 2.2.0 | Apache-2.0 | https://github.com/awslabs/smithy-typescript |
| @smithy/node-http-handler | 4.10.0 | Apache-2.0 | https://github.com/smithy-lang/smithy-typescript |
| @smithy/node-http-handler | 4.7.3 | Apache-2.0 | https://github.com/smithy-lang/smithy-typescript |
| @smithy/signature-v4 | 5.7.0 | Apache-2.0 | https://github.com/smithy-lang/smithy-typescript |
| @smithy/types | 4.17.0 | Apache-2.0 | https://github.com/smithy-lang/smithy-typescript |
| @smithy/util-buffer-from | 2.2.0 | Apache-2.0 | https://github.com/awslabs/smithy-typescript |
| @smithy/util-utf8 | 2.3.0 | Apache-2.0 | https://github.com/awslabs/smithy-typescript |
| @standard-schema/spec | 1.1.0 | MIT | https://github.com/standard-schema/standard-schema |
| @szmarczak/http-timer | 4.0.6 | MIT | https://github.com/szmarczak/http-timer |
| @tanstack/react-virtual | 3.14.9 | MIT | https://github.com/TanStack/virtual |
| @tanstack/virtual-core | 3.17.7 | MIT | https://github.com/TanStack/virtual |
| @types/cacheable-request | 6.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/debug | 4.1.13 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/fs-extra | 9.0.13 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/hast | 3.0.5 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/http-cache-semantics | 4.2.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/katex | 0.16.8 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/keyv | 3.1.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/mdast | 4.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/ms | 2.1.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/node | 24.13.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/node | 26.2.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/responselike | 1.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/retry | 0.12.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/unist | 3.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @ungap/structured-clone | 1.3.3 | ISC | https://github.com/ungap/structured-clone |
| @vscode/ripgrep | 1.18.0 | MIT | https://github.com/microsoft/vscode-ripgrep |
| @vscode/ripgrep-win32-x64 | 1.18.0 | MIT | https://github.com/microsoft/vscode-ripgrep |
| @xmldom/xmldom | 0.8.14 | MIT | https://github.com/xmldom/xmldom |
| abbrev | 4.0.0 | ISC | https://github.com/npm/abbrev-js |
| accepts | 2.0.0 | MIT | jshttp/accepts |
| agent-base | 7.1.4 | MIT | https://github.com/TooTallNate/proxy-agents |
| ajv | 8.20.0 | MIT | ajv-validator/ajv |
| ajv-formats | 3.0.1 | MIT | https://github.com/ajv-validator/ajv-formats |
| anser | 2.3.5 | MIT | https://github.com/IonicaBizau/anser |
| ansi-regex | 5.0.1 | MIT | chalk/ansi-regex |
| ansi-styles | 4.3.0 | MIT | chalk/ansi-styles |
| app-builder-lib | 26.15.3 | MIT | https://github.com/electron-userland/electron-builder |
| argparse | 2.0.1 | Python-2.0 | nodeca/argparse |
| asn1js | 3.0.10 | BSD-3-Clause | https://github.com/PeculiarVentures/ASN1.js |
| async | 3.2.6 | MIT | https://github.com/caolan/async |
| async-exit-hook | 2.0.1 | MIT | https://github.com/tapppi/async-exit-hook |
| asynckit | 0.4.0 | MIT | https://github.com/alexindigo/asynckit |
| at-least-node | 1.0.0 | ISC | https://github.com/RyanZim/at-least-node |
| aws4 | 1.13.2 | MIT | https://github.com/mhart/aws4 |
| balanced-match | 1.0.2 | MIT | https://github.com/juliangruber/balanced-match |
| balanced-match | 4.0.4 | MIT | https://github.com/juliangruber/balanced-match |
| base64-js | 1.5.1 | MIT | https://github.com/beatgammit/base64-js |
| bignumber.js | 9.3.1 | MIT | https://github.com/MikeMcl/bignumber.js |
| bluebird | 3.7.2 | MIT | https://github.com/petkaantonov/bluebird |
| body-parser | 2.3.0 | MIT | expressjs/body-parser |
| boolean | 3.2.0 | MIT | https://github.com/thenativeweb/boolean |
| bowser | 2.14.1 | MIT | https://github.com/bowser-js/bowser |
| brace-expansion | 1.1.18 | MIT | https://github.com/juliangruber/brace-expansion |
| brace-expansion | 2.1.4 | MIT | https://github.com/juliangruber/brace-expansion |
| brace-expansion | 5.0.9 | MIT | https://github.com/juliangruber/brace-expansion |
| buffer-equal-constant-time | 1.0.1 | BSD-3-Clause | git@github.com:goinstant/buffer-equal-constant-time |
| buffer-from | 1.1.2 | MIT | LinusU/buffer-from |
| builder-util | 26.15.3 | MIT | https://github.com/electron-userland/electron-builder |
| builder-util-runtime | 9.7.0 | MIT | https://github.com/electron-userland/electron-builder |
| bytes | 3.1.2 | MIT | visionmedia/bytes.js |
| bytestreamjs | 2.0.1 | BSD-3-Clause | https://github.com/PeculiarVentures/ByteStream.js |
| cacheable-lookup | 5.0.4 | MIT | https://github.com/szmarczak/cacheable-lookup |
| cacheable-request | 7.0.4 | MIT | lukechilds/cacheable-request |
| call-bind-apply-helpers | 1.0.2 | MIT | https://github.com/ljharb/call-bind-apply-helpers |
| call-bound | 1.0.4 | MIT | https://github.com/ljharb/call-bound |
| ccount | 2.0.1 | MIT | wooorm/ccount |
| chalk | 4.1.2 | MIT | chalk/chalk |
| character-entities | 2.0.2 | MIT | wooorm/character-entities |
| character-entities-html4 | 2.1.0 | MIT | wooorm/character-entities-html4 |
| character-entities-legacy | 3.0.0 | MIT | wooorm/character-entities-legacy |
| chokidar | 4.0.3 | MIT | https://github.com/paulmillr/chokidar |
| chokidar | 5.0.0 | MIT | https://github.com/paulmillr/chokidar |
| chownr | 3.0.0 | BlueOak-1.0.0 | https://github.com/isaacs/chownr |
| chromium-pickle-js | 0.2.0 | MIT | https://github.com/electron/node-chromium-pickle-js |
| ci-info | 4.3.1 | MIT | https://github.com/watson/ci-info |
| ci-info | 4.4.0 | MIT | https://github.com/watson/ci-info |
| cliui | 8.0.1 | ISC | yargs/cliui |
| clone-response | 1.0.3 | MIT | https://github.com/sindresorhus/clone-response |
| clsx | 2.1.1 | MIT | lukeed/clsx |
| color-convert | 2.0.1 | MIT | Qix-/color-convert |
| color-name | 1.1.4 | MIT | git@github.com:colorjs/color-name |
| combined-stream | 1.0.8 | MIT | https://github.com/felixge/node-combined-stream |
| comma-separated-tokens | 2.0.3 | MIT | wooorm/comma-separated-tokens |
| commander | 15.0.0 | MIT | https://github.com/tj/commander.js |
| commander | 5.1.0 | MIT | https://github.com/tj/commander.js |
| commander | 8.3.0 | MIT | https://github.com/tj/commander.js |
| commander | 9.5.0 | MIT | https://github.com/tj/commander.js |
| compare-version | 0.1.2 | MIT | kevva/compare-version |
| concat-map | 0.0.1 | MIT | https://github.com/substack/node-concat-map |
| content-disposition | 1.1.0 | MIT | jshttp/content-disposition |
| content-type | 1.0.5 | MIT | jshttp/content-type |
| content-type | 2.0.0 | MIT | jshttp/content-type |
| cookie | 0.7.2 | MIT | jshttp/cookie |
| cookie-signature | 1.2.2 | MIT | https://github.com/visionmedia/node-cookie-signature |
| core-util-is | 1.0.3 | MIT | https://github.com/isaacs/core-util-is |
| cors | 2.8.6 | MIT | expressjs/cors |
| cosmokit | 1.8.1 | MIT | https://github.com/shigma/cosmokit |
| cross-dirname | 0.1.0 | MIT | https://github.com/JumpLink/cross-dirname |
| cross-spawn | 7.0.6 | MIT | git@github.com:moxystudio/node-cross-spawn |
| data-uri-to-buffer | 4.0.1 | MIT | https://github.com/TooTallNate/node-data-uri-to-buffer |
| debug | 4.4.3 | MIT | https://github.com/debug-js/debug |
| decode-named-character-reference | 1.3.0 | MIT | wooorm/decode-named-character-reference |
| decompress-response | 6.0.0 | MIT | sindresorhus/decompress-response |
| defer-to-connect | 2.0.1 | MIT | https://github.com/szmarczak/defer-to-connect |
| define-data-property | 1.1.4 | MIT | https://github.com/ljharb/define-data-property |
| define-properties | 1.2.1 | MIT | https://github.com/ljharb/define-properties |
| delayed-stream | 1.0.0 | MIT | https://github.com/felixge/node-delayed-stream |
| depd | 2.0.0 | MIT | dougwilson/nodejs-depd |
| dequal | 2.0.3 | MIT | lukeed/dequal |
| detect-libc | 2.1.2 | Apache-2.0 | https://github.com/lovell/detect-libc |
| detect-node | 2.1.0 | MIT | https://github.com/iliakan/detect-node |
| devlop | 1.1.0 | MIT | wooorm/devlop |
| diff | 9.0.0 | BSD-3-Clause | https://github.com/kpdecker/jsdiff |
| dir-compare | 4.2.0 | MIT | https://github.com/gliviu/dir-compare |
| dmg-builder | 26.15.3 | MIT | https://github.com/electron-userland/electron-builder |
| dotenv | 16.6.1 | BSD-2-Clause | https://github.com/motdotla/dotenv |
| dotenv-expand | 11.0.7 | BSD-2-Clause | https://github.com/motdotla/dotenv-expand |
| dsh-better-sidebar | 0.12.2 | MIT | https://github.com/omdsh-dev/DSH-better-sidebar |
| dunder-proto | 1.0.1 | MIT | https://github.com/es-shims/dunder-proto |
| duplexer2 | 0.1.4 | BSD-3-Clause | deoxxa/duplexer2 |
| ecdsa-sig-formatter | 1.0.11 | Apache-2.0 | ssh://git@github.com/Brightspace/node-ecdsa-sig-formatter |
| ee-first | 1.1.1 | MIT | jonathanong/ee-first |
| ejs | 3.1.10 | Apache-2.0 | https://github.com/mde/ejs |
| electron | 43.4.0 | MIT | https://github.com/electron/electron |
| electron-builder | 26.15.3 | MIT | https://github.com/electron-userland/electron-builder |
| electron-builder-squirrel-windows | 26.15.3 | MIT | https://github.com/electron-userland/electron-builder |
| electron-publish | 26.15.3 | MIT | https://github.com/electron-userland/electron-builder |
| electron-winstaller | 5.4.0 | MIT | https://github.com/electron/windows-installer |
| emoji-regex | 8.0.0 | MIT | https://github.com/mathiasbynens/emoji-regex |
| encodeurl | 2.0.0 | MIT | pillarjs/encodeurl |
| end-of-stream | 1.4.5 | MIT | https://github.com/mafintosh/end-of-stream |
| env-paths | 2.2.1 | MIT | sindresorhus/env-paths |
| env-paths | 3.0.0 | MIT | sindresorhus/env-paths |
| err-code | 2.0.3 | MIT | https://github.com/IndigoUnited/js-err-code |
| es-define-property | 1.0.1 | MIT | https://github.com/ljharb/es-define-property |
| es-errors | 1.3.0 | MIT | https://github.com/ljharb/es-errors |
| es-object-atoms | 1.1.2 | MIT | https://github.com/ljharb/es-object-atoms |
| es-set-tostringtag | 2.1.0 | MIT | https://github.com/es-shims/es-set-tostringtag |
| es6-error | 4.1.1 | MIT | https://github.com/bjyoungblood/es6-error |
| escalade | 3.2.0 | MIT | lukeed/escalade |
| escape-html | 1.0.3 | MIT | component/escape-html |
| escape-string-regexp | 4.0.0 | MIT | sindresorhus/escape-string-regexp |
| escape-string-regexp | 5.0.0 | MIT | sindresorhus/escape-string-regexp |
| etag | 1.8.1 | MIT | jshttp/etag |
| eventsource | 3.0.7 | MIT | https://git@github.com/EventSource/eventsource |
| eventsource-parser | 3.1.1 | MIT | ssh://git@github.com/rexxars/eventsource-parser |
| exponential-backoff | 3.1.3 | Apache-2.0 | https://github.com/coveooss/exponential-backoff |
| express | 5.2.1 | MIT | expressjs/express |
| express-rate-limit | 8.6.2 | MIT | https://github.com/express-rate-limit/express-rate-limit |
| extend | 3.0.2 | MIT | https://github.com/justmoon/node-extend |
| fast-deep-equal | 3.1.3 | MIT | https://github.com/epoberezkin/fast-deep-equal |
| fast-uri | 3.1.5 | BSD-3-Clause | https://github.com/fastify/fast-uri |
| fdir | 6.5.0 | MIT | https://github.com/thecodrr/fdir |
| fetch-blob | 3.2.0 | MIT | https://github.com/node-fetch/fetch-blob |
| fflate | 0.8.3 | MIT | https://github.com/101arrowz/fflate |
| filelist | 1.0.6 | Apache-2.0 | https://github.com/mde/filelist |
| finalhandler | 2.1.1 | MIT | pillarjs/finalhandler |
| form-data | 4.0.6 | MIT | https://github.com/form-data/form-data |
| formdata-polyfill | 4.0.10 | MIT | https://jimmywarting@github.com/jimmywarting/FormData |
| forwarded | 0.2.0 | MIT | jshttp/forwarded |
| fresh | 2.0.0 | MIT | jshttp/fresh |
| fs-extra | 10.1.0 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 11.3.1 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 11.4.0 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 7.0.1 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 8.1.0 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 9.1.0 | MIT | https://github.com/jprichardson/node-fs-extra |
| fs.realpath | 1.0.0 | ISC | https://github.com/isaacs/fs.realpath |
| function-bind | 1.1.2 | MIT | https://github.com/Raynos/function-bind |
| gaxios | 7.3.1 | Apache-2.0 | https://github.com/googleapis/google-cloud-node |
| gcp-metadata | 8.1.2 | Apache-2.0 | https://github.com/googleapis/google-cloud-node-core |
| get-caller-file | 2.0.5 | ISC | https://github.com/stefanpenner/get-caller-file |
| get-intrinsic | 1.3.0 | MIT | https://github.com/ljharb/get-intrinsic |
| get-proto | 1.0.1 | MIT | https://github.com/ljharb/get-proto |
| get-stream | 5.2.0 | MIT | sindresorhus/get-stream |
| glob | 7.2.3 | ISC | https://github.com/isaacs/node-glob |
| global-agent | 3.0.0 | BSD-3-Clause | https://github.com/gajus/global-agent |
| globalthis | 1.0.4 | MIT | https://github.com/ljharb/System.global |
| google-auth-library | 10.9.1 | Apache-2.0 | https://github.com/googleapis/google-cloud-node |
| google-logging-utils | 1.1.3 | Apache-2.0 | https://github.com/googleapis/google-cloud-node-core |
| gopd | 1.2.0 | MIT | https://github.com/ljharb/gopd |
| got | 11.8.6 | MIT | sindresorhus/got |
| graceful-fs | 4.2.11 | ISC | https://github.com/isaacs/node-graceful-fs |
| harness-pet | 0.1.0 | MIT | https://github.com/cakeni/harness-pet |
| has-flag | 4.0.0 | MIT | sindresorhus/has-flag |
| has-property-descriptors | 1.0.2 | MIT | https://github.com/inspect-js/has-property-descriptors |
| has-symbols | 1.1.0 | MIT | https://github.com/inspect-js/has-symbols |
| has-tostringtag | 1.0.2 | MIT | https://github.com/inspect-js/has-tostringtag |
| hasown | 2.0.4 | MIT | https://github.com/inspect-js/hasOwn |
| hast-util-to-html | 9.0.5 | MIT | syntax-tree/hast-util-to-html |
| hast-util-whitespace | 3.0.0 | MIT | syntax-tree/hast-util-whitespace |
| hono | 4.13.2 | MIT | https://github.com/honojs/hono |
| hosted-git-info | 4.1.0 | ISC | https://github.com/npm/hosted-git-info |
| html-void-elements | 3.0.0 | MIT | wooorm/html-void-elements |
| http-cache-semantics | 4.2.0 | BSD-2-Clause | https://github.com/kornelski/http-cache-semantics |
| http-errors | 2.0.1 | MIT | jshttp/http-errors |
| http-proxy-agent | 7.0.2 | MIT | https://github.com/TooTallNate/proxy-agents |
| http2-wrapper | 1.0.3 | MIT | https://github.com/szmarczak/http2-wrapper |
| https-proxy-agent | 7.0.6 | MIT | https://github.com/TooTallNate/proxy-agents |
| iconv-lite | 0.7.3 | MIT | https://github.com/pillarjs/iconv-lite |
| immer | 10.2.0 | MIT | https://github.com/immerjs/immer |
| inflight | 1.0.6 | ISC | https://github.com/npm/inflight |
| inherits | 2.0.4 | ISC | https://github.com/isaacs/inherits |
| ip-address | 10.5.0 | MIT | https://github.com/beaugunderson/ip-address |
| ipaddr.js | 1.9.1 | MIT | https://github.com/whitequark/ipaddr.js |
| is-fullwidth-code-point | 3.0.0 | MIT | sindresorhus/is-fullwidth-code-point |
| is-promise | 4.0.0 | MIT | https://github.com/then/is-promise |
| isarray | 1.0.0 | MIT | https://github.com/juliangruber/isarray |
| isbinaryfile | 4.0.10 | MIT | https://github.com/gjtorikian/isBinaryFile |
| isbinaryfile | 5.0.7 | MIT | https://github.com/gjtorikian/isBinaryFile |
| isexe | 2.0.0 | ISC | https://github.com/isaacs/isexe |
| isexe | 3.1.5 | BlueOak-1.0.0 | https://github.com/isaacs/isexe |
| isexe | 4.0.0 | BlueOak-1.0.0 | https://github.com/isaacs/isexe |
| jake | 10.9.4 | Apache-2.0 | https://github.com/jakejs/jake |
| jiti | 2.7.0 | MIT | unjs/jiti |
| jose | 6.2.8 | MIT | panva/jose |
| js-tokens | 4.0.0 | MIT | lydell/js-tokens |
| js-yaml | 4.3.1 | MIT | nodeca/js-yaml |
| json-bigint | 1.0.0 | MIT | git@github.com:sidorares/json-bigint |
| json-buffer | 3.0.1 | MIT | https://github.com/dominictarr/json-buffer |
| json-schema-to-ts | 3.1.1 | MIT | https://github.com/ThomasAribart/json-schema-to-ts |
| json-schema-traverse | 1.0.0 | MIT | https://github.com/epoberezkin/json-schema-traverse |
| json-schema-typed | 8.0.2 | BSD-2-Clause | https://github.com/RemyRylan/json-schema-typed |
| json-stringify-safe | 5.0.1 | ISC | https://github.com/isaacs/json-stringify-safe |
| json5 | 2.2.3 | MIT | https://github.com/json5/json5 |
| jsonfile | 4.0.0 | MIT | git@github.com:jprichardson/node-jsonfile |
| jsonfile | 6.2.1 | MIT | git@github.com:jprichardson/node-jsonfile |
| jwa | 2.0.1 | MIT | https://github.com/brianloveswords/node-jwa |
| jws | 4.0.1 | MIT | https://github.com/brianloveswords/node-jws |
| katex | 0.16.47 | MIT | https://github.com/KaTeX/KaTeX |
| keyv | 4.5.4 | MIT | https://github.com/jaredwray/keyv |
| koffi | 3.1.5 | MIT | https://github.com/Koromix/koffi |
| lazy-val | 1.0.5 | MIT | develar/lazy-val |
| lodash | 4.18.1 | MIT | lodash/lodash |
| long | 5.3.2 | Apache-2.0 | https://github.com/dcodeIO/long.js |
| longest-streak | 3.1.0 | MIT | wooorm/longest-streak |
| loose-envify | 1.4.0 | MIT | https://github.com/zertosh/loose-envify |
| lowercase-keys | 2.0.0 | MIT | sindresorhus/lowercase-keys |
| lru-cache | 6.0.0 | ISC | https://github.com/isaacs/node-lru-cache |
| markdown-table | 3.0.4 | MIT | wooorm/markdown-table |
| matcher | 3.0.0 | MIT | sindresorhus/matcher |
| math-intrinsics | 1.1.0 | MIT | https://github.com/es-shims/math-intrinsics |
| mdast-util-find-and-replace | 3.0.2 | MIT | syntax-tree/mdast-util-find-and-replace |
| mdast-util-from-markdown | 2.0.3 | MIT | syntax-tree/mdast-util-from-markdown |
| mdast-util-gfm | 3.1.0 | MIT | syntax-tree/mdast-util-gfm |
| mdast-util-gfm-autolink-literal | 2.0.1 | MIT | syntax-tree/mdast-util-gfm-autolink-literal |
| mdast-util-gfm-footnote | 2.1.0 | MIT | syntax-tree/mdast-util-gfm-footnote |
| mdast-util-gfm-strikethrough | 2.0.0 | MIT | syntax-tree/mdast-util-gfm-strikethrough |
| mdast-util-gfm-table | 2.0.0 | MIT | syntax-tree/mdast-util-gfm-table |
| mdast-util-gfm-task-list-item | 2.0.0 | MIT | syntax-tree/mdast-util-gfm-task-list-item |
| mdast-util-math | 3.0.0 | MIT | syntax-tree/mdast-util-math |
| mdast-util-phrasing | 4.1.0 | MIT | syntax-tree/mdast-util-phrasing |
| mdast-util-to-hast | 13.2.1 | MIT | syntax-tree/mdast-util-to-hast |
| mdast-util-to-markdown | 2.1.2 | MIT | syntax-tree/mdast-util-to-markdown |
| mdast-util-to-string | 4.0.0 | MIT | syntax-tree/mdast-util-to-string |
| media-typer | 1.1.1 | MIT | jshttp/media-typer |
| merge-descriptors | 2.0.0 | MIT | sindresorhus/merge-descriptors |
| micromark | 4.0.2 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark |
| micromark-core-commonmark | 2.0.3 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-core-commonmark |
| micromark-extension-gfm | 3.0.0 | MIT | micromark/micromark-extension-gfm |
| micromark-extension-gfm-autolink-literal | 2.1.0 | MIT | micromark/micromark-extension-gfm-autolink-literal |
| micromark-extension-gfm-footnote | 2.1.0 | MIT | micromark/micromark-extension-gfm-footnote |
| micromark-extension-gfm-strikethrough | 2.1.0 | MIT | micromark/micromark-extension-gfm-strikethrough |
| micromark-extension-gfm-table | 2.1.1 | MIT | micromark/micromark-extension-gfm-table |
| micromark-extension-gfm-tagfilter | 2.0.0 | MIT | micromark/micromark-extension-gfm-tagfilter |
| micromark-extension-gfm-task-list-item | 2.1.0 | MIT | micromark/micromark-extension-gfm-task-list-item |
| micromark-extension-math | 3.1.0 | MIT | micromark/micromark-extension-math |
| micromark-factory-destination | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-factory-destination |
| micromark-factory-label | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-factory-label |
| micromark-factory-space | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-factory-space |
| micromark-factory-title | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-factory-title |
| micromark-factory-whitespace | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-factory-whitespace |
| micromark-util-character | 2.1.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-character |
| micromark-util-chunked | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-chunked |
| micromark-util-classify-character | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-classify-character |
| micromark-util-combine-extensions | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-combine-extensions |
| micromark-util-decode-numeric-character-reference | 2.0.2 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-decode-numeric-character-reference |
| micromark-util-decode-string | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-decode-string |
| micromark-util-encode | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-encode |
| micromark-util-html-tag-name | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-html-tag-name |
| micromark-util-normalize-identifier | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-normalize-identifier |
| micromark-util-resolve-all | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-resolve-all |
| micromark-util-sanitize-uri | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-sanitize-uri |
| micromark-util-subtokenize | 2.1.0 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-subtokenize |
| micromark-util-symbol | 2.0.1 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-symbol |
| micromark-util-types | 2.0.2 | MIT | https://github.com/micromark/micromark/tree/main/packages/micromark-util-types |
| mime | 2.6.0 | MIT | https://github.com/broofa/mime |
| mime-db | 1.52.0 | MIT | jshttp/mime-db |
| mime-db | 1.54.0 | MIT | jshttp/mime-db |
| mime-types | 2.1.35 | MIT | jshttp/mime-types |
| mime-types | 3.0.2 | MIT | jshttp/mime-types |
| mimic-response | 1.0.1 | MIT | sindresorhus/mimic-response |
| mimic-response | 3.1.0 | MIT | sindresorhus/mimic-response |
| minimatch | 10.2.6 | BlueOak-1.0.0 | git@github.com:isaacs/minimatch |
| minimatch | 3.1.5 | ISC | https://github.com/isaacs/minimatch |
| minimatch | 5.1.9 | ISC | https://github.com/isaacs/minimatch |
| minimatch | 9.0.9 | ISC | https://github.com/isaacs/minimatch |
| minimist | 1.2.8 | MIT | https://github.com/minimistjs/minimist |
| minipass | 7.1.3 | BlueOak-1.0.0 | https://github.com/isaacs/minipass |
| minizlib | 3.1.0 | MIT | https://github.com/isaacs/minizlib |
| mkdirp | 0.5.6 | MIT | https://github.com/substack/node-mkdirp |
| ms | 2.1.3 | MIT | vercel/ms |
| negotiator | 1.0.0 | MIT | jshttp/negotiator |
| node-abi | 4.33.0 | MIT | https://github.com/electron/node-abi |
| node-addon-api | 7.1.1 | MIT | https://github.com/nodejs/node-addon-api |
| node-addon-native-custom-loader | 0.1.4 | MIT | — |
| node-addon-require-builtin | 0.1.4 | MIT | — |
| node-addon-require-builtin-win32-x64-msvc | 0.1.4 | MIT | — |
| node-api-version | 0.2.1 | MIT | https://github.com/timfish/node-api-version |
| node-domexception | 1.0.0 | MIT | https://github.com/jimmywarting/node-domexception |
| node-fetch | 3.3.2 | MIT | https://github.com/node-fetch/node-fetch |
| node-gyp | 12.4.0 | MIT | https://github.com/nodejs/node-gyp |
| node-int64 | 0.4.0 | MIT | https://github.com/broofa/node-int64 |
| node-pty | 1.1.0 | MIT | https://github.com/microsoft/node-pty |
| nopt | 9.0.0 | ISC | https://github.com/npm/nopt |
| normalize-url | 6.1.0 | MIT | sindresorhus/normalize-url |
| object-assign | 4.1.1 | MIT | sindresorhus/object-assign |
| object-inspect | 1.13.4 | MIT | https://github.com/inspect-js/object-inspect |
| object-keys | 1.1.1 | MIT | https://github.com/ljharb/object-keys |
| on-finished | 2.4.1 | MIT | jshttp/on-finished |
| once | 1.4.0 | ISC | https://github.com/isaacs/once |
| oniguruma-parser | 0.12.2 | MIT | https://github.com/slevithan/oniguruma-parser |
| oniguruma-to-es | 4.3.6 | MIT | https://github.com/slevithan/oniguruma-to-es |
| openai | 6.26.0 | Apache-2.0 | https://github.com/openai/openai-node |
| p-cancelable | 2.1.1 | MIT | sindresorhus/p-cancelable |
| p-limit | 3.1.0 | MIT | sindresorhus/p-limit |
| p-retry | 4.6.2 | MIT | sindresorhus/p-retry |
| parseurl | 1.3.3 | MIT | pillarjs/parseurl |
| partial-json | 0.1.7 | MIT | https://github.com/promplate/partial-json-parser-js |
| path-is-absolute | 1.0.1 | MIT | sindresorhus/path-is-absolute |
| path-key | 3.1.1 | MIT | sindresorhus/path-key |
| path-to-regexp | 8.4.2 | MIT | https://github.com/pillarjs/path-to-regexp |
| pe-library | 0.4.1 | MIT | https://github.com/jet2jet/pe-library-js |
| picocolors | 1.1.1 | ISC | alexeyraspopov/picocolors |
| picomatch | 4.0.5 | MIT | micromatch/picomatch |
| pkce-challenge | 5.0.1 | MIT | https://github.com/crouchcd/pkce-challenge |
| pkijs | 3.4.0 | BSD-3-Clause | https://github.com/PeculiarVentures/PKI.js |
| plist | 3.1.0 | MIT | https://github.com/TooTallNate/node-plist |
| postject | 1.0.0-alpha.6 | MIT | git@github.com:nodejs/postject |
| proc-log | 6.1.0 | ISC | https://github.com/npm/proc-log |
| process-nextick-args | 2.0.1 | MIT | https://github.com/calvinmetcalf/process-nextick-args |
| progress | 2.0.3 | MIT | https://github.com/visionmedia/node-progress |
| promise-retry | 2.0.1 | MIT | https://github.com/IndigoUnited/node-promise-retry |
| proper-lockfile | 4.1.2 | MIT | git@github.com:moxystudio/node-proper-lockfile |
| property-information | 7.2.0 | MIT | wooorm/property-information |
| protobufjs | 7.6.5 | BSD-3-Clause | protobufjs/protobuf.js |
| proxy-addr | 2.0.7 | MIT | jshttp/proxy-addr |
| pump | 3.0.4 | MIT | https://github.com/mafintosh/pump |
| pvtsutils | 1.3.6 | MIT | https://github.com/PeculiarVentures/pvtsutils |
| pvutils | 1.2.0 | MIT | https://github.com/PeculiarVentures/pvutils |
| qs | 6.15.3 | BSD-3-Clause | https://github.com/ljharb/qs |
| quick-lru | 5.1.1 | MIT | sindresorhus/quick-lru |
| range-parser | 1.3.0 | MIT | jshttp/range-parser |
| raw-body | 3.0.2 | MIT | stream-utils/raw-body |
| react | 18.3.1 | MIT | https://github.com/facebook/react |
| react-dom | 18.3.1 | MIT | https://github.com/facebook/react |
| read-binary-file-arch | 1.0.6 | MIT | ssh://git@github.com/samuelmaddock/read-binary-file-arch |
| readable-stream | 2.3.8 | MIT | https://github.com/nodejs/readable-stream |
| readdirp | 4.1.2 | MIT | https://github.com/paulmillr/readdirp |
| readdirp | 5.1.1 | MIT | https://github.com/paulmillr/readdirp |
| regex | 6.1.0 | MIT | https://github.com/slevithan/regex |
| regex-recursion | 6.0.2 | MIT | https://github.com/slevithan/regex-recursion |
| regex-utilities | 2.3.0 | MIT | https://github.com/slevithan/regex-utilities |
| require-directory | 2.1.1 | MIT | https://github.com/troygoode/node-require-directory |
| require-from-string | 2.0.2 | MIT | floatdrop/require-from-string |
| resedit | 1.7.2 | MIT | https://github.com/jet2jet/resedit-js |
| resolve-alpn | 1.2.1 | MIT | https://github.com/szmarczak/resolve-alpn |
| responselike | 2.0.1 | MIT | https://github.com/sindresorhus/responselike |
| retry | 0.12.0 | MIT | https://github.com/tim-kos/node-retry |
| retry | 0.13.1 | MIT | https://github.com/tim-kos/node-retry |
| rimraf | 2.6.3 | ISC | https://github.com/isaacs/rimraf |
| roarr | 2.15.4 | BSD-3-Clause | git@github.com:gajus/roarr |
| router | 2.2.0 | MIT | pillarjs/router |
| safe-buffer | 5.1.2 | MIT | https://github.com/feross/safe-buffer |
| safe-buffer | 5.2.1 | MIT | https://github.com/feross/safe-buffer |
| safer-buffer | 2.1.2 | MIT | https://github.com/ChALkeR/safer-buffer |
| sanitize-filename | 1.6.4 | WTFPL OR ISC | git@github.com:parshap/node-sanitize-filename |
| sax | 1.6.1 | BlueOak-1.0.0 | ssh://git@github.com/isaacs/sax-js |
| scheduler | 0.23.2 | MIT | https://github.com/facebook/react |
| schemastery | 3.18.0 | MIT | https://github.com/shigma/schemastery |
| semver | 5.7.2 | ISC | https://github.com/npm/node-semver |
| semver | 6.3.1 | ISC | https://github.com/npm/node-semver |
| semver | 7.7.4 | ISC | https://github.com/npm/node-semver |
| semver | 7.8.5 | ISC | https://github.com/npm/node-semver |
| semver-compare | 1.0.0 | MIT | https://github.com/substack/semver-compare |
| send | 1.2.1 | MIT | pillarjs/send |
| serialize-error | 7.0.1 | MIT | sindresorhus/serialize-error |
| serve-static | 2.2.1 | MIT | expressjs/serve-static |
| setprototypeof | 1.2.0 | ISC | https://github.com/wesleytodd/setprototypeof |
| sharp | 0.35.3 | Apache-2.0 | https://github.com/lovell/sharp |
| shebang-command | 2.0.0 | MIT | kevva/shebang-command |
| shebang-regex | 3.0.0 | MIT | sindresorhus/shebang-regex |
| shiki | 4.4.3 | MIT | https://github.com/shikijs/shiki |
| side-channel | 1.1.1 | MIT | https://github.com/ljharb/side-channel |
| side-channel-list | 1.0.1 | MIT | https://github.com/ljharb/side-channel-list |
| side-channel-map | 1.0.1 | MIT | https://github.com/ljharb/side-channel-map |
| side-channel-weakmap | 1.0.2 | MIT | https://github.com/ljharb/side-channel-weakmap |
| signal-exit | 3.0.7 | ISC | https://github.com/tapjs/signal-exit |
| simple-update-notifier | 2.0.0 | MIT | https://github.com/alexbrazier/simple-update-notifier |
| source-map | 0.6.1 | BSD-3-Clause | http://github.com/mozilla/source-map |
| source-map-support | 0.5.21 | MIT | https://github.com/evanw/node-source-map-support |
| space-separated-tokens | 2.0.2 | MIT | wooorm/space-separated-tokens |
| sprintf-js | 1.1.3 | BSD-3-Clause | https://github.com/alexei/sprintf.js |
| stat-mode | 1.0.0 | MIT | https://github.com/TooTallNate/stat-mode |
| statuses | 2.0.2 | MIT | jshttp/statuses |
| string_decoder | 1.1.1 | MIT | https://github.com/nodejs/string_decoder |
| string-width | 4.2.3 | MIT | sindresorhus/string-width |
| stringify-entities | 4.0.4 | MIT | wooorm/stringify-entities |
| strip-ansi | 6.0.1 | MIT | chalk/strip-ansi |
| sumchecker | 3.0.1 | Apache-2.0 | https://github.com/malept/sumchecker |
| supports-color | 7.2.0 | MIT | chalk/supports-color |
| tar | 7.5.22 | BlueOak-1.0.0 | https://github.com/isaacs/node-tar |
| temp | 0.9.4 | MIT | https://github.com/bruce/node-temp |
| temp-file | 3.4.0 | MIT | develar/temp-file |
| tiny-async-pool | 1.3.0 | MIT | git@github.com:rxaviers/async-pool |
| tinyglobby | 0.2.17 | MIT | https://github.com/SuperchupuDev/tinyglobby |
| tmp | 0.2.7 | MIT | https://github.com/raszi/node-tmp |
| tmp-promise | 3.0.3 | MIT | https://github.com/benjamingr/tmp-promise |
| toidentifier | 1.0.1 | MIT | component/toidentifier |
| trim-lines | 3.0.1 | MIT | wooorm/trim-lines |
| truncate-utf8-bytes | 1.0.2 | WTFPL | https://github.com/parshap/truncate-utf8-bytes |
| ts-algebra | 2.0.0 | MIT | https://github.com/ThomasAribart/ts-algebra |
| tslib | 2.8.1 | 0BSD | https://github.com/Microsoft/tslib |
| turndown | 7.2.4 | MIT | https://github.com/mixmark-io/turndown |
| type-fest | 0.13.1 | (MIT OR CC0-1.0) | sindresorhus/type-fest |
| type-is | 2.1.0 | MIT | jshttp/type-is |
| typebox | 1.1.38 | MIT | https://github.com/sinclairzx81/typebox |
| undici | 6.28.0 | MIT | https://github.com/nodejs/undici |
| undici | 7.29.0 | MIT | https://github.com/nodejs/undici |
| undici-types | 7.18.2 | MIT | https://github.com/nodejs/undici |
| undici-types | 8.3.0 | MIT | https://github.com/nodejs/undici |
| unist-util-is | 6.0.1 | MIT | syntax-tree/unist-util-is |
| unist-util-position | 5.0.0 | MIT | syntax-tree/unist-util-position |
| unist-util-remove-position | 5.0.0 | MIT | syntax-tree/unist-util-remove-position |
| unist-util-stringify-position | 4.0.0 | MIT | syntax-tree/unist-util-stringify-position |
| unist-util-visit | 5.1.0 | MIT | syntax-tree/unist-util-visit |
| unist-util-visit-parents | 6.0.2 | MIT | syntax-tree/unist-util-visit-parents |
| universalify | 0.1.2 | MIT | https://github.com/RyanZim/universalify |
| universalify | 2.0.1 | MIT | https://github.com/RyanZim/universalify |
| unpipe | 1.0.0 | MIT | stream-utils/unpipe |
| unzipper | 0.12.5 | MIT | https://github.com/ZJONSSON/node-unzipper |
| use-sync-external-store | 1.2.0 | MIT | https://github.com/facebook/react |
| utf8-byte-length | 1.0.5 | (WTFPL OR MIT) | https://github.com/parshap/utf8-byte-length |
| util-deprecate | 1.0.2 | MIT | https://github.com/TooTallNate/util-deprecate |
| vary | 1.1.2 | MIT | jshttp/vary |
| vfile | 6.0.3 | MIT | vfile/vfile |
| vfile-message | 4.0.3 | MIT | vfile/vfile-message |
| web-streams-polyfill | 3.3.3 | MIT | https://github.com/MattiasBuelens/web-streams-polyfill |
| webcrypto-core | 1.9.2 | MIT | https://github.com/PeculiarVentures/webcrypto-core |
| which | 2.0.2 | ISC | https://github.com/isaacs/node-which |
| which | 5.0.0 | ISC | https://github.com/npm/node-which |
| which | 6.0.1 | ISC | https://github.com/npm/node-which |
| wrap-ansi | 7.0.0 | MIT | chalk/wrap-ansi |
| wrappy | 1.0.2 | ISC | https://github.com/npm/wrappy |
| ws | 8.21.3 | MIT | https://github.com/websockets/ws |
| xmlbuilder | 15.1.1 | MIT | https://github.com/oozcitak/xmlbuilder-js |
| y18n | 5.0.8 | ISC | yargs/y18n |
| yallist | 4.0.0 | ISC | https://github.com/isaacs/yallist |
| yallist | 5.0.0 | BlueOak-1.0.0 | https://github.com/isaacs/yallist |
| yaml | 2.9.0 | ISC | https://github.com/eemeli/yaml |
| yargs | 17.7.3 | MIT | https://github.com/yargs/yargs |
| yargs-parser | 21.1.1 | ISC | https://github.com/yargs/yargs-parser |
| yocto-queue | 0.1.0 | MIT | sindresorhus/yocto-queue |
| zat-dsh-engine | 0.4.0 | MIT | https://github.com/mishibeikejie/zat-dsh-engine |
| zod | 4.4.3 | MIT | https://github.com/colinhacks/zod |
| zod-to-json-schema | 3.25.2 | ISC | https://github.com/StefanTerdell/zod-to-json-schema |
| zstddec | 0.2.0 | MIT AND BSD-3-Clause | https://github.com/donmccurdy/zstddec |
| zustand | 4.4.7 | MIT | https://github.com/pmndrs/zustand |
| zwitch | 2.0.4 | MIT | wooorm/zwitch |
