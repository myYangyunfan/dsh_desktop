# 第三方组件与许可（Third-party Notices）

DSH Desktop 集成了大量开源组件。本文件汇总主要第三方项目及其许可证，作为发行包内的合规说明。更完整的清单以各安装包实际携带的 `node_modules/**/LICENSE*`、`LICENSES.chromium.html` 为准。

## 核心第三方项目

| 项目 | 版本（随 v0.3.5 打包） | 许可证 | 来源 |
|---|---|---|---|
| [Zat-DSH Engine](https://github.com/mishibeikejie/zat-dsh-engine) | 0.4.0 | MIT | 设置 → 插件 → 插件市场（完整替换旧市场，随 v0.3.6 发布） |
| [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | 0.12.2 | MIT | 侧边栏工作台 bundle |
| [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh) | 0.1.0-rc.6 | MIT | DeepSeek Harness CLI 与插件生态 |
| [koffi](https://koffi.dev/) | 3.1.5 | MIT | 原生 FFI（目录选择器 / 原子写 / 会话持久化） |
| [Electron](https://www.electronjs.org/) | 43.4.0 | MIT | 桌面壳运行时 |
| [Chromium](https://www.chromium.org/) | 随 Electron | BSD 风格（见 `LICENSES.chromium.html`） | 渲染引擎 |
| [Node.js](https://nodejs.org/) | 24.15.0 | MIT（部分依赖各有许可） | 内置运行时 |
| [React](https://react.dev/) | 18.3.1 | MIT | Web UI 框架 |
| [zod](https://zod.dev/) | 4.4.3 | MIT | Zat-DSH Engine 依赖 |
| [electron-builder](https://www.electron.build/) | 26.15.3 | MIT | 打包工具（仅构建期） |
| [Cordis / Cosmokit / Schemastery](https://github.com/deepseek-ai) | 随 dsh | MIT | 插件框架 |

## Zat-DSH Engine（插件市场，已退役）

> 本行与本节是历史记录：`zat-dsh-engine`（旧内置市场）已从随包清单移出并删除源目录
> （commit `4baa9beaf`「随包删除已退役的内置插件市场 zat-dsh-engine」），后续接替它的
> `dsh-community-market` + `dsh-market-desktop-bridge` 也于 **2026-10-07** 随 v1.0.0 内置插件
> 精简（39 → 28）整体退役。本仓库当前不再分发任何插件市场组件，下列路径已不存在。

- 上游仓库：<https://github.com/mishibeikejie/zat-dsh-engine>
- 许可证：MIT（全文见 `assets/plugins/zat-dsh-engine/LICENSE`，随安装包一并分发）
- 集成方式：`assets/plugins/zat-dsh-engine`（lib/index.js、lib/client.js、lib/typert.host.js、cordis.patch.yml、LICENSE、README.md、README.zh.md）
- 数据：社区目录实时来自 GitHub `dsh-plugin` 主题；内置 999 条中文简介与分类数据已编译进 `lib/index.js`。
- 修改说明：本仓库按上游 release 原样打包，未做代码改动；运行时由 `syncCompanionPlugins` 同步为 web profile bundle。

## Agent 预设（v1.0.0 起不再携带）

v1.0.0 纯净线把 `assets/agent-presets` 整树删除，并拆除了预设写入器与 boot 的 `presets`
步——本仓库不再分发任何第三方 Agent 预设，因此其许可义务不再适用，本文件不再为它们保留
逐条许可表；曾随包分发的预设名与上游来源记录见 git 历史
（`git log --diff-filter=D -- dsh-desktop/assets/agent-presets`）。

## 其他说明

- 所有 npm 依赖的许可证均可通过各包目录内的 `LICENSE` 文件核验；electron-builder 在打包时会保留这些文件。
- 本项目自身为 MIT License（见仓库根目录 LICENSE 与 `dsh-desktop/LICENSE`）。
- 若下游分发需要，可运行 `npx license-checker --summary` 生成完整清单。
