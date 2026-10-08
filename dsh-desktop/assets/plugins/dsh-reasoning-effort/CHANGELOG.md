# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Changed

- Make **Copy for your agent** available for user-declared models with existing levels as well as missing declarations.
- Copy vendor-neutral endpoint research and configuration instructions without built-in model presets; distinguish off semantics, aliases, protocol compatibility, and configuration versus request validation in both languages.

## [0.8.1] - 2026-10-01

### Changed

- Match the model and reasoning-effort menu to DSH's native surface with theme-controlled translucent fill, backdrop blur, and elevation shadow in both light and dark themes.
- Remove the menu's solid border and let the theme's elevation shadow define its edge.

### Fixed

- Replace the undefined menu background token so the surface follows DSH's active theme instead of always using hardcoded fallback colors.
- Correct the warning color tokens so custom-model guidance warnings use the theme's warning text and background colors.

## [0.8.0] - 2026-09-28

### Changed

- Adapt the browser half to DSH `0.2.0-rc.1`'s split client store, renderer, and model selection APIs.
- Target DSH `0.2.0-rc.1` in the Web Profile; DSH `0.1.x` users should remain on the earlier plugin releases.

### Fixed

- Handle failed model and reasoning-effort selections through the new result contract instead of treating every resolved request as successful.

## [0.7.3] - 2026-09-23

### Fixed

- Adapt the Host plugin to DSH `0.1.7-rc.1`'s configuration-backed settings API. Export the plugin's `Config` schema and read its knowledge entries from the plugin configuration when `settings.register` is unavailable; keep the legacy settings path for earlier RC builds. Read the LLM section from the settings descriptor when `settings.get` is unavailable. This restores Host activation and the guidance RPC channel on the new RC.
- Show the configuration document and model location reported by the active Host instead of always directing users to `settings.yaml`. Generate snippets at the indentation of the actual model entry in `settings.yaml` or a profile patch, including the copied agent brief.

## [0.7.2] - 2026-09-11

### Added

- Add a one-click **Copy for your agent** brief beside the guidance panel: it composes the observed facts (route, model id, settings.yaml path, entry path and line, levels the directory reads, knowledge-base suggestion, endpoint caveat), the task, the complete declaration rules, and the suggested block, so a user can hand the whole problem to an agent instead of filling the configuration by hand. The rules ship as a locale pair of markdown briefs inlined into the browser bundle at build time, and `pnpm run check:i18n` now fails when one side is missing, empty, or has a different outline.

### Fixed

- Mount the guidance channel as a plain loopback prefix route instead of `connection.rpc.handle`. On DSH `0.1.5-rc.1` the connection plugin injects only `credentials` while its route registration still reads `owner.webServer` off its own context, so `rpc.handle` throws `cannot get property "webServer" without inject` for every caller and the browser half never received a channel — the declaration panel could not render at all. The route reuses the connection service's request fence and the shared transport's envelope shape, method and content-type status codes.
- Report a failed guidance call in the model menu instead of rendering nothing, so a missing channel no longer looks like "this model needs no guidance".
- Clear guidance and copy state when the model changes, show only results matching the current provider/model, and disable copying during selection or diagnosis. A late diagnosis cannot replace the current model's guidance.
- Decode request bodies as a UTF-8 stream so Chinese names and other multibyte characters survive HTTP chunk boundaries; retain the 64 KiB request limit.
- Keep the model menu inside the visible viewport, with size limits, scrolling, and position updates when the viewport or content changes.

### Changed

- Teach level declaration generically, in the panel and in both READMEs: the how-to states the key/value rule (DSH level → endpoint spelling, an omitted level counts as unsupported) and lists the `compat` switches to reach for, instead of leaving the answer to a vendor note.
- Leave `compat` out of the unknown-model template and show it as a commented example. The previous block asserted `thinkingFormat: "openai"` for every unknown model, which made endpoints receive a switch they do not read; with `compat` absent the adapter applies its own base-URL detection, which is what an unrecognized endpoint wants and the correct vendor format for a recognized one.
- Reword the endpoint caveat to name the switch rather than a vendor: it no longer recommends changing provider (the earlier advice pointed at the built-in `zai` route, which needs its own credentials and was never the only fix).
- Update both README homepages, installation commands, and release links to v0.7.2.

### Compatibility and validation

- The maintainer reports successful hands-on use with DSH `0.1.5-rc.2` (Web Profile), with no compatibility issues found. Compatibility maintenance continues to target RC releases.
- Type checking, bilingual-copy checks, and the complete build pass. Isolated regressions cover model/provider switches, late diagnosis responses, copy controls, all 132 byte-split boundaries of a Unicode request, and request-size/error handling. These automated checks do not constitute a separate full-page or physical-device test.

## [0.7.1] - 2026-09-08

### Fixed

- Declare `remote` and `remote.session` client injections so resolving the model directory on DSH `0.1.2-rc.1` no longer crashes the plugin's model slot and falls back to the built-in selector (#14). Thanks to @Kalospacer for the diagnosis, and to @FengZhiHen1 for the independent minimal fix and real-browser verification in #15 (not merged; this release ships the equivalent injection declarations).

## [0.7.0] - 2026-09-01

### Added

- Follow DSH's active locale with complete Simplified Chinese and English runtime dictionaries for the model control, settings rows, accessibility labels, guidance notes, warnings, and generated YAML comments.

### Changed

- Return locale-neutral guidance codes and configuration fields from the Host half so language switches update visible guidance immediately without another RPC request.

## [0.6.2] - 2026-08-17

### Fixed

- Keep the round knob fully inside the track at both ends (clamped to its half-width), so every visible part stays draggable (#5).
- Smooth the chibi runner animation by starting the loop from the second sprite frame, removing the stand→run hitch each cycle (#3).

## [0.6.1] - 2026-08-17

### Changed

- Enable the Big Fat Fish (chibi runner) slider thumb by default; users who prefer the plain white thumb disable it under Settings → General.

## [0.6.0] - 2026-08-16

### Added

- Host half with a built-in knowledge base (glm-5.2, kimi-k3) plus user-extensible entries under the `dsh-reasoning-effort` settings namespace.
- Read-only reasoning-effort guidance: for models the user declares in `llm-pi-ai` settings whose directory levels are missing (or disagree with the knowledge base), the composer menu offers a panel with the suggested levels and a copy-ready complete-entry YAML (including the `- id:` line; existing `name`/`contextWindow`/`maxTokens` are preserved) plus the settings.yaml path and hot-reload notes.
- Endpoint-level caveats: gateways whose OpenAI-compatible endpoint rejects the `developer` message role (e.g. Aliyun Bailian `maas/dashscope.aliyuncs.com`) get an explicit warning, since settings.yaml cannot override that behavior.
- Loopback-only Client→Host RPC channel (`/dsh-reasoning-effort`) for `diagnose`.

### Design guarantees

- The plugin never writes settings and never invents levels: built-in catalog data — including deliberately sparse level sets — is trusted as-is and never flagged; users paste declarations themselves and DSH validates them as usual.
- The Host row declares `settings`/`llm` injections so it never races the base-bundle boot order; the RPC channel mounts only on Web profiles through `ctx.inject(['connection'])`.
- Malformed user knowledge-base entries are ignored instead of breaking diagnosis; every RPC endpoint answers a structured error instead of leaking exceptions.

### Fixed

- Build pipeline split: `tsc` now only emits the Host half and client type declarations; the browser bundle is produced exclusively by esbuild plus the module-loader wrap, so a bare `tsc` run can no longer overwrite `lib/client/index.js`.

## [0.5.0] - 2026-08-16

### Changed

- Derive slider levels from the model's advertised `reasoning.efforts` instead of requiring exactly `off` / `high` / `max`, so any model with two or more levels gets a working slider (e.g. GLM coding models).
- Show adapter-provided level names (`Low` / `High` / `Xhigh`…); models without levels now read "默认" on the seat instead of a hardcoded middle level.
- Key the peak-intensity track/knob effects off the topmost level (`data-top`) rather than a hardcoded `max` effort id.
- Hide the slider when the model exposes fewer than two levels, with the menu explaining that none are provided.
- Split the stylesheet into `src/client/styles.ts`.
- Document how to declare `reasoningEfforts` + `compat` for models missing from the pi-ai catalog (README, both languages).

## [0.4.0] - 2026-08-15

### Added

- Optional eight-frame chibi runner thumb, disabled by default.
- Dedicated persistent switch under General Settings.
- Transparent, tightly packed sprite assets with top-row then bottom-row playback order.

### Changed

- Replace the initial runner frames with the refined transparent run cycle.
- Increase animation speed from 720 ms to 420 ms while dragging.
- Keep the character fully visible at both slider endpoints by applying a thumb-only inset.
- Preserve the original white thumb whenever the Big Fat Fish option is disabled.

## [0.3.0] - 2026-08-15

### Added

- Combined model and reasoning-effort control for the DSH composer.
- Three snapping levels: `off`, `high`, and `max`.
- Dark blue-violet-black and light blue-white visual themes.
- Left-clipped waves, shock pulses, pixel radiation, particles, and trails.
- Persistent enable switch under General Settings, directly below Appearance.
- English and Simplified Chinese documentation.

### Fixed

- Use direct pointer-position rendering during drag to keep the thumb synchronized with the cursor.
- Add window-level pointer release fallback for reliable completion outside the track.
- Remove thumb position transitions during active dragging.
- Restrict all trailing effects to the left side of the thumb.

### Changed

- Renamed the public package from `@dsh-external/dsh-reasoning-effort` to the unscoped `dsh-reasoning-effort`.
- Migrate the legacy browser enable preference automatically.

[0.3.0]: https://github.com/HanaAyane/dsh-reasoning-effort/releases/tag/v0.3.0
