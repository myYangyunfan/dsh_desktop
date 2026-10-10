# DSH Desktop 发版 Runbook（Tauri 线）

> 适用仓库：`myYangyunfan/dsh_desktop`，主线分支（v1.0.0 起为 `main`；`tauri/modular` 是
> Tauri 线立项时的分支名，现已不再是发版落点）。
> 现役发布流水线：`.github/workflows/tauri-release.yml`（Tauri 2）。
> Electron 旧线 `release.yml` 已归档（所有 job `if: false`，仅留考古入口）。
> 本文档随 v0.5.0 版本混装事故整改而建立——先读「事故档案」再发版。

---

## 0. 30 秒速查

```
# ① 前置：版本号已 bump、CHANGELOG 已更新、已合入主线分支
grep '"version"' dsh-tauri/src-tauri/src/app/tauri.conf.json

# ② 打 tag 并推（正式发版唯一入口）
git tag v0.5.1 && git push origin v0.5.1   # ← origin 必须是 GitHub 上的 dsh_desktop，
                                           #   先 `git remote -v` 核对（开发机上 origin 位
                                           #   可能挂着别的仓库，推错 = 流水线根本不被触发）

# ③ 等 Actions 里 "Tauri Release" run 全绿（5 个 build + publish；mirror-gitee 自 v1.0.0 起
#    整条 `if: false` 停用，run 里显示为 skipped 属预期）

# ④ 核对资产（主资产上限 7 个：win-x64 setup / portable / portable-lite / win-arm64（实验性）
#    / linux AppImage / linux deb / macos dmg，每个都应有同名 .sha256 边车；
#    三个 continue-on-error 平台可能缺席，缺不缺失逐条看 run）
gh release view v0.5.1 --json assets --jq '.assets[] | "\(.name)\t\(.size)"'

# ⑤ 发布后核验（v1.0.0 起 Gitee 不再镜像，双源核验只剩 GitHub 单源有意义；详见 §8）
node dsh-tauri/scripts/verify-update-sources.mjs --expect-version 0.5.1
```

---

## 1. 前置检查（打 tag 之前）

| 项 | 检查方式 | 不满足的后果 |
|---|---|---|
| `tauri.conf.json` 的 `version` == 待发版本 | `grep '"version"' dsh-tauri/src-tauri/src/app/tauri.conf.json`（顶层第一个即安装包内嵌版本唯一来源） | CI 第二道闸 fail-fast，浪费一次 run |
| CHANGELOG 已有待发版本段落 | `dsh-tauri/CHANGELOG.md` | release notes 链接指向过时内容 |
| 待发 commit 已在主线分支头（现为 `main`）且本地 CI 绿 | push 前跑 `ci.yml` 同款检查（见 CONTRIBUTING.md） | 带病发版 |
| tag 指向的 commit 就是 bump 过版本的那个 | `git log --oneline -3` 确认 | 混装（CI 会拦，但会浪费 run） |

版本号三处对齐（当前口径）：
- tag：`v<X>.<Y>.<Z>`
- `dsh-tauri/src-tauri/src/app/tauri.conf.json` 顶层 `"version": "<X>.<Y>.<Z>"`
- 资产文件名：`<X>.<Y>.<Z>`（**不带 v 前缀**，历史命名口径）

## 2. 正式发版（唯一入口：推 tag）

```bash
git tag v0.5.1            # 打在主线分支头（版本已 bump 的 commit）
git push origin v0.5.1    # 只推 tag；分支另行常规推送。⚠ origin 必须是 GitHub 上的
                          #   myYangyunfan/dsh_desktop——先 `git remote -v` 核对远端表，
                          #   推错仓库不会报错，只会让流水线安静地不触发
```

**为什么必须走 tag**：push tag 事件里 `actions/checkout` 默认检出
`github.ref`（即 `refs/tags/vX` 指向的提交）——不存在「tag 触发却检出分支头」
的问题。混装事故只发生在「workflow_dispatch 从分支头跑」的历史路径（见 §6）。

流水线结构（7 job）：

| job | 产物 | 容错 |
|---|---|---|
| build-windows | `DSH-Desktop-Setup-<v>-win-x64.exe` + 裸 exe（便携版原料） | 硬性（失败则不发版） |
| build-portable | `DSH-Desktop-Portable-<v>-win-x64.zip` | 依赖 build-windows 成功 |
| build-windows-arm64 | `DSH-Desktop-Setup-<v>-win-arm64.exe` | 实验性，continue-on-error |
| build-linux | `dsh-desktop_<v>_amd64.deb`（底线）+ `DSH-Desktop-<v>-linux-x64.AppImage`（可选） | continue-on-error，AppImage 偶发失败有 deb 兜底 |
| build-macos | `DSH-Desktop-<v>-macos-arm64.dmg` | continue-on-error，但**签名校验失败会自动重签重打**，绝不带病出仓 |
| publish | 汇总上传 GitHub Release（含生成/上传 `.sha256` 边车） | 总闸：版本/体积/边车断言不通过一律拒绝发布 |
| mirror-gitee | ~~镜像资产到 Gitee release（含边车，见 §8）~~ **自 v1.0.0 起整条 `if: false` 停用**（实现保留以便恢复） | 停用后在 run 里显示为 skipped，属预期；恢复时还原原条件即可 |

注意：同一 ref 的 run 串行排队（concurrency 不取消），重复推同一 tag 会排队重建，
不会互相打断。

## 3. 验证 run

1. 打开 GitHub → Actions → 左侧选 **Tauri Release**。
2. 找到触发器为 **push**、ref 显示 **tag**（如 `v0.5.1`）的最新 run。
3. 逐项确认：
   - 每个 build job 的 `Assert tauri.conf.json version == tag version` 步骤日志
     出现 `OK: tauri.conf.json version=<v> == 期望 <v>`；
   - mac job 的 `Verify ad-hoc signature` 步骤出现
     `OK: app bundle 签名有效`（或重签后通过）；
   - 各 Rename/Verify 步骤出现 `OK: <资产名> (<bytes> bytes)`；
   - publish job 的 `Verify assets` 与 `Verify uploaded assets` 全绿。
4. 若 publish 的 `Verify assets` 报「资产文件名未包含期望版本」——这就是版本
   混装被防线④拦下，**不要重试绕过**，回查是哪个 build job 的断言漏放（理论上
   不可能，出现了说明防线本身被改坏）。

## 4. 核对 release 资产

```bash
gh release view v0.5.1 --json assets --jq '.assets[] | "\(.name)\t\(.size)"'
```

期望清单（v0.5.0 实测大小供参照）：

| 资产 | 参照大小 |
|---|---|
| `DSH-Desktop-Setup-<v>-win-x64.exe` | ~72 MB |
| `DSH-Desktop-Portable-<v>-win-x64.zip` | ~102 MB |
| `DSH-Desktop-Setup-<v>-win-arm64.exe`（实验，可缺） | ~68 MB |
| `dsh-desktop_<v>_amd64.deb` | ~122 MB |
| `DSH-Desktop-<v>-linux-x64.AppImage`（可缺，缺则查 run 日志） | ~190 MB |
| `DSH-Desktop-<v>-macos-arm64.dmg` | ~117 MB |
| 以上每个主资产对应的 `<资产名>.sha256` 边车 | ~100 字节 |

核对纪律：
- **数量**：4 个必备（win-x64 / portable / deb / dmg）+ 2 个可选（arm64 / AppImage）
  **+ 每个主资产 1 个 `.sha256` 边车**（CI 已断言边车数 == 主资产数）。
- **无重复**：文件名逐个比对，不允许出现同名或 `(1)` 后缀（后者是网页手动
  重复上传的残影，手动删：`gh release delete-asset v0.5.1 "坏文件名" --yes`）。
- **大小**：全部 >50MB（CI 已断言，人工再扫一眼数量级即可）。
- **版本抽检**（可选但推荐）：
  - macOS：`hdiutil attach DSH-Desktop-<v>-macos-arm64.dmg -mountpoint /Volumes/DSHD &&
    plutil -extract CFBundleShortVersionString raw "/Volumes/DSHD/DSH Desktop.app/Contents/Info.plist" &&
    hdiutil detach /Volumes/DSHD`（应输出 `<v>`）
  - Windows：安装包右键 → 属性 → 详细信息 → 产品版本。

## 5. 补传 / 重建资产（workflow_dispatch）

仅用于给**已存在的 tag** 重建资产（如 mac 包发布后发现坏、linux AppImage 缺失）。

1. Actions → Tauri Release → **Run workflow** → 分支随便选（**无所谓**，见下）→
   输入 `version=v0.5.1`（tag 必须已存在）。
2. 流水线会**强制 checkout `refs/tags/v0.5.1`**——即使从分支头 dispatch 也绝不
   从分支头构建（v0.5.0 混装事故的根治点）。
3. 上传时会**先删 release 上同名资产再重传**（幂等重建，不需要手动清理），
   之后逐资产核对远端存在性与大小。已存在 release 的 title/body/pre-release/
   draft 状态**绝不会被改动**。

dispatch 输入 `version` 必须是已 push 的 tag（带不带 `v` 前缀均可，流水线会归一）。

## 6. 事故档案（为什么有这些防线）

### v0.5.0 版本混装（2025，本 runbook 的直接起因）
- 经过：分支头已 bump 到 0.5.1 后，用 workflow_dispatch 从**分支头**重建
  v0.5.0 资产 → DMG 内 Info.plist=0.5.1，文件名/Release 却挂 v0.5.0。
- 根因：旧版 workflow 的 checkout 不带 `ref`，dispatch 检出运行分支头；版本号
  只取自 dispatch 输入（仅用于文件名），与构建内容无任何一致性校验。
- 防线（四道闸，全部在 tauri-release.yml）：
  1. checkout 强制 `refs/tags/v<版本>`（每个 build job）；
  2. `tauri.conf.json version == tag 版本` fail-fast；
  3. 产物名内嵌版本断言（NSIS/deb/AppImage/dmg glob + mac Info.plist plutil）；
  4. publish 汇总断言（全部资产文件名含版本 + 体积 >50MB + 上传后逐个核对）。

### v0.5.0 macOS「已损坏」（f41ecc9）
- 根因：Tauri v2 无 signingIdentity 时静默跳过 codesign，Sequoia Gatekeeper
  对无 bundle 密封的 quarantine 应用直接报损坏。已修：`signingIdentity: "-"` +
  CI 签名校验步骤（失败自动重签重打 DMG）。**该步骤不得删除**。

### release.yml 假短路（本次整改发现）
- 旧写法 `if: false && A || B` 因 `&&` 优先级高于 `||`，实际等价 `false || B`
  ——dispatch 默认输入（arch=both）下两个 Windows Electron job 仍会真实执行。
  已改为显式 `if: false` 真短路，文件头有完整说明。

### 手动上传重复资产（v0.5.0）
- release 页面上手动拖传过重复安装包（绕过一切 CI 校验）。禁止手动上传；
  补资产一律走 §5 的 dispatch 路径。

## 7. 禁止事项

- ❌ 手动往 release 页面上传/拖拽资产（绕过版本/体积/去重校验）。
- ❌ dispatch 重建资产时期望它构建「分支头」内容——它只会构建 tag 内容，
  这是特性不是 bug。
- ❌ 删除/绕过 mac 签名校验步骤、publish 的 Verify assets / Verify uploaded
  assets 步骤。
- ❌ 用 `--clobber` 之外的方式强推同名资产去「覆盖」——dispatch 路径已内置
  delete-asset + 重传 + 核对。
- ❌ 发版后 force-push 移动已发布的 tag（资产与 commit 对不上，等同混装）。

## 8. 自动更新配套（sha256 边车 + 双源镜像 + 发布后核验）

客户端壳侧更新器轮询 **GitHub + Gitee 双源** `releases/latest`，下载平台资产
（如 `DSH-Desktop-Setup-0.5.3-win-x64.exe`）后**强制校验同名 `.sha256` 边车**；
Gitee 缺失的资产（>100MB）自动回落 GitHub 源下载。发布链路的责任分工：

> ⚠️ **自 v1.0.0 起不再镜像 Gitee**（`mirror-gitee` job 整条 `if: false`，代码与资产都不推）。
> 更新器代码仍按双源轮询，但 Gitee 侧从 v1.0.0 起没有对应 release——取包请直接走 GitHub
> 链接。本节里凡涉及镜像的条目（8.1 的「镜像 / 前置 secret / tag 同步」三条、8.2 的双源
> 判定、8.4 的镜像重建步骤）都是为**恢复镜像**时准备的，现状发版不必执行。

### 8.1 边车约定（唯一规范）

- **命名**：`<主资产名>.sha256`，如 `DSH-Desktop-Setup-0.5.3-win-x64.exe.sha256`。
- **内容**：`<64 位小写十六进制哈希>` + 可选文件名尾注（即 `sha256sum` 原生
  输出 `<hex><两空格><文件名>`）；解析规则=**取首段 64 hex**，尾注向后兼容可省略。
- **生成**：publish job 的 `Generate sha256 sidecars` 步骤统一产出（ubuntu
  runner 上 `sha256sum`，GNU 工具链；不在 mac job 生成——规避 BSD 工具链坑）。
  单点生成保证「一个主资产恰好一个边车」，dispatch 重建资产时边车必然重建。
- **上传**：边车与主资产同目录，走 publish 的同一套 delete-then-upload 循环
  （幂等：重跑时先删同名再传，不留旧哈希残影）；`Verify assets` 断言边车
  数量 == 主资产数量且格式合法（首段 64 hex），`Verify uploaded assets`
  断言远端边车数量与本地一致。
- **镜像**：mirror-gitee job 把 GitHub release 全部资产（含边车）镜像到
  `gitee.com/my-yang-yunfan/dsh_desktop` 同名 release。**>100MB（104857600
  字节）的主资产跳过**（Gitee 单附件上限，AppImage/deb/dmg 属预期缺失，壳侧
  回落 GitHub 源）；**边车是小文件必须全部镜像**，镜像收口步骤会校验。
  幂等策略：Gitee v5 API 无删单附件端点，故「同名同大小→跳过；同名不同
  大小→删整个 Gitee release 重建再全量上传」。
- **前置 secret**：仓库需配置 `GITEE_TOKEN`（gitee.com 私人令牌，需 projects
  权限）——缺失时 mirror-gitee job 第一步即 fail 并给出配置指引。
- **tag 同步**：Gitee 建 release 要求 tag 已存在。mirror job 会先查 Gitee
  tag 列表，缺失则用 token 浅推 tag；推送失败（Gitee 仓库落后 GitHub）时
  人工处理：Gitee 仓库管理→强制同步，或本地 `git push gitee v<x.y.z>`，
  然后重跑 mirror job。

### 8.2 发布后必跑：核验（v1.0.0 起实际只有 GitHub 单源）

publish 全绿后（v1.0.0 起 mirror-gitee 停用，不再等它），本地（或 CI）跑只读核验工具：

```bash
node dsh-tauri/scripts/verify-update-sources.mjs --expect-version 0.5.3
# 默认参数即本仓库双源；--test 为离线自检；纯 node:https 无第三方依赖，
# 尊重 HTTP(S)_PROXY / NO_PROXY；企业 MITM 证书环境用 NODE_USE_SYSTEM_CA=1
```

核验内容与判定：
- 双源 `releases/latest` tag 必须一致（漂移=FAIL）且等于 `--expect-version`；
  **v1.0.0 起的实际判据只看 GitHub 侧**（Gitee 无 release，比对必然落空，勿据此判红）；
- **时机**：publish 创建 release **缺省不带 `--prerelease`**（0.5.7 整改的结论：出生即
  prerelease 会让更新器的 `releases/latest` 永远看不到新版本，「自动更新一直不生效」
  的全局根因），所以正常路径下**无需**再去页面「转正」；若某天发现 release 是
  Pre-release 而并非下列开关所致，那是人工改出来的，先查是谁改的再跑 verify；
- **预发布开关（v1.0.2 起）**：`tauri-release.yml` 顶层 `env.RELEASE_PRERELEASE`
  置 `'true'` 时，publish 用 `gh release create --prerelease` 且标题带「（预发布）」——
  用于「修复未经多平台实机复验、先出包但不自动推送」的版本。此时 §8.2 第一条的
  「latest tag == `--expect-version`」判据**必然落空**（GitHub 的 latest 端点跳过
  prerelease），这是开关的预期结果，不是发版缺陷：判据改取 GitHub 侧「资产在位 +
  边车格式合法 + 边车哈希与 API `digest` 交叉核对一致」三段。恢复正式形态 = 开关改回
  `'false'`（或删除该行，缺省即正式）；把已发的预发布转正 =
  `gh release edit v1.0.2 --prerelease=false`，流水线只在 release 不存在时写元数据，
  重跑 dispatch 不会回头覆盖（上传纪律第 1 条，已用桩 `gh` 反证过四种开关态）。
- 资产对照表：Gitee 缺 >100MB 资产属预期；缺小资产/缺边车=WARN 或 FAIL；
- 每个主资产：有边车→格式校验 + 与 GitHub API `digest`（sha256:…）交叉核对
  （不下载大文件即可确认边车哈希==已上传资产哈希）；HEAD 下载 URL 核
  content-length == API size；镜像侧 HEAD 核 content-length == GitHub size；
- 退出码：**0=可发布（允许 WARN），1=硬错（API 不可达/tag 漂移/边车格式坏/
  哈希不符/大小不符）**。网络不可达类 HEAD 失败记 WARN（CN 环境常见）。
- **v1.0.0 起的读法**：脚本没有「关源」开关，Gitee 的 `releases/latest` 会停在最后一次
  镜像的旧版本，于是「镜像漂移」判 FAIL——**这是停用镜像的预期结果，不是发版缺陷**。
  判据取 GitHub 侧三段输出（latest tag == 期望版本 / 资产逐个有边车且格式合法 /
  边车哈希与 API `digest` 交叉核对一致）；要连 Gitee 一起判，就把镜像恢复起来（见 §8.1）。

### 8.3 旧版本无边车的兼容期

≤ v0.5.2 的 release 没有边车（管线改造前发布）。壳侧更新器对缺边车资产
**仅做 size 兜底校验**（API size vs 下载字节数），不阻断升级——verify 工具
对无边车资产同样标 WARN 不 FAIL。兼容期没有截止日期：旧版本资产永不重建，
新版本（≥0.5.3）起边车由管线自动保证。

### 8.4 回滚 / 删 tag 重发时边车同步重建

- **dispatch 重建资产**（§5）：publish 重新生成全部边车（新内容新哈希），
  delete-then-upload 覆盖 GitHub 侧；mirror-gitee 检出同名不同大小后删整个
  Gitee release 重建，边车随镜像同步更新。全程无需手工干预边车。
- **删 tag 重发**：GitHub 删 release+tag 后重推同名 tag，管线全量重建（含
  边车）；Gitee 侧若残留旧 release，mirror job 的漂移检测会触发删重建。
  注意 Gitee 源码包（`v*.zip`/`v*.tar.gz`）随 tag 自动重建，无需处理。
- **禁止**：手动往任一源拖传/手改边车（绕过校验链，与 §7 手动上传禁令同理）。

