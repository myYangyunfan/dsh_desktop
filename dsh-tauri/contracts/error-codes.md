# 契约 5：统一错误码

> 沿用 PR #121 的 PluginError 形态：`{code, message, detail?}`。
> Rust 侧 `BridgeError`（serde 序列化）→ 垫片转 `Error(message)`，插件按 message 前缀
> `[CODE]` 识别。**code 是稳定契约，message 是人话可变。**

## 1. 通用壳错误

| code | 语义 | 典型来源 |
|------|------|----------|
| `E_OK` | 成功（不作为错误出现） | — |
| `E_INTERNAL` | 壳内部未分类错误 | 任何 crate |
| `E_INVALID_ARG` | 参数校验失败（含超长/类型错） | bridge 参数校验 |
| `E_NOT_FOUND` | 目标不存在（窗口/插件/会话/文件） | 各 command |
| `E_CUT_FEATURE` | 该能力在 Tauri 版已裁撤（自研客户端更新链） | 命令位保留（v0.5.3 起无活跃返回方——`check-agent-update` 菜单动作已整体移除） |
| `E_TIMEOUT` | 下游超时（内核 HTTP / sidecar 探活） | kernel-process / sidecar |
| `E_NOT_IMPLEMENTED` | 能力已规划未实装（占位拒绝，非裁撤——区别于 `E_CUT_FEATURE`） | `BridgeError::not_implemented` 构造器（当前无活跃命令返回方；原占位 `image_paste_save` 已随 dsh-image-paste 插件于 2026-10 裁撤） |
| `E_UNAUTHORIZED` | 调用窗越权：主窗白名单（Electron `pluginManagerIpcAllowed` 同守卫面）外的窗口调插件管理/诊断/备份族或 `restart_service` | app commands（v0.5.2 实装，ipc-commands.md §3.3） |
| `E_IMAGE_PASTE` | 剪贴板粘贴图落盘失败（dataUrl 缺失/非法、写盘失败） | bridge commands（`image_paste_save`）。**已退役（2026-10）**：随 dsh-image-paste 内置插件裁撤，命令与 `codes::IMAGE_PASTE` 常量一并移除；码值保留不复用（历史错误串仍可识别）。粘贴图现走内核输入区的图片附件面 |
| `E_AGENT_UPDATE_NETWORK` | npm registry 版本查询双源（npmmirror/npmjs）均不可达 | menu_action `check-agent-update` 最简比对链。**已退役（v0.5.3）**：npm 内核检查链随「内核随客户端分发」移除，`check-agent-update` 菜单动作删除；码值保留不复用（历史错误串仍可识别）。客户端更新网络失败现走 `E_UPDATER_NETWORK` |

## 2. 内核进程域（kernel-process）

| code | 语义 |
|------|------|
| `E_NO_HOST` | 垫片本地降级码（非壳侧命令码）：页面运行在浏览器（无 `__TAURI_INTERNALS__` 宿主）时 `window.dshDesktop` 全方法的安全回退——不误报错误、静默降级。仅存在于 bridge-shim.js，IPC 层永不返回 |
| `E_KERNEL_SPAWN` | vendor-node 或 bin.js 启动失败 |
| `E_KERNEL_PORT` | 端口占用/安全端口选择失败 |
| `E_KERNEL_CRASH_LOOP` | 崩溃环触发（连续崩溃超阈值，进入恢复页） |
| `E_KERNEL_NOT_READY` | 就绪行未在期限内出现 |

> **注记（清偿口径）**：`E_KERNEL_SPAWN` / `E_KERNEL_PORT` / `E_KERNEL_CRASH_LOOP`
> 三码**声明保留但无活跃生产方**（不参与 command 返回；仅作历史错误串识别锚点）。
> 崩溃环 → 恢复页的实际链路是 `SupervisorEvent::CrashLoop` 事件路由（route_events →
> `navigate_main` 换恢复页）+ `recovery_state` 状态值（`{state:"no-kernel", reason}` 等，
> 见 data-flow.md §3.2），**并非错误码**。`E_KERNEL_NOT_READY` 除外——有活跃
> `kernel_not_ready` 构造方。

## 3. Sidecar / 插件域（沿用 #121 码表；Rust 编排在 app commands/sidecar + supervisor，执行在 Node sidecar cli.js）

| code | 语义 |
|------|------|
| `E_SIDECAR_EXIT` | Node sidecar 非零退出（detail 含 stderr 摘要） |
| `E_PATCH_ALREADY` | 文本手术幂等命中（already，非错误但上报状态） |
| `E_PATCH_ANCHOR_MISSING` | 锚点缺失（failPolicy=warn 时降级日志；fatal 时阻断 boot） |
| `E_PATCH_ANCHOR_CHANGED` | 锚点漂移（内核小版本变化，需人工重锚定） |
| `E_MANIFEST_INVALID` | cordis.patch.yml / package.json 解析失败（触发 repair） |
| `E_QUARANTINE` | 隔离/恢复操作失败 |
| `E_UPDATE_VERIFY` | 插件更新校验失败（fail-closed，原物不动） |
| `E_WRITE_GATE` | 跨进程写锁冲突（WriteGate，重试或报用户） |

## 4. 围栏 / 文件域（fence）

| code | 语义 |
|------|------|
| `E_FENCE_ROOT` | 路径不在允许的 fileRoots 内（越界拒绝） |
| `E_FENCE_ZSTD` | zstd 会话首帧解析失败 |
| `E_FILE_ATOMIC` | 原子写失败（临时文件 rename 异常） |

## 5. 更新域（tauri-plugin-updater，Phase 4）

| code | 语义 |
|------|------|
| `E_UPDATER_SIGNATURE` | 产物完整性校验失败：sha256 哈希不匹配（`UpdaterError::HashMismatch` 映射）。哈希优先级链：显式参数 > GitHub API `digest` 字段 > `.sha256` 边车资产 > size/下限兜底（v0.5.3 双源 releases 路线；minisign 方案已让位——边车+digest 即可信锚，HTTPS 传输） |
| `E_UPDATER_NETWORK` | 更新源不可达/解析失败：GitHub+Gitee releases/latest 双源并发探测均失败（`Offline`/`SourceUnreachable`/`BadManifest`/`Download` 映射），含「唯一可达源缺本平台资产」场景 |
| `E_UPDATER_CONFIG` | 更新链内部配置态异常（v0.5.3 起更新源为编译期固定双仓库+运行时免配置，此码仅保留给未来可配置更新源接口的未配置态；`DSH_UPDATER_ENDPOINT`/`DSH_UPDATER_PUBKEY` 环境变量已随 tauri-plugin-updater 通道退役） |

## 6. 规则

1. **新增码只追加不复用**；删除码保留占位（返回 `E_CUT_FEATURE` 或 `E_INTERNAL`）。
2. `detail` 字段自由结构（诊断用），插件不得依赖其稳定性。
3. fire-and-forget command 的错误只进日志，不达页面。
4. 崩溃环 / 恢复页场景：主窗切恢复页走 `SupervisorEvent::CrashLoop` 事件路由 + `recovery_state` 状态值（非错误码；`E_KERNEL_SPAWN`/`E_KERNEL_PORT`/`E_KERNEL_CRASH_LOOP` 三码声明保留但无活跃生产方，见 §2 注记）。
5. **入表口径（2026-08 清偿时钉板）**：错误码只覆盖 command 返回的跨进程
   错误面。以下两类形态**刻意不入表**：
   - 恢复页**状态值**（`recovery_state` 的 `{state:"no-kernel", reason}` 等，
     见 data-flow.md §3.2）——那是状态查询的正常返回，不是错误；
   - 内部监督**事件**（探活失败 `ProbeFailed`、假死可疑 `ZombieSuspect`——
     TCP 通而 HTTP 连续无响应的 #122/#129 形态）——只进 desktop.log，终态
     仍归 `SupervisorEvent::CrashLoop` 事件路由（假死受控重启走崩溃环窗口限次，天然防死循环）。

## 7. WSL 托管域（wsl-backend crate，v0.5.3 随 supervisor WSL 分支实装）

契约：`contracts/wsl-backend.md` §3（新码只追加）。返回面：`wsl_config_save`
预检失败 `{ok:false,code,error}`（插件展示 `error`，`code` 供程序识别）；
`wsl_recheck` 强制探测失败进 `status.lastError`。

| code | 语义 | 典型场景 |
|------|------|----------|
| `E_WSL_UNAVAILABLE` | WSL 不可用：wsl.exe 缺失 / `wsl -l -q` 无发行版 / 显式 distro 不在实测名单 | 未装 WSL、仅 docker-desktop 系统发行版、UTF-16 残留字符形态「名字」（#126 防御延伸） |
| `E_WSL_NO_NODE` | 发行版内缺可用 node/npm | configure 探活 `node --version` 失败（登录 shell PATH 无 node） |
| `E_WSL_DIR_INVALID` | 安装目录非法（契约 §1.3：非绝对路径 / 含空白或 shell 元字符） | 目录被拼进 `sh -lc` 单引号内插——注入面防御 |
| `E_WSL_PROBE` | WSL 探活失败（configure 之外的探测） | `$HOME` 解析失败、UNC 主机覆盖非法、后端未配置即调用 |
| `E_WSL_INSTALL` | WSL 内 npm 安装/升级失败（ensure_installed / 版本对齐） | staging 安装超时、入口校验失败、**exit 0 但无 WSL_INSTALL_OK 标记**（issue #87）、安装目录不可创建 |

规则（沿 §6 口径在 WSL 域的投影）：

1. **启动期探测失败不是 command 错误**：走回落路径（issue #54——回落 local
   继续启动，配置保留），原因进 `wsl_config_get` 的 `fallbackReason`
   （状态值，不入错误码表）。
2. 保存期预检失败**不落盘**（`{"ok":false}` 载荷错误不变更配置）。
3. 恢复页触达仍只有 `E_KERNEL_CRASH_LOOP` 一个码（§6 规则 4 不破——WSL
   模式崩溃环/假死/看门狗与 local 共用同一链）。
