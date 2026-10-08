# 第三方开源组件声明 / THIRD-PARTY NOTICES

> DSH Desktop（本项目）许可证：**MIT**，见 [LICENSE](LICENSE)。
> 本文件声明本项目使用、引用或分发的第三方开源组件及其许可证。各组件的完整许可证文本以其各自源仓库为准。

**口径（v1.0.0 纯净线）**：本清单按**实际进安装包的载荷**现场重算——
`dsh-tauri/package-payload/dsh-desktop` 的 `node_modules` 全树（768 个唯一 `包名@版本`，其中 DeepSeek 官方 330 个）、
内置运行时（Node v24.15.0 + npm 11.12.1）与 Tauri/Rust 壳层（`src-tauri/Cargo.lock`，531 个 crate）。

与旧版清单的两点实质差异：① **不再有 Electron**——壳层是 Tauri 2，渲染后端为系统 WebView（Windows 的 WebView2 / macOS 的 WKWebView / Linux 的 WebKitGTK），
electron / electron-builder / electron-winstaller 已从载荷中排除；② **内置插件不进安装包**（见第 4 节），
它们只作为仓库源码随本仓库分发。

---

## 1. 运行时直接依赖（Runtime Dependencies）

### 1.1 第三方基础库（本项目 `package.json` 直接声明）

| 组件 | 版本 | 许可证 | 来源 |
|---|---|---|---|
| schemastery | 3.18.0 | MIT | https://github.com/shigma/schemastery |
| ws | 8.22.0 | MIT | https://github.com/websockets/ws |
| yaml | 2.9.1 | ISC | https://eemeli.org/yaml/ |
| zod | 4.4.3 | MIT | https://zod.dev |
| zstddec | 0.2.0 | MIT AND BSD-3-Clause | github:donmccurdy/zstddec |

### 1.2 DeepSeek 官方内核（@deepseek-ai，本项目直接声明）

均来自 https://github.com/deepseek-ai/deepseek-harness ，许可证 **MIT**：

| 组件 | 进包版本 |
|---|---|
| @deepseek-ai/cordis | 4.0.4 |
| @deepseek-ai/cordis-plugin-group | 1.0.4 |
| @deepseek-ai/cordis-plugin-include | 1.0.9 |
| @deepseek-ai/cordis-plugin-loader | 1.0.5 |
| @deepseek-ai/cordis-plugin-timer | 1.1.6 |
| @deepseek-ai/cosmokit | 1.8.5 |
| @deepseek-ai/dsh | 0.2.0-rc.2 |
| @deepseek-ai/dsh-acp | 0.2.0-rc.2 |
| @deepseek-ai/dsh-acp-app | 0.2.0-rc.2 |
| @deepseek-ai/dsh-agent | 0.2.0-rc.2 |
| @deepseek-ai/dsh-agent-default-model | 0.2.0-rc.2 |
| @deepseek-ai/dsh-agent-instructions | 0.2.0-rc.2 |
| @deepseek-ai/dsh-agent-loop | 0.2.0-rc.2 |
| @deepseek-ai/dsh-agent-loop-testkit | 0.2.0-rc.2 |
| @deepseek-ai/dsh-agent-preset | 0.2.0-rc.2 |
| @deepseek-ai/dsh-agent-preset-registry | 0.2.0-rc.2 |
| @deepseek-ai/dsh-agent-tool-presentation | 0.2.0-rc.2 |
| @deepseek-ai/dsh-anonymous-user-id | 0.2.0-rc.2 |
| @deepseek-ai/dsh-api-account-controller | 0.2.0-rc.2 |
| @deepseek-ai/dsh-api-gateway | 0.2.0-rc.2 |
| @deepseek-ai/dsh-api-job-controller | 0.2.0-rc.2 |
| @deepseek-ai/dsh-api-remotes | 0.2.0-rc.2 |
| @deepseek-ai/dsh-api-session-controller | 0.2.0-rc.2 |
| @deepseek-ai/dsh-api-settings-controller | 0.2.0-rc.2 |
| @deepseek-ai/dsh-api-terminal-controller | 0.2.0-rc.2 |
| @deepseek-ai/dsh-api-workspace-controller | 0.2.0-rc.2 |
| @deepseek-ai/dsh-api-workspace-files | 0.2.0-rc.2 |
| @deepseek-ai/dsh-app-boot | 0.2.0-rc.2 |
| @deepseek-ai/dsh-atomic-write | 0.2.0-rc.2 |
| @deepseek-ai/dsh-attachment | 0.2.0-rc.2 |
| @deepseek-ai/dsh-attachment-local | 0.2.0-rc.2 |
| @deepseek-ai/dsh-authorization | 0.2.0-rc.2 |
| @deepseek-ai/dsh-base | 0.2.0-rc.2 |
| @deepseek-ai/dsh-bash-local | 0.2.0-rc.2 |
| @deepseek-ai/dsh-bash-sandbox | 0.2.0-rc.2 |
| @deepseek-ai/dsh-brand | 0.2.0-rc.2 |
| @deepseek-ai/dsh-browser-use | 0.2.0-rc.2 |
| @deepseek-ai/dsh-chunked-list | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-connection | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-file-upload | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-hmr | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-locale | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-modules | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-product-analytics | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-resources | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-shortcuts | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-store | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-test-runtime | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-agent-preset | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-approval | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-attachment | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-brand-official | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-chat | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-commands | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-conversation | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-cordis | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-deliverables | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-directory-picker-browse | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-directory-picker-native | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-dockkit | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-goal | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-input-trigger | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-jobs | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-layout | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-message-feedback | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-model-selection | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-open-in-app | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-permission-presets | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-plan | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-plugin-manager | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-primitives | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-reference | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-renderer | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-schedule | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-session | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-settings | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-settings-account | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-settings-agent-loop | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-settings-general | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-settings-models | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-settings-plugin-inventory | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-settings-plugins | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-settings-session-log | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-settings-shell | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-settings-subagent | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-settings-web-search | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-shortcuts | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-sidebar | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-sidebar-browser | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-sidebar-documentpreview | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-sidebar-files | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-sidebar-right | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-sidebar-terminal | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-skill | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-slots | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-subagent | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-theme | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-tool | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-trajectory | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-user-questions | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-workflow-run | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-ui-workspace | 0.2.0-rc.2 |
| @deepseek-ai/dsh-client-web | 0.2.0-rc.2 |
| @deepseek-ai/dsh-cmdline | 0.2.0-rc.2 |
| @deepseek-ai/dsh-command-compact | 0.2.0-rc.2 |
| @deepseek-ai/dsh-command-feedback | 0.2.0-rc.2 |
| @deepseek-ai/dsh-command-goal | 0.2.0-rc.2 |
| @deepseek-ai/dsh-commands | 0.2.0-rc.2 |
| @deepseek-ai/dsh-compaction | 0.2.0-rc.2 |
| @deepseek-ai/dsh-compaction-basic | 0.2.0-rc.2 |
| @deepseek-ai/dsh-compaction-image-offload | 0.2.0-rc.2 |
| @deepseek-ai/dsh-compaction-tool-result-pruner | 0.2.0-rc.2 |
| @deepseek-ai/dsh-computer-use | 0.2.0-rc.2 |
| @deepseek-ai/dsh-config-editor | 0.2.0-rc.2 |
| @deepseek-ai/dsh-cordis-client-runner | 0.2.0-rc.2 |
| @deepseek-ai/dsh-cordis-host-runner | 0.2.0-rc.2 |
| @deepseek-ai/dsh-credentials | 0.2.0-rc.2 |
| @deepseek-ai/dsh-credentials-local | 0.2.0-rc.2 |
| @deepseek-ai/dsh-deepseek-account | 0.2.0-rc.2 |
| @deepseek-ai/dsh-deepseek-account-platform | 0.2.0-rc.2 |
| @deepseek-ai/dsh-deepseek-llm-api-extensions | 0.2.0-rc.2 |
| @deepseek-ai/dsh-deque | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-agent-team | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-agent-team-profile | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-api-speech-to-text | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-auto-review | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-browser-use-playwright-mcp | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-browser-use-runtime | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-browser-use-stagehand-native | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-client-ui-agent-team | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-client-ui-voice-input | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-computer-use-cua-driver-native | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-inspector | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-ptc-runtime-python | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-schedule-bundle | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-speech-to-text | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-speech-to-text-sensevoice | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-tool-agent-team | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-voice-input-bundle | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-webworker-packer | 0.2.0-rc.2 |
| @deepseek-ai/dsh-experimental-webworker-runtime | 0.2.0-rc.2 |
| @deepseek-ai/dsh-file-reference | 0.2.0-rc.2 |
| @deepseek-ai/dsh-file-reference-local | 0.2.0-rc.2 |
| @deepseek-ai/dsh-fs | 0.2.0-rc.2 |
| @deepseek-ai/dsh-fs-local | 0.2.0-rc.2 |
| @deepseek-ai/dsh-fs-observation-policy | 0.2.0-rc.2 |
| @deepseek-ai/dsh-fs-sandbox | 0.2.0-rc.2 |
| @deepseek-ai/dsh-fs-ssh | 0.2.0-rc.2 |
| @deepseek-ai/dsh-goal | 0.2.0-rc.2 |
| @deepseek-ai/dsh-goal-round-driver | 0.2.0-rc.2 |
| @deepseek-ai/dsh-headless | 0.2.0-rc.2 |
| @deepseek-ai/dsh-hmr | 0.2.0-rc.2 |
| @deepseek-ai/dsh-home-paths | 0.2.0-rc.2 |
| @deepseek-ai/dsh-hook-protocol | 0.2.0-rc.2 |
| @deepseek-ai/dsh-hooks-claude-code | 0.2.0-rc.2 |
| @deepseek-ai/dsh-hooks-codex | 0.2.0-rc.2 |
| @deepseek-ai/dsh-host-directory-picker | 0.2.0-rc.2 |
| @deepseek-ai/dsh-host-directory-picker-auto | 0.2.0-rc.2 |
| @deepseek-ai/dsh-host-directory-picker-browse | 0.2.0-rc.2 |
| @deepseek-ai/dsh-host-directory-picker-native | 0.2.0-rc.2 |
| @deepseek-ai/dsh-host-frontend-static | 0.2.0-rc.2 |
| @deepseek-ai/dsh-host-open-in-app | 0.2.0-rc.2 |
| @deepseek-ai/dsh-host-plugin-inventory | 0.2.0-rc.2 |
| @deepseek-ai/dsh-host-product-telemetry-otel | 0.2.0-rc.2 |
| @deepseek-ai/dsh-host-webserver | 0.2.0-rc.2 |
| @deepseek-ai/dsh-http-proxy | 0.2.0-rc.2 |
| @deepseek-ai/dsh-invariants | 0.2.0-rc.2 |
| @deepseek-ai/dsh-jobs | 0.2.0-rc.2 |
| @deepseek-ai/dsh-jobs-local | 0.2.0-rc.2 |
| @deepseek-ai/dsh-launch-environment | 0.2.0-rc.2 |
| @deepseek-ai/dsh-lazy-require | 0.2.0-rc.2 |
| @deepseek-ai/dsh-llm | 0.2.0-rc.2 |
| @deepseek-ai/dsh-llm-deepseek | 0.2.0-rc.2 |
| @deepseek-ai/dsh-llm-deepseek-account | 0.2.0-rc.2 |
| @deepseek-ai/dsh-llm-deepseek-api-key | 0.2.0-rc.2 |
| @deepseek-ai/dsh-llm-mock-server | 0.2.0-rc.2 |
| @deepseek-ai/dsh-llm-pi-ai | 0.2.0-rc.2 |
| @deepseek-ai/dsh-llm-replay | 0.2.0-rc.2 |
| @deepseek-ai/dsh-llm-retry | 0.2.0-rc.2 |
| @deepseek-ai/dsh-loader-smoke | 0.2.0-rc.2 |
| @deepseek-ai/dsh-lsp | 0.2.0-rc.2 |
| @deepseek-ai/dsh-lsp-stdio | 0.2.0-rc.2 |
| @deepseek-ai/dsh-mcp-client | 0.2.0-rc.2 |
| @deepseek-ai/dsh-mcp-resources | 0.2.0-rc.2 |
| @deepseek-ai/dsh-message-feedback | 0.2.0-rc.2 |
| @deepseek-ai/dsh-native-command | 0.2.0-rc.2 |
| @deepseek-ai/dsh-office-to-pdf | 0.2.0-rc.2 |
| @deepseek-ai/dsh-otel | 0.2.0-rc.2 |
| @deepseek-ai/dsh-output-retention | 0.2.0-rc.2 |
| @deepseek-ai/dsh-package-manifest | 0.2.0-rc.2 |
| @deepseek-ai/dsh-permission-presets | 0.2.0-rc.2 |
| @deepseek-ai/dsh-persona | 0.2.0-rc.2 |
| @deepseek-ai/dsh-plan-mode | 0.2.0-rc.2 |
| @deepseek-ai/dsh-plugin-manager | 0.2.0-rc.2 |
| @deepseek-ai/dsh-plugin-package-inventory-deepseek | 0.2.0-rc.2 |
| @deepseek-ai/dsh-ptc-runtime | 0.2.0-rc.2 |
| @deepseek-ai/dsh-ptc-runtime-node | 0.2.0-rc.2 |
| @deepseek-ai/dsh-pwsh-local | 0.2.0-rc.2 |
| @deepseek-ai/dsh-pwsh-sandbox | 0.2.0-rc.2 |
| @deepseek-ai/dsh-remote-mock | 0.2.0-rc.2 |
| @deepseek-ai/dsh-repeat-tool-reminder | 0.2.0-rc.2 |
| @deepseek-ai/dsh-sandbox | 0.2.0-rc.2 |
| @deepseek-ai/dsh-sandbox-local | 0.2.0-rc.2 |
| @deepseek-ai/dsh-sandbox-policy | 0.2.0-rc.2 |
| @deepseek-ai/dsh-sandbox-ssh | 0.2.0-rc.2 |
| @deepseek-ai/dsh-sandbox-windows-acl | 0.2.0-rc.2 |
| @deepseek-ai/dsh-schedule | 0.2.0-rc.2 |
| @deepseek-ai/dsh-scope | 0.2.0-rc.2 |
| @deepseek-ai/dsh-sdk-app | 0.2.0-rc.2 |
| @deepseek-ai/dsh-sdk-client | 0.2.0-rc.2 |
| @deepseek-ai/dsh-sdk-jsonrpc-server | 0.2.0-rc.2 |
| @deepseek-ai/dsh-sdk-minimal | 0.2.0-rc.2 |
| @deepseek-ai/dsh-sdk-protocol | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-checkpoint-policy | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-format | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-format-catalog | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-format-v0-to-v1 | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-format-v1-to-v2 | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-format-v2-to-v3 | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-format-v3-to-v4 | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-log-deepseek | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-log-export | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-persistence | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-persistence-jsonl | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-projection | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-projection-cache | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-query | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-query-sqlite | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-reference | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-snapshot | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-stats | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-telemetry | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-telemetry-otel | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-title | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-title-all-prompts-llm | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-title-first-prompt-llm | 0.2.0-rc.2 |
| @deepseek-ai/dsh-session-title-llm | 0.2.0-rc.2 |
| @deepseek-ai/dsh-settings | 0.2.0-rc.2 |
| @deepseek-ai/dsh-shell | 0.2.0-rc.2 |
| @deepseek-ai/dsh-shell-env | 0.2.0-rc.2 |
| @deepseek-ai/dsh-skill | 0.2.0-rc.2 |
| @deepseek-ai/dsh-skill-badge | 0.2.0-rc.2 |
| @deepseek-ai/dsh-skill-filesystem | 0.2.0-rc.2 |
| @deepseek-ai/dsh-skill-office | 0.2.0-rc.2 |
| @deepseek-ai/dsh-spill | 0.2.0-rc.2 |
| @deepseek-ai/dsh-spill-local | 0.2.0-rc.2 |
| @deepseek-ai/dsh-spill-policy | 0.2.0-rc.2 |
| @deepseek-ai/dsh-ssh | 0.2.0-rc.2 |
| @deepseek-ai/dsh-storage | 0.2.0-rc.2 |
| @deepseek-ai/dsh-storage-domain | 0.2.0-rc.2 |
| @deepseek-ai/dsh-storage-json | 0.2.0-rc.2 |
| @deepseek-ai/dsh-storage-sqlite | 0.2.0-rc.2 |
| @deepseek-ai/dsh-subagent | 0.2.0-rc.2 |
| @deepseek-ai/dsh-subagent-acp | 0.2.0-rc.2 |
| @deepseek-ai/dsh-subagent-claude-code | 0.2.0-rc.2 |
| @deepseek-ai/dsh-subagent-codex | 0.2.0-rc.2 |
| @deepseek-ai/dsh-subagent-dsh-sdk | 0.2.0-rc.2 |
| @deepseek-ai/dsh-subagent-fork-in-process | 0.2.0-rc.2 |
| @deepseek-ai/dsh-subagent-in-process-driver | 0.2.0-rc.2 |
| @deepseek-ai/dsh-subagent-spawn-in-process | 0.2.0-rc.2 |
| @deepseek-ai/dsh-subprocess | 0.2.0-rc.2 |
| @deepseek-ai/dsh-subprocess-local | 0.2.0-rc.2 |
| @deepseek-ai/dsh-subprocess-ssh | 0.2.0-rc.2 |
| @deepseek-ai/dsh-system-prompt | 0.2.0-rc.2 |
| @deepseek-ai/dsh-terminal | 0.2.0-rc.2 |
| @deepseek-ai/dsh-terminal-bash | 0.2.0-rc.2 |
| @deepseek-ai/dsh-time-context | 0.2.0-rc.2 |
| @deepseek-ai/dsh-timeout | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tmux-context | 0.2.0-rc.2 |
| @deepseek-ai/dsh-token-meter | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-ask-user | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-bash | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-bash-persistent | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-call-timeout-policy | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-cordis | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-fs | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-fs-search | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-goal | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-jobs | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-lsp | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-present | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-pwsh | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-pwsh-persistent | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-ralph | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-session-query | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-skill | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-str-replace-editor | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-subagent | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-subagent-control | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-terminal | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-todo | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-web | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-workflow | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tool-workspace-dependencies | 0.2.0-rc.2 |
| @deepseek-ai/dsh-tools | 0.2.0-rc.2 |
| @deepseek-ai/dsh-typert-generator | 0.2.0-rc.2 |
| @deepseek-ai/dsh-typert-loader | 0.2.0-rc.2 |
| @deepseek-ai/dsh-typert-protocol | 0.2.0-rc.2 |
| @deepseek-ai/dsh-typert-registry | 0.2.0-rc.2 |
| @deepseek-ai/dsh-user-approval | 0.2.0-rc.2 |
| @deepseek-ai/dsh-user-questions | 0.2.0-rc.2 |
| @deepseek-ai/dsh-util-code-language | 0.2.0-rc.2 |
| @deepseek-ai/dsh-util-crypto | 0.2.0-rc.2 |
| @deepseek-ai/dsh-util-time | 0.2.0-rc.2 |
| @deepseek-ai/dsh-util-values | 0.2.0-rc.2 |
| @deepseek-ai/dsh-util-workspace-path | 0.2.0-rc.2 |
| @deepseek-ai/dsh-web | 0.2.0-rc.2 |
| @deepseek-ai/dsh-web-app | 0.2.0-rc.2 |
| @deepseek-ai/dsh-web-fetch-http | 0.2.0-rc.2 |
| @deepseek-ai/dsh-web-frontend | 0.2.0-rc.2 |
| @deepseek-ai/dsh-web-search-deepseek | 0.2.0-rc.2 |
| @deepseek-ai/dsh-web-search-exa | 0.2.0-rc.2 |
| @deepseek-ai/dsh-web-search-perplexity | 0.2.0-rc.2 |
| @deepseek-ai/dsh-webhook | 0.2.0-rc.2 |
| @deepseek-ai/dsh-webhook-github | 0.2.0-rc.2 |
| @deepseek-ai/dsh-win32-process | 0.2.0-rc.2 |
| @deepseek-ai/dsh-workflow | 0.2.0-rc.2 |
| @deepseek-ai/dsh-workflow-ptc | 0.2.0-rc.2 |
| @deepseek-ai/dsh-workspace | 0.2.0-rc.2 |
| @deepseek-ai/dsh-workspace-changes | 0.2.0-rc.2 |
| @deepseek-ai/libreoffice-kit | 0.1.5 |
| @deepseek-ai/node-addon-system | 0.1.2 |
| @deepseek-ai/schemastery | 3.18.4 |

### 1.3 载荷内全部 @deepseek-ai 包（含传递依赖）

| 组件 | 版本 | 许可证 |
|---|---|---|
| @deepseek-ai/cordis | 4.0.4 | MIT |
| @deepseek-ai/cordis-plugin-group | 1.0.4 | MIT |
| @deepseek-ai/cordis-plugin-include | 1.0.9 | MIT |
| @deepseek-ai/cordis-plugin-loader | 1.0.5 | MIT |
| @deepseek-ai/cordis-plugin-timer | 1.1.6 | MIT |
| @deepseek-ai/cosmokit | 1.8.5 | MIT |
| @deepseek-ai/dsh | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-acp | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-acp-app | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-agent | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-agent-default-model | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-agent-instructions | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-agent-loop | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-agent-loop-testkit | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-agent-preset | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-agent-preset-registry | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-agent-tool-presentation | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-anonymous-user-id | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-api-account-controller | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-api-gateway | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-api-job-controller | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-api-remotes | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-api-session-controller | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-api-settings-controller | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-api-terminal-controller | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-api-workspace-controller | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-api-workspace-files | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-app-boot | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-atomic-write | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-attachment | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-attachment-local | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-authorization | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-base | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-bash-local | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-bash-sandbox | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-brand | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-browser-use | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-chunked-list | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-connection | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-file-upload | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-hmr | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-locale | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-modules | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-product-analytics | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-resources | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-schema-form | 0.1.0-rc.7 | MIT |
| @deepseek-ai/dsh-client-shortcuts | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-store | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-test-runtime | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-agent-preset | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-approval | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-attachment | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-brand-official | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-chat | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-commands | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-conversation | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-cordis | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-deliverables | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-directory-picker-browse | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-directory-picker-native | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-dockkit | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-goal | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-input-trigger | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-jobs | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-layout | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-message-feedback | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-model-selection | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-open-in-app | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-permission-presets | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-plan | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-plugin-manager | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-primitives | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-reference | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-renderer | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-schedule | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-session | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-settings | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-settings-account | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-settings-agent-loop | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-settings-general | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-settings-models | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-settings-plugin-inventory | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-settings-plugins | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-settings-session-log | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-settings-shell | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-settings-subagent | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-settings-web-search | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-shortcuts | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-sidebar | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-sidebar-browser | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-sidebar-documentpreview | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-sidebar-files | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-sidebar-right | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-sidebar-terminal | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-skill | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-slots | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-subagent | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-theme | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-tool | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-trajectory | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-user-questions | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-workflow-run | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-ui-workspace | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-web | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-client-web-react | 0.1.0-rc.7 | MIT |
| @deepseek-ai/dsh-cmdline | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-command-compact | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-command-feedback | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-command-goal | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-commands | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-compaction | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-compaction-basic | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-compaction-image-offload | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-compaction-tool-result-pruner | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-computer-use | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-config-editor | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-cordis-client-runner | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-cordis-host-runner | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-credentials | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-credentials-local | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-deepseek-account | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-deepseek-account-platform | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-deepseek-llm-api-extensions | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-deque | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-agent-team | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-agent-team-profile | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-api-speech-to-text | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-auto-review | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-browser-use-playwright-mcp | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-browser-use-runtime | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-browser-use-stagehand-native | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-client-ui-agent-team | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-client-ui-voice-input | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-computer-use-cua-driver-native | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-inspector | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-ptc-runtime-python | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-schedule-bundle | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-speech-to-text | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-speech-to-text-sensevoice | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-tool-agent-team | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-voice-input-bundle | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-webworker-packer | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-experimental-webworker-runtime | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-file-reference | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-file-reference-local | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-fs | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-fs-local | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-fs-observation-policy | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-fs-sandbox | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-fs-ssh | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-goal | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-goal-round-driver | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-headless | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-hmr | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-home-paths | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-hook-protocol | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-hooks-claude-code | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-hooks-codex | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-host-directory-picker | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-host-directory-picker-auto | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-host-directory-picker-browse | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-host-directory-picker-native | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-host-frontend-static | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-host-open-in-app | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-host-plugin-inventory | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-host-product-telemetry-otel | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-host-webserver | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-http-proxy | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-invariants | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-jobs | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-jobs-local | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-launch-environment | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-lazy-require | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-llm | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-llm-deepseek | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-llm-deepseek-account | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-llm-deepseek-api-key | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-llm-mock-server | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-llm-pi-ai | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-llm-replay | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-llm-retry | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-loader-smoke | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-lsp | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-lsp-stdio | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-mcp-client | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-mcp-resources | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-message-feedback | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-native-command | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-office-to-pdf | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-otel | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-output-retention | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-package-manifest | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-permission-presets | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-persona | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-plan-mode | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-plugin-manager | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-plugin-package-inventory-deepseek | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-ptc-runtime | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-ptc-runtime-node | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-pwsh-local | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-pwsh-sandbox | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-remote-mock | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-repeat-tool-reminder | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-sandbox | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-sandbox-local | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-sandbox-policy | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-sandbox-ssh | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-sandbox-windows-acl | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-schedule | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-scope | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-sdk-app | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-sdk-client | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-sdk-jsonrpc-server | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-sdk-minimal | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-sdk-protocol | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-checkpoint-policy | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-format | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-format-catalog | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-format-v0-to-v1 | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-format-v1-to-v2 | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-format-v2-to-v3 | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-format-v3-to-v4 | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-log-deepseek | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-log-export | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-persistence | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-persistence-jsonl | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-projection | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-projection-cache | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-query | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-query-sqlite | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-reference | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-snapshot | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-stats | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-telemetry | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-telemetry-otel | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-title | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-title-all-prompts-llm | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-title-first-prompt-llm | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-title-llm | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-session-turn-outline | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-settings | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-shell | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-shell-env | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-skill | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-skill-badge | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-skill-filesystem | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-skill-office | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-spill | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-spill-local | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-spill-policy | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-ssh | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-storage | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-storage-domain | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-storage-json | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-storage-sqlite | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-subagent | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-subagent-acp | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-subagent-claude-code | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-subagent-codex | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-subagent-dsh-sdk | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-subagent-fork-in-process | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-subagent-in-process-driver | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-subagent-spawn-in-process | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-subprocess | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-subprocess-local | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-subprocess-ssh | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-system-prompt | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-terminal | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-terminal-bash | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-time-context | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-timeout | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tmux-context | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-token-meter | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-ask-user | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-bash | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-bash-persistent | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-call-timeout-policy | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-cordis | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-fs | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-fs-search | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-goal | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-jobs | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-lsp | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-present | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-pwsh | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-pwsh-persistent | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-ralph | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-session-query | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-skill | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-str-replace-editor | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-subagent | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-subagent-control | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-terminal | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-todo | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-web | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-workflow | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tool-workspace-dependencies | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-tools | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-typert-generator | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-typert-loader | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-typert-protocol | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-typert-registry | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-user-approval | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-user-questions | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-util-code-language | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-util-crypto | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-util-time | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-util-values | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-util-workspace-path | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-web | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-web-app | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-web-fetch-http | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-web-frontend | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-web-search-deepseek | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-web-search-exa | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-web-search-perplexity | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-webhook | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-webhook-github | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-win32-process | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-workflow | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-workflow-ptc | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-workspace | 0.2.0-rc.2 | MIT |
| @deepseek-ai/dsh-workspace-changes | 0.2.0-rc.2 | MIT |
| @deepseek-ai/libreoffice-kit | 0.1.5 | MPL-2.0 |
| @deepseek-ai/libreoffice-kit-win32-x64 | 0.1.5 | MPL-2.0 |
| @deepseek-ai/node-addon-system | 0.1.2 | BSD-3-Clause |
| @deepseek-ai/schemastery | 3.18.4 | MIT |

---

## 2. Tauri / Rust 壳层依赖

壳层 crate 树见 `dsh-tauri/src-tauri/Cargo.lock`（共 531 个 crate，8 个工作区成员）。下列为工作区 Cargo.toml 直接声明的外部 crate 及其在锁文件中的版本，许可证取自本机 cargo 源码缓存中该 crate 的 `Cargo.toml` 元数据：

| crate | 版本 | 许可证 |
|---|---|---|
| libc | 0.2.189 | MIT OR Apache-2.0 |
| serde | 1.0.229 | MIT OR Apache-2.0 |
| serde_json | 1.0.151 | MIT OR Apache-2.0 |
| tauri | 2.11.5 | Apache-2.0 OR MIT |
| tauri-build | 2.6.3 | Apache-2.0 OR MIT |
| windows-api | - | （不在锁文件） |
| windows-sys | 0.61.2 | MIT OR Apache-2.0 |

Windows 目标另依赖系统 **WebView2 Runtime**（微软 Edge WebView2，随 Windows 更新分发，不在安装包内），以及 gnu/msvc 工具链产出的 `WebView2Loader.dll`（来自 `webview2-com-sys`/`windows` 族，MIT/Apache-2.0 双许可）。

---

## 3. 内置运行时（Bundled Runtime）

| 组件 | 版本 | 许可证 | 说明 |
|---|---|---|---|
| Node.js | v24.15.0 | MIT | 安装时由 `npm run fetch-node` 从本机 Node 复制进 `vendor/node/`；内核与原生模块按该 ABI 运行 |
| npm | 11.12.1 | Artistic-2.0 | 随 Node 分发，内置于 `vendor/npm/`（含 117 个自带包），用于插件安装与更新链 |

---

## 4. 随仓库分发、但**不进安装包**的组件

v1.0.0 起与官方桌面客户端形态对齐：安装包不携带第三方插件（`dsh-tauri/scripts/stage-payload.sh` 显式剔除并有门禁）。下列内容仍随**本仓库源码**分发，其许可证义务因此仍然适用（自定义 Agent 预设在 v1.0.0 已连同源目录整体拆除，仓库不再携带，故不在此列）：

### 4.1 `dsh-desktop/assets/plugins`（28 个配套插件）

> **v1.0.0 精简（2026-10-07）**：内置伴随插件由 39 个减为 28 个——用户点名移除 11 个，其源目录已从
> `dsh-desktop/assets/plugins/` 整树删除，仓库不再携带，故其许可义务不再适用、本表相应撤除其行：
> `@deepseek-ai/dsh-client-file-changes`、`@deepseek-ai/dsh-terminal-tab`（这两者与内核官方同名包重叠，
> 镜像进 `profiles/web/node_modules` 会遮蔽官方包）、`harness-pet`、`@dsh-external/dsh-vision`、`graph-memory`、
> `dsh-community-market`、`dsh-market-desktop-bridge`（仅服务于市场）、`dsh-hub`（仅挂载 graph-memory 与市场）、
> `dsh-file-drop`、`dsh-image-paste`、`dsh-cardian`。这些包自带的内层 `node_modules` 依赖树随包一并移除。

| 插件 | 版本 | 许可证 |
|---|---|---|
| @deepseek-ai/dsh-balance | 0.1.2 | MIT |
| @deepseek-ai/dsh-conversation-tweaks | 0.1.1 | MIT |
| @deepseek-ai/dsh-file-changes | 0.1.0 | MIT |
| @deepseek-ai/dsh-openclaw-bridge | 0.8.1 | MIT |
| @deepseek-ai/dsh-prompt-custom | 0.3.5 | MIT |
| @deepseek-ai/dsh-quest-ui | 0.6.1 | MIT |
| @deepseek-ai/dsh-workspace-anchor | 0.1.0 | MIT |
| @deepseek-ai/dsh-wsl-settings | 0.1.0 | MIT |
| @dsh-external/dsh-side-session | 0.3.1 | MIT |
| @dsh-external/dsh-subagent-lens | 0.1.1 | MIT |
| @dsh-external/dsh-super-injector | 0.3.1 | BSD-3-Clause |
| billion-context-dsh | 0.2.26 | MIT |
| dsh-auto-compact | 0.1.1 | MIT |
| dsh-basics-panel | 0.4.1 | MIT |
| dsh-better-sidebar | 0.24.1 | MIT |
| dsh-change-review | 0.1.1 | MIT |
| dsh-easyrewrite | 2.6.0 | MIT |
| dsh-input-fold | 0.1.1 | MIT |
| dsh-input-history | 0.1.1 | MIT |
| dsh-offpeak | 1.0.1 | MIT |
| dsh-pocket | 2.10.7 | GPL-2.0 |
| dsh-prompt-optimizer | 2.0.4 | MIT |
| dsh-reasoning-effort | 0.8.1 | MIT |
| dsh-session-manager | 0.1.0 | MIT |
| dsh-settings-groups | 0.1.1 | MIT |
| dsh-settings-nav-custom | 0.1.1 | MIT |
| dsh-synapse | 0.3.0 | MIT |
| dsh-zcode-migrate | 0.1.2 | MIT |

---

## 5. 完整依赖清单（Full Dependency List，含间接依赖，按字母排序）

共 768 个唯一 `包名@版本`（第 1.3 节的 @deepseek-ai 之外部分）。

| 包名 | 版本 | 许可证 |
|---|---|---|
| @agentclientprotocol/sdk | 1.4.0 | Apache-2.0 |
| @anthropic-ai/claude-agent-sdk | 0.3.263 | SEE LICENSE IN README.md |
| @anthropic-ai/sdk | 0.93.0 | MIT |
| @anthropic-ai/sdk | 0.124.0 | MIT |
| @aws-sdk/client-bedrock-runtime | 3.1127.0 | Apache-2.0 |
| @aws-sdk/core | 3.978.1 | Apache-2.0 |
| @aws-sdk/credential-provider-env | 3.972.72 | Apache-2.0 |
| @aws-sdk/credential-provider-http | 3.972.74 | Apache-2.0 |
| @aws-sdk/credential-provider-ini | 3.973.17 | Apache-2.0 |
| @aws-sdk/credential-provider-login | 3.972.79 | Apache-2.0 |
| @aws-sdk/credential-provider-node | 3.972.84 | Apache-2.0 |
| @aws-sdk/credential-provider-process | 3.972.72 | Apache-2.0 |
| @aws-sdk/credential-provider-sso | 3.973.16 | Apache-2.0 |
| @aws-sdk/credential-provider-web-identity | 3.972.78 | Apache-2.0 |
| @aws-sdk/eventstream-handler-node | 3.972.35 | Apache-2.0 |
| @aws-sdk/middleware-eventstream | 3.972.30 | Apache-2.0 |
| @aws-sdk/middleware-websocket | 3.972.54 | Apache-2.0 |
| @aws-sdk/nested-clients | 3.997.46 | Apache-2.0 |
| @aws-sdk/signature-v4-multi-region | 3.996.47 | Apache-2.0 |
| @aws-sdk/token-providers | 3.1138.0 | Apache-2.0 |
| @aws-sdk/token-providers | 3.1127.0 | Apache-2.0 |
| @aws-sdk/types | 3.974.6 | Apache-2.0 |
| @aws-sdk/xml-builder | 3.972.41 | Apache-2.0 |
| @aws/lambda-invoke-store | 0.3.0 | Apache-2.0 |
| @babel/code-frame | 7.29.7 | MIT |
| @babel/helper-validator-identifier | 7.29.7 | MIT |
| @babel/runtime | 7.29.7 | MIT |
| @browserbasehq/sdk | 2.21.0 | Apache-2.0 |
| @browserbasehq/stagehand | 4.1.0 | MIT |
| @earendil-works/pi-ai | 0.87.1 | MIT |
| @earendil-works/pi-telemetry | 0.87.1 | MIT |
| @emnapi/runtime | 1.11.3 | MIT |
| @esbuild/win32-x64 | 0.28.2 | MIT |
| @eslint-community/regexpp | 4.12.2 | MIT |
| @google/genai | 2.21.0 | Apache-2.0 |
| @hono/node-server | 2.1.3 | MIT |
| @img/colour | 1.1.0 | MIT |
| @img/sharp-win32-x64 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later |
| @joplin/turndown-plugin-gfm | 1.0.68 | MIT |
| @jridgewell/gen-mapping | 0.3.13 | MIT |
| @jridgewell/resolve-uri | 3.1.2 | MIT |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT |
| @jridgewell/trace-mapping | 0.3.31 | MIT |
| @js-temporal/polyfill | 0.5.1 | ISC |
| @keyv/serialize | 1.1.1 | MIT |
| @koromix/koffi-win32-x64 | 3.1.5 | MIT |
| @mixmark-io/domino | 2.2.0 | BSD-2-Clause |
| @modelcontextprotocol/client | 2.0.0 | MIT |
| @modelcontextprotocol/core | 2.0.0 | MIT |
| @modelcontextprotocol/sdk | 1.32.1 | MIT |
| @noble/hashes | 2.4.0 | MIT |
| @octokit/openapi-types | 29.0.1 | MIT |
| @octokit/openapi-webhooks-types | 12.1.0 | MIT |
| @octokit/request-error | 7.1.2 | MIT |
| @octokit/types | 18.0.0 | MIT |
| @octokit/webhooks | 14.2.0 | MIT |
| @octokit/webhooks-methods | 6.0.0 | MIT |
| @openai/codex | 0.153.4 | Apache-2.0 |
| @opentelemetry/api | 1.9.1 | Apache-2.0 |
| @opentelemetry/api-logs | 0.220.0 | Apache-2.0 |
| @opentelemetry/core | 2.9.0 | Apache-2.0 |
| @opentelemetry/core | 2.11.0 | Apache-2.0 |
| @opentelemetry/otlp-exporter-base | 0.220.0 | Apache-2.0 |
| @opentelemetry/otlp-transformer | 0.220.0 | Apache-2.0 |
| @opentelemetry/resources | 2.9.0 | Apache-2.0 |
| @opentelemetry/resources | 2.11.0 | Apache-2.0 |
| @opentelemetry/sdk-logs | 0.220.0 | Apache-2.0 |
| @opentelemetry/sdk-metrics | 2.9.0 | Apache-2.0 |
| @opentelemetry/sdk-trace | 2.9.0 | Apache-2.0 |
| @opentelemetry/semantic-conventions | 1.43.0 | Apache-2.0 |
| @oxc-project/types | 0.152.0 | MIT |
| @playwright/mcp | 0.0.80 | Apache-2.0 |
| @protobufjs/aspromise | 1.1.2 | BSD-3-Clause |
| @protobufjs/base64 | 1.1.2 | BSD-3-Clause |
| @protobufjs/codegen | 2.0.5 | BSD-3-Clause |
| @protobufjs/eventemitter | 1.1.1 | BSD-3-Clause |
| @protobufjs/fetch | 1.1.1 | BSD-3-Clause |
| @protobufjs/float | 1.0.2 | BSD-3-Clause |
| @protobufjs/path | 1.1.2 | BSD-3-Clause |
| @protobufjs/pool | 1.1.0 | BSD-3-Clause |
| @protobufjs/utf8 | 1.1.2 | BSD-3-Clause |
| @puppeteer/browsers | 3.2.2 | Apache-2.0 |
| @rolldown/binding-win32-x64-msvc | 1.2.12 | MIT |
| @rolldown/pluginutils | 1.0.1 | MIT |
| @sec-ant/readable-stream | 0.4.1 | MIT |
| @sindresorhus/is | 7.2.0 | MIT |
| @sindresorhus/merge-streams | 4.0.0 | MIT |
| @smithy/core | 3.35.1 | Apache-2.0 |
| @smithy/credential-provider-imds | 4.5.2 | Apache-2.0 |
| @smithy/fetch-http-handler | 5.8.0 | Apache-2.0 |
| @smithy/node-http-handler | 4.12.1 | Apache-2.0 |
| @smithy/signature-v4 | 5.7.4 | Apache-2.0 |
| @smithy/types | 4.19.0 | Apache-2.0 |
| @stablelib/base64 | 1.0.1 | MIT |
| @standard-schema/spec | 1.1.0 | MIT |
| @swc/helpers | 0.5.23 | Apache-2.0 |
| @testing-library/dom | 10.4.2 | MIT |
| @testing-library/react | 16.3.3 | MIT |
| @trycua/cua-driver | 0.28.0 | MIT |
| @trycua/cua-driver-win32-x64-msvc | 0.28.0 | MIT AND MPL-2.0 |
| @types/aria-query | 5.0.4 | MIT |
| @types/chai | 5.2.3 | MIT |
| @types/deep-eql | 4.0.2 | MIT |
| @types/estree | 1.0.9 | MIT |
| @types/http-cache-semantics | 4.2.0 | MIT |
| @types/node | 18.19.130 | MIT |
| @types/node | 26.6.4 | MIT |
| @types/node-fetch | 2.6.13 | MIT |
| @types/retry | 0.12.0 | MIT |
| @ubjs/core | 0.31.0-3 | MPL-2.0 |
| @ubjs/node | 0.31.0-3 | MPL-2.0 |
| @ubjs/node-win32-x64-msvc | 0.31.0-3 | MPL-2.0 |
| @vitest/expect | 4.1.11 | MIT |
| @vitest/mocker | 4.1.11 | MIT |
| @vitest/pretty-format | 4.1.11 | MIT |
| @vitest/runner | 4.1.11 | MIT |
| @vitest/snapshot | 4.1.11 | MIT |
| @vitest/spy | 4.1.11 | MIT |
| @vitest/utils | 4.1.11 | MIT |
| @vscode/ripgrep | 1.18.0 | MIT |
| @vscode/ripgrep-win32-x64 | 1.18.0 | MIT |
| @xterm/addon-serialize | 0.14.0 | MIT |
| @xterm/headless | 6.0.0 | MIT |
| @yarnpkg/parsers | 3.1.0 | BSD-2-Clause |
| abort-controller | 3.0.0 | MIT |
| accepts | 2.0.0 | MIT |
| acorn | 8.19.0 | MIT |
| agent-base | 9.0.0 | MIT |
| agent-base | 7.1.4 | MIT |
| agentkeepalive | 4.6.0 | MIT |
| ajv | 8.20.0 | MIT |
| ajv-formats | 3.0.1 | MIT |
| ansi-regex | 5.0.1 | MIT |
| ansi-regex | 6.4.0 | MIT |
| ansi-styles | 5.2.0 | MIT |
| ansi-styles | 6.2.3 | MIT |
| argparse | 2.0.1 | Python-2.0 |
| aria-query | 5.3.0 | Apache-2.0 |
| assertion-error | 2.0.1 | MIT |
| asynckit | 0.4.0 | MIT |
| base64-js | 1.5.1 | MIT |
| bignumber.js | 9.3.1 | MIT |
| body-parser | 2.3.0 | MIT |
| bowser | 2.14.1 | MIT |
| brotli | 1.3.3 | MIT |
| buffer | 6.0.3 | MIT |
| buffer-equal-constant-time | 1.0.1 | BSD-3-Clause |
| bundle-name | 4.1.1 | MIT |
| byte-counter | 0.1.0 | MIT |
| bytes | 3.1.2 | MIT |
| cacheable-lookup | 7.0.0 | MIT |
| cacheable-request | 13.0.19 | MIT |
| call-bind-apply-helpers | 1.0.2 | MIT |
| call-bound | 1.0.4 | MIT |
| chai | 6.3.0 | MIT |
| chokidar | 5.0.0 | MIT |
| chokidar | 4.0.3 | MIT |
| chrome-devtools-mcp | 1.9.0 | Apache-2.0 |
| cliui | 9.0.1 | ISC |
| clone | 2.1.2 | MIT |
| combined-stream | 1.0.8 | MIT |
| commander | 15.0.0 | MIT |
| compressible | 2.0.18 | MIT |
| compression | 1.8.2 | MIT |
| content-disposition | 1.1.0 | MIT |
| content-type | 2.1.0 | MIT |
| content-type | 1.0.5 | MIT |
| convert-source-map | 2.0.0 | MIT |
| cookie | 0.7.2 | MIT |
| cookie-signature | 1.2.2 | MIT |
| cors | 2.8.6 | MIT |
| cosmokit | 1.8.1 | MIT |
| cross-spawn | 7.0.6 | MIT |
| data-uri-to-buffer | 4.0.1 | MIT |
| debug | 4.4.3 | MIT |
| debug | 2.6.9 | MIT |
| decompress-response | 10.0.0 | MIT |
| default-browser | 5.5.1 | MIT |
| default-browser-id | 5.0.1 | MIT |
| define-lazy-prop | 3.0.0 | MIT |
| delayed-stream | 1.0.0 | MIT |
| depd | 2.0.0 | MIT |
| dequal | 2.0.3 | MIT |
| destroy | 1.2.0 | MIT |
| detect-libc | 2.1.2 | Apache-2.0 |
| dfa | 1.2.0 | MIT |
| diff | 9.0.0 | BSD-3-Clause |
| dom-accessibility-api | 0.5.16 | MIT |
| dunder-proto | 1.0.1 | MIT |
| ecdsa-sig-formatter | 1.0.11 | Apache-2.0 |
| ee-first | 1.1.1 | MIT |
| emoji-regex | 10.6.0 | MIT |
| encodeurl | 2.0.0 | MIT |
| es-define-property | 1.0.1 | MIT |
| es-errors | 1.3.0 | MIT |
| es-module-lexer | 2.3.2 | MIT |
| es-object-atoms | 1.1.2 | MIT |
| es-set-tostringtag | 2.1.0 | MIT |
| esbuild | 0.28.2 | MIT |
| escalade | 3.2.0 | MIT |
| escape-html | 1.0.3 | MIT |
| estree-walker | 3.0.3 | MIT |
| etag | 1.8.1 | MIT |
| event-target-shim | 5.0.1 | MIT |
| events | 3.3.0 | MIT |
| eventsource | 3.0.7 | MIT |
| eventsource-parser | 3.1.1 | MIT |
| execa | 10.0.1 | MIT |
| expect-type | 1.4.0 | Apache-2.0 |
| express | 5.2.1 | MIT |
| express-rate-limit | 8.7.0 | MIT |
| extend | 3.0.2 | MIT |
| fast-deep-equal | 3.1.3 | MIT |
| fast-sha256 | 1.3.0 | Unlicense |
| fast-uri | 3.1.8 | BSD-3-Clause |
| fdir | 6.5.0 | MIT |
| fetch-blob | 3.2.0 | MIT |
| fflate | 0.8.2 | MIT |
| fflate | 0.8.3 | MIT |
| figures | 6.1.0 | MIT |
| finalhandler | 2.1.1 | MIT |
| fontkit | 2.0.4 | MIT |
| form-data | 4.0.6 | MIT |
| form-data-encoder | 1.7.2 | MIT |
| form-data-encoder | 4.1.0 | MIT |
| formdata-node | 4.4.1 | MIT |
| formdata-polyfill | 4.0.10 | MIT |
| forwarded | 0.2.0 | MIT |
| fresh | 2.0.0 | MIT |
| function-bind | 1.1.2 | MIT |
| gaxios | 7.3.1 | Apache-2.0 |
| gcp-metadata | 8.1.2 | Apache-2.0 |
| get-caller-file | 2.0.5 | ISC |
| get-east-asian-width | 1.7.0 | MIT |
| get-intrinsic | 1.3.0 | MIT |
| get-proto | 1.0.1 | MIT |
| get-stream | 9.0.1 | MIT |
| google-auth-library | 10.9.1 | Apache-2.0 |
| google-logging-utils | 1.1.3 | Apache-2.0 |
| gopd | 1.2.0 | MIT |
| got | 14.6.6 | MIT |
| has-symbols | 1.1.0 | MIT |
| has-tostringtag | 1.0.2 | MIT |
| hasown | 2.0.4 | MIT |
| hono | 4.13.13 | MIT |
| http-cache-semantics | 4.3.0 | BSD-2-Clause |
| http-errors | 2.0.1 | MIT |
| http-proxy-agent | 9.1.0 | MIT |
| http2-wrapper | 2.2.1 | MIT |
| https-proxy-agent | 7.0.6 | MIT |
| https-proxy-agent | 9.1.0 | MIT |
| human-signals | 8.0.1 | Apache-2.0 |
| humanize-ms | 1.2.1 | MIT |
| iconv-lite | 0.7.3 | MIT |
| ieee754 | 1.2.1 | BSD-3-Clause |
| inherits | 2.0.4 | ISC |
| ip-address | 10.7.3 | MIT |
| ipaddr.js | 2.5.0 | MIT |
| ipaddr.js | 1.9.1 | MIT |
| is-docker | 3.0.0 | MIT |
| is-in-ssh | 1.0.0 | MIT |
| is-inside-container | 1.0.0 | MIT |
| is-plain-obj | 4.1.0 | MIT |
| is-promise | 4.0.0 | MIT |
| is-stream | 4.0.1 | MIT |
| is-unicode-supported | 2.1.0 | MIT |
| is-wsl | 3.1.1 | MIT |
| isexe | 2.0.0 | ISC |
| jose | 6.2.12 | MIT |
| js-tokens | 4.0.0 | MIT |
| js-yaml | 4.3.2 | MIT |
| jsbi | 4.3.2 | Apache-2.0 |
| json-bigint | 1.0.0 | MIT |
| json-schema-to-ts | 3.1.1 | MIT |
| json-schema-traverse | 1.0.0 | MIT |
| json-schema-typed | 8.0.2 | BSD-2-Clause |
| jwa | 2.0.1 | MIT |
| jws | 4.0.1 | MIT |
| keyv | 5.6.0 | MIT |
| koffi | 3.1.5 | MIT |
| lightningcss | 1.33.0 | MPL-2.0 |
| lightningcss-win32-x64-msvc | 1.33.0 | MPL-2.0 |
| long | 5.3.2 | Apache-2.0 |
| loose-envify | 1.4.0 | MIT |
| lowercase-keys | 3.0.0 | MIT |
| lz-string | 1.5.0 | MIT |
| magic-string | 0.30.21 | MIT |
| math-intrinsics | 1.1.0 | MIT |
| media-typer | 1.1.1 | MIT |
| merge-descriptors | 2.0.0 | MIT |
| mime-db | 1.52.0 | MIT |
| mime-db | 1.54.0 | MIT |
| mime-types | 2.1.35 | MIT |
| mime-types | 3.0.2 | MIT |
| mimic-response | 4.0.0 | MIT |
| modern-tar | 0.8.5 | MIT |
| ms | 2.1.3 | MIT |
| ms | 2.0.0 | MIT |
| nanoid | 3.3.20 | MIT |
| negotiator | 0.6.4 | MIT |
| negotiator | 1.1.0 | MIT |
| node-addon-api | 7.1.1 | MIT |
| node-addon-native-custom-loader | 0.1.7 | MIT |
| node-addon-require-builtin | 0.1.7 | MIT |
| node-addon-require-builtin-win32-x64-msvc | 0.1.7 | MIT |
| node-domexception | 1.0.0 | MIT |
| node-fetch | 3.3.2 | MIT |
| node-fetch | 2.7.0 | MIT |
| node-pty | 1.2.0-beta.15 | MIT |
| normalize-url | 8.1.1 | MIT |
| npm-run-path | 6.0.0 | MIT |
| object-assign | 4.1.1 | MIT |
| object-inspect | 1.13.4 | MIT |
| obug | 2.2.1 | MIT |
| on-finished | 2.4.1 | MIT |
| on-headers | 1.1.0 | MIT |
| once | 1.4.0 | ISC |
| open | 11.0.4 | MIT |
| openai | 6.40.0 | Apache-2.0 |
| p-cancelable | 4.0.1 | MIT |
| p-retry | 4.6.2 | MIT |
| pako | 0.2.9 | MIT |
| parse-ms | 4.0.0 | MIT |
| parseurl | 1.3.3 | MIT |
| partial-json | 0.1.7 | MIT |
| path-key | 4.0.0 | MIT |
| path-key | 3.1.1 | MIT |
| path-to-regexp | 8.4.2 | MIT |
| pathe | 2.0.3 | MIT |
| picocolors | 1.1.1 | ISC |
| picomatch | 4.0.7 | MIT |
| pkce-challenge | 5.0.1 | MIT |
| playwright | 1.63.0-alpha-2026-08-31 | Apache-2.0 |
| playwright-core | 1.63.0-alpha-2026-08-31 | Apache-2.0 |
| postcss | 8.5.29 | MIT |
| powershell-utils | 0.2.1 | MIT |
| pretty-format | 27.5.1 | MIT |
| pretty-ms | 9.3.1 | MIT |
| process | 0.11.10 | MIT |
| protobufjs | 7.6.6 | BSD-3-Clause |
| proxy-addr | 2.0.8 | MIT |
| proxy-agent-negotiate | 1.1.0 | MIT |
| qs | 6.16.0 | BSD-3-Clause |
| quick-lru | 5.1.1 | MIT |
| range-parser | 1.3.0 | MIT |
| raw-body | 3.0.2 | MIT |
| react | 18.3.1 | MIT |
| react-dom | 18.3.1 | MIT |
| react-is | 17.0.2 | MIT |
| readable-stream | 4.7.0 | MIT |
| readdirp | 5.1.1 | MIT |
| readdirp | 4.1.2 | MIT |
| require-from-string | 2.0.2 | MIT |
| resolve-alpn | 1.2.1 | MIT |
| resolve.exports | 2.0.3 | MIT |
| responselike | 4.0.2 | MIT |
| restructure | 3.0.2 | MIT |
| retry | 0.13.1 | MIT |
| rolldown | 1.2.12 | MIT |
| router | 2.2.0 | MIT |
| run-applescript | 7.1.0 | MIT |
| safe-buffer | 5.2.1 | MIT |
| safer-buffer | 2.1.2 | MIT |
| saxes | 6.0.0 | ISC |
| scheduler | 0.23.2 | MIT |
| schemastery | 3.18.0 | MIT |
| semver | 7.8.5 | ISC |
| send | 1.2.1 | MIT |
| serve-static | 2.2.1 | MIT |
| setprototypeof | 1.2.0 | ISC |
| sharp | 0.35.5 | Apache-2.0 |
| shebang-command | 2.0.0 | MIT |
| shebang-regex | 3.0.0 | MIT |
| sherpa-onnx-node | 1.13.8 | Apache-2.0 |
| sherpa-onnx-win-x64 | 1.13.8 | Apache-2.0 |
| side-channel | 1.1.1 | MIT |
| side-channel-list | 1.0.1 | MIT |
| side-channel-map | 1.0.1 | MIT |
| side-channel-weakmap | 1.0.2 | MIT |
| siginfo | 2.0.0 | ISC |
| signal-exit | 4.1.0 | ISC |
| source-map-js | 1.2.2 | BSD-3-Clause |
| stackback | 0.0.2 | MIT |
| standardwebhooks | 1.1.1 | MIT |
| statuses | 2.0.2 | MIT |
| std-env | 4.3.0 | MIT |
| string_decoder | 1.3.0 | MIT |
| string-width | 7.2.0 | MIT |
| string-width | 8.3.0 | MIT |
| strip-ansi | 7.2.0 | MIT |
| strip-final-newline | 4.0.0 | MIT |
| tiny-inflate | 1.0.3 | MIT |
| tinybench | 2.9.0 | MIT |
| tinyexec | 1.3.1 | MIT |
| tinyglobby | 0.2.17 | MIT |
| tinyrainbow | 3.2.0 | MIT |
| toidentifier | 1.0.1 | MIT |
| tr46 | 0.0.3 | MIT |
| ts-algebra | 2.0.0 | MIT |
| tslib | 2.8.1 | 0BSD |
| tsx | 4.23.15 | MIT |
| turndown | 7.2.4 | MIT |
| type-fest | 4.41.0 | (MIT OR CC0-1.0) |
| type-is | 2.1.0 | MIT |
| typebox | 1.3.27 | MIT |
| typescript | 6.0.3 | Apache-2.0 |
| undici | 8.11.2 | MIT |
| undici-types | 5.26.5 | MIT |
| undici-types | 8.9.0 | MIT |
| unicode-properties | 1.4.1 | MIT |
| unicode-trie | 2.0.0 | MIT |
| unicorn-magic | 0.3.0 | MIT |
| unpipe | 1.0.0 | MIT |
| use-sync-external-store | 1.2.0 | MIT |
| vary | 1.1.2 | MIT |
| vite | 8.3.2 | MIT |
| vitest | 4.1.11 | MIT |
| web-streams-polyfill | 3.3.3 | MIT |
| web-streams-polyfill | 4.0.0-beta.3 | MIT |
| webidl-conversions | 3.0.1 | BSD-2-Clause |
| whatwg-url | 5.0.0 | MIT |
| which | 2.0.2 | ISC |
| which-command | 0.1.0 | MIT |
| why-is-node-running | 2.3.0 | MIT |
| wrap-ansi | 9.0.2 | MIT |
| wrappy | 1.0.2 | ISC |
| ws | 8.22.0 | MIT |
| wsl-utils | 1.0.1 | MIT |
| xmlchars | 2.2.0 | MIT |
| y18n | 5.0.8 | ISC |
| yaml | 2.9.1 | ISC |
| yargs | 18.2.0 | MIT |
| yargs-parser | 22.0.0 | ISC |
| yoctocolors | 2.2.0 | MIT |
| zod | 4.4.3 | MIT |
| zod | 4.6.5 | MIT |
| zod-to-json-schema | 3.25.2 | ISC |
| zstddec | 0.2.0 | MIT AND BSD-3-Clause |

---

_本清单由载荷现场重算；载荷变化（内核换代、依赖调整、`stage-payload` 排除面改动）后必须重算。_
