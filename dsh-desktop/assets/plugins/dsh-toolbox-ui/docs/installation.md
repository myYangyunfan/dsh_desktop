# 安装与升级

**中文** | [English](installation.en.md)


本文区分正式安装和本地开发安装。正式使用推荐 GitHub、npm 或 tarball，不要长期依赖开发目录的 `link:`。

## 环境要求

- DeepSeek Harness `0.2.1-rc.5` 及以上；已验证 `0.2.1-rc.5`（Cordis 4.0.5 / Loader 1.0.6）与 `0.2.2-rc.1`（Cordis 4.1.0 / Loader 1.1.0）。
- 已初始化的 `web` profile
- Node.js 和 pnpm 可由 DSH 的插件命令正常调用

插件把 DSH 宿主 API 声明为 `>=0.2.1-rc.5 <0.3.0` 的 peer，并通过 `engines.dsh` 声明同一准入窗口。当前发布支持从 0.2.1-rc.5 起；旧 loader 只保留历史回归，0.2.2 的新版 ToolSearch executor 与匹配的 Loader/Include 作为独立目标验证。

历史 Loader 回归说明（不代表 0.2.0 是当前发布准入）：

- **启动错误传播**：1.0.3 在 `Entry.update()` 里对 apply 失败直接 throw，所以 `loader.create()` 自己就 reject；1.0.6 改成只记日志，`create()` 总是 resolve，错误只挂在 fiber 上。插件以 `fiber.await()` 为准，否则"添加一个连不上的服务器"不会回滚 patch。
- **dispose 时的写盘**：1.0.3 的 unload 处理器有一道 `_disposing` 早退守卫，1.0.6 删掉了它，于是 `fiber.entry.parent.tree.write()` 会真的执行——对 include 子树条目就是 `Include.write()`，会把 base 配置连同**其余 patch 行**一起写回。插件在移除条目前先置 `disabled`（该处理器里唯一还能早退的判据），否则"删一台服务器"会把兄弟服务器的 patch 行烙进 `cordis.yml`。

开发基线跟随已验证的最新 RC，并镜像每一个 peer 依赖（另有一个仅供测试的 `@deepseek-ai/dsh-typert-loader`，见[设计与限制](design.md#版本范围怎么定以及它管不到什么)）；升级 DSH 后运行 `pnpm install && npm test` 验证。

## 安装

推荐用 npm 安装：包里的 `^1.x` 范围让后续 `dsh plugin update` 能自动升级小版本。

```sh
dsh plugin --profile web add dsh-toolbox-ui@^1.10.1
```

也可以固定 GitHub release tag（适合需要锁定某个具体版本时）：

```sh
# 固定 release tag
dsh plugin --profile web add github:Imzl-zl/dsh-toolbox-ui#v1.10.1

# 或固定某个 commit
dsh plugin --profile web add github:Imzl-zl/dsh-toolbox-ui#<commit>
```

两种方式的**代码与运行行为完全相同**（包里带预构建的 `lib/`，不需要运行 `prepare`，也不需要配置 `allowBuilds`）；区别只在升级：`^1.x` 范围能被 `dsh plugin update` 自动推进，而 tag/commit 是不可变规格、`update` 只会重新解析同一个规格。

如果之前安装的是本地开发目录或另一种规格，先移除旧依赖：

```sh
dsh plugin --profile web remove dsh-toolbox-ui
```

安装完成后重启 Web Host：

```sh
dsh web
```

## 验证安装

检查 profile 的有效配置：

```sh
dsh --profile web --dump-config
```

输出中应出现：

```yaml
id: mcp-manager-ui
name: dsh-toolbox-ui
```

打开 DSH Web 后，右下角应出现 MCP 管理按钮。面板能够读取当前 profile 中的 MCP，并对可管理条目执行启停、编辑、重连和删除。

安装插件或启动 Web Host 不会自动安装内置 MCP。需要时打开面板，点击“内置 MCP”，选择 Exa、Tavily、Firecrawl、Chrome DevTools 或 Playwright 后再确认安装。已存在于当前 profile、其他 bundle 或 Agent preset 的同类配置会显示为“已配置”并跳过，不会被覆盖。前三项默认使用官方免密限额入口；Chrome DevTools 和 Playwright 通过本机 `npx` 启动，需满足相应 Node.js/浏览器要求。

## 升级

```sh
dsh plugin --profile web update dsh-toolbox-ui
```

升级后重启 `dsh web`。

按安装时的规格，行为不同：

| 安装规格 | `update` 的效果 | 怎么跨版本 |
|---|---|---|
| `dsh-toolbox-ui@^1.10.1`（npm，推荐） | 在 `^1.x` 内自动升到最新小版本，不会跨到 2.0.0 | 已是自动；跨大版本显式安装 `@^2` |
| `github:...#v1.4.0`（tag） | 重新解析同一个 tag，**不会动** | 换成新 tag 重新 `add`：`... #<新 tag>` |
| `github:...#<commit>` | 同上，固定在 commit | 用新 commit/tag 重新 `add` |
| `github:...#main`（分支） | 拉取最新 main | 已是自动；但不推荐生产（无 release 门槛） |
| `link:<本地目录>`（开发） | 不适用 | 在 checkout 里 `git pull` 后重启 `dsh web` |

为什么 tag 不会自动跨版本：`dsh plugin` 是 `pnpm` 的薄转发器，`update` 就是「按 package.json 里的 spec 再解析一次」，而 git tag 是不可变规格、没有范围语义（`pnpm update --help`："Updates packages to their latest version **based on the specified range**"）。

面板自带更新提示与一键升级（查 npm registry 上**本包的 latest**，每天最多一次、可关闭、不会自己动；点「升级」才装）。npm 安装的用户也可以用命令行 `update` 升级，两者等价。每个 release 都会同时发布到 npm 与 GitHub Releases，两者版本一致。

## 发布流程（维护者）

npm 与 GitHub Releases 必须**同一次发布里都更新**：用户从 npm 升级，而面板的更新提示问的正是 npm 上本包的 latest。两者版本不一致就会出现「提示说有新版、`update` 却拿不到」。这两件事现在由 `.github/workflows/release.yml` 在推 tag 时自动完成，并且会先校验「tag 与 package.json 版本一致」再跑测试。

### 一次性准备（只需做一次）

1. **首次发布必须本地交互式完成**：npm 要求发布带 2FA 挑战，而包必须先存在才能在包设置里配置 trusted publisher。

   ```sh
   npm login    # 会话 token 有效期 2 小时，发布时会弹 2FA 挑战
   npm publish
   ```

2. 在 npmjs.com 该包的 Settings → **Trusted Publisher** → GitHub Actions，填：organization/user `Imzl-zl`、repository `dsh-toolbox-ui`、workflow filename `release.yml`（可另填 environment）。
   ⚠️ 这里的 repository 是 **GitHub 仓库名**，它必须与仓库当前的 slug 一致——仓库此前叫 `dsh-mcp-manager-ui`，改名之后不同步改这一项，`npm publish` 会被拒（OIDC 凭据里带的就是仓库名）。失败是安全的：CI 那一步会红，不会建 Release。
3. 之后可选但推荐：把包的 Publishing access 设为 **Require two-factor authentication and disallow tokens** —— trusted publishing 不受该限制影响（它用 OIDC，不是 token），而长期写凭据因此彻底用不上。

### 每次发布

```sh
# 1) 改版本：package.json + README/docs 里的版本与 tag 引用 + lib/whats-new.js 的更新条目
#    + .github/release-notes/v<新版本>.md（后面两项缺一项，下面的 npm test 就会红）
npm test

# 2) 真机过一遍（触发条件见下），**必须在打 tag 之前**
dsh web    # 打开面板点一遍

# 3) 提交并推 tag（CI 会校验 tag 与 version 一致，不一致就拒绝发布）
git add -A && git commit -m "..."
git push origin main
git tag -a v1.10.1 -m "dsh-toolbox-ui 1.10.1" && git push origin v1.10.1
```

推 tag 后 CI 依次做：校验版本 → `pnpm install --frozen-lockfile` → `npm test` → `npm publish`（trusted publishing，无需 token）→ `gh release create`。

**第 2 步的真机检查什么时候必须做**：客户端那一半是替身测试——组件在 node 里渲染不起来（见[设计与限制](design.md#版本范围怎么定以及它管不到什么)），所以 CI 全绿也证明不了面板能显示。因此**只要本次改动碰了 `lib/client.js`、或推进了 DSH 基线，就必须做**：起 `dsh web`，确认侧栏入口能打开面板、悬浮按钮在位，然后导入 / 预览 / 启停各点一次。

为什么不能交给 CI：这类失败的表现是**面板白屏**，不会让任何用例变红（注册契约是好的，渲染不出来而已）。宿主改 slot 就是这种改动的典型——`0.1.6-alpha.2` 的发布说明里有「客户端 Session 会话支持多实例共存，相关 API 及 slot 有变化」，2026-09-24 推进基线到 `0.1.7-rc.1`、09-28 推进到 `0.1.7-rc.2` 时也属于这一类，所以它固定成检查单而不是靠记得。纯 Host 侧改动（`lib/index.js`、`lib/workspace-*.js` 等）可以跳过这一步。

**Release notes 是必写的**，稿子放 `.github/release-notes/vX.Y.Z.md`（**不要**放 `docs/`，docs 会随包发布到 npm）；有稿子就用它，没有才退回 `--generate-notes`。为什么必写：本仓库全部直接提交到 main、没有 PR，自动生成几乎生成不出内容（v1.3.0 及之前每个 Release 页面都只有一行 compare 链接），而面板的更新提示正是把用户指到那一页。`test/package-contract.test.mjs` 会拦下「bump 了版本却没写稿」，所以在打 tag 之前本地就会红。

**应用内的「更新到 vX」提示是另一件事**：它的内容真源是 `lib/whats-new.js`（随包发布，宿主的 `whatsNew` RPC 直接转发它），发布前必须给它写上当前版本那一条——`test/whats-new.test.mjs` 会拦下「bump 了版本却没写更新内容」。只写一条就够，不必和 GitHub Release notes 逐字一致。

### 不用 CI 的手动路径（备选）

`npm publish` 不会跑构建（包内已含 `lib/`，也没有 `prepare`/`prepublishOnly`），发布的就是提交里的文件；因此**先提交、再发布**，否则 npm 上的包会与 tag 内容不一致。发布前用 `npm pack --dry-run` 核对内容与体积。

```sh
npm publish          # 会弹 2FA 挑战；若用 bypass-2FA 的 granular token 则非交互
gh release create v1.10.1 --title "dsh-toolbox-ui v1.10.1" --notes-file <notes>
```

`npm login` 的会话 token 只有 2 小时，超时需要重新登录；classic token 已被 npm 永久吊销，能非交互发布的只剩勾了 **Bypass 2FA** 的 granular access token——但它正在被 npm 收窄（已不能做账号/包管理类操作，且 2027-01 起将失去直接发布能力），所以长期方案是上面的 trusted publishing。

## 卸载

```sh
dsh plugin --profile web remove dsh-toolbox-ui
```

卸载插件不会自动删除当前 profile 中已有的 `@deepseek-ai/dsh-mcp-client` 条目。

## 本地开发安装

本地开发才使用目录安装：

```sh
cd C:\path\to\dsh-toolbox-ui
pnpm install
dsh plugin --profile web add C:\path\to\dsh-toolbox-ui
```

修改 Host 代码后需要重启 `dsh web`；浏览器 bundle 是否热更新取决于当前 DSH 的 client HMR 状态。

## 常见问题

### `Remote package ... is already registered`

插件被重复装配。确认 bundle、profile patch、Agent preset 和额外 `--patch` 中只有一个 `mcp-manager-ui` 条目。

### `file access denied under workspace-write mode`

旧版本错误地通过会话文件系统写 profile。当前版本使用固定目标的 Host 原子写入，不需要切换到 `danger-full-access`。升级插件并重启 Web Host。

### 面板能看见但修改后立即恢复

先查看页面上的错误提示，再确认 profile 文件没有被其他进程同时编辑。插件使用内容版本检查，检测到外部修改时会拒绝覆盖。

### 项目 MCP 显示「挂载失败」或「作用域故障」

两者不是同一类故障，面板顶部的横幅和行上的标记会告诉你是哪一类：

- **挂载失败**：本插件在**会话挂载阶段**（`agent/created` 串行监听器）就没挂上（`${VAR}` 求值为空、`failOnStartupError: true` 下启动失败、工具注册被拒等）。点开那一行的详情看具体原因。
- **作用域故障**：连接本身是好的，但工具不在共享作用域层（落到了全局层）。原因是 `@deepseek-ai/dsh-scope` 在宿主与插件之间解析成了两份模块实例（作用域标签是模块内的 Symbol）。先核对两点：
  1. profile 的 `pnpm-workspace.yaml` 是否仍是官方写入的形状——它必须带 **`autoInstallPeers: false`**，否则 pnpm 会把 9 个 `@deepseek-ai/dsh-*` peer 装进 profile 自己的 `node_modules`，插件就会解析到第二份宿主包（这正是官方注释写明要避免的事）。
  2. 安装的依赖树里是否只有一份 `@deepseek-ai/dsh-scope`。
  修好后重启 `dsh web` 即可恢复。

同一项目的多个会话不会因并发而撞 `serverName`：项目 MCP 按 `(项目, serverName)` 共用一份连接（0.1.5 起 `mcp-client` 按注册作用域判重），所以这个错误不会因「同项目开了两个会话」而出现。
