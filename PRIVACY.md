# Privacy Policy · 隐私政策

**Last updated / 最后更新：2026-11-14**
**Applies to / 适用范围：DSH Desktop（DSH Pack）v1.x** — the installer and portable builds published on GitHub Releases, and the same builds redistributed by package managers such as WinGet.
**[中文版见下半部分 ↓](#隐私政策中文版)**

---

## English

### Plain-language summary

- **We collect nothing.** This project runs no analytics, no telemetry, no crash reporting and no ad SDKs, and we operate no server that receives data from the app.
- **Everything the app stores stays on your computer** — settings, conversations, attachments, logs, API keys.
- **The app only talks to the network to do something you asked for:** check for updates, talk to the model provider whose key you entered, download a plugin you chose to install, or reach a site because you asked the agent to.

### 1. Who we are

DSH Desktop ("DSH Pack") is a free, open-source (MIT) desktop client for DeepSeek Harness, maintained at
<https://github.com/myYangyunfan/dsh_desktop>.

This policy covers the desktop application itself. It does **not** cover the model providers you configure (for
example DeepSeek's own API), third-party plugins you install, or services those plugins call — each of them has its
own policy, linked from inside the app or from the plugin's own repository.

### 2. What we collect

**Nothing.** Specifically:

- no usage analytics, product telemetry, session recording or A/B assignment;
- no crash reporting service (crash logs are written to a local file on your disk);
- no account, sign-in or device identifier issued by us — the app uses the API key you provide for your model provider;
- no advertising, tracking pixels or third-party SDKs of that kind;
- no server of ours that the app contacts at all.

We therefore cannot know how often you launch the app, which features you use, or what you type.

### 3. What the app stores on your device

| Data | Location |
| --- | --- |
| Shell settings (window state, tray, updater, feature switches), logs, quarantine area | Windows: `%APPDATA%\dsh-desktop\` · macOS: `~/Library/Application Support/dsh-desktop/` · Linux: `$XDG_CONFIG_HOME/dsh-desktop/` · portable build: `data\` next to the executable |
| Conversations, attachments, plugin profiles, caches, credentials | `<DSH_HOME>` — default `~/.dsh`, override with the `DSH_HOME` environment variable. This is also where the portable build keeps them unless you point `DSH_HOME` into `data\`. |

Notes:

- **API keys** are stored in your local data directory — `<DSH_HOME>/.credentials.yaml`, plain YAML with owner-only
  permissions — and are sent only to the provider endpoint they belong to, as the authentication header of requests you
  initiate.
- **Logs** exist for local troubleshooting and may contain prompt or session text. Delete them at any time.
- **Uninstalling does not delete your data directory** — remove it manually if you want a clean slate.
- Nothing in these directories is uploaded anywhere by us.

### 4. When the app uses the network

Only these cases, and only when the situation applies:

1. **Update check** — an HTTPS `GET` of the public release metadata at
   `api.github.com/repos/myYangyunfan/dsh_desktop/releases/latest`, with a Gitee mirror as fallback. At most once per
   24 hours in the background, plus whenever you trigger it from the menu. It carries the app version and an ordinary
   HTTP client fingerprint; no identifier of you or your device.
2. **Your model provider** — prompts, attachments and conversation context are sent to the API endpoint you
   configured (DeepSeek by default) so that it can answer. That provider's privacy policy governs this.
3. **Plugin installation and updates** — when you install or update a plugin, the app fetches it from the npm registry
   or its GitHub repository. Nothing is fetched on its own initiative.
4. **Tools and plugins that need a service** — the agent only browses, fetches or searches when you ask it to; bundled
   plugins that need an external service (account balance, web search, remote pairing, compression proxy, …) contact
   that service on your behalf so the feature works.
5. **Local only** — the UI talks to the bundled kernel over `http://127.0.0.1:<port>` on this machine. Any non-loopback
   access requires authentication. Remote/LAN access is opt-in and off unless you configure it.

### 5. Third-party components

The installer bundles an offline copy of the DeepSeek Harness kernel and about thirty companion plugins, several of
them third-party. Their code runs locally, but a plugin may contact its own service to do its job. The bundled
inventory — package names, versions, upstream repositories and licenses — is at
[`dsh-desktop/docs/builtin-plugins-inventory.md`](dsh-desktop/docs/builtin-plugins-inventory.md) and
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

### 6. Children

The app is not directed at children under 13 (or the minimum age in your jurisdiction). We do not knowingly collect
personal data from anyone, of any age.

### 7. Your choices

- You can use the app fully offline except for requests to your model provider.
- You can delete the data directories, individual sessions or logs at any time.
- You can decline to install or update plugins; nothing breaks.
- The source code is public, so every claim above can be checked — the update client lives in
  `dsh-tauri/src-tauri/src/app/src/commands/updater_client.rs`, the data paths in
  `dsh-tauri/src-tauri/crates/shell-core/src/paths.rs`.

### 8. Security notes

- API keys are kept in plain local files, not in an OS keychain. Protect your user account and disk encryption
  accordingly.
- Only install plugins you trust: a plugin runs with the same privileges as the app.

### 9. Changes to this policy

Changes are made in this file in the repository; its git history is the record. Material changes are mentioned in the
release notes.

### 10. Contact

Open an issue at <https://github.com/myYangyunfan/dsh_desktop/issues>.

---

## 隐私政策中文版

### 一句话概括

- **我们不收集任何数据。** 项目没有埋点、没有遥测、没有崩溃上报、没有广告 SDK，也没有任何接收 App 数据的服务器。
- **App 存下来的东西全在你自己的机器上** —— 设置、会话、附件、日志、API Key。
- **只有你要求它做事时它才联网**：检查更新、调你填的那个模型服务商、装你选择安装的插件、或替你访问某个网站。

### 1. 我们是谁

DSH Desktop（DSH Pack）是 DeepSeek Harness 的桌面客户端，免费、MIT 开源，仓库在
<https://github.com/myYangyunfan/dsh_desktop>。

本政策只覆盖桌面应用本身，**不覆盖**你配置的模型服务商（例如 DeepSeek 官方 API）、你安装的第三方插件，以及
这些插件访问的服务——它们各有自己的隐私政策，通常写在插件仓库里。

### 2. 我们收集什么

**什么都不收集**，具体地：

- 没有使用统计、产品遥测、会话录制、灰度分组；
- 没有崩溃上报服务（崩溃日志写在你自己磁盘上的本地文件里）；
- 没有我们发放的账号、登录态或设备标识——App 用的是你自己填的模型服务商 API Key；
- 没有广告、跟踪像素或同类第三方 SDK；
- 没有任何属于我们的服务器供 App 连接。

因此我们无法知道你多久打开一次、用了哪些功能、输入了什么。

### 3. App 在你设备上存了什么

| 数据 | 位置 |
| --- | --- |
| 壳设置（窗口状态、托盘、更新器、功能开关）、日志、隔离区 | Windows：`%APPDATA%\dsh-desktop\` · macOS：`~/Library/Application Support/dsh-desktop/` · Linux：`$XDG_CONFIG_HOME/dsh-desktop/` · 便携版：exe 旁的 `data\` |
| 会话、附件、插件 profile、缓存、凭据 | `<DSH_HOME>` —— 默认 `~/.dsh`，可用环境变量 `DSH_HOME` 改。便携版默认也在这里，想让数据随 exe 走就把 `DSH_HOME` 指到 `data\` 下。 |

几点说明：

- **API Key** 存在本地数据目录的 `<DSH_HOME>/.credentials.yaml`（明文 YAML，权限位只给所有者），只在你发起的请求中
  作为认证头发给你填的那家服务商。
- **日志**用于本地排查，可能含提示词或会话文本；随时可以删。
- **卸载不会删除数据目录**，要清干净请手动删。
- 这些目录里的任何东西，我们都不会上传到任何地方。

### 4. App 什么时候联网

只有下面几种情况，且只在条件成立时：

1. **检查更新** —— HTTPS `GET` 公开的发行版元数据 `api.github.com/repos/myYangyunfan/dsh_desktop/releases/latest`，
   失败时走 Gitee 镜像兜底。后台最多 24 小时一次，另有你在菜单里手动触发。只带 App 版本号和普通 HTTP 客户端
   指纹，不带你或你设备的任何标识。
2. **你的模型服务商** —— 提示词、附件与会话上下文发给你配置的 API 端点（默认 DeepSeek），否则它无法作答。这部分
   受该服务商的隐私政策约束。
3. **插件安装与更新** —— 你主动安装或更新插件时，App 从 npm registry 或其 GitHub 仓库取包。不会自作主张去拉。
4. **需要外部服务的工具与插件** —— 代理只在你要求时才浏览、抓取或搜索；需要外部服务的内置插件（账户余额、
   网页搜索、远程配对、压缩代理等）会代你访问对应服务，以完成该功能。
5. **仅本机** —— 界面与内置内核通过 `http://127.0.0.1:<端口>` 在本机通信；任何非回环访问都需要认证。局域网/远程
   访问是可选能力，你不配置就不开。

### 5. 第三方组件

安装包内置了一份 DeepSeek Harness 内核的离线副本和约三十个伴随插件，其中若干来自第三方。它们的代码在本地运行，
但插件为完成功能可能访问自己的服务。逐条清单（包名、版本、上游仓库、许可）见
[`dsh-desktop/docs/builtin-plugins-inventory.md`](dsh-desktop/docs/builtin-plugins-inventory.md) 与
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

### 6. 未成年人

本应用不面向 13 岁以下儿童（或你所在司法辖区规定的最低年龄）。我们不会在知情情况下收集任何人的个人数据，
不论年龄。

### 7. 你的选择

- 除访问你自己配置的模型服务商外，App 可以完全离线使用。
- 数据目录、单个会话、日志随时可删。
- 可以不装或不停插件，不影响其他功能。
- 源码公开，上面每一条都可以自己核：更新客户端在
  `dsh-tauri/src-tauri/src/app/src/commands/updater_client.rs`，数据路径在
  `dsh-tauri/src-tauri/crates/shell-core/src/paths.rs`。

### 8. 安全提示

- API Key 以明文存放在本地文件里，没有使用系统钥匙串。请相应保护你的系统账户与磁盘加密。
- 只安装你信任的插件：插件的权限与 App 本身相同。

### 9. 政策变更

变更直接改本文件，git 历史即记录；影响较大的变更会在发行说明里提一句。

### 10. 联系方式

在 <https://github.com/myYangyunfan/dsh_desktop/issues> 提 issue。
