# cardian · DeepSeek Harness Knowledge-Center Plugin

**English** · [中文 (简体)](README.zh-CN.md)

> A DeepSeek Harness (dsh) plugin that reproduces the "Knowledge Center" capability model of mainstream agentic IDEs. **RepoWiki / Knowledge Cards / Memory** — all internalized and persisted into a local **Obsidian vault**: every knowledge card, every memory, every RepoWiki page is a Markdown file with YAML frontmatter, ready to be opened, searched, and graphed in Obsidian.

Engineering-wise it benchmarks against open-source practices such as `basic-memory`, `12-factor-agents`, `claude-obsidian` (see the 10 iterations in [`ITERATIONS.md`](./ITERATIONS.md)).

## Quick Start (plug & play)

```bash
git clone https://github.com/myYangyunfan/dsh_cardian.git
cd dsh_cardian
npm install            # installs react + tsdown + typescript, auto-builds the client (prepare script)
npm test               # test suite all green
npm run build:client   # manually build the sidebar UI → lib/client.js (install usually does this)
```

**As a dsh plugin**: install `dsh-cardian` into dsh desktop (`npm install <this dir>` or `npm install dsh-cardian`) and merge the `insert` line from `cordis.patch.yml` into the active profile; a 「🌳 知识树 / Knowledge Tree」 entry appears at the bottom of the left sidebar. See [`docs/dsh-integration.md`](./docs/dsh-integration.md).

**Standalone (pure local knowledge base, no dsh host)**:

```bash
node cli.mjs status --vault ./cardian-vault
node cli.mjs card add "Closure" "closure = function + lexical environment" --tags js
node examples/demo.mjs      # seeds a demo vault; open ./cardian-vault in Obsidian
```

## The Three Pillars

| Feature | Directory | Role | Tools |
|---|---|---|---|
| **RepoWiki** | `Repos/` | Scans local code repos to build a Wiki skeleton; agent back-fills semantic descriptions | `cardian.wiki.*` |
| **Knowledge Cards** | `Cards/` | Atomic knowledge units grouped/retrieved by category & tags | `cardian.card.*` |
| **Memory** | `Memory/` | Cross-session persistent memory grouped by scope; facts / importance | `cardian.memory.*` |

Cross-section tools: `cardian.recall` (budgeted recall), `cardian.search` (keyword + semantic hybrid), `cardian.tagCloud`, `cardian.backlinks`, `cardian.related`, `cardian.doctor`/`schema`/`reindex`, `cardian.export`/`import`/`importMarkdown`, `cardian.status`; two-way sync & code graph via `cardian.wiki.sync`/`graph`; layered skill export via `cardian.skill.export`; memory promotion via `cardian.memory.promote`.

### Activity-Driven Auto Refresh

The host plugin listens for `session/event` (`user/message`): when the session working directory (`header.cwd` basename, slug-normalized) matches an existing RepoWiki section, it automatically:

1. Upserts an episodic memory「Recent conversation · <project>」with `scope=<project>` (stable id, merged updates);
2. Calls `refreshAll()` to rebuild the MOC index for **RepoWiki / Knowledge Cards / Memory**.

I.e. "whenever a project has conversation activity, all three sections refresh" — memory stays fresh with activity.

### One-Click Condense = Skeleton + AI Enrichment (0.6.3)

Clicking「沉淀 ▸ (Condense)」in the workflow dock of the RepoWiki tab doesn't just scan a skeleton: after skeleton cards are generated, it spawns an **agent session** (`ctx.get('agents').create(...)`) that back-fills each skeleton into a semantic card using `cardian.wiki.list` / `cardian.wiki.get` / `cardian.wiki.upsert` — body becomes「## 职责 / ## 关键实现 / ## 依赖 / ## 注意点」, summary is a one-line responsibility statement, title is human-readable, and the「## 待补充」placeholder is removed with status set to published. Already-enriched cards are skipped (idempotent, no clobbering of human work).

- The panel shows AI status per task: ✦ 凝练中 (session xxx) / ✅ done / ⚠️ unavailable (host has no agents service — skeleton is still generated, ask AI to fill in later);
- Config `aiCondense` (default true) is the master switch; a single run can pass `ai: false`.

### Idempotent Condense (0.6.2): No Data Loss on Re-condense

`cardian.wiki.ingest` **skips overwriting** cards already semantically enriched (body no longer the「待补充」skeleton template): agent/user-written descriptions, summaries, and titles are fully preserved; only newly scanned files or refreshed skeletons are written. Returns `{ count, skipped, reserved }`; the panel shows「新增 N 张，保留已凝练 M 张」.

### Knowledge Tree Folder Hierarchy (0.6.2)

The「知识树」panel list is an expandable tree: first level groups by section (RepoWiki=repos / Knowledge Cards=categories / Memory=scopes), RepoWiki expands by file path segments (`src/lib/store.js` → `src` ▸ `lib` ▸ `store.js`). Click a project/folder to expand, a file to view content; searching switches back to a flat result list. `sectionList` entries gained a `path` field (frontmatter truth wins).

## Architecture

```
┌────────────────────────────────────────────┐
│  dsh adapter (src/)   Cordis contract + tool registry │
│  src/index.js · tools.js · schema.js        │
└──────────────────────┬─────────────────────┘
                       │ createCardian()
┌──────────────────────▼─────────────────────┐
│  core/  framework-agnostic knowledge engine  │
│  store(atomic writes) · indexer(inverted idx)│
│  embedder(pluggable vectors) · links(backlinks)│
│  cards · memory · repowiki · sync            │
└──────────────────────┬─────────────────────┘
                       │ pure Markdown + YAML frontmatter
┌──────────────────────▼─────────────────────┐
│  Obsidian vault   Cards/ Memory/ Repos/     │
└────────────────────────────────────────────┘
```

The core engine has no Cordis dependency — the same logic serves the dsh plugin, the standalone CLI (`cli.mjs`), and (in the future) an MCP server.

## Tool Matrix (36 tools with behavior hints)

Each tool is annotated `readOnly` / `idempotent` / `destructive` so agents pick the right tool without trial-and-error; errors are compacted into structured `{ ok:false, error:{code,message,suggestion} }` (12-factor Factor 9).

| Tools | Behavior |
|---|---|
| `cardian.status` | readOnly |
| `cardian.search` / `recall` / `tagCloud` / `backlinks` / `related` / `export` / `doctor` / `schema` | readOnly |
| `cardian.import` / `importMarkdown` / `reindex` / `card.review` | idempotent |
| `cardian.wiki.ingest` / `upsert` · `card.card.upsert` · `memory.commit` | idempotent |
| `cardian.wiki.get` / `list` · `card.get/list/search/due` · `memory.get/list/search/history` | readOnly |
| `cardian.wiki.delete` · `card.delete` · `memory.delete` | destructive (idempotent-safe) |
| `cardian.wiki.overview` / `memory.promote` / `import` / `importMarkdown` / `reindex` | idempotent governance |
| `cardian.wiki.sync` / `skill.export` | idempotent (sync / layered export) |
| `cardian.wiki.graph` / `cardian.feedback` | graph readOnly · feedback idempotent loop |

Domain features: notes support `status`(draft/published), `confidence`(0-1), `source`, `summary`, `aliases`, `relations` (typed relations like `"depends_on [[X]]"`), `as_of`/`expires` (freshness). RepoWiki auto-extracts `imports` dependencies; memory supports `kind`(semantic/episodic/procedural) with append-only revision history; Knowledge Cards support `front`/`back`/`deck` flashcards with SM-2 review scheduling.

## Obsidian Vault Layout

```
<vaultPath>/
├── Cards/      README.md(MOC) + <category>/<slug>.md
├── Memory/     README.md(MOC) + <scope>/<slug>.md
└── Repos/      README.md(MOC) + <repo>/<path-slug>.md
```

The three `README.md` are auto-maintained MOCs tying entries into a graph with `[[wikilink]]` and tags.

## Install & Load (dsh)

Follows the official compatibility protocol: `dsh.bundle.patch` in `package.json` + `insert` line in `cordis.patch.yml`.

```yaml
# cordis.patch.yml
- insert:
    - id: cardian
      name: dsh-cardian
      config:
        vaultPath: ./cardian-vault   # Obsidian vault path
        autoInit: true
        semanticSearch: true
        searchAlpha: 0.5             # 0=pure semantic, 1=pure keyword
```

### Configuration

| Field | Default | Description |
|---|---|---|
| `vaultPath` | `./cardian-vault` | Obsidian vault path; absolute or `!!js` injected |
| `autoInit` | `true` | Auto-create directories & MOCs at startup |
| `semanticSearch` | `true` | Enable semantic search (mixed with keyword) |
| `searchAlpha` | `0.5` | Hybrid search weight |
| `embedderDim` | `256` | Built-in HashEmbedder vector dimension |

### Knowledge Tree (dsh client)

cardian ships a **dsh client half** (`src/client/`): it adds a「🌳 知识树」section at the bottom of the left sidebar that opens a floating panel to browse/search everything the three pillars produce, directly inside the host. It registers into two official additive slots — `sidebar.footer.action` (left-bottom entry) and `shell.overlay` (floating panel).

```bash
npm run build:client   # produces lib/client.js (window.__ModuleLoader__.load closure factory)
```

Full walkthrough: [`docs/dsh-integration.md`](./docs/dsh-integration.md).

## CLI (no dsh host needed)

```bash
node cli.mjs status --vault ./cardian-vault
node cli.mjs card add "Closure" "closure = function + lexical environment" --tags js,core --category frontend
node cli.mjs search "lexical" --top 5
node cli.mjs wiki ingest ./src --name cardian
node cli.mjs export --file backup.json
node cli.mjs import backup.json
node cli.mjs tagcloud / backlinks <ref> / related <ref>
```

Global flags: `--vault <path>`, `--dry-run` (print intent only, no writes), `--quiet`.

## Viewing in Obsidian

```bash
node examples/demo.mjs            # seeds a demo vault (default ./cardian-vault)
```

Then in Obsidian choose「Open folder as vault」→ `vaultPath`; the graph view ties Knowledge Cards, Memory, and RepoWiki into one network.

## Development & Testing

```bash
npm test        # node:test — covers core + adapter layer + path safety + round-trips
```

## Repository Layout

```
dsh_cardian/
├── package.json / cordis.patch.yml / LICENSE / CHANGELOG.md / ITERATIONS.md
├── core/          # framework-agnostic engine (store/indexer/embedder/links/sync/errors/config/log/three services)
├── src/           # dsh adapter (index/tools/schema) + client half
├── cli.mjs        # standalone CLI
├── examples/demo.mjs
├── test/          # node:test + fixtures
└── docs/
    ├── dsh-integration.md          # host/client integration walkthrough
    └── research/                   # DSH plugin compatibility research
        ├── dsh-std/                # official plugin contract, manifest & config layer
        └── adapter/                # LLM adapter seam & cross-framework adapter patterns
```

## Research: DSH Plugin Compatibility Protocol

[`docs/research/README.md`](./docs/research/README.md) is a condensed index of the key conclusion: **dsh = official `deepseek-ai/deepseek-harness` ("Everything is a Plugin")**, running on the Cordis plugin framework. The "critical gate" for compatibility is a few exact field names and hierarchy orders — get them wrong and the plugin won't load. Read the two sub-folders before writing plugins/adapters:

- [`docs/research/dsh-std/`](./docs/research/dsh-std/README.md) — plugin standard/compat protocol: official plugin contract, manifest & config layer, community dsh-std outlook, universal compat-element checklist, reference URLs.
- [`docs/research/adapter/`](./docs/research/adapter/README.md) — adapter specs: official LLM adapter seam, directory structure & authoring checklist, cross-framework adapter patterns (MCP/A2A/OpenAI/LiteLLM/vLLM).

## Related Projects

- **[dsh-hotplug-hub](https://github.com/myYangyunfan/dsh-hotplug-hub)** — independent plugin assembly launcher: reads combinations → assembles profiles → pre-flight checks → launches official DSH → captures logs → self-heals. The two projects share the same compatibility research.
- **[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)** — official DSH host (MIT, TypeScript, developer preview).

## License

[MIT](./LICENSE)