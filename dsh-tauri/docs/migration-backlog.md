# Electron→Tauri 迁移收口 Backlog（R1 终审 2026-08-22）

> 基线：ee7e420~1 main.js（44 ipcMain）+ preload.js（49 桥方法）对照 tauri/modular 全量核对。
> 契约面零欠账（43 通道/49 方法全部实装，contract_audit 机器锚定）；欠账全部在非 IPC 壳职责层。
> 难度 S=<半天 M=1-2天 L=需专项。完成一项划一项并注明 commit。

## 第一波（紧急/高价值）

- [x] **C3 内核与壳日志落盘（S-M）**（2026-08-22：logging.rs 极早期落盘+panic hook+指针文件；supervisor stdout/stderr→dsh-web.log、file_log→desktop.log 经 append_capped 4MB 轮转+凭据脱敏 scrub_secrets；B2+RV8 P1-4 合并）：supervisor 全走 println/eprintln，GUI 进程 stdout 丢弃；`userData/logs/dsh-web.log` 无人写恒空——**safe-overlay 崩溃自愈层实际失效**（无日志可解析）、诊断报告无附件。落点：spawn_kernel 的 stdout/stderr 线程追加写日志（4MB 封顶语义照搬 Electron capLogFile）+ boot/路由日志写 desktop.log。是 C6/C14 的前置。
- [x] **C1 会话完成通知全链（M）**（2026-08-22 完成：session-watcher CLI 行协议 + session_notify.rs Electron 保真门控 + 30s/15s 双层限流 + 通知跳转主窗定向；N2 对抗验收 32 测 + 四 P1 修复（重启风暴退避/emit_to 注释修正+垫片 isMainWindow 守卫/C2 30s 节流/模块公开））：session-watcher crate 已写好但零接线；shim 已监听 notification-jump 但无人发射；notifyOnTurnEnd 是死开关。落点：sidecar `session-watch` 长驻子命令复用 payload session-watcher.js（stdout 行协议）→ Rust 消费 NotifyThrottle/CurrentSessionTracker + notification。需补 30s/会话+15s 全局限流。
- [x] **C2 会话完成即刷余额（S）**（2026-08-22：trigger_fetch_throttled 挂 turn-end 首行，30s 节流与轮询环/强制路径四路互不冲突[TA15 竞态实证]）：balance.rs trigger_fetch 挂 turn-end 事件（W3 挂账点 docs/balance-architecture.md:210）。
- [ ] **C11 托盘差距（S，2026-08-22 半开）**：左键唤起主窗（Win/Linux）已落（T1）；closeToTray 假开关与托盘会话通知 checkbox、首隐藏气泡未做。
- [x] ~~**C10 宠物窗三件套（S）**~~ **作废（2026-10-07）**：桌宠插件 `harness-pet` 已随 v1.0.0 内置插件精简（39 → 28）按用户点名移除，`assets/plugins/harness-pet` 源目录整树删除——宠物窗的位置记忆 / 最小化自动弹出（`pet_set_auto_open` 只写不读）/ 默认右下角三件套失去服务对象，不再补做。
- [ ] **C16 页面 console.error 落 page_error（S）**：smoke 全在 grep 这些词，排障价值高；垫片包 console.error（5s 节流）。

## 第二波（体验补全）

- [x] **C4 更新链激活（S）**（2026-08-22 改写：**双源 releases + sha256 路线**，非 minisign——updater_client.rs（GitHub digest/边车校验 fail-closed、Gitee 单源无锚拒绝、跨源换源重试）+ menu.rs 安装链 + CI sha256 边车/mirror-gitee + verify-update-sources.mjs；check-agent-update 退役）
- [x] ~~**C5 文件预览静态服务（S-M）**~~ **作废（2026-10-07）**：本项要救的「站内 HTML 预览降级」是 `dsh-client-file-changes`（「文件」视图 + 一键还原）的功能面，该插件已随 v1.0.0 内置插件精简（39 → 28）按用户点名移除（与内核官方同名包重叠、镜像副本遮蔽官方包），其还原依赖的壳侧 `file_revert` 亦退役——**降级问题不复存在**。preview-server 仍承担静态页与 `/__diag/` 诊断端点，不需要为此项加 fence 路由。文件浏览/预览入口见 `dsh-better-sidebar`（仍在包内）。
- [ ] **C8 备份/诊断导出系统对话框（S）**：tauri-plugin-dialog save/open。
- [ ] **C9 拖拽路径回填（S-M）**：onDragDropEvent→file.path（shim 已读恒空）。
- [ ] **C12 M3 主题（M）**：preload 的 Material Design 3 注入整体搬垫片（纯页面侧）。
- [ ] **C15 快捷方式运行时维护（S 低优先）**：如遇「图标消失」反馈再补。
- [ ] **C18 agent 更新半截体验（M）**：维持 D1 裁撤则菜单文案改「随客户端发版升级」。

## 决策记录（先补文档再议）

- [ ] **C7 外部看门狗（M）**：倾向正式裁撤（Tauri 崩溃环已内化）——补 roadmap 决策记录即可。
- [ ] **C13 渲染进程恢复状态机（M）**：同上倾向维持简化（WebView2 自处理 renderer 崩溃）——补记录。

## 专项（既定规划）

- [ ] **C17 WSL 完整托管（L，进行中）**：JS 半边（0202fa8d）+ Rust 半边（X1，X1b 验尸确认 7 项全完成：wsl-backend crate/ensure_installed 原子切换/三层收割/慢环熔断三件/SliceBudget 睡眠安全/koffi 契约）均已落；**真机验证清单待用户重启开启虚拟化**（bcdedit hypervisorlaunchtype auto）。

## 风险（迁移了但语义漂移）

- [ ] **浮窗与主窗共享 localStorage（半开）**：FW1 已修浮窗白屏（看门狗+mount-then-hide）；localStorage 隔离（Electron persist:dsh-float 等价）未做，float_session_preset 覆盖主窗选中态风险仍在。落点：浮窗独立 data_directory 或 URL 参数传会话（S-M）。

## 有意裁撤（勿动）

内核自动更新链（D1）、自研客户端更新链（D2→updater）、GPU 守卫、Electron 权限处理器、crashReporter、deep-link/自启/全局快捷键（Electron 本就没有）。
注：ipc-commands §2.4 裁撤表里 `guard:action` 的裁撤理由写错（写成 GPU 守卫，实为 plugin-guard 设置页 UI）——设置页手动快照/回滚入口消失，未见用户确认，随 C1 波次补或补裁撤依据。
