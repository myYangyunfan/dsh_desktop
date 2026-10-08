<div align="center">
<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Renzic-Stone/DSH-EasyRewrite/main/assets/logo-dark.png" />
<img src="https://raw.githubusercontent.com/Renzic-Stone/DSH-EasyRewrite/main/assets/logo.png" alt="dsh-easyrewrite" width="320" />
</picture>

# DSH-EasyRewrite

[中文](README.md) | [日本語](README.ja.md)

<a href="https://www.npmjs.com/package/dsh-easyrewrite"><img src="https://img.shields.io/npm/v/dsh-easyrewrite?style=flat-square&label=npm&color=4d6bfe" alt="npm version"></a> <a href="https://github.com/Renzic-Stone/DSH-EasyRewrite/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Renzic-Stone/DSH-EasyRewrite?style=flat-square&label=license" alt="license"></a> <a href="https://github.com/Renzic-Stone/DSH-EasyRewrite/stargazers"><img src="https://img.shields.io/github/stars/Renzic-Stone/DSH-EasyRewrite?style=flat-square&label=stars&color=f1c40f" alt="stars"></a> <a href="https://www.npmjs.com/package/dsh-easyrewrite"><img src="https://img.shields.io/npm/dm/dsh-easyrewrite?style=flat-square&label=downloads&color=2ea44f" alt="downloads"></a> <a href="https://dshfind.com/en/plugins/Renzic-Stone/DSH-EasyRewrite?ref=badge"><img src="https://dshfind.com/api/badge/Renzic-Stone/DSH-EasyRewrite?metric=downloads&lang=en" alt="dshfind"></a>

`#dsh` `#deepseek-harness` `#recall` `#rewrite` `#bubble-edit` `#version-pager` `#i18n` `#multilingual`

</div>

**Inline-edit & recall your own user messages in the DeepSeek Harness Web UI — lazily, seamlessly, and without ever losing your work.**

Click your own message bubble to edit it in place; hit the recall button beside copy to withdraw it and everything after it. Nothing is ever really changed until you commit — the conversation, the model context, and the session log stay untouched until you press **Confirm** (rewrite) or **Send** (recall).

> Compatible with DeepSeek Harness Web (**v2.6.0 fully supports both dsh 0.1.7-rc.1+ and 0.1.2-rc.1+**; users on dsh 0.1.1-rc.2 and older hosts, please stay on **2.3.1** — the final release of that line, fully functional, no further features). Built on official extension points only — no source patches.

---

## 📸 Visual Tour

<div align="center">
  <img src="docs/images/drag-drop-dual-dropzone.png" alt="Dual dropzone and synchronized expansion" width="920" />
  <p><em>✨ <b>Dual-dropzone & synchronized 2.5x expansion</b>: smart drag-and-drop dispatch (drop onto the bubble to add images to current edit, or drop into the 2.5x expanded bottom composer to stage for new sessions — strictly isolated with zero leakage)</em></p>
</div>

---

## Quick Start

```sh
# One-line install via npm
dsh plugin --profile web add dsh-easyrewrite
```

## Features (what we've built)

### Bubble Inline Edit (Rewrite) — Shipped (M2/M4)
- **Click to edit**: Click your message bubble to enter inline editing directly (original Markdown source preserved), Esc to cancel / Ctrl+Enter to confirm.
- **Adjustable width modes**: Compact (starts at bubble width, up to 360px) / Standard (fixed 360px) / Expanded (full message width) / Custom, with automatic vertical expansion and smooth inner scrolling.
- **On-the-spot model & effort switching**: Native dropdown menu embedded inside the bubble editor allows instant switching of provider, model, and reasoning effort for the resend.
- **Rich image support & drag-drop management**: Multi-image messages render in equal-width thumbnail strips, supporting individual `×` deletion, clipboard paste, and drag-and-drop addition. Edits survive tab switching and page reloads.

<div align="center">
  <img src="docs/images/bubble-edit-active.png" alt="Bubble inline edit" width="380" />
  &nbsp;&nbsp;
  <img src="docs/images/bubble-edit-model-select.png" alt="Model & reasoning selection" width="380" />
</div>
<div align="center" style="margin-top: 8px;">
  <img src="docs/images/bubble-edit-images.png" alt="Bubble image editing" width="380" />
</div>

<br>

### Message Recall (撤回) — Done, End to End
- **Native & frictionless action**: Permanent recall button placed cleanly next to the official copy button on hover.
- **Inline confirmation capsule**: Native-styled capsule (`撤回这条消息及其后 x 条提问？` + Confirm / Cancel pills), calculating the exact count of subsequent user prompts to be truncated in real time.
- **Lazy commit & "正在修改" editing bar**: Confirming only populates the composer with a top editing bar; truncation only commits when you press **Send**. Cancelling (`×`) at any point cleanly restores your draft with zero context disruption.
- **Seamless replacement & context folding**: Subsequent conversation turns are automatically folded and hidden during edit. Resending archives the original session and seamlessly replaces it with the truncated new session.

<div align="center">
  <img src="docs/images/message-hover-actions.png" alt="Message hover actions" width="220" />
  &nbsp;&nbsp;
  <img src="docs/images/recall-confirm-capsule.png" alt="Inline confirmation capsule" width="300" />
</div>
<div align="center" style="margin-top: 8px;">
  <img src="docs/images/recall-editing.png" alt="Recall editing and context fold" width="780" />
</div>

<br>

### Version Pager (< X >) — Shipped (M3)
- **Seamless history version navigation**: The **`‹ X/N ›`** control is embedded directly inside the action strip of the final reply after every recall/edit resend.
- **Context synchronization**: Clicking arrows (or pressing ←/→ keys) toggles the target branch, and **all subsequent dialogue context automatically syncs with the active version**.
- **Archive swap & smooth viewport anchoring**: The workspace list keeps only one active session at any time, while the chat viewport stays rock-solid without jumping.

<div align="center">
  <img src="docs/images/version-pager.png" alt="Version pager" width="620" />
</div>

<br>

### Settings & Customization — Shipped (M3/M4)
- **Integrated settings card**: Integrates into **Settings → Plugins → EasyRewrite** with native design tokens and automatic trilingual localization (中文 / English / 日本語).
- **Rich toggles & fine-grained control**:
  - Bubble edit toggle & fallback recall button
  - Bubble editor width presets (Compact / Standard / Expanded / Custom)
  - Recall confirmation capsule & visual display modes (Simple / Minimal / Info)
  - Customizable shortcut recording (trigger recall with one keystroke when composer is unfocused)
  - Composer conflict resolution (Overwrite mode safely restores pre-existing draft upon send/cancel)
  - Full version history tree explorer with manual restoration
  - Built-in one-click plugin update check & auto-upgrade

<div align="center">
  <img src="docs/images/settings-panel-1.png" alt="Settings panel part 1" width="440" />
  &nbsp;&nbsp;
  <img src="docs/images/settings-panel-2.png" alt="Settings panel part 2" width="440" />
</div>

<br>

### Draft Auto-Backup — Shipped (M3)
- Pending drafts untouched for over 10 seconds with recent changes are safely backed up locally; deleted immediately upon Confirm/Send.
- Path: `$DSH_HOME/dsh-easyrewrite/backups/<sessionId>.json`.
- Crash recovery: restores draft automatically only when there is no active local draft — never overwriting your live input.

---

## How we differ from similar plugins

| Capability | dsh-easyrewrite | Other recall/edit plugins |
| :--- | :---: | :--- |
| Recall | ✅ | Basic capability |
| **Seamless replacement** (feels like a *native* feature — frictionless edit-resend) | ✅ | Basic capability, but ours is **more refined** |
| **Lazy commit** (context changes only after you confirm; closing mid-way changes nothing) | ✅ | Some competitors edit immediately, causing cache-hit / context issues |
| **Bubble inline edit (Rewrite)** | ✅ | **No comparable feature in any competitor** |
| **Version pager < X >** (switch history versions — a **gold-standard design** proven by countless Chatbox users) | ✅ | **No comparable feature in any competitor** |
| **Draft persistence + timeout auto-backup + crash recovery** (solid recovery that protects every bit of your thinking) | ✅ | **No comparable feature in any competitor** |
| **Attachment-preserving edit resend** | ✅ | No comparable feature in any competitor |
| **Official extension points only** (zero source patches, clean uninstall) | ✅ | Competitors rely on source patches — hard to uninstall, complex dependencies |
| Trilingual UI & i18n | ✅ | Few have proper i18n; we natively support multiple languages with three presets |
| **Every feature can be toggled off** | ✅ | **No competitor does it better** |

---

## Design philosophy

**1. Simple to use, easy to onboard, compatible by contract**

- Interactions need no manual: **click the bubble to edit, recall key sits beside copy** — no new concepts, no new entry points.
- Sensible defaults: the default settings are the right choice for most scenarios; install, restart, done.
- Compatibility is a hard promise: only official extension points (keyed slot override, official `sessions.fork` RPC, official components & design tokens) — **no source patches, no brittle internal APIs**, actively adapted across DSH releases.
- Uninstall restores everything; nothing of your install is left behind.

**2. Faithful to the original experience — seamless & invisible**

- UI language follows dsh's native design (grey-blue palette, rounded corners, pills, official icons), dark/light theme aware — feels like an official feature, not "another plugin skin".
- Original interactions stay intact: copy key, hover timestamps, bubble look — all preserved.
- **Invisible**: day-to-day use barely notices the plugin — features live where you expect them, results match intuition; no popups, no interrupted rhythm.
- **Lazy commit** is the foundation: entering edit mode or confirming a recall is purely local draft state; **context changes only at "确定" (rewrite) or "发送" (recall)**. Close dsh mid-way and nothing moves.
- **Seamless replacement**: after a recall it *feels* like the original conversation was edited — the old session is archived, a same-titled replacement takes over, and your edited text is sent for you. No "a new conversation appeared" split.
- **Bubble edit (landing soon)**: click the bubble to edit in place, what you edit is what you send — the natural extension of the same seamless philosophy.

**3. Persistent & accident-proof**

- Edit/recall drafts **persist per session**: switching chats, refreshing, even restarting dsh — progress resumes where you left it. No "lost half-written" moments.
- In overwrite mode the pre-recall draft is restored after both send and cancel — **no data loss on any path**.
- Long-idle pending drafts auto-backup to local files (removed once handled) — a safety net for the extreme case.
- Every destructive step has a confirm and an undo path: confirmation capsule, × cancel, one-pending-per-session — **mistakes are recoverable, data is never lost**.

**4. Complete logging, fast diagnosis**

- Every client step (load, confirm, pending, send-hook, fork, resume) is reported to the host and written to a unified log: `$DSH_HOME/dsh-easyrewrite.log`.
- Uniform format (JSON lines: time / level / tag / message / data) — one reproduction is enough to locate the issue, no back-and-forth descriptions.
- Host behaviour lands in the same log (requests, rejection reasons, exceptions), so both halves reconcile on one trail.
- Logs stay local; nothing is uploaded.

**5. Continuously updated, actively compatible**

- Follows DSH releases (rc.x → stable); upstream API changes are adapted promptly.
- Semantic versioning + CHANGELOG; breaking changes announced in advance.
- Community-driven: issues and PRs answered, new ideas and scenarios folded into the roadmap.

---

## Install

```sh
# npm (published)
dsh plugin --profile web add dsh-easyrewrite
# or from GitHub
dsh plugin --profile web add github:Renzic-Stone/DSH-EasyRewrite
```

Restart `dsh web`, hard-refresh (`Ctrl+Shift+R`), done.

> A note on **when recall works**: DSH forks only at closed-turn boundaries, so a message inside a still-open turn cannot be truncated yet — wait for the reply to finish, then recall. (The UI tells you: `该消息所在回合尚未结束…`)

---

## Debugging

Every client step is reported to the host and written to a unified log:

```
$DSH_HOME/dsh-easyrewrite.log   # e.g. ~/.dsh/dsh-easyrewrite.log
```

JSON lines: `{ t, level, tag, message, data }`.

---

## Structure

```
dsh-easyrewrite/
├── lib/index.js          # host half: boundary resolution + /bubble/recall, /bubble/log
├── src/client.src.js     # client template (icons inlined at build)
├── assets/               # recall / edit icons (PNG, theme-adaptive via CSS invert)
├── build.mjs             # assets → data-URL → lib/client.js
├── DESIGN.md             # full interaction design (v1.0, 20 product decisions)
├── PROJECT_PLAN.md       # roadmap, architecture, git workflow
└── docs/                 # api-facts, m0-verify
```

---

## License

MIT
