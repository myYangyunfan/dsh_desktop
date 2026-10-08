# DSH Desktop — Issue Coverage Record (local-only work)

Status of all open GitHub issues (myYangyunfan/dsh_desktop) as resolved by
local, uncommitted working-tree changes. NOT pushed to any remote (per user
instruction: "不要同步到远程仓库，本地处理就可以").

## Fixed & test-verified (working tree)

| # | Title | Fix location |
|---|-------|--------------|
| 48 | profile package.json reset by syncCompanionPlugins | profile-reconcile.js backs up `.broken-<ts>` before rebuild + preserves user bundles |
| 54 | WSL config error crashes startup | main.js resolveBackendConfig catches WSL error → backendMode='local', wslFallbackReason |
| 65 | built-in plugins missing dist build | billion-context-dsh dist/ now present/built. ~~graph-memory dist/~~ **retired 2026-10-07**: `graph-memory` was dropped from the bundled plugin set (39 → 28, user-requested removal), its `assets/plugins/graph-memory/` source tree is gone so that half of this fix no longer applies. |
| 66 | closing plugin removes others in same insert block | plugin-manager-patch.js regex: non-greedy subtree + negative lookahead |
| 67 | file-revert expands `$` in oldText + only first match | main.js uses content.split(newText).join(oldText) |
| 68 | file fence rejects previews in ~5s after new session | main.js sessionFilesSignature() cache invalidation |
| 69 | out-of-range webPort crashes startup | main.js chooseStableWebPort: Number.isInteger + 0<port<=65535 |
| 70 | concatFiles write stream lacks error handler | client-updater.js out.on('error') + writeError tracked, rej on write error |
| 71 | session notify: corrupted log loses turn/end + non-string id | session-watcher.js scanZstdFrames skips garbage; non-string id fix + tests |
| 72 | shortcut dedup compare always false | main.js cleanupDir `e.name.toLowerCase()==='dsh desktop.lnk'` |
| 73 | profile self-heal leaves orphan list rows | profile-patch-heal.js dedupePatchEntries subtree boundary |
| 74 | inspect-session only decodes first frame | scripts/inspect-session.js uses scanZstdFrames |
| 75 | check-syntax false-positive detached async | scripts/check-syntax.js stripStringsAndBlockComments first |
| 76 | desktop-validity summary contradicts detail | desktop-validity.js missing main = error not warning |
| 77 | transformExposeFix rc.7 anchor-missing | transformExposeFix (DYNAMIC_SETTINGS_ANCHOR) |
| 78 | balance query fails on http:// endpoint | balance.js fetchJson protocol dispatch + 3xx redirect |
| 79 | menu.action payload can override caller action | preload.js `{...(payload||{}), action}` |
| 80 | plugin HTTP redirect Location unresolved | main.js new URL(location,url) + protocol dispatch |
| 81 | saveSettings non-atomic (rmSync before rename) | updater.js atomic rename, no rmSync |
| 82 | delete session leaves workspace state refs | patch-session-manage.js deleteSession detach loop |
| 83 | file fence path case-sensitive on Windows | main.js isUnderFileRoots normalize case on Windows |
| 84 | software update failure (redirects/proxy) | client-updater.js resolveHttpProxy/rawRequest + updater.js GitHub discovery |
| 36 | agent preset many → top ones don't display | patch-menu-viewport.js (dsh-client-ui-primitives menu max-height + y-clamp), wired in main.js/after-pack.js/patch-deps.js |

## Implemented as new feature (local, uncommitted)

| # | Title | Fix location |
|---|-------|--------------|
| 85 | sidebar ⋮ menu + right-click "打开项目目录" | scripts/patch-open-project-dir.js (17 anchors: project/session row open-folder item + right-click onContextMenu + getAnchorRect 4-side rect) + dsh-session-manager bridge `window.__dshDesktopOpenDir` (assets/plugins/dsh-session-manager/lib/client.js:229) + wired in patch-deps.js/main.js(applyOpenProjectDirFix)/after-pack.js + scripts/test/unit-open-project-dir.test.js (3 tests) |

## Out of scope for this repo (upstream / communication / installer)

| # | Title | Reason / disposition |
|---|-------|----------------------|
| 60 | plugin store auto-translate consumes model balance | Feature lives in UPSTREAM third-party plugin `dsh-market` (repo `git+https://github.com/dsh-market/dsh-market.git`, bundled v1.11.1). No translate/LLM/balance code in desktop shell or bundled source. Clean fix belongs upstream (add a disable option there). Modifying the compiled bundle here would be fragile + overwritten on update. |
| 58 | installer optional plugins | Installer (NSIS) feature request; not a desktop-shell code change. |
| 52 | recommend third-party right-click menu plugin | Communication/recommendation issue. |
| 50 | DSH Meme Hub ecosystem listing | Communication/ecosystem issue. |

## Verification
- Full unit suite: `node --test scripts/test/*.test.js scripts/test/*.test.mjs` from dsh-desktop → 356 tests, 356 pass, 0 fail (353 baseline + 3 new #85 tests).
- check-syntax gate passes (all entry files).
- #85 patch verified idempotent in repo node_modules (apply → 已应用, re-run → 已应用跳过); MARKER + injected code confirmed present in dsh-client-ui-workspace/lib/client.js.
- **Additional fix (post-#85):** `scripts/patch-deps.js` dev-path blocks for menu-viewport(#36) / session-manage(#82,#48) / session-persistence were passing the repo root instead of `node_modules` root, so they silently no-op'ed in dev. Corrected to `path.join(root,'node_modules')`; running `node scripts/patch-deps.js` now confirms all 5 target files are hit (已应用跳过).
- All changes are uncommitted working-tree modifications in dsh-desktop/. No push performed.
