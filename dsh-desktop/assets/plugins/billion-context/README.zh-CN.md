# billion-context

<p align="center"><a href="./README.md">English</a> | <a href="./README.zh-CN.md">中文</a></p>

<p align="center"><strong>上下文压缩插件</strong> — <em>billion-context is all you need。</em></p>

<p align="center"><sub>小窗口（100k 上下文足矣）· <em>省 5 倍 token</em> · 超长会话（十亿级别单会话）· 高压缩质量</sub></p>

<p align="center">
<a href="https://www.npmjs.com/package/billion-context"><img src="https://img.shields.io/npm/v/billion-context.svg?style=flat-square" alt="npm"></a>
<a href="https://github.com/ranxianglei/billion-context/blob/master/LICENSE"><img src="https://img.shields.io/npm/l/billion-context.svg?style=flat-square" alt="license"></a>
<a href="https://github.com/ranxianglei/billion-context"><img src="https://img.shields.io/badge/GitHub-ranxianglei%2Fbillion--context-181717?style=flat-square&logo=github" alt="GitHub"></a>
</p>

<p align="center">
<code>npm install -g billion-context --prefix=~/.local</code>
</p>

<p align="center">
<a href="https://claude.com/product/claude-code" title="Claude Code"><img src="https://cdn.simpleicons.org/claude/D97757" height="26" alt="Claude Code"></a>&nbsp;
<a href="https://github.com/openai/codex" title="Codex"><picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/simple-icons/openai.svg?color=white"><img src="https://api.iconify.design/simple-icons/openai.svg" height="26" alt="Codex"></picture></a>&nbsp;
<a href="https://opencode.ai" title="OpenCode"><picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.simpleicons.org/opencode/FFFFFF"><img src="https://cdn.simpleicons.org/opencode/000000" height="26" alt="OpenCode"></picture></a>&nbsp;
<a href="https://pi.dev" title="pi"><picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.simpleicons.org/pi/FFFFFF"><img src="https://cdn.simpleicons.org/pi/000000" height="26" alt="pi"></picture></a>&nbsp;
<a href="https://github.com/google-gemini/gemini-cli" title="Gemini CLI"><img src="https://cdn.simpleicons.org/googlegemini/8E75B2" height="26" alt="Gemini CLI"></a>&nbsp;
<a href="https://www.kimi.com" title="Kimi"><picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.simpleicons.org/kimi/FFFFFF"><img src="https://cdn.simpleicons.org/kimi/000000" height="26" alt="Kimi"></picture></a>&nbsp;
<a href="https://github.com/QwenLM/qwen-code" title="Qwen Code"><img src="https://cdn.simpleicons.org/qwen/6950EF" height="26" alt="Qwen Code"></a>&nbsp;
<a href="https://github.com/github/copilot-cli" title="GitHub Copilot CLI"><picture><source media="(prefers-color-scheme: dark)" srcset="https://cdn.simpleicons.org/githubcopilot/FFFFFF"><img src="https://cdn.simpleicons.org/githubcopilot/000000" height="26" alt="GitHub Copilot CLI"></picture></a>&nbsp;
<a href="https://www.trae.ai" title="TRAE"><img src="https://cdn.simpleicons.org/trae/32F08C" height="26" alt="TRAE"></a>&nbsp;
<a href="https://www.codebuddy.cn" title="CodeBuddy"><img src="https://cdn.simpleicons.org/codebuddy/6C4DFF" height="26" alt="CodeBuddy"></a>&nbsp;
<a href="https://qoder.com" title="Qoder"><img src="https://icons.duckduckgo.com/ip3/qoder.com.ico" height="26" alt="Qoder"></a>&nbsp;
<a href="https://iflow.cn" title="iFlow CLI"><img src="https://img.alicdn.com/imgextra/i4/O1CN01yBfg3x1iNi4YggwIt_!!6000000004401-2-tps-72-72.png" height="26" alt="iFlow CLI"></a>&nbsp;
<a href="https://www.minimax.io" title="MiniMax Code (mcode)"><img src="https://cdn.simpleicons.org/minimax/E73562" height="26" alt="MiniMax Code"></a>&nbsp;
<a href="https://www.deepseek.com" title="deepseek-harness (dsh)"><img src="https://cdn.simpleicons.org/deepseek/5786FE" height="26" alt="deepseek-harness"></a>&nbsp;
<a href="https://ampcode.com" title="Amp"><img src="https://icons.duckduckgo.com/ip3/ampcode.com.ico" height="26" alt="Amp"></a>&nbsp;
<a href="https://charm.land/crush" title="Crush"><img src="https://icons.duckduckgo.com/ip3/charm.land.ico" height="26" alt="Crush"></a>&nbsp;
<a href="https://zed.dev" title="Zed"><img src="https://icons.duckduckgo.com/ip3/zed.dev.ico" height="26" alt="Zed"></a>&nbsp;
<a href="https://aider.chat" title="aider"><img src="https://raw.githubusercontent.com/Aider-AI/aider/main/aider/website/assets/icons/favicon-32x32.png" height="26" alt="aider"></a>&nbsp;
<a href="https://github.com/aaif-goose/goose" title="goose"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/aaif-goose/goose/main/documentation/static/img/logo_dark.png"><img src="https://raw.githubusercontent.com/aaif-goose/goose/main/documentation/static/img/logo_light.png" height="26" alt="goose"></picture></a>&nbsp;
<a href="https://github.com/NousResearch/hermes-agent" title="hermes"><img src="https://raw.githubusercontent.com/NousResearch/hermes-agent/main/apps/bootstrap-installer/src-tauri/icons/128x128.png" height="26" alt="hermes"></a>&nbsp;
<a href="https://z.ai" title="zcode (Z.ai)"><img src="https://z-cdn.chatglm.cn/z-ai/static/logo.svg" height="26" alt="zcode"></a>&nbsp;
<a href="https://omp.sh" title="omp (oh-my-pi, Stencil Labs)"><img src="https://omp.sh/favicon.svg" height="26" alt="omp"></a>&nbsp;
<a href="https://github.com/1jehuang/jcode" title="jcode"><img src="https://github.com/1jehuang.png" height="26" alt="jcode"></a>
</p>

---

> **缓存健康速览：**健康会话的前缀缓存命中率在 **95–97%** 左右——压缩本身代价 ≤2%。持续低于这个数，用 `/acp` 或 `/acp-cache` 查归因（见[常见问题](#常见问题)）；常见原因依次：上游缓存 TTL 到期 · 切换模型 · bili 的 bug（欢迎提报）· 其他/未知。

## 社区

QQ群:
1056132097(已满)
1108730198(已满)
1129868472(未满)

---

## 📄 论文 / 预印本

- **[模型驱动的分层增量压缩:面向长寿命编码 Agent 的免训练多代上下文管理](./paper/模型驱动的分层增量压缩-免训练多代上下文管理.md)**(中文版,v0.2)

> 📝 **论文本身与代码一同以 MIT 许可开源(位于 `paper/` 目录),是代码库的一部分 —— 这是一份活文档,任何人都可以编辑,欢迎提 PR 改进。**

生产规模纵向研究:四个半月、三宿主、174,327 次模型调用、187.6 亿累计输入 token(三宿主合计约 247 亿),204,800-token 窗口零违规,马拉松会话 8,584–12,049 次调用。

### 📊 第三方独立评测基准

- **[1,500 题三大基准横评报告（`LongMemEval-S` · `ContextBench` · `MemoryAgentBench`）](./benchmarks/third-party-1500/README.zh-CN.md)**（[English](./benchmarks/third-party-1500/README.md)）—— 基于 `DeepSeek V4.1 Flash`、`Qwen3-Embedding-8B`、`Qwen3-Reranker-4B` 与 `Pi Agent`，对 `billion-context` (`v0.1.202`)、`full` 全量上下文及 3 条 RAG 管线（`bm25`、`embedding`、`embedding-rerank`）进行全成本归因盲测：**ContextBench 端到端有效 F1 夺得全场第一**（`0.3097`，比 `full` 省钱 `58.3%`）、**LongMemEval-S 领先最强 RAG 达 +16.6%**（`79.20%` vs `62.60%`，比独立会话 `full` 省钱 `71.1%`）、**MemoryAgentBench 1.48M 超长会话实现 100% 存活与 30× 稳态压缩**（`full` 199 题全部爆窗崩溃）。

---

`billion-context` 架在**任意**编程助手与其模型 API 之间,用 [acp-kernel](https://github.com/ranxianglei/acp-kernel) 压缩重写 Anthropic/OpenAI 流。何时压缩、压缩什么 —— <strong>由模型决定</strong>,而非硬截断。

## 为什么

长编程会话会把上下文撑爆。各家 provider 按 token 计费,一旦超过上下文窗口,会话质量下降甚至崩掉。`billion-context` 把已消耗的对话压缩成分层摘要,让你**一个会话连跑数天** —— 海量 token 穿过同一个上下文窗口。

与宿主自带的摘要器不同,这里的压缩**增量、可逆、对前缀缓存友好**:摘要在小范围内写入,可按需解压,缓存前缀保持完整。

## 工作原理

```
编程助手 (Claude Code / Codex / Cursor / Aider ...)
        │  你把助手的 base URL 指向 proxy
        ▼
┌─────────────────┐
│  billion-context│   1. 解析请求(Anthropic 或 OpenAI 格式)
│     proxy       │   2. 对对话运行 acp-kernel 压缩
│                 │   3. 注入 `compress` 工具 + 压缩哲学
│                 │   4. 转发到真实模型 API
│                 │   5. 重写流式响应
└─────────────────┘
        │
        ▼
   真实模型 API (Anthropic / OpenAI / 兼容厂商)
```

### 上下文管理工具

代理向对话注入四个上下文管理工具;模型在上下文增长时自行调用,代理在服务端执行 `compress`,折叠后的范围在历史中保持摘要形态、直到被恢复:

- **`compress`** —— 把一段消息范围折叠成详细摘要。
- **`decompress`** —— 需要精确细节时恢复某个已压缩范围。
- **`search_context`** —— 在压缩摘要与可见消息中做关键词检索。
- **`acp_status`** —— 上下文用量概览 + 哪些区间仍可压缩。

模型会自主使用以上工具自主管控上下文，无需人工干预。

## 该选哪个?

按客户端选:

| 客户端 | 用这个 |
|---|---|
| **pi** | [`billion-context`](https://github.com/ranxianglei/billion-context) —— `bili pi`(启动器)或 `bili plugin install pi`(原生);独立 [`billion-context-pi`](https://github.com/ranxianglei/billion-context-pi) 仍可用 —— 细节见 [CLIENTS.zh-CN.md](CLIENTS.zh-CN.md#pipidev-coding-agent) |
| **opencode**(1.x / 2.x) | [`billion-context`](https://github.com/ranxianglei/billion-context) —— `bili opencode`(启动器)或 `bili plugin install opencode`(原生);独立 [`opencode-acp`](https://github.com/ranxianglei/opencode-acp) 在 1.x 上仍可用 —— 完整指南:[OpenCode](CLIENTS.zh-CN.md#opencode) |
| **omp** | [`billion-context`](https://github.com/ranxianglei/billion-context)，`bili omp`（内置插件）或 `bili plugin install omp`（自拉起原生插件，免启动器） |
| **dsh** | [`billion-context`](https://github.com/ranxianglei/billion-context) —— `bili dsh`(启动器,经 `--patch` 注入完整原生插件)或 `bili plugin install dsh` ≡ `dsh plugin --profile <name> add billion-context`(统一泳道)—— 细节见 [CLIENTS.zh-CN.md](CLIENTS.zh-CN.md) |
| **kimi** | `bili plugin install kimi`(自拉起原生,需 Kimi Code ≥ 2.0.0)或 `bili kimi`(证书 MITM)或 `/bili/` 前缀 —— 细节见 [CLIENTS.zh-CN.md](CLIENTS.zh-CN.md) |
| **hermes** | `bili plugin install hermes`(自拉起原生,Python 插件 #958)或 `bili hermes`(证书 MITM) |
| **zcode**(Z.ai / bigmodel coding plan) | `bili plugin install zcode`(自拉起原生,#1145)或 GUI「设置 → 网络」证书 MITM 或 `/bili/` 前缀 —— 细节见 [CLIENTS.zh-CN.md](CLIENTS.zh-CN.md) |
| **claude** | `bili claude`(启动器)或 `bili plugin install claude`(原生姿态,#964 —— 受管 settings 块 + 会话自管代理;见下方"注意") |
| **codex** | `bili codex`(启动器 —— 全功能零配置姿势)或 `bili plugin install codex`(MCP shell 工具面配套:**先起 bili 再玩** —— shell 不拉代理,也路由不了 codex 本体流量)—— 细节见 [CLIENTS.zh-CN.md](CLIENTS.zh-CN.md#codexopenai-codex-cli) |
| **jcode** | [`billion-context`](https://github.com/ranxianglei/billion-context),`bili jcode`(cert-MITM)或 `/bili/` 前缀 —— 无原生模式(编译型 Rust 二进制、无插件接缝,[#962](https://github.com/ranxianglei/billion-context/issues/962)) |
| **gemini**(Gemini CLI) | `bili gemini`(启动器,`GOOGLE_GEMINI_BASE_URL` `/bili/` 改写)或 `/bili/` 前缀 —— 仅启动器(无环内工具注入接缝,#1043) |
| **iflow**（iFlow CLI） | `bili iflow`（启动器，`IFLOW_BASE_URL` `/bili/` 改写）或 `/bili/` 前缀 |
| **qwen**（Qwen Code） | `bili qwen`（启动器，cert-MITM）或 `/bili/` 前缀 |
| **antigravity**（Antigravity CLI / agy，Google） | `bili antigravity`（启动器，`CLOUD_CODE_URL` 对 `daily-cloudcode-pa.googleapis.com` 的 `/bili/` 改写 —— Antigravity 真实默认上游，#3129）或 `/bili/` 前缀 —— 无插件接缝（闭源 Go language_server；其用户插件面仅可追加、不能拦截模型流，[#2115](https://github.com/ranxianglei/billion-context/issues/2115)）—— 细节见 [CLIENTS.zh-CN.md](CLIENTS.zh-CN.md) |
| **mcode**(MiniMax Code) | [`billion-context`](https://github.com/ranxianglei/billion-context),`bili mcode`(cert-MITM)或 `/bili/` 前缀 —— 无原生模式(纯声明式事件钩子,无模型请求接缝,[#1050](https://github.com/ranxianglei/billion-context/issues/1050)) |
| **aider** | [`billion-context`](https://github.com/ranxianglei/billion-context),`bili aider`(cert-MITM)或 `/bili/` 前缀 —— 无原生模式(仅 shell 命令钩子,无工具注入接缝,[#1048](https://github.com/ranxianglei/billion-context/issues/1048)) |
| **copilot**(GitHub Copilot CLI) | `bili copilot`(启动器,cert-MITM)—— 闭源 Go 二进制、无插件接缝(#1049) |
| **amp**(Amp CLI) | `bili amp`(启动器,cert-MITM)—— 闭源 Go 二进制、无插件接缝(#1049) |
| **kiro**(Kiro CLI,AWS) | `bili kiro`(启动器,cert-MITM)—— Rust 外壳 + Node 代理服务、无插件接缝;模型流量走 `runtime.<region>.kiro.dev` 的 Responses wire,网关差异已内置处理——详见 [CLIENTS.zh-CN.md](CLIENTS.zh-CN.md#kiro-cliaws) |
| **crush**(Charm Crush) | `bili crush`(启动器,cert-MITM)—— 开源 Go 二进制、无插件接缝;内置 provider 域加白,crush.json 自定义 `base_url` 自动发现(#2340) |
| **zed**(Zed 编辑器) | `bili zed`(启动器,cert-MITM)—— 开源 Rust 编辑器、无插件接缝;reqwest 吃 HTTPS_PROXY,CA 走 SSL_CERT_FILE(Linux TLS env 探测);内置 provider 域加白,settings.json 自定义 `api_url` 自动发现;环回 provider(ollama/lmstudio)经 NO_PROXY 保持直连(#2340) |
| **goose**(Goose CLI) | `bili goose`(启动器)—— rustls 不信任任何 CA 文件,无法 cert-MITM:openai/anthropic 腿经 `OPENAI_HOST`/`ANTHROPIC_HOST`,自定义 provider 经重新生成的 `GOOSE_PATH_ROOT` overlay(#1049) |
| **其余所有**（没有上下文 hook） | [`billion-context`](https://github.com/ranxianglei/billion-context) —— `bili <client>`（启动器，优先）或 `/bili/` 前缀 |

**原生模式 vs 独立扩展。** 宿主原生插件(`bili plugin install …`)与独立进程内扩展(`billion-context-pi`、`opencode-acp`)**互斥** —— 两者同时生效意味着双重压缩。安装器负责切换:替换旧条目(裸名、`npm:` 别名、带版本号、路径形式都认,数组/对象两种形态都处理),原配置快照到 `.bili-bak`;**项目级**安装不会被碰 —— 需手动移除。作为手动安装的运行期安全网,原生入口在加载时同步设置 `BILLION_CONTEXT_NATIVE=<host>`,让独立扩展在动作时自动退出。pi 一侧该标记需要 `billion-context-pi` **0.1.72+**。


## 安装

Linux / macOS —— 指定用户级 prefix 安装(全程不需要 `sudo`，也不改你的 npm 配置，`bili` 自更新不会再遇到权限问题)：

```bash
npm install -g billion-context --prefix=~/.local
```

`bili` 命令装在 `~/.local/bin`——多数发行版默认已在 PATH 中；没有的话把 `export PATH="$HOME/.local/bin:$PATH"` 写进 `~/.bashrc` 或 `~/.zshrc`。用 nvm 或 Homebrew Node 的，默认 prefix 本来就属于当前用户，直接 `npm install -g billion-context` 即可；Windows 的默认 prefix(`%APPDATA%\npm`)同样用户可写，直接 `npm install -g billion-context`。

这会安装 `bili` 命令(`bili-proxy` 保留为别名)。旧装的是 root 属主的 prefix、现在报 `EACCES`?用 `--prefix=~/.local` 重装即可根治(以后用 npm 重装 `bili` 时记得同样带上该参数)——不要用 `sudo`。

想用容器?仓库根目录自带 `Dockerfile`——见下文[在 Docker 中运行](#在-docker-中运行)。

## 快速上手

3种方式 —— 任选其一:

- **原生插件(最原生):** `bili plugin install <client>` —— bili 成为客户端内的插件,照常启动客户端即可.
- **启动器(免安装):** `bili <client>` 一条命令拉起代理 + 客户端,不碰任何真实配置文件.
- **改url(最通用):** 在客户端 baseURL 前面加上代理地址 + `/bili/`。

三种方式背后的机制细节(插件生命周期、runtime-info 协议、注入优先级)见 [TECHNICAL-NOTES.zh-CN.md](TECHNICAL-NOTES.zh-CN.md)。

端口,一句话(#1660):`bili start`(手工)拥有 `8787`;lane 替你拉起的一切(原生 hook、启动器 lane)住在独立的自管端口区,从 `18787` 起 —— 碰撞 +1 跳口、每个 lane 记住自己的漂移,零配置安装永不抢端口,刻意常驻的 `bili start` 守护进程则默认被附着。Attach 按泳道感知(#2905):hook 先骑自己 lane 的实例,绝不骑其他已声明 lane —— 除非在 `native.attachLanePriority` 里显式列出 —— 8787 用户区守护永远是最后兜底。升级重启时若旧版本还在该 lane 端口上排水,会最多等 5 秒让它释放并复用同一端口,而不是漂移(#1723);只有真正被占用的端口才 +1 跳口 —— 且这种跳口现在会大声打 warn。

### 方式 1 —— 原生插件(native,`bili plugin install pi` / `omp` / `opencode` / `dsh` / `kimi` / `hermes` / `zcode`)

代理住进客户端:装一次,之后照常启动客户端 —— 不用启动器命令、不用环境变量、不用固定端口、不用改 URL。目前支持 **pi**、**omp**、**opencode**(1.x 与 2.x)、**dsh**、**kimi**、**hermes** 与 **zcode**:

```bash
bili plugin install pi          # 在 pi 的 settings 里注册 billion-context 条目(bili 自身为 npm 安装时写 npm 条目)
bili plugin install omp         # 在 omp 的 config.yml(~/.omp/agent/config.yml)注册 extensions 条目
bili plugin install opencode    # 在 opencode 真实配置里注册插件 + 关闭原生自动压缩
bili plugin install dsh         # 对每个已存在的 profile 执行 'dsh plugin --profile <name> add billion-context'
bili plugin install kimi        # 写 $KIMI_CODE_HOME/plugins/managed/billion-context/kimi.plugin.json(+ installed.json 记录);每会话路由块在首次启动时落到 config.toml(需 Kimi Code >= 2.0.0)
bili plugin install hermes      # 把 Python 插件拷进 ~/.hermes/plugins/billion-context/(+ 机器自管的 bili.json sidecar),并经 `hermes plugins enable billion-context` 启用
bili plugin install zcode       # 写 hooks.enabled + SessionStart hook + mcp.servers.bili 到 ~/.zcode/cli/config.json;每会话路由块在首次启动时落到 bigmodel provider store
bili plugin remove <client>     # 卸载(dsh 经同一通道移除;配置快照存 .bili-bak)
```

客户端有自己的插件通道时,也可以原生安装、完全不用 bili 命令:

- **dsh:** `dsh plugin --profile <name> add billion-context` 正是 `bili plugin install dsh` 按 profile 驱动的那条命令(仅 npm 形态;git checkout 没有已发布入口 —— 直接填 GitHub 地址装到的是没有 `dist/` 的源码,bundle 永远加载不出来)—— 两种走法终态一致(pnpm 装进 profile、patch 层由 dsh 自己挂载);经同一通道卸载。见下文 dsh 段。
- **opencode:** 把裸 npm 包名直接写进你真实配置的插件列表 —— `"plugin": ["billion-context"]`(仅 npm 形态;git checkout 没有已发布入口)。包通过 `exports["./server"]` → `dist/agent/opencode-native.js` 暴露插件入口,opencode 用自己的 Npm.add 机制加载,插件自拉起的行为与 bili 安装的形态完全一致。另外要做两件 bili 安装器会替你做的事:在同一份配置里设 `"compaction": { "auto": false }`(否则 OpenCode 的原生自动压缩会双重压缩),并先手工备份该配置文件。
- **claude:** 本仓库同时是一个 Claude Code 插件市场 —— `/plugin marketplace add ranxianglei/billion-context`,再 `/plugin install billion-context@billion-context`,然后运行 `/billion-context:bili-setup`(它会替你驱动 `bili plugin install claude` 并提示重启)。终态与 bili 安装器一致;插件自身不携带 hooks 或 MCP 条目,不会双重注册。

pi / omp / kimi / claude 没有客户端侧通道 —— 它们的配置条目由 `bili plugin install <client>` 代写(kimi 的声明式 `kimi.plugin.json` + 注册记录、claude 的受管 settings 块等)。

注意:

- 原生模式与独立进程内扩展(`billion-context-pi`、`opencode-acp`)**互斥** —— 安装器负责换条目并把原配置快照(`.bili-bak`)。
- **pi:** 原生安装默认自带子代理功能(`acp_delegate` / `acp_delegate_wait` / `acp_delegate_cancel`)—— 如何关闭它们并保留上下文压缩:[Pi 内置子代理](#pi-内置子代理)。
- OpenCode 旧会话、V1/V2 插件形态与全部注意事项:[OpenCode](CLIENTS.zh-CN.md#opencode)。
- `kimi` 仅在自举时上报 runtime-info(静态头无法承载逐请求窗口/模型值);子代理工具调用由代理的出站 tool_use 见证环路由(#1685)——模型看不到任何会话 id。
- `hermes` 的原生插件是 Python:健康检查通过后用环境变量把 hermes 的 httpx 栈指向代理,并经 `llm_request` 中间件打逐请求头。
- `claude` 有**原生姿态**(#964):受管 settings 块 + `SessionStart` hook + MCP shell;hook 骑自管端口区(#1660),每会话把受管 URL 重钉到存活 origin,端口漂移自愈。#1821 起 MCP shell 还在会话内守护代理(30s × 3 次失败),代理死亡时自行重生,lane 内模型请求 ~90s 内恢复而无需新开会话(与 zcode 车道同语义)。`BILI_NATIVE_CLAUDE=0` 退出(passthrough)。机制:[TECHNICAL-NOTES.zh-CN.md](TECHNICAL-NOTES.zh-CN.md)。**已知限制(#2290):** Claude Desktop 应用的 Code 标签页(`CLAUDE_CODE_ENTRYPOINT=claude-desktop`)会为其内嵌的 Claude Code 设置自己的 `ANTHROPIC_BASE_URL`,覆盖受管值——桌面会话完全绕过代理,而受管块的 `DISABLE_AUTO_COMPACT=1` 仍然生效,因此既没有 bili 压缩、也没有原生自动压缩。hook 会在会话开始时大声警告并记录下来供 `bili doctor` 展示(检测到本机装有 Claude Desktop 时,该 lane 也会显示 ⚠️ 提示);终端会话不受影响。**真机验证(2026-10-06,#2290):** 把 `HTTPS_PROXY` 写进 settings 的 `env` 块后,在 Claude Desktop 2.19675.1 / 内嵌 CC 2.1.288(Windows 11)上对一台开启 MITM 的存活代理**零 CONNECT 流量**——该变量没有到达应用内任何网络栈,与该时期的 CLI 行为一致——注意新版构建(CC 2.1.301 起)在 CLI 上会遵守 `HTTPS_PROXY`,这正是 `bili claude` 走 `/bili/` base-URL 改写的原因——launcher 不再为该 lane 设置代理、也不再设置 CA,而自带代理的子进程会把 loopback 主机合并进 `NO_PROXY`/`no_proxy`,确保无论子进程的代理行为如何,这一腿都保持直连(#3446)。截至该版本,桌面 Code 标签页不存在可用的路由缝隙;该 lane 继续在 [#2290](https://github.com/ranxianglei/billion-context/issues/2290) 跟踪,若上游行为变化再议。仅用桌面的用户可用 `bili plugin remove claude` 恢复原生自动压缩。#5095 起受管块还会安装一个 `SubagentStart` hook(`node <root>/dist/claude-subagent-hook.js`),给每次子代理派发铸一个随机 lane token 注入其上下文:骑着父会话 id 且无 agent-id 头的子代理(VS Code 扩展构建,#4352)按 `<id>|sub:…:t:<token>` 键控各自的压缩车道,并行同型派发不再合流(首条消息被折叠后 token 消失,后续请求回落到指纹车道)。卸载时随受管块一并移除。
- `zcode` 有**原生姿态**(#1145):受管 `~/.zcode/cli/config.json` 块 + 每会话 provider `baseURL` 改写。完整机制:[CLIENTS.zh-CN.md](CLIENTS.zh-CN.md)。
- `omp` 是自拉起原生插件;`codex` 性质不同 —— 它是 MCP shell 工具面配套:codex 的模型流量只能经 env 路由(默认 ChatGPT-登录 provider 没有可改写的配置缝 —— managed `model_providers` 块会强制 API-key 认证、废掉订阅登录),而 MCP 子进程无法向父进程注入 env,所以插件安装既不拉代理、也永远路由不了 codex 本体流量。`bili plugin install codex` 在 `~/.codex/config.toml` 写入 `[mcp_servers.bili]`(command = node,args = dist/mcp.js)注册四个 ACP 工具,会话启动时解析代理:env `BILI_MCP_PROXY` > 活实例登记(任一 lane 的代理或 `bili start` 守护)> 8787 用户区默认(#1660 去掉了安装时烘焙 origin,#403)—— 全不可达则 `tools/list` 报 -32003。结论:**先起 bili**(`bili start` 或任一客户端的 lane 代理),想要压缩再自行导出 HTTPS_PROXY;零配置全功能用 `bili codex`。机制:[CLIENTS.zh-CN.md](CLIENTS.zh-CN.md#codexopenai-codex-cli)。
- `jcode`、`aider` 无原生模式(无插件/MCP/工具注入接缝:#962、#1048)—— 用 `bili jcode` / `bili aider`。
- `copilot`、`amp`、`crush`、`zed`、`goose` 仅启动器模式(#1049/#2340);goose 无法 cert-MITM(rustls 不信任任何 CA 文件),改走纯 HTTP base-URL 重定向。

### 方式 2 —— 启动器(`bili pi` / `bili codex` / `bili claude` / `bili omp` / `bili opencode` / `bili hermes` / `bili dsh` / `bili codebuddy` / `bili qoder` / `bili trae` / `bili jcode` / `bili kimi` / `bili gemini` / `bili iflow` / `bili qwen` / `bili antigravity` / `bili mcode` / `bili aider` / `bili copilot` / `bili amp` / `bili crush` / `bili zed` / `bili goose` / `bili kiro`)

启动器把客户端包进一条命令:在独立端口拉起一个代理(总是全新实例,绝不复用端口),再按客户端支持的机制把它指向代理 —— 能吃代理/CA 环境变量的走**证书 MITM**,不吃的走隔离的**`/bili/` 配置重写**。真实配置文件从不被修改;客户端自己的配置只被**读取**,用来发现它实际连接的 HTTPS 上游主机,把这些主机加入 MITM 白名单 —— 代理只 TLS 终结它们,其余流量盲透传。

```bash
bili pi                               # 拉起 pi,走代理 —— file-free(#535):环境变量 + 扩展 registerProvider,真实 ~/.pi 不动
bili codex                            # 拉起 codex
bili claude                           # 拉起 claude
bili omp                              # pi 同款,file-free(#535):环境变量 + 扩展 registerProvider + 压缩取消,真实 ~/.omp 不动
bili opencode                         # OpenCode(1.x 与 2.x):完整指南见下文 [OpenCode](CLIENTS.zh-CN.md#opencode) 一节
bili hermes                           # file-free(#535):hermes 代理环境变量(HTTPS_PROXY + SSL_CERT_FILE 组合 CA bundle)—— https 走 CONNECT MITM,http 走绝对形式转发;真实 ~/.hermes 不动
bili dsh                              # deepseek-harness:经 --patch 注入完整原生插件(#941) —— 真实 dsh 工具、会话绑定 /acp(plugin 模式);非回环上游走代理 env,回环保留 overlay DSH_HOME 改写(#535);dsh 自动压缩处处关闭(宿主平面经 bundle patch,web profile 的 preset 经 #3354 加载期 overlay,#1772/#2474/#3354)
bili codebuddy                        # Tencent CodeBuddy Code CLI:CODEBUDDY_BASE_URL /bili/ 重写(OpenAI chat completions wire),预算对齐走 CODEBUDDY_AUTO_COMPACT_WINDOW;真实 ~/.codebuddy 不动
bili qoder                            # qoder CLI(`qoder`/`qodercli`):模型端点硬编码 https(无法 /bili/ 改写)—— 证书 MITM(HTTPS_PROXY + NODE_EXTRA_CA_CERTS),默认模型主机已加白名单(#653)。Qoder Desktop 是另一条 BYOK/自定义渠道,走 `/bili/` 前缀的明文 OpenAI wire —— 当作普通自定义 provider 指向 bili 即可(不走这条 MITM 车道);其官方订阅流量是加密的,不在范围内(#764)
bili trae                             # Trae CLI(字节跳动,闭源 Go 二进制,无 base-URL 覆盖)—— 证书 MITM(HTTPS_PROXY + SSL_CERT_FILE),模型主机取 TRAE_CLI_API_HOST 或默认企业网关(#655)
bili jcode                            # jcode(Rust 终端编码 agent)—— 环境变量式证书 MITM 启动:HTTPS_PROXY + SSL_CERT_FILE,模型主机 api.z.ai 默认加白,本地回环 provider 走 NO_PROXY 直连
bili kimi                             # Kimi Code CLI(Moonshot):除无条件回环绕过外遵循标准代理环境变量 —— https 证书 MITM、http 绝对形式转发;回环端点编目并附手动 /bili/ 提示(#757)
bili gemini                           # Gemini CLI(Google):GOOGLE_GEMINI_BASE_URL /bili/ 改写到 generativelanguage.googleapis.com(Google 原生 wire),真实 ~/.gemini 零改动
bili iflow                            # iFlow CLI:IFLOW_BASE_URL /bili/ 改写到 apis.iflow.cn/v1(OpenAI chat-completions wire),真实 ~/.iflow 零改动
bili qwen                             # Qwen Code(多协议 gemini-cli fork,无 base-URL 钩子):HTTPS_PROXY + NODE_EXTRA_CA_CERTS 证书 MITM,默认 DashScope/Qwen 模型主机加白,自建中转用 --mitm-domain 追加
bili antigravity                      # Google Antigravity CLI(agy,Gemini CLI 继任者):CLOUD_CODE_URL 对 daily-cloudcode-pa.googleapis.com 的 /bili/ 改写 —— 真实默认上游(裸 cloudcode-pa 在 /v1internal:* 上 400,#3129),无需证书 MITM(#2115)
bili mcode                            # MiniMax Code CLI:与 kimi 同构(代理环境变量、无条件回环绕过、证书 MITM/绝对形式);会话经 X-Mavis-Session-Id 绑定(#1050)
bili aider                            # Aider(Python pair programmer):HTTPS_PROXY + SSL_CERT_FILE/REQUESTS_CA_BUNDLE 证书 MITM;端点取自 OPENAI_API_BASE / ANTHROPIC_BASE_URL / --openai-api-base / .aider.conf.yml(#1048)
bili copilot                          # Copilot CLI(GitHub,闭源 Go 二进制)—— 证书 MITM(HTTPS_PROXY + SSL_CERT_FILE),api.githubcopilot.com + 各套餐子域加白(#1049)
bili amp                              # Amp CLI(Sourcegraph,闭源 Go 二进制)—— 证书 MITM(HTTPS_PROXY + SSL_CERT_FILE),ampcode.com 加白(#1049)
bili crush                            # Crush(Charm,开源 Go 二进制)—— 证书 MITM(HTTPS_PROXY + SSL_CERT_FILE),api.anthropic.com/api.openai.com/openrouter.ai + crush.json 自定义 base_url 加白(#2340)
bili zed                              # Zed 编辑器(开源 Rust)—— 证书 MITM(HTTPS_PROXY + SSL_CERT_FILE,Linux TLS env 探测),内置 provider 域 + settings.json 自定义 api_url 加白,环回 provider 保持直连(#2340)
bili goose                            # Goose(Block,Rust/reqwest):rustls 发布构建不信任任何 CA 文件 —— openai/anthropic 腿经 OPENAI_HOST/ANTHROPIC_HOST,自定义 provider 经重新生成的 GOOSE_PATH_ROOT overlay(/bili/ 改写,真实配置不动)(#1049)
bili kiro                             # Kiro CLI(AWS):经 HTTPS_PROXY + SSL_CERT_FILE 与 NODE_EXTRA_CA_CERTS 上的合并 CA 做 cert-MITM;只解密 runtime.<region>.kiro.dev;developer/system 项为网关改写为 user;会话 = Kiro 的 conversation id(--resume 后保持)
bili pi --mitm-domain api.foo.com     # 向 MITM 白名单追加域名
```


### 方式 3 —— 改url(`/bili/` 前缀)

启动代理:

```bash
bili
```

然后把客户端现有的 baseURL 前面加上 `http://localhost:8787/bili/` 就行。完整上游 URL 嵌在路径里,proxy 无需任何配置就知道转发到哪:

```
客户端 baseURL 之前:  https://api.openai.com/v1
客户端 baseURL 之后:  http://localhost:8787/bili/https://api.openai.com/v1
```

更多客户端配置参考网页引导: [http://localhost:8787](http://localhost:8787) .

**验证。** 代理跑着、配置保存了之后,确认它能应答,并且第一个真实请求在日志里显示压缩活动:

```bash
# 健康检查(代理是否在跑 + 转发到哪)
curl -s http://localhost:8787/__bili/health
# → {"ok":true,"upstream":"https://api.anthropic.com"}

# 实时会话统计(发过真实请求后)
curl -s http://localhost:8787/__bili/stats
```

然后从助手发一条消息,观察日志(`~/.local/state/billion-context/bili.log`,同时也打到 stderr)。每个请求应该看到一行 `processTurn`,等对话变长后会出现 `[acp-usage] round N input=X cached=Y (cache hit Z%)` + `compress` 事件。

### 客户端深入

一行带不过来的细节 —— 各模式(启动器 / `/bili/` URL 前缀 / 原生插件)如何把流量接进代理、往哪儿写了什么、已知局限有哪些 —— 都在 **[CLIENTS.zh-CN.md](CLIENTS.zh-CN.md)**:dsh · Kimi Code · Hermes · ZCode · Gemini 系(Gemini CLI / iFlow CLI / Qwen Code / Antigravity)· CONNECT 盲隧道接入但从不压缩的客户端(#897)· 未识别端点直连(#1290)· OpenCode(启动器 / 原生 / 纯代理、`/acp` 状态与规则、旧 opencode-acp 会话 #920)。

## 从源码安装(开发)

> **风险**:`master` 是开发分支,随时可能处于不可用状态——未发布的改动、跑不过的构建、未验证的修复都可能出现。除非你要改代码、或验证一个还没发布的修复,否则请用上面的 npm 方式装发布版。

```bash
git clone https://github.com/ranxianglei/billion-context.git
cd billion-context
npm ci
npm run build
npm link
bili --version
```

`npm link` 之后,在任何目录都能直接用 `bili`。

## 常见问题

**怎么查缓存命中率？** 不用翻日志——`/acp-cache` 直接在客户端里打一份**文字总结报告**，顶部带一个可点击的 **Web UI 链接**，点进去是网页版会话页（**折线图 + 逐断点归因**）：

![网页会话页：缓存命中率折线图 + 归因（中文界面）](docs/cache-web-session.zh-CN.png)
报告四块，一眼定位：**GRAND LEDGER**（总账：总输入/总命中/hit%，直接给出 `HEALTHY` 或异常判定；miss 拆解为 new content 新增内容 / compress re-pay 压缩重付 / upstream-ttl-or-client-rewrite 上游 TTL 或客户端重写）· **FOLD ECONOMICS**（每次折叠的经济账：净省多少、是否回本）· **LINE ITEMS**（只列异常行：hit<85% 或 miss≥5000）。经验值：**压缩本身只吃掉 ≤2%**，健康会话稳在 **95–97%**；低于这个值时，归因按概率排序：①上游缓存 TTL 到期（报告里表现为 stable-prefix miss，top spikes 会点出闲置时长）②切换了模型 ③bili 的 bug（带报告页提 issue）④其他/未知。`/acp-cache [full]` 列每一折每一行；HTTP 同款：`GET /__bili/cache-report`；每个请求的 `[acp-usage]` 行仍会落日志，供深挖。

**`/acp` 显示什么?** 带原生插件的客户端(opencode、dsh)里,`/acp` 直接从代理取当前会话的 ACP 状态面板(会话、块、可压缩区间、用量);首个模型请求到来前显示空闲提示。`/acp-cache [full]` 打印上面的缓存报告。

**能用网页查会话和配置吗?** 能 —— 打开 [http://localhost:8787](http://localhost:8787):总览仪表盘、会话列表(含逐会话详情)、实时日志、配置编辑器、上游连通性测试。「博客」页还在面板内直接渲染发布笔记与长文——随装内置,在线时后台自动从 GitHub master 拉取新文章(约 1 小时节流,离线时回退到内置旧内容),完整文库也在 GitHub Pages。其余功能同样以纯 JSON 提供(`/__bili/stats`、`/__bili/sessions`、`/__bili/config`、…),方便脚本化。

**压缩什么时候发生?** 由模型驱动:注入的上下文工具由模型在上下文增长时自行调用,温和的增长 nudge(按设计固定约 50K token 步长,可用 `compress.nudgeGrowthTokens` 调整)沿途提醒它,仅输入就超窗时预检作为硬兜底触发(#470)。用 `/acp` 或网页界面实时观察。

**压缩会缩小客户端自己的对话文件吗?** 不会 —— 这是超长会话里最常见的意外(#5796)。压缩缩的是**发给模型的内容**:每个出站请求都由存活块加摘要重建,所以对话再长、线上体积也保持小。客户端自己存的对话历史是用户数据 —— bili 从不改写它。dsh 上宿主自带的自动压缩在 bili 激活时还会被一并关闭(两个压缩器不能抢同一份历史,#1772/#2474/#3354),因此宿主侧文件随每一轮增长:文件越大每轮越慢(实测约 3 万条消息时每轮几十秒,#5796),实际可行的收敛路径就是**重开一个新会话**。网页会话列表会对请求数达到 5000+ 的会话打上「长会话/slow」徽标作为提醒。

**为什么第一次压缩要到 ~200k 才触发?** 压缩触发不是按绝对窗口位置、而是按增长区间:默认在开机内容之上增长 50k token 才触发第一次软压缩(`compress.nudgeGrowthTokens` 恒定步长、与窗口无关)。开机 100k 左右、或把 `compress.nudgeGrowthTokens` 设到 100k 左右时,可能都要到 ~200k 才发生第一次压缩。想更早压缩省 token:1.删减系统提示词、关闭不需要的工具、精简 skill;2.把 nudge 调小到 50k 左右;3.开启 lean 功能。完整算例见 [CONFIGURATION.zh-CN.md](CONFIGURATION.zh-CN.md#为什么第一次压缩要到-200k-才触发)。

**bili 是透明的吗?怎么关掉?** 未识别端点原样转发([CLIENTS.zh-CN.md](CLIENTS.zh-CN.md)),且每种模式都能干净退出:原生安装用 `bili plugin remove <client>`,另两种模式停掉启动器命令 / 环境变量 / `/bili/` 前缀即可 —— 流量立刻恢复直连。

**能配合模型路由网关(如 [magpie](https://github.com/yetone/magpie))用吗?** 能 —— 客户端指向 bili、bili 经 `/bili/` 前缀指向网关(前缀内嵌网关的绝对 URL):`http://localhost:8787/bili/http://127.0.0.1:3425…`。例:Claude Code → `ANTHROPIC_BASE_URL=http://localhost:8787/bili/http://127.0.0.1:3425` + `ANTHROPIC_API_KEY=magpie`;OpenAI 系客户端 → `OPENAI_BASE_URL=http://localhost:8787/bili/http://127.0.0.1:3425/v1`(+ `OPENAI_API_KEY=magpie`)。压缩发生在路由*之前*——到达网关节点里任何账号的请求都已是压缩后的。凭据留在网关内:客户端的假 key 原样穿过,真实 key 不接触 bili。注意:① 会话中途切换账号会使 provider 前缀缓存失效——多账号路由的固有代价,与 bili 无关(见 `/acp-cache` 的 KEY SWITCHES 段);② 路由后的模型名对 bili 的窗口查询不透明——需在 providers 键 `http://127.0.0.1:3425` 下用 `models.<name>.context` 声明其上下文窗口,否则按兜底窗口运行(route-miss 警告,#2317);③ 中继若拒绝 bili Anthropic 车道的 `cache_control` 标记,设 `compat.noCacheControl`;④ 回环网关开箱即用;网关在非回环私网地址时可能还需 `network.allowPrivateHttpProviders`(#2984);⑤ Claude Code 原生插件模式(`bili plugin install claude`)下,可在安装前设 `BILI_CLAUDE_UPSTREAM=http://127.0.0.1:3425`,受管配置块会自动将其包裹为代理 URL(或直接配置 `ANTHROPIC_BASE_URL=http://127.0.0.1:8787/bili/http://127.0.0.1:3425`;`localhost` 与 `127.0.0.1` 均被正确识别,#5369)。三条线(OpenAI Chat / Responses / Anthropic Messages,含跨协议转换)已端到端实测,#4433。

**日志和会话数据存在哪?** 日志:`~/.local/state/billion-context/bili.log`(同时镜像到 stderr);会话状态:`~/.local/share/billion-context/`(XDG 可覆盖;Windows 杀软排除 #362、可选清理 #1082)—— 完整路径见 [CONFIGURATION.zh-CN.md](CONFIGURATION.zh-CN.md)。

## 运行代理

### 在 Docker 中运行

仓库根目录自带 `Dockerfile`——构建期从 npm 装已发布的包(被测试过的产物;镜像里不编译任何东西),把代理作为服务跑起来:

```bash
docker build -t billion-context .
docker run -d --name bili -p 8787:8787 \
  -v bili-config:/root/.config/billion-context \
  -v bili-data:/root/.local/share/billion-context \
  -v bili-cache:/root/.cache/billion-context \
  -v bili-state:/root/.local/state/billion-context \
  billion-context
```

然后把客户端 baseURL 指到 `http://<host>:8787/bili/…`,和上面方式 3 完全一样。

- **基础镜像:** `node:24-slim` —— 直接用内置 `node:sqlite` 存储引擎(不发生 native addon 下载)。不要换成 Node 20 基础镜像:自举下载的 SQLite 引擎要求 Node ≥ 22,在 20 上会崩(#3341)。
- **更新:** 容器内自更新**默认关闭**(`ACP_AUTO_UPDATE=0`)——容器化副本的合法升级通道是重建/pull 新镜像;原地自更新会在下次重建时被静默回退到镜像版本。想开回来用 `-e ACP_AUTO_UPDATE=1`;构建期钉版本用 `--build-arg BILI_VERSION=0.1.197`(默认 `latest`)。
- **数据:** 四个挂载目录分别存放配置、会话状态、更新节流/锁 + 缓存的 SQLite 引擎、日志。挂 volume 或 bind mount 让它们跨容器替换存活;镜像也把这四个目录声明为 `VOLUME`,裸 `docker run` 也不会把它们落进容器层。
- **安全:** 容器监听 `0.0.0.0:8787` 以便外部客户端接入——**没有认证**,端口只应暴露给可信网络(与下面 `--host 0.0.0.0` 的注意事项相同)。Web UI 和 `/__bili/*` JSON 端点经映射端口照常可用。
- **健康检查:** 镜像自带 `HEALTHCHECK`,用 node 内置 fetch 探 8787 上的 `/__bili/health`(slim 基础无需 curl);若覆盖监听端口,注意探针仍钉在 8787。

### 命令行参数

```bash
bili --port 9000              # 改监听端口
bili --host 0.0.0.0           # 监听所有网卡(见下面的 host 说明)
bili --debug                 # 详细日志(也可在配置里设 "debug": true)
bili --passthrough           # 不压缩直接转发(冒烟测试模式)
bili --config ~/my-bili.json # 用别的配置文件
bili update                  # 立即检查并安装新版本(跳过节流)
bili doctor --fix            # 把漂移的 dsh profile 三本账(manifest 声明 / lockfile 记录 / 盘上副本)收敛到盘上版本(#3496)
bili --no-auto-update        # 本次启动禁用自动更新
```

参数优先级高于环境变量和配置文件。`bili --help` 列出全部。

### 远程 agent（`--host`）

默认绑定 `127.0.0.1`,只接受本机连接。要给其他机器上的 agent 用:`bili --host 0.0.0.0`(或局域网 IP);远程 agent 把模型 `baseURL` 指向 `http://<本机>:<端口>/bili/…`。

- MITM 模式的 `CONNECT` 也会接受远程客户端 —— 但仅限**白名单内的模型域名**;到任意主机的盲隧道仍仅限本机,代理不会沦为开放中继。
- `/bili/<绝对URL>` 目的地准入(#409):代理自身与 link-local/metadata 地址一律拒绝;loopback/私网目的地对本地客户端放行(自托管上游)、对远程客户端拒绝,除非列入 `BILI_TUNNEL_ALLOWED_HOSTS`(`host` 或 `host:port`,逗号分隔)。一个例外(#1073):**本地**客户端经**loopback IP 字面量**目的地转发管理路径(`/__bili/*`、`/__acp/*`)时不带标记放行;远程 peer 与主机名目的地无条件保留内部隧道标记,管理路径即使经 NAT hairpin 也无法穿过隧道。指向本实例自身管理端点的绝对形式请求会在本地直接应答、而不是经隧道转发(正向代理式健康探测能拿到真实响应)。
- **没有任何鉴权**:只应在可信局域网或防火墙内使用。`/__bili/` 管理端点仍仅限本机访问。启动时的 `[security]` 警告会提醒上述事项。


### 调试

`bili --debug`(或环境变量 `ACP_DEBUG=1`,或配置里 `"debug": true` —— 优先级:参数 > 环境变量 > 配置)会打印每次 `processTurn`(标签计数、token 用量)、nudge 决策(growth/usage/pendingT1/shouldInject)、客户端 headers 和 SSE 重写。

### 日志文件

所有日志**默认同时写入文件**:`~/.local/state/billion-context/bili.log`(XDG state 目录),同时仍打印到 stderr。覆盖用配置的 `"logFile"` 或 `ACP_LOG_FILE`(`off` 关闭文件)。超过 10 MB 自动轮转(`bili.log.old`)。每个请求的缓存命中统计以 `[acp-usage] round N input=X cached=Y (cache hit Z%)` 打印,可直接从日志衡量前缀缓存健康度。

### 连接生命周期调优（#1982）

客户端侧连接在最终响应结束后优雅关闭:代理主动发起关闭(`Connection: close`)时,最多等待 `BILI_POST_RESPONSE_LINGER_MS`(默认 `5000`)毫秒的对端关闭信号才释放套接字,池化客户端因此看到的是干净的 EOF,而非字节竞态可能产生的 RST。相关旋钮:`BILI_KEEP_ALIVE_TIMEOUT_MS`(空闲回收预算,默认 `5000`)与 `BILI_CLIENT_ERROR_BACKSTOP_MS`(错误排空路径终局兜底,默认 `30000`)——完整语义见 [CONFIGURATION.zh-CN.md](CONFIGURATION.zh-CN.md)。

### 自动更新

代理启动时和每 3 分钟检查 npm 是否有新版本。发现新版本就原位安装并打印通知 —— **重启 `bili` 才能生效**,除非启用可选自重启(`--auto-restart-on-update` 参数 / `ACP_AUTO_RESTART_ON_UPDATE=1` 环境变量 / 配置 `"autoRestartOnUpdate": true`,默认关闭):零在途请求时校验新安装、停止接收连接、排空、在同一端口拉起替代进程并在其开始接受连接后退出(客户端自动重连;会话状态在磁盘上保留)。安全门:排空窗口全程零在途、re-exec 前安装完整性检查、10 分钟冷却标记防止版本抖动循环重启;任何失败恢复原监听器并回落到普通提醒。运行进程落后于磁盘安装("stale")时,Web UI 显示横幅,`GET /__bili/status` 返回 `{version, diskVersion, stale, autoRestartOnUpdate, advisory, updatePolicy, inFlight}` 供脚本使用(`advisory` 为生效中的严重缺陷公告或 `null`,见下节;`updatePolicy` 上报 #3619 撒点状态——策略来源、`hold`/`pinned`/`blocked`、以及待执行的撒点升级及其到点时刻)。永久禁用:配置(`"autoUpdate": false`)或环境变量(`ACP_AUTO_UPDATE=0`)。

**升级撒点(#3619):** 发现新版本后,自动更新不再立即应用。每台实例在延迟窗口内随机抽取**一个**时刻(内置默认 **15 分钟 – 48 小时**),到点再升;抽中的时刻落盘持久化,重启不重摇。全量升级因此摊开在整个窗口内,而不是发版后十几分钟内全体升完,给坏发版留出中途拦截的响应窗(#3401/#3600/#3394)。窗口与紧急控制放在一个公开的策略文件里(本仓库的 `auto-update-policy.json`,匿名 GET + ETag 缓存):`hold` 全局冻结自动升级、`blocked` 跳过指定版本、`pinned` 设置升级天花板。按设计 fail-open——文件不可达或格式非法时直接回退本地默认;而且它只能调节奏/跳过/钉住,**永远控制不了装什么**。本机退出方式:手动 `bili update` 绕过 `hold`/撒点(但仍遵守 `blocked`/`pinned`)、`"staggerMinDelayMs": 0` + `"staggerMaxDelayMs": 0`(或 `BILI_UPDATE_STAGGER_MIN_MS`/`BILI_UPDATE_STAGGER_MAX_MS`)恢复旧版立即升级、`ACP_AUTO_UPDATE=0` 完全停用自动更新。完整格式与语义见 [CONFIGURATION.zh-CN.md → `update`](CONFIGURATION.zh-CN.md#update)。

**插件模式**(`bili opencode` / `bili pi` / `bili dsh` —— 代理内嵌在长驻宿主里运行时),"重启 bili"指的是重启**宿主**:内嵌进程无法自行退出,所以一直开着的宿主会持续运行它启动时的那份代码,默默地错过自动更新报告为"已安装"的每一处修复(#1603)。启用 `--auto-restart-on-update` 可让它在安全点自重启;或运行 `/acp`(当前仅 OpenCode 宿主,pi/dsh 覆盖见 #2084)—— 当磁盘安装领先于运行进程时,状态面板会追加一行过期警告(运行版本 vs 已安装版本)。若注入代码在运行期损坏(如 agent scope 被销毁),模型流量会静默直连(不压缩),直到宿主重启;自 #3581 起该状态可见:无会话运行时插件上报归属闸门降级,Web UI 显示「接管已失效」横幅,`GET /__bili/status` / `/__bili/overview` 暴露每代理的 `attribution` 状态。**按设计无归属**的后台车道(如 dsh 标题生成 sidecar)本身不携带 initiator,其小体量一次性请求按定义直连——按 #3651 契约这类正常拦截**永不报告**,因此永远不会触发横幅。横幅只在归属查询本身抛错(宿主内部错误,如 agent scope 被销毁)时出现,并给出可诊断信息:抛出的错误文本、脱敏后的端点、起始时间、已直连的请求数、解决方法(重启宿主进程),以及复制/提交诊断按钮(预填 GitHub issue)。

**自 v0.1.183 起,更新提示默认静默(#1977):**routine/recommended 版本不再在 `/acp` 面板脚注或 `acp_status` 中渲染更新行 —— 只有 `critical` 级别的版本会在那里显示(`CRITICAL UPDATE READY/AVAILABLE`)。检查"已安装未重启"版本的常设途径即上文所列的过期线索:Web UI 横幅、`/acp` 单行警告、以及 `GET /__bili/status`。刻意不设常驻提醒;严重缺陷公告通道(#1481)仍是唯一自动可见的严重路径。

当安装反复失败(目录不可写或受宿主托管、网络错误等)时,自动更新不再每个 3 分钟周期都重复下载并重试。连续失败三次后,它按指数退避(5 分钟 → 10 → 20 …,上限 6 小时),打印一次性的可操作提示(修复权限 / npm prefix、以用户级重装,或用 `"autoUpdate": false` / `ACP_AUTO_UPDATE=0` 禁用),并在冷却期间不再为这次失败输出日志(不下载、不打重试行);一旦故障消除或目标版本变化即恢复(#1603)。

同样的有界重试现在也覆盖全局自更新代为驱动的 **owner 托管通道** —— dsh desktop 原位副本、dsh profile bundle 与 pi 的 npm 副本(#2192)。每条通道按「通道 + 目标版本」维护独立的失败计数,desktop 布局持续损坏时不再每周期重新下载整个 tarball(修复前每台受影响机器每天最多约 480 次下载);连续失败三次进入同样的指数冷却,一次性提示会指明出错的通道与手动修复方式(`dsh plugin --profile <name> add …`、`pi update --extension …`,或重建 desktop profile)。宿主托管实例另走更慢的独立检查节奏 —— 30 分钟加最多 15 分钟抖动,记在独立的节流标记里 —— 不再占用全局 3 分钟预算。失败计数通过缓存目录下的一个小状态文件(`.install-backoff.json`)在机器上所有 bili 进程间共享,多个运行中的实例不会各自烧掉独立的重试预算;`bili plugin update` 成功一次会立即解除 dsh profile 通道的冷却。该文件以原子方式写入(tmp+rename),且每次写入都与磁盘上已有内容合并,并发实例互相协作而不是覆盖彼此的计数;长驻进程会在文件变化时重新读取,任一副本执行的手动解除会在其它副本的下次检查时可见。它的一切失败模式都偏向重试 —— 损坏的文件或时钟跳跃会被丢弃,绝不允许长期沉默某条更新通道。`bili plugin update` 清除 dsh profile 通道的键;修复好的 desktop 通道则在下次成功的原位刷新时清除自己的键。

### 网络/VPN 切换后本地 DNS 陈旧(#5224)

**长驻**的独立代理在 WSL/VPN/TUN 拓扑变化后可能一直持有陈旧的 OS 解析器状态 —— 进程会缓存其系统解析器,而 libuv 的 `getaddrinfo` 不会自行重读 `/etc/resolv.conf`。症状:经 `/bili/` 隧道发出的每个模型请求都返回 HTTP 502 `tunnel_destination_denied`(detail `unresolvable`),尽管同一时刻新起的 `bili` 能正常解析同一主机、新 shell 里的 `curl` 也正常。两种解决办法任选其一即可清除:
- **重启代理进程** —— 新进程会重读系统解析器。在 launcher 车道和 dsh web-profile 车道里,代理是一个**独立登记的**进程(instance registry),所以只重启客户端/宿主会从 registry 重新收养同一个楔死的代理,**不起作用** —— 必须停掉并重新启动代理本身。(内嵌插件模式下代理跑在宿主内部,重启宿主**能**清除。)
- **让出口走上游代理** —— `-F http://<host:port>` 或 `BILI_UPSTREAM_PROXY=… BILI_UPSTREAM_PROXY_MODE=auto`:目标改由那个上游代理远端解析,bili 准入时不再查询自己(已陈旧的)解析器。

### 严重缺陷公告(强制更新)

独立于自动更新(#1481):即使关闭了 `autoUpdate`,代理也会按同样的 3 分钟节奏轮询一个小的伴生 npm 包(`billion-context-advisories`,由 CI 从本仓库的 [`advisories/`](advisories/) 目录发布)。每条公告指明受缺陷影响的版本范围(`affected`,semver)、应安装的确切版本(`target`,可以比当前版本**更旧**,即回滚),以及面向用户的缺陷说明(`reason`)。当本地版本落入 `affected` 范围时,bili 会走自更新的全套安全链路强制安装 `target`(跨进程锁、备份+校验+回滚;源码检出和宿主托管的安装会被拒绝并给出手动升级指引),并以警告方式呈现:

- 日志中每个进程、每条公告一次性的 `[advisory] ⚠️ …`;
- Web UI 概览页横幅,显示原因与手动升级命令;
- `GET /__bili/status` 在 `advisory` 字段返回生效中的公告。

该检查默认 fail-open:公告源不可达或格式错误只产生警告,绝不阻断模型流量。禁用方式:配置(`"advisoryCheck": false`)或环境变量(`BILI_ADVISORY_CHECK=0`);可用 `"advisoryUrl"` / `BILI_ADVISORY_URL` 指向自定义文档。**公告（Announcements）**（#5548）——与上面的关键缺陷公告是两回事：三个来源给 Web UI 提供横幅，相同 id 的覆盖顺序为**本地文件 > 远程源 > 内置**：(1)*内置*——一次性提示，直接走界面内置文案；(2)*本地*——把 JSON 文件放进配置目录的 `announcements/*.json`（默认 `~/.config/billion-context/announcements/`）即自动渲染：双语记录、按 kind 定色、npm 风格 `versions` 版本定向（`>=a.b.c`、`^`、`~`、`[lo hi]`、`||` 列表）、`percent` 灰度、时间窗、按类型排优先级——一个坏文件只废掉它自己；(3)*远程*——本仓库 master 分支的 [`announcements/remote.json`](announcements/remote.json)（每个 PR 都过 CI 校验），约每 3 分钟拉取一次，上一份有效公告的快照可跨重启/断网存活，坏推送会被拒绝；无法直连的环境用 `"remoteAnnouncementsUrl"` / `BILI_ANNOUNCEMENTS_URL` 指向同一文档的中继镜像。关闭行为按每条记录声明的模式：`persistent`（默认，按内容寻址——公告内容改动后会再提示一次）、`instance`（仅本进程）或 `always`（不显示关闭按钮）。关闭内置提示的记录按安装持久化在统一存储里（默认 SQLite，MySQL 后端同样可用），重启后不复发；旧的 `upgrade-notices.json` 状态文件只作为无统一存储边车（如显式加密 opt-out）的旧式安装的回退。官方源当前发布的是空条目列表。



## 配置

完整的配置参考 —— 配置文件位置、顶层键、providers、压缩调参、环境变量 ——
见 **[CONFIGURATION.zh-CN.md](CONFIGURATION.zh-CN.md)**。

### 配置文件

一份 JSON 文档:`~/.config/billion-context/billion-context.json`
(`$XDG_CONFIG_HOME/billion-context/`;用 `BILI_CONFIG_FILE` 可改路径)。
同一开关有多个来源时的优先级:**CLI 参数(如有)> 环境变量 > 配置文件 > 内置默认值** —— 每个环境变量都继续作为覆盖层可用。

里面有什么(细节见 CONFIGURATION.zh-CN.md):

- `providers` —— 按 provider 的路由表:上游覆盖、模型上下文窗口、按 provider/模型的压缩调参、wire 协议声明、compaction opt-in。
- `compress` —— 三级压缩调参(全局 → provider → 模型):阈值、nudge 节奏、保留规则、prompts、tiers。
- 服务端级配置块 —— 进程级行为,含 #2030 新增:`network`(超时 / 重试 / keep-alive / preflight 节奏)、`persist`(会话持久化格式 + tail)、`sessions`(上限 + GC 策略)、`update`(registry 镜像 + 检查间隔)、`diagnostics`(dump、render-tag 模式、注入开关)、`fakeCompletion`,以及标量 `codexCompact` / `ccrRetrievalTtlMs` / `decompressTmpCap` 和扩展项 `mitm.handshakeTimeoutMs`、`compat.noCacheControl`、`compat.keepResponseId`。

最小示例:

```json
{
  "network": { "upstreamTimeoutMs": 900000 },
  "persist": { "zstd": true },
  "sessions": { "gc": { "enabled": true, "maxAgeDays": 14 } }
}
```

最常找的开关:

- **上游代理(防火墙/GFW)**—— 让代理自身出站流量走 v2rayA/clash:完整解析顺序、空字符串 = 显式直连、SOCKS5 拒绝、两条出站路径都覆盖,以及 `mitm://` vs `https://` 键 scheme 区分,都在 [CONFIGURATION.zh-CN.md](CONFIGURATION.zh-CN.md)(服务端设置 → `proxy`;Providers → key schemes)。
- **线上兼容角色改写(`compat.roles`)**—— 上游拒绝 `developer` 角色?[CONFIGURATION.zh-CN.md](CONFIGURATION.zh-CN.md)(服务端设置 → `compat`)已覆盖 —— 包括零配置即用的失败自学习修复。
- **签名上游(body 级签名)**—— 请求携带 body 级签名的网关(CodeArts APIG 的 `SDK-HMAC-SHA256`,或 `x-ofm-signature` 一类网关自造头):内置方案在 dsh 上透明重签;其他被形状检测识别出的方案**一律本地拒收** —— 签名请求要么重签+压缩、要么拒绝,绝不无签名放行 —— bili 在补上对应重签器前每次启动与 web UI 持续提醒(#1884/#2090)。检测规则、按方案覆盖、`BILI_RESIGN` / `BILI_RESIGN_PASSTHROUGH` / `BILI_CODEARTS_REF` 见 [CONFIGURATION.zh-CN.md](CONFIGURATION.zh-CN.md)(服务端设置 → `resign`)。

### Pi 内置子代理

使用 `bili pi` 或 pi 原生插件（`bili plugin install pi`）时，会自带默认启用的子代理功能：`acp_delegate`、`acp_delegate_wait` 和 `acp_delegate_cancel`。这组额外工具仅在 pi 上提供。

**建议只启用一套子代理实现。** 如果使用内置功能，建议在用户级和项目级配置中移除或禁用其他 pi 子代理插件（例如 `pi-subagents` 或单独安装的 `billion-context-pi-subagents`），避免工具、提示词或行为重叠。如果更喜欢其他子代理插件，可以关闭内置功能。`pi-subagents` 在任一作用域（项目级或用户级）的安装都会让内置 delegate 自动让位（#5637）——用户级安装在每个项目中都会加载，因此该保护同样适用；如需与其并存保留 `acp_delegate`，设置 `delegate.forceEnable`。

要关闭内置子代理并保留上下文压缩，请将以下配置合并到 `~/.config/billion-context/billion-context.json`（或 `BILI_CONFIG_FILE` 指定的文件），保留已有的其他设置：

```json
{
  "pi": {
    "subagents": false
  }
}
```

重启 pi 并开启新会话后生效。该配置关闭三个 delegate 工具、配套的系统提示词和子代理管理界面的快捷键，上下文压缩仍然启用；单独安装的其他子代理插件不受此开关控制。更多选项见[子代理配置](CONFIGURATION.zh-CN.md#pi)。

## 会话机制

代理以**客户端自己提供的会话值(原样照搬)**为键隔离压缩状态(`src/session-id.ts`)—— 不哈希、不含协议/上游/API key 维度(它们会在会话中途变化,拿它们做 key 恰好在用户继续对话时把状态弄丢,#280/#286)。该 id 只在代理内部使用(状态存储、持久化、UI 标签),绝不上送。

取值来源(按顺序取第一个命中的):插件的 `x-bili-plugin-conversation`(仅当同时带 `x-bili-plugin` 标记 header)、客户端专属 header(`x-claude-code-session-id`、`x-grok-session-id`/`x-grok-conv-id`、`x-mavis-session-id`、`x-opencode-session-id`)、通用 header(`x-session-affinity`、`x-acp-session`、`x-session-id`、`x-opencode-session`、`session-id`/`session_id`)、或 body 字段:Responses wire 的 `session_id`/`metadata.session_id`,以及 Responses/OpenAI/Anthropic wire 上提升替代内容指纹回退的 `prompt_cache_key`。

| 客户端 | 发会话 id 吗? | 来源 |
|---|---|---|
| **Codex** | ✅ 发 | `body.session_id` / turn-metadata thread id |
| **OpenCode** | ✅ 发 | `x-opencode-session-id` header(`ses_…`,请求自身会话 id;2.x 同时在 `x-session-affinity`/`X-Session-Id`/`x-opencode-session` 里携带*父级*缓存路由亲和值,#2779 —— 1.x 在这些 header 里发送的是自身 id) |
| **Claude Code** | ✅ 发 | `x-claude-code-session-id` header |
| **omp**(经插件)| ✅ 发 | `prompt_cache_key` 提升为稳定身份(#268)|
| **pi**(裸跑)| ❌ 不发 | 无 → 见下方匿名前缀亲和 |

**omp 注意(#2583/#3556):** 较新的 OMP 构建中,默认 Anthropic(`anthropic-messages`)请求经 OMP 的 Cowork 传输以 node:https **直发** —— 到不了 bili 的 fetch 层,因此那条路径上 `prompt_cache_key` 打戳被*主动放弃*(打了戳反而会把字段泄漏进 Anthropic 严格 schema → HTTP 400)。自 #3556 起,`bili omp` launcher lane 默认不再留这个洞:除非你自己设置了 `PI_PROXY` / `PI_PROXY_ANTHROPIC`,launcher 会导出 `PI_PROXY_ANTHROPIC=<proxy>`,把 Cowork 推回 Bun 的 fetch、像其余 lane 一样经代理路由(可压缩、会话可见;打上的 key 由代理消费并剥离)。直连且匿名的行为只保留在 native omp 模式、以及你自己钉死代理姿态的 launcher lane;其余 omp 流量保持打戳身份。详见 [TECHNICAL-NOTES.zh-CN.md](TECHNICAL-NOTES.zh-CN.md)。

**无 header 客户端(pi 类):匿名前缀亲和。** 当客户端完全不发任何会话信号时,代理从重放的历史本身解析会话(`src/prefix-affinity.ts`,#309):只有当请求历史从第 0 条开始逐字节复现某已存会话的消息链时,才重新挂回该会话;否则获得一个确定性的新 `pfa-…` 会话。后果(#1262):**恢复(resume)** 的对话重新挂回自己的会话(包括代理重启后,#499);**开头相同的新任务不会继承**另一个会话的 block —— 它拿到全新会话,历史一旦分叉就彻底独立;完全没有任何可用信号时,请求会被显式 400 拒绝,而不是静默与他人状态碰撞。

设计记录与威胁模型:[SESSION-IDENTITY.md](SESSION-IDENTITY.md)。消息粒度的对偶文档(为什么身份由内容派生、而非指派 id)是 [MESSAGE-IDENTITY.zh-CN.md](MESSAGE-IDENTITY.zh-CN.md)。

上游粘性路由方面,代理只转发客户端本来就提供的身份值(例如 body 里的 `session_id` 会以 `x-session-id` 上送),绝不自行合成一个。

**建议:** 发显式 id 的客户端可以安全并发。无 header 的多 agent 场景,优先装客户端插件(为每个会话盖稳定 id)或每会话传显式 `x-acp-session` header —— 两者都没有时,前缀亲和也能把不同任务分开(分叉的代价只是一次原始重发加压缩阶梯重启)。

### 派生(子)会话继承父会话的压缩上下文(#1333、#1362)

当 agent 派生子会话(subagent 或 fork,从空历史起步、不重发父会话内容)时,它会在出生时上报这条血缘:身份注册携带父会话 id(`parentConversationId`),代理在子会话上记录一条只读链接(`derivedFrom`)。此后 `decompress` / `search_context` 对子会话自己从未见过的内容沿父链回退(带环检测、深度上限 8);任何东西都不复制进子会话,父会话也绝不被修改;父会话未知时子会话就按全新起步。各 lane 的父信号(pi/omp `parentSession` header、OpenCode V1/V2 `parentID`):[SESSION-IDENTITY.zh-CN.md](SESSION-IDENTITY.zh-CN.md#派生子会话出生时携带血统1333-1362)。claude/codex/dsh 在这里不需要任何信号:它们的子 agent 共享同一个会话 id,或根本没有子会话概念。

### Windows：把会话目录加入杀软排除项（#362）

代理把每个会话的压缩状态持久化到会话目录(默认 `%USERPROFILE%\.local\share\billion-context\`),长会话每一轮都会重写该文件。在 Windows 上,实时杀毒(Defender)、搜索索引器或同步工具(OneDrive)可能在写入中途锁住该目录,导致 rename 以 `EPERM` 失败。同一会话连续 N 次写失败(默认 `5`)时,代理打一条一次性可操作告警,指明要排除的目录。根上修复:把 `%USERPROFILE%\.local\share\billion-context\` 加入杀软**排除项**,并确认没有同步工具在同步该路径 —— 完整步骤见 [CONFIGURATION.zh-CN.md](CONFIGURATION.zh-CN.md) 的「Windows：把会话目录加入杀软排除项」章节。同一排除项也覆盖统一存储 `index.db` 打不开(`unable to open database file`,#3823)——存储降级告警会把它列为第一嫌疑。

### 单机多安装共存（#5046）

同一台机器上装了**两份及以上** bili（例如两个 DSH profile——桌面端 + bot，或全局 npm 拷贝与宿主树拷贝并存）时，各自的代理默认都解析到**同一个** XDG 会话目录（`%USERPROFILE%\.local\share\billion-context\sessions\`）和同一份配置文件。开了统一存储（`storage.unified` = shadow/full）后，两个进程会双写同一个 `index.db`：日志出现 `[instances] another bili instance is running …`，lane 重叠时还有 `[storage] … two processes on one index.db corrupt it` 级别的 error；SQLite 写锁争用（`SQLITE_BUSY` / `database is locked`）会让整轮模型请求直接失败，持续双写还有损坏风险。正确做法是**隔离**：给每份安装设独立的 `BILI_SESSIONS_DIR`（配置也要分开时再加 `BILI_CONFIG_FILE`），只加在该安装自己的启动器/profile 环境变量里，不动全局环境。隔离后两份可正常并存，`[instances]` 提示会自动降为 info 级（目录不同 ⇒ 无共享状态）。

### 会话文件清理（#1082）

短命会话会留下永远不会再被恢复的小状态文件。清理是**可选开启(opt-in)**的:设 `BILI_SESSION_GC=1` 才启用(默认关闭 —— 会话文件属于用户数据,不应有静默删除策略)。启用且持久化开启时,bili 在启动时和每小时扫描会话目录,只有**两个条件同时满足**才删除一个文件:年龄超过 `BILI_SESSION_GC_MAX_AGE_DAYS`(默认 7 天),并且该会话**从未被压缩过**(没有折叠块)、最近一次请求体 ≤ `BILI_SESSION_GC_MAX_TOKENS` token(默认 1M)—— 删除只丢字节不丢内容。CCR 内容存储遵循其会话文件的生命周期;被压缩过的会话永不删除;每次删除都写审计日志。详见 [CONFIGURATION.zh-CN.md](CONFIGURATION.zh-CN.md)。

### 存储维护 CLI（#3928）

面板通过 HTTP(`POST /__bili/storage/gc`、`POST /__bili/storage/restore`)暴露的同一套存储维护操作,现在有一个薄的 CLI 层 —— 不需要代理进程,在持有会话目录的任何机器上都能直接跑:

```bash
bili sessions ls                 # id、label、解码后大小、最后更新时间、存储状态(active/archived)
bili sessions rm <id>            # 完整删除(释放内容引用计数,含媒体);随后收缩 index.db(--no-vacuum 跳过)
bili sessions archive <id>       # 导出到 archive/archive.jsonl + 清行;tombstone 保留 label 与身份
bili sessions restore <id>       # 从日志行恢复已归档的会话
bili storage gc [--days N] [--vacuum full|incremental] [--dry-run]
                                 # 先打印清扫计划(超期会话、零引用内容行、可回收页数估算),再执行与 HTTP 端点相同的 gc();--dry-run 只打印计划
```

`archive`/`restore`/`gc` 需要统一存储(`BILI_STORAGE_UNIFIED=shadow|full` 或配置文件里的 `storage.unified`)—— legacy-only 安装会拒绝并给出提示。`--days` 默认取 `storage.archiveAfterDays`(365)。没有调度器:全部按需运行。所有命令都支持 `--json`。

**大库上 full vacuum 是离线操作(#4612)。** `--vacuum full`(默认)会在独占写锁下重写整个 index.db —— O(库大小),多 GB 的库要几分钟到几十分钟,且没有中间进度(SQLite 的 VACUUM 是原子操作,拆不开)。在有代理正从同一会话目录服务时跑它,会把那个代理的写入饿死到其存储层降级为止,所以 `storage gc --vacuum full` **在另一个存活进程持有该数据库时会拒绝启动**(`index.db.lock` pid 纪律,#4175):CLI 以退出码 1 给出可操作提示,面板端点返回 HTTP 409。先停掉另一个实例(或等它退出)再重试;要在线安全地缩库用 `--vacuum incremental`,它以短事务回收空闲页、不拿独占锁。零引用删除清扫无论哪种模式都分批执行并逐批打印进度。

## 状态

早期。协议处理和压缩已通过 mock 测试(500+ 项通过)。真实模型集成测试是下一里程碑。预期会有粗糙的地方。

针对 pi / omp / opencode 的客户端插件随 `billion-context` 一起发布(`dist/agent/*.js`),用于协作代理路径。三者(`billion-context`、独立的 `billion-context-pi`、`opencode-acp`)如何取舍,见上文「该选哪个?」一节。

## 额外署名要求（在 MIT 之上的一条附加条款）

本项目采用 MIT 许可**外加一条附加条款**：任何终端用户可见或可交互、且使用了本软件的产品或服务（无论商业或开源），须在其首页、文档或“关于/致谢”页面中注明该产品使用了 billion-context，并附指向本仓库的链接；纯服务端/内嵌用途随附文档声明即可。详见 [LICENSE](LICENSE) 末尾的**附加条款**。

如果你的产品用到了本项目，欢迎提一个 issue 告知（没有强制义务），方便我们了解它被用在哪些地方。

## 许可证

MIT
