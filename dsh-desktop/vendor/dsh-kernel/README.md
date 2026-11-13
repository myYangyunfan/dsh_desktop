# Vendored dsh kernel tarballs (ACTIVE — 0.2.2-rc.3)

This directory holds the packed, npm-installable tarballs for the
`@deepseek-ai/dsh` **0.2.2-rc.3** kernel (the full `@deepseek-ai/dsh-*`
family — 375 packages (including the `@deepseek-ai/dsh` root), plus 13 framework-line tarballs whose version line is
its own: cordis / cordis-plugin-* / cosmokit / schemastery / node-addon-system
+ its four platform subpackages / libreoffice-kit). The kernel is downloaded
from the **npm registry**
(`registry.npmjs.org/@deepseek-ai/dsh-*` at the exact `0.2.2-rc.3` dist-tag
version) and is **NOT** re-published here under any other version. This is the
**active** vendored set: `dsh-desktop/package.json` / `package-lock.json`
resolve every `@deepseek-ai/dsh*` package against these `file:` tarballs, so a
fresh machine / CI reproduces the exact kernel `node_modules` offline from the
pre-fetched tarballs.

The single source of truth for the pinned kernel version is
`dsh-desktop/scripts/compat/kernel-pin.json` (`kernel.tag`, `kernel.packageVersion`,
`kernel.vendorDir`). Everything here — the tarball file names, the manifests, and the
comments in the surrounding scripts — must agree with that pin.

Contents: 375 `deepseek-ai-dsh-<pkg>-0.2.2-rc.3.tgz` tarballs + 13 framework tarballs
(388 total, 56,530,217 bytes). The authoritative list is whatever is present in this
directory — verify with `Get-ChildItem dsh-desktop/vendor/dsh-kernel` rather than
trusting any enumerated diff. (相对 0.2.2-rc.2 的 374 个 dsh tarball：保留 374、退役 0、新增 1 → 375；框架件版本线一字未动。
目录里**没有任何** `*-0.2.2-rc.2.tgz` 残留。2026-11-13 换代实测：权威枚举面 410 个
`@deepseek-ai/dsh*` 包名，其中 375 个有 `0.2.2-rc.3` 版本、35 个没有，registry 上不存在 404
的候选名。)**退役 0 这件事要记住**：8 个包（`dsh-error` / `dsh-tool-testkit` / `dsh-util-file-drag` /
`dsh-experimental-{claude-code-mods,client-ui-claude-code-mods,cua-macos,subagent-oar,tool-subagent-oar}`）
不在根包依赖链上，只靠依赖闭包会被误判成「rc.3 已退役」——它们 live 在 registry 与 bundle/profile 上。)

**框架件的平台子包只收 node-addon-system 的四件**：`@deepseek-ai/libreoffice-kit`
的平台子包（darwin-x64 / win32-arm64 / wasm 等）历史上就不进 vendor，registry 上
也没有全部发布（0.2.1-rc.1 换代实测两个 404）；它们作为传递依赖由 lock 解析。

## Where they came from

- Downloaded from the public npm registry at version `0.2.2-rc.3` (the registry
  uses `-rc.3`, not `-rc3`). For each package in the dsh family, the
  `dist.tarball` URL was fetched and the payload verified: the embedded
  `package.json` must report `name` equal to the requested package and `version`
  equal to `0.2.2-rc.3`, and the sha512 must match the registry `dist.integrity`,
  before the file is accepted into this directory.
- Tarball file naming follows the vendoring convention
  `deepseek-ai-dsh-<name>-<version>.tgz` (i.e. `@deepseek-ai/dsh-acp` →
  `deepseek-ai-dsh-acp-0.2.2-rc.3.tgz`, dropping `@`, replacing `/` with `-`).
  `scripts/generate-kernel-lock.mjs` reverses this convention to build the
  `file:vendor/dsh-kernel/*.tgz` dependency map.
- Framework packages (`@deepseek-ai/cordis*`, cosmokit, schemastery,
  node-addon-system…) and external transitive deps (ws, yaml, zod, zstddec,
  koffi, …) are **not** vendored here besides the 13 framework tarballs listed
  above; they resolve from the npm registry as regular semver dependencies.

## How to activate (kernel bump)

Version is driven by `dsh-desktop/scripts/compat/kernel-pin.json` as the single data
source (`kernel.tag` / `kernel.packageVersion` / `kernel.vendorDir`). To bump the
kernel:

1. Update the pin (`kernel.tag`, `kernel.packageVersion`) in
   `scripts/compat/kernel-pin.json`, and place the matching same-version
   `deepseek-ai-dsh-<pkg>-<newVersion>.tgz` tarballs into this directory (remove the
   old-version ones so no mixed versions remain). The kernel version constants in
   `scripts/install-kernel.mjs` and `scripts/generate-kernel-lock.mjs` read the pin
   directly — no separate edit.
2. Verify pin vs directory consistency: `node scripts/compat/validate-pin.js`
   (fail-closed if any tarball version does not match `kernel.packageVersion`).
3. Regenerate `package-lock.json` (the `file:`-resolved entries) with
   `dsh-desktop/scripts/generate-kernel-lock.mjs`, so `package.json` /
   `package-lock.json` declare every `@deepseek-ai/dsh*` package at the new version.
4. Re-run `npm install` (which triggers `scripts/install-kernel.mjs`) to merge the
   new kernel into `node_modules`, then re-run the patch chain and refresh the
   `patch-surface` snapshot so the adapters' anchors match the new kernel.

`scripts/install-kernel.mjs` and `scripts/patch-deps.js` pick the version up from the
pin / manifests; after install, verify the kernel reports the pinned version.

## 0.2.2-rc.1 → 0.2.2-rc.1 家族变动（2026-11-05）

- **退役 1 个**：@deepseek-ai/dsh-client-ui-deepseek-model-label-1017（0.2.2 线未再发布，无同名替代）。
- **新增 25 个**：action-cards / client-ui-{action-cards,context-menu,creation-recommendations,file-actions,file-drag,plugin-recommendations} /
  creation-recommendations / deliverable-file-references / experimental-{client-ui-forge,client-ui-stats,forge,forge-bundle,forge-github,forge-session,liveshare,liveshare-protocol} /
  fs-patch / message-quotes / official-bundles / personalized-recommendations / plugin-{detail,recommendations} / tool-executor-{native,ptc}。
- **框架线升级**：cordis 4.0.5→4.1.0、cordis-plugin-include 1.0.10→1.1.0、cordis-plugin-loader 1.0.6→1.1.0、
  cordis-plugin-timer 1.1.7→1.2.0、cordis-plugin-group 1.0.5→1.1.0、schemastery 3.18.5→3.19.0、cosmokit 1.8.6→1.9.0；
  libreoffice-kit 0.1.5 与 node-addon-system 0.1.2（含 4 个平台变体）不变。
- 判定方式：包在不在家族里，按「目标版本是否在 registry 发布过」判，**不要**用根包依赖链——
  依赖链只看得到 320 个，会把 44 个只挂在 bundle/profile 上的包误判成退役。

## 0.2.2-rc.1 → 0.2.2-rc.2 家族变动（2026-11-12）

- **规模**：364 → **374** 个 dsh tarball（含 `@deepseek-ai/dsh` 根包）；保留 355、退役 9、新增 19。
  框架件 13 个**一字未动**（cordis 4.1.0 / cordis-plugin-{group,include,loader} 1.1.0 / cordis-plugin-timer 1.2.0 /
  cosmokit 1.9.0 / schemastery 3.19.0 / node-addon-system 0.1.2 + 4 个平台变体 / libreoffice-kit 0.1.5）。
- **退役 9 个**（registry 上最高版本停在 `0.2.2-rc.1`，当前线上 latest 仍是 0.1.x alpha）：
  `dsh-api-account-controller`、`dsh-deepseek-account-platform`、`dsh-experimental-agent-team`、
  `dsh-experimental-agent-team-profile`、`dsh-experimental-client-ui-agent-team`、`dsh-experimental-tool-agent-team`、
  `dsh-office-to-pdf`、`dsh-web-search-exa`、`dsh-web-search-perplexity`。
- **新增 19 个**：`dsh-agent-team`、`dsh-client-ui-account-notifications`、`dsh-client-ui-agent-team`、`dsh-cua`、
  `dsh-cua-bundle`、`dsh-error`、`dsh-experimental-claude-code-mods`、`dsh-experimental-client-ui-claude-code-mods`、
  `dsh-experimental-cua-macos`、`dsh-experimental-subagent-oar`、`dsh-experimental-tool-subagent-oar`、
  `dsh-mcp-manager`、`dsh-office-kit`、`dsh-terminal-panel`、`dsh-tool-agent-team`、`dsh-tool-office`、
  `dsh-tool-testkit`、`dsh-util-file-drag`、`dsh-util-ripgrep`。
  其中 4 个是 agent-team / office 线的**改名接替**（`experimental-*agent-team` → `dsh-agent-team` /
  `dsh-client-ui-agent-team` / `dsh-tool-agent-team`，`dsh-office-to-pdf` → `dsh-office-kit` + `dsh-tool-office`）。
- **判定方式**：候选名不靠根包依赖链（那样只看得到约 350 个、还会把 bundle/profile 包误判成退役），
  而是先做权威穷尽枚举——npm 复制库 `https://replicate.npmjs.com/registry/_all_docs` 按
  `startkey="@deepseek-ai/dsh"` 前缀扫描得 **409** 个包名，再与 `/-/v1/search` 多路查询
  （`text=@deepseek-ai/dsh` / `scope:deepseek-ai` / `@deepseek-ai/dsh-`）取并集（搜索结果 ⊆ 409，无新增）；
  对 409 个逐个查 `registry.npmjs.org/@deepseek-ai/<pkg>` 的 `versions["0.2.2-rc.2"]` 是否存在。
  实测 `present=374 / 无 rc.2 = 35 / registry 404 = 0`。
  **注意**：`/-/v1/search` 索引对新发布包有滞后，仅靠「基线文件名 ∪ 搜索」会漏 10 个
  （`dsh-agent-team`、`dsh-client-ui-account-notifications`、`dsh-client-ui-agent-team`、`dsh-error`、
  `dsh-mcp-manager`、`dsh-office-kit`、`dsh-terminal-panel`、`dsh-tool-agent-team`、`dsh-tool-office`、
  `dsh-util-ripgrep`），它们是被已 vendor 包的 `dependencies` 直接引用的；本代用 replicate `_all_docs`
  前缀扫描 + 依赖闭包复核才补齐，换代时照此办理。
- 校验：374 个全部通过「内嵌 `package.json` 的 name/version == 请求包名/`0.2.2-rc.2`」+「sha512 == registry
  `dist.integrity`」；0 个失败（无 404、无 integrity 不符、无 version 不符）。新集全部到位并核对字节后才删旧版，
  目录内无混版残留。

## 0.2.2-rc.2 → 0.2.2-rc.3 家族变动（2026-11-13）

- **规模**：374 → **375** 个 dsh tarball（含 `@deepseek-ai/dsh` 根包）；**保留 374、退役 0、新增 1**。
  框架件 13 个**一字未动**（cordis 4.1.0 / cordis-plugin-{group,include,loader} 1.1.0 / cordis-plugin-timer 1.2.0 /
  cosmokit 1.9.0 / schemastery 3.19.0 / node-addon-system 0.1.2 + 4 个平台变体 / libreoffice-kit 0.1.5）。
- **新增 1 个**：`dsh-deepseek-chat-import`（根包 `dependencies` 直接新增，是 rc.3 唯一真正的家族变化）。
- **判定方式（照 rc.2 的姿势，这次又踩了一次）**：`dsh` 根的依赖闭包只走得到 **367** 个（因为部分包用
  `^`/`~` 范围声明、且有 8 个只挂在 bundle/profile 上），若拿闭包当家族清单，会得出「退役 8 个」的
  **错误结论**。正确姿势仍是权威穷尽枚举：replicate `_all_docs` 前缀扫 `@deepseek-ai/dsh` 得 **410** 个
  包名，再逐个查 `registry.npmjs.org/@deepseek-ai/<pkg>` 的 `versions["0.2.2-rc.3"]` 是否存在。
  实测 `present=375 / 无 rc.3 = 35 / registry 404 = 0`。
- **一致性判据（比对上代更硬）**：这 8 个若真按闭包删掉，`package-lock.json` 会把
  `dsh-error` 与 `dsh-experimental-cua-macos` 记成 **registry 解析**（rc.2 时代两者都是 `file:`），
  离线可复现性当场破——所以换代后必须复查 `lock` 里每个 `@deepseek-ai/*` 的 `resolved` 是否都是
  `file:vendor/dsh-kernel/`。判据是 `unit-vendor-node-gate` 之外的这条一次性核查：
  `node -e` 遍历 `lock.packages` 里 `@deepseek-ai/` 前缀，`resolved` 不以 `file:` 开头即判红。
