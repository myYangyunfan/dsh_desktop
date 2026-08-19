# DSH Skill Manager

DSH Skill Manager is a community plugin for managing Agent Skills in DeepSeek Harness, with a thin integration layer for DSH Desktop.

The project is under active development. The first complete release will provide:

- creation and validation of `SKILL.md` bundles;
- an isolated managed library with per-Skill enablement for DSH;
- discovery and explicit import/export for Codex, Claude Code, `.agents/skills`, and OpenCode;
- Marketplace V2 repository discovery, fixed-commit inspection, bounded media, risk hints, and safe GitHub installation;
- update checks, conflict detection, backup, and rollback;
- a DSH settings section and leading slash command/Skill prefix parsing.

## Scope

This repository does not implement or modify shell timeout behavior. Timeout investigation is a separate read-only project.

## Development Status

The architecture and acceptance criteria are recorded under `docs/`. The managed Core, 24-method Protocol 5 Marketplace V2 Host protocol, metadata-only GitHub repository home, category-backed GitHub searches, on-demand fixed-commit inspection, repository-level batch analysis and installation, two-worker failure-isolated provenance batches, explicit all-Skill rematching, bounded media resolver, static risk hints, safe update/rollback, 30-day recoverable deletion, opt-in background maintenance, cross-agent synchronization, theme-adaptive React settings UI, and DSH Desktop v0.3.8 adapter are implemented in tested slices. skills.sh and Hugging Face remain optional discovery/provenance signals rather than installation authority. The central index schema is frozen, but no Indexer service ships yet. v0.3.9 compatibility is deferred.

For the current protocol, see [`docs/API_SPEC.md`](docs/API_SPEC.md). For a detailed Chinese overview, see [`docs/PROJECT_OVERVIEW.zh-CN.md`](docs/PROJECT_OVERVIEW.zh-CN.md).

## DSH Desktop v0.3.8 Adapter

Build the plugin first, then stage and verify the same bundle inside a DSH Desktop v0.3.8 source checkout:

```powershell
npm run build
npm run desktop:v038:stage -- --desktop C:\path\to\dsh_desktop\dsh-desktop
npm run desktop:v038:verify -- --desktop C:\path\to\dsh_desktop\dsh-desktop
```

The adapter rejects any Desktop or Harness version other than `0.3.8` with `@deepseek-ai/dsh` `0.1.0-rc.6`. It vendors the standalone bundle without duplicating its implementation, updates both v0.3.8 companion synchronization paths to copy `dist`, and adds an exact rc.6 dependency patch that limits slash suggestions to a whitespace-bounded leading command/Skill prefix (`/command-one /skill-one /command-two body`). After ordinary body text starts, later slashes remain text. The native `+ 命令` launcher and Enter submission keep their original claimed-command behavior; the adapter changes manual prefix authoring, not the Host's single-command execution protocol. It does not install, start, stop, or update the user's Desktop application.

## License

MIT
