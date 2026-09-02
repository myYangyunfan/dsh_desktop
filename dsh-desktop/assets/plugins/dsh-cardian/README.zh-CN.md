# cardian · DeepSeek Harness 知识中心插件

[English](README.md) · **中文（简体）**

> 一个复刻主流 agentic IDE「知识中心」能力模型的 DeepSeek Harness（dsh）插件。把 **RepoWiki / 知识卡片 / 记忆** 三大功能，全部**内化并落地到本地 Obsidian 仓库**——每一张知识卡、每一条记忆、每一页 RepoWiki 都是一份带 YAML frontmatter 的 Markdown，可直接用 Obsidian 打开、检索、可视化图谱。

工程上对标 `basic-memory`、`12-factor-agents`、`claude-obsidian` 等开源实践（详见 [`ITERATIONS.md`](./ITERATIONS.md) 的 10 轮迭代记录）。

## 快速开始（即插即用）

```bash
git clone https://github.com/myYangyunfan/dsh_cardian.git
cd dsh_cardian
npm install            # 安装 react + tsdown + typescript，并自动构建客户端（prepare 脚本）
npm test               # 测试全绿
npm run build:client   # 手动构建侧边栏 UI → lib/client.js（通常 install 已自动完成）
```

**作为 dsh 插件接入**：把 `dsh-cardian` 装进 dsh desktop（`npm install <本目录>` 或 `npm install dsh-cardian`），并把 `cordis.patch.yml` 里的 `insert` 行合入当前 profile；左下栏即出现「🌳 知识树」入口。详见 [`docs/dsh-integration.md`](./docs/dsh-integration.md)。

**脱离 dsh 单独用**（纯本地知识库）：

```bash
node cli.mjs status --vault ./cardian-vault
node cli.mjs card add "闭包" "闭包=函数+词法环境" --tags js
node examples/demo.mjs      # 生成示例仓库，用 Obsidian 打开 ./cardian-vault 查看
```

## 三大功能

| 功能 | 目录 | 定位 | 工具 |
|---|---|---|---|
| **RepoWiki** | `Repos/` | 扫描本地代码仓库生成 Wiki 骨架，agent 回填语义描述 | `cardian.wiki.*` |
| **知识卡片** | `Cards/` | 原子化知识单元，按分类/标签归组与检索 | `cardian.card.*` |
| **记忆** | `Memory/` | 跨会话持久记忆，按 scope 归组，支持 facts / importance | `cardian.memory.*` |

另有跨分区工具：`cardian.recall`（精简召回）、`cardian.search`（关键词+语义混合检索）、`cardian.tagCloud`、`cardian.backlinks`、`cardian.related`、`cardian.doctor`/`schema`/`reindex`、`cardian.export`/`import`/`importMarkdown`、`cardian.status`；双向同步与代码图谱用 `cardian.wiki.sync`/`graph`，知识分层导出用 `cardian.skill.export`，记忆晋升用 `cardian.memory.promote`。

### 对话活动自动刷新

宿主插件监听 `session/event`（`user/message`）：当会话工作目录（`header.cwd` 的 basename，经 slug 归一）匹配某项目已有 RepoWiki 分区时，自动执行：

1. 以 `scope=<project>` upsert「最近对话 · <project>」episodic 记忆（稳定 id，正文含消息摘录，合并更新）；
2. `refreshAll()` 重建 **RepoWiki / 知识卡片 / 记忆** 三个分区的 MOC 索引。

即「项目每次有对话活动，三个分区都会刷新」，实现知识中心的"记忆随活动保鲜"行为。

### 一键沉淀 = 骨架 + AI 凝练（0.6.3）

知识树面板 RepoWiki 标签的「📁 工作区沉淀」dock 里点「沉淀 ▸」，现在不只是扫描骨架：骨架卡生成完成后会自动新建一个 **agent 会话**（`ctx.get('agents').create(...)`），让 AI 用 `cardian.wiki.list` / `cardian.wiki.get` / `cardian.wiki.upsert` 把每张骨架卡回填成语义卡片——正文改为「## 职责 / ## 关键实现 / ## 依赖 / ## 注意点」，summary 是一句话职责摘要，标题是人类可读的模块名，去掉「## 待补充」占位并置为 published。已有回填的卡跳过（幂等，不覆盖人工成果）。

- 面板在任务行旁显示 AI 状态：✦ AI 凝练中（会话 xxx）/ ✅ AI 凝练完成 / ⚠️ 不可用（宿主无 agents 服务，骨架已生成，可在对话中让 AI 回填）；
- 配置项 `aiCondense`（默认 true）控制整体开关；单次沉淀可传 `ai: false` 关闭；
- agent 会话被关闭时任务自动标成「AI 凝练完成」。

### 凝练幂等（0.6.2）：重复点击凝练不丢内容

`cardian.wiki.ingest` 对已语义回填过的卡片（body 已不再是「待补充」骨架模板）**跳过覆写**：agent/用户 upsert 的职责描述、摘要、标题全部保留，只在扫描新文件或刷新骨架卡时写入。返回 `{ count, skipped, reserved }`，面板沉淀完成文案显示「新增 N 张，保留已凝练 M 张」。

### 知识树文件夹层级（0.6.2）

「知识树」面板列表改为可展开的树：第一层按分区组（RepoWiki=仓库 / 知识卡片=分类 / 记忆=scope），RepoWiki 内再按文件路径段（`src/lib/store.js` → `src` ▸ `lib` ▸ `store.js`）展开成目录；点击项目/文件夹展开收起，点击文件查看凝练内容。搜索时自动切回扁平结果列表。`sectionList` 条目新增 `path` 字段（frontmatter 真值优先）。

## 架构

```
┌────────────────────────────────────────────┐
│  dsh adapter (src/)   Cordis 契约 + 工具注册 │
│  src/index.js · tools.js · schema.js        │
└──────────────────────┬─────────────────────┘
                       │ createCardian()
┌──────────────────────▼─────────────────────┐
│  core/  框架无关的知识中心引擎                │
│  store(原子写) · indexer(倒排检索)            │
│  embedder(可插拔向量) · links(反向链接)        │
│  cards · memory · repowiki · sync            │
└──────────────────────┬─────────────────────┘
                       │ 纯 Markdown + YAML frontmatter
┌──────────────────────▼─────────────────────┐
│  Obsidian vault   Cards/ Memory/ Repos/     │
└────────────────────────────────────────────┘
```

核心引擎不依赖 Cordis，同一份逻辑同时服务 dsh 插件、独立 CLI（`cli.mjs`）、未来的 MCP server。

## 工具矩阵（36 个，带行为提示）

每个工具标注 `readOnly` / `idempotent` / `destructive`，agent 无需试错即可选对工具；工具抛出的错误会被压缩成结构化 `{ ok:false, error:{code,message,suggestion} }`（12-factor Factor 9）。

| 工具 | 行为 |
|---|---|
| `cardian.status` | 只读 |
| `cardian.search` / `recall` / `tagCloud` / `backlinks` / `related` / `export` / `doctor` / `schema` | 只读 |
| `cardian.import` / `importMarkdown` / `reindex` / `card.review` | 幂等 |
| `cardian.wiki.ingest` / `upsert` · `card.card.upsert` · `memory.commit` | 幂等 |
| `cardian.wiki.get` / `list` · `card.get/list/search/due` · `memory.get/list/search/history` | 只读 |
| `cardian.wiki.delete` · `card.delete` · `memory.delete` | 破坏性（幂等重试安全） |
| `cardian.wiki.overview` / `memory.promote` / `import` / `importMarkdown` / `reindex` | 幂等治理动作 |
| `cardian.wiki.sync` / `skill.export` | 幂等（同步/分层导出） |
| `cardian.wiki.graph` / `cardian.feedback` | graph 只读 · feedback 幂等反馈闭环 |

领域特性：笔记可带 `status`(draft/published)、`confidence`(0-1)、`source`、`summary`、`aliases`、`relations`(类型化关系如 `"depends_on [[X]]"`)、`as_of`/`expires`(新鲜度)。RepoWiki 会自动提取 `imports` 依赖；记忆支持 `kind`(semantic/episodic/procedural) 与追加式修订历史；知识卡片支持 `front`/`back`/`deck` 闪卡与 SM-2 复习排期。

## Obsidian 仓库结构

```
<vaultPath>/
├── Cards/      README.md(MOC) + <分类>/<slug>.md
├── Memory/     README.md(MOC) + <scope>/<slug>.md
└── Repos/      README.md(MOC) + <repo>/<path-slug>.md
```

三个 `README.md` 是自动维护的 MOC，用 `[[wikilink]]` 与标签把条目连成图谱。

## 安装与加载（dsh）

遵循官方兼容协议：`package.json` 的 `dsh.bundle.patch` + `cordis.patch.yml` 的 `insert` 行。

```yaml
# cordis.patch.yml
- insert:
    - id: cardian
      name: dsh-cardian
      config:
        vaultPath: ./cardian-vault   # Obsidian 仓库路径
        autoInit: true
        semanticSearch: true
        searchAlpha: 0.5             # 0=纯语义, 1=纯关键词
```

### 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `vaultPath` | `./cardian-vault` | Obsidian 仓库路径，可绝对路径或 `!!js` 注入 |
| `autoInit` | `true` | 启动时自动建目录与 MOC |
| `semanticSearch` | `true` | 启用语义检索（与关键词混合） |
| `searchAlpha` | `0.5` | 混合检索权重 |
| `embedderDim` | `256` | 内置 HashEmbedder 向量维度 |

### 知识树（dsh 客户端）

cardian 还带一个 **dsh 客户端半侧**（`src/client/`）：在左侧边栏脚部添加「🌳 知识树」栏目，点击展开浮动面板，直接在宿主里查看/搜索三大功能生成的全部内容。它注册进 dsh 官方的两个可加性 slot——`sidebar.footer.action`（左下栏入口）与 `shell.overlay`（浮动面板）。

```bash
npm run build:client   # 产出 lib/client.js（window.__ModuleLoader__.load 闭包工厂）
```

完整说明见 [`docs/dsh-integration.md`](./docs/dsh-integration.md)。

## CLI（无需 dsh 宿主）

```bash
node cli.mjs status --vault ./cardian-vault
node cli.mjs card add "闭包" "闭包=函数+词法环境" --tags js,基础 --category frontend
node cli.mjs search "词法" --top 5
node cli.mjs wiki ingest ./src --name cardian
node cli.mjs export --file backup.json
node cli.mjs import backup.json
node cli.mjs tagcloud / backlinks <ref> / related <ref>
```

全局 `--vault <path>`、`--dry-run`（只打印意图不写盘）、`--quiet`。

## 在 Obsidian 中查看

```bash
node examples/demo.mjs            # 生成含示例内容的仓库（默认 ./cardian-vault）
```

然后在 Obsidian「打开文件夹作为仓库」选择 `vaultPath` 即可；图谱视图会把知识卡片、记忆、RepoWiki 连成一张网。

## 开发与测试

```bash
npm test        # node:test，用例覆盖核心 + 适配层 + 路径安全 + 往返
```

## 仓库结构

```
dsh_cardian/
├── package.json / cordis.patch.yml / LICENSE / CHANGELOG.md / ITERATIONS.md
├── core/          # 框架无关引擎（store/indexer/embedder/links/sync/errors/config/log/三大服务）
├── src/           # dsh 适配（index/tools/schema）+ 客户端半侧
├── cli.mjs        # 独立 CLI
├── examples/demo.mjs
├── test/          # node:test + fixtures
└── docs/
    ├── dsh-integration.md          # 宿主/客户端接入说明
    └── research/                   # DSH 插件兼容协议研究
        ├── dsh-std/                # 官方插件契约、manifest 与配置层
        └── adapter/                # LLM adapter seam 与跨框架 adapter 模式
```

## 研究：DSH 插件兼容协议

[`docs/research/README.md`](./docs/research/README.md) 是本仓库附带的研究成果索引，核心结论：**dsh = 官方 `deepseek-ai/deepseek-harness`（"一切皆插件"）**，跑在 Cordis 插件框架之上。兼容性的"命门"是几个精确字段名与层级顺序——写错就崩。写插件/适配器前先读这两个子目录：

- [`docs/research/dsh-std/`](./docs/research/dsh-std/README.md) — 插件标准/兼容协议：官方插件契约、manifest 与配置层、社区 dsh-std 前瞻、通用兼容协议要素清单、参考资料 URL。
- [`docs/research/adapter/`](./docs/research/adapter/README.md) — 适配器规范：官方 LLM adapter seam、目录结构与编写清单、跨框架 adapter 模式（MCP/A2A/OpenAI/LiteLLM/vLLM）。

## 相关项目

- **[dsh-hotplug-hub](https://github.com/myYangyunfan/dsh-hotplug-hub)** — 独立的插件拼装启动器：读组合 → 拼 profile → 预检 → 拉起官方 DSH → 捕获日志 → 自愈。两个项目共享同一份兼容性研究。
- **[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)** — 官方 DSH 宿主（MIT，TypeScript，developer preview）。

## License

[MIT](./LICENSE)