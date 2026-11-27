# Security Policy · 安全政策

**Last updated / 最后更新：2026-11-27**
**Applies to / 适用范围：DSH Desktop（DSH Pack）** — the source in this repository and the installer / portable builds published from it on GitHub Releases.
**[中文版见下半部分 ↓](#安全政策中文版)**

This is a vulnerability disclosure policy. It does not promise a bounty, a response time, or that every report will become a code change.
What the app stores, and when it uses the network, is described in [PRIVACY.md](PRIVACY.md). This file does not add a privacy or telemetry claim.
数据怎么存、什么时候联网，以 [PRIVACY.md](PRIVACY.md) 为准；本文件不另作隐私或遥测声明。

---

## English

### Report a vulnerability

Please use GitHub private vulnerability reporting for this repository:

<https://github.com/myYangyunfan/dsh_desktop/security/advisories/new>

Do not open a public issue, discussion, or pull request that includes exploit steps, a proof of concept, credentials, or crash dumps. Public issues are for ordinary bugs.

There is no published security email. If that form says private vulnerability reporting is turned off, open a public issue that only says a vulnerability report is waiting and asks the maintainer to enable Security Advisories. Leave the technical details out of that issue.

### What helps

- App version and operating system.
- What an attacker can do, and whether they need to already be on the machine.
- Steps to reproduce, or a short description if a full recipe would be harmful to publish later.
- A suggested fix, if you have one. Optional.

### What we will do

Reports are read by the maintainer. There is no bug bounty and no guaranteed reply window. Confirmed issues are fixed in a later release when a fix is practical. You may ask to be credited or to stay anonymous.

Please give us time to publish a fixed release before you describe the issue in public. This is a request, not an open-ended embargo.

Security fixes target the latest GitHub Release. Older tags are not a separate supported line.

### In scope

- This repository: the Tauri shell, the Node sidecar and desktop scripts, the updater, local credential handling, companion-plugin packaging and loading that this repo ships, and the release workflows' handling of build artifacts.
- A problem in how this repo patches or packages the DeepSeek Harness kernel, when the behavior is introduced here.

### Out of scope

- The upstream DeepSeek Harness kernel (`@deepseek-ai/dsh` and the rest of that family) when the issue is not introduced by this repo's patches or packaging. Report those upstream.
- Upstream bugs in a third-party companion plugin, when this repo only vendors or pins it. The plugin's own repository is the right place.
- The model provider you configure, and any account or API key you send to that provider.
- Malware or another person who already runs as your user. The app stores API keys in a local file (`<DSH_HOME>/.credentials.yaml`, owner-only permissions), not in the OS keychain. That storage choice is described in [PRIVACY.md](PRIVACY.md). Restating it, without a new exposure path, is not a new vulnerability.
- A warning from Windows SmartScreen, Microsoft Defender, or macOS Gatekeeper because the published Windows and macOS installers are not code-signed or notarized. That is a known distribution limit. Signing certificates are obtained by the maintainer outside this repository. Do not send certificates or private keys to the repo, to an issue, or to a pull request.
- Feature requests and ordinary bugs. Use [issues](https://github.com/myYangyunfan/dsh_desktop/issues).

### What this policy does not claim

[PRIVACY.md](PRIVACY.md) describes what the app stores on the machine and when it uses the network. This document does not add a privacy, telemetry, or data-collection claim.

---

## 安全政策中文版

### 报告漏洞

请走本仓库的 GitHub 私下漏洞报告（Security Advisories）：

<https://github.com/myYangyunfan/dsh_desktop/security/advisories/new>

不要开公开 issue、讨论或 pull request 去写利用步骤、概念验证、凭据或崩溃转储。公开 issue 只收普通缺陷。

本仓库没有公开的安全邮箱。如果上面的表单提示「未开启私下漏洞报告」，可以开一条公开 issue，只写「有一份漏洞报告在等，请维护者打开 Security Advisories」，不要写技术细节。

### 报告里写什么

- App 版本和操作系统。
- 攻击者能做什么，以及是否必须已经在这台机器上。
- 复现步骤；若完整步骤以后不适合公开，写一段简短说明即可。
- 若有修改建议可以附上，不是必须。

### 我们会做什么

报告由维护者阅读。没有漏洞奖金，也没有保证回复时限。确认属实、且修得动的问题，会在后续版本里修。你可以要求署名，也可以保持匿名。

请等修复版本发出后再公开细节。这是请求，不是无限期的保密义务。

安全修复以 GitHub 上最新的 Release 为目标。更早的 tag 不单独维护。

### 范围内

- 本仓库：Tauri 壳、Node sidecar 与桌面脚本、更新器、本地凭据处理、本仓库随包的伴随插件打包与加载，以及发布工作流对构建产物的处理。
- 本仓库对 DeepSeek Harness 内核的补丁或打包方式引入的问题。

### 范围外

- 上游 DeepSeek Harness 内核（`@deepseek-ai/dsh` 及其同族包）自身的问题，且不是本仓库的补丁或打包引入的。请报到上游。
- 第三方伴随插件的上游缺陷，而本仓库只是 vendored 或钉版本。请报到该插件自己的仓库。
- 你配置的模型服务商，以及你发给该服务商的账号或 API Key。
- 已经以你的用户身份在跑的恶意软件或其他人。App 把 API Key 放在本地文件（`<DSH_HOME>/.credentials.yaml`，权限只给所有者），不用系统钥匙串。这个存放方式写在 [PRIVACY.md](PRIVACY.md)。只是复述它、没有新的暴露路径，不算新漏洞。
- Windows SmartScreen、Microsoft Defender 或 macOS Gatekeeper 因为安装包未做代码签名、未公证而报警或拦截。这是已知的分发限制。签名证书由维护者在仓库外另行取得。不要把证书或私钥发到仓库、issue 或 pull request。
- 功能请求和普通缺陷。请用 [issues](https://github.com/myYangyunfan/dsh_desktop/issues)。

### 本政策不声称的事

机器上存了什么、何时联网，以 [PRIVACY.md](PRIVACY.md) 为准。本文件不另加隐私、遥测或数据采集方面的声称。
