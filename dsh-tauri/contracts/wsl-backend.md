# 契约 6：WSL 托管后端

> **单一事实源**：WSL 模式下「设置 → 保存 → 重启 → boot 链 → 内核 spawn →
> 就绪 → 探活 → 收割 → 降级」的全链语义。蓝本 = Electron 线
> `dsh-desktop/wsl-backend.js`（全量移植对象）+ `ee7e420~1` main.js 的 WSL
> 接线段（`resolveBackendConfig` / `killTree` / `startServer` / `wsl-config`
> 三 IPC）。**语义照抄，不发明**——Electron 线的每个行为决策都有真实用户机
> 实测背书（issue #54 回落、#126 编码、#87 回退虚假成功）。
>
> 现状（v0.5.2）：Tauri 侧仅有配置存取三通道（`commands/wsl.rs`），保存
> `backend=wsl` 被 061a8ba 诚实拒绝。本契约为完整实装的落地目标态。
> 配套设计：`docs/wsl-backend-design.md`（架构 + 文件级改动清单）。

## 0. 术语与总览

```text
backend（后端模式）
  local —— 内核 = 客户端 payload 自带 node_modules（现状，零变更）
  wsl   —— 内核 = WSL 发行版内 npm 安装的 @deepseek-ai/dsh，
           壳经 wsl.exe 在 WSL 内拉起；profile/插件/补丁数据同在 WSL 内，
           Windows 侧经 UNC 路径（\\wsl.localhost\<distro>\...）读写。
```

WSL 模式下的角色分摊（Electron 实证语义，逐条照抄）：

| 环节 | local 模式 | WSL 模式 |
|------|-----------|----------|
| node 运行时 | vendor node（`<app>/vendor/node/node.exe`） | WSL 发行版内登录 shell PATH 上的 node（fnm/nvm/apt 均可） |
| 内核包 | payload `node_modules/@deepseek-ai/dsh` | `<installDir>/agent/node_modules/@deepseek-ai/dsh`（WSL 内 npm 安装） |
| 内核数据 DSH_HOME | Windows `~/.dsh`（或 `DSH_HOME` env） | WSL 内 `<installDir>`（Linux 路径）；Windows 侧进程经 UNC 等价路径读写 |
| boot 链（插件同步/补丁/guard） | Windows 侧执行，home=本地 | **仍在 Windows 侧执行**，home=UNC 路径，`wslMode:true` 布局 |
| 内核 spawn | 直接 spawn vendor node | spawn `wsl.exe -d <distro> -e sh -lc "<cmd>"`，cmd 内 exec node |
| 端口 | 壳先 `choose_stable_port` 再传 `--port <p>` | `--port 0`（WSL 内 OS 分配），实际端口从就绪行 URL 解析 |
| 探活 | Windows `127.0.0.1:<port>` | 同左（WSL2 localhost 转发，Electron 实证可用） |
| 收割 | taskkill /T /F（或 killpg） | WSL 内按 pid 文件 kill + 杀 wsl.exe 包装进程；**绝不 `wsl --terminate`** |
| 探测失败（启动期） | —— | **回落 local 模式继续启动**（issue #54），不进恢复页 |

## 1. 设置契约（settings.json + env 覆盖）

### 1.1 持久化键（扁平键，与 Electron 同键同文件）

文件：`%APPDATA%/dsh-desktop/settings.json`（`shell_core::DshPaths::settings`）。

| 键 | 类型 | 语义 | 默认 |
|----|------|------|------|
| `backend` | `"local" \| "wsl"` | 后端模式 | `"local"`（键缺失 = local） |
| `wslDistro` | string | WSL 发行版名 | `""`（空 = 自动检测：`wsl -l -q` 首个非系统发行版） |
| `wslInstallDir` | string | WSL 内安装目录（Linux 绝对路径） | `""`（空 = `<WSL $HOME>/.dsh-desktop`） |

- 空值存空串、读取端 default 兜底（现状 `commands/wsl.rs` 语义保留）。
- 旧嵌套键 `wslBackend:{mode|backend, wslDistro, wslInstallDir}` 的迁移
  读取保留（扁平键优先），不清理。
- **改动的生效时机：重启客户端**。保存成功返回 `restartRequired:true`，
  设置页（dsh-wsl-settings 插件）据此提示「重启应用后生效」。

### 1.2 环境变量覆盖（优先级高于 settings；Electron 同名）

| env | 语义 |
|-----|------|
| `DSH_DESKTOP_BACKEND` | 覆盖 `backend`（测试/高级用户通道） |
| `DSH_DESKTOP_WSL_DISTRO` | 覆盖 `wslDistro` |
| `DSH_DESKTOP_WSL_DIR` | 覆盖 `wslInstallDir` |

解析优先级：`env > settings 扁平键 > 旧嵌套键 > 默认`。

### 1.3 安装目录校验（保存与解析共用，失败即拒绝）

1. 必须以 `/` 或 `~` 开头（WSL 内绝对路径）；`~` 前缀在解析时展开为
   WSL 内 `$HOME`。
2. **不得含**：空白字符与 shell 元字符 `` $ ` ; & | < > " ' ( ) \ `` 及
   控制字符（目录会被拼进 `sh -lc '<cmd>'` 单引号内插——这是注入面，
   Electron `INSTALL_DIR_FORBIDDEN` 同规则）。正则：
   `[\s$`;&|<>"'()\\\r\n\t]`。
3. 发行版名（`wslDistro`）允许含空格（经 wsl.exe argv 传递，不拼进命令串）；
   但显式指定的 distro 不在 `wsl -l -q` 实测名单内时按配置错误拒绝
   （防 UTF-16 残留字符形态的「名字」——issue #126 防御的延伸）。

### 1.4 WSL 内目录布局（Electron wsl-backend.js 头注释同构）

```text
<installDir>/agent/node_modules/@deepseek-ai/dsh   当前生效内核
<installDir>/agent-prev/...                        上一版本（回退锚点）
<installDir>/agent-staging/...                     npm 安装 staging（原子切换）
<installDir>/dsh.pid                               内核 pid（收割用）
<installDir>/profiles、sessions、settings.yaml     内核自身数据（DSH_HOME=<installDir>）
```

配套插件**不**经 wsl.exe 同步：boot 链在 Windows 侧经
UNC（`\\wsl.localhost\<distro><installDir 的反斜杠形态>`）直接写入 WSL 侧的
effective DSH home 的 `profiles/`（与 Electron `effectiveDshHome()` 语义一致）。
Agent 预设自 v1.0.0 起客户端完全不写（随包预设子系统整体移除）。

## 2. 命令契约（bridge 三通道，payload 形态不变）

载荷形态与 `bridge-api.md §2.4` / 设置页插件
`dsh-desktop/assets/plugins/dsh-wsl-settings/lib/client.js` 的消费面逐字段
一致（该插件已存在且按完整形态消费，**本契约解锁的是 Rust 侧实现**）。

### 2.1 `wsl_config_get`（`dsh:wsl-config` → `window.dshDesktop.wsl.getConfig`）

```jsonc
{
  "backend": "local",            // 实际生效模式（运行态，非配置值；探测中/回落时为 "local"）
  "wslDistro": "",               // 已保存配置原样回显
  "wslInstallDir": "",
  "status": {                    // 当前 backend 实例的探测快照
    "configured": false,         // true = WSL 后端已配置且探活通过（运行态）
    "distro": "",                // 解析后的发行版名（含自动检测结果）
    "installDir": "",            // 解析展开后的 Linux 绝对路径
    "nodeVersion": "",           // WSL 内 node --version（探测成功才有值）
    "npmVersion": "",
    "agentVersion": "",          // <installDir>/agent 的 package.json version；空 = 未安装
    "lastError": ""              // 非空 = 最近一次探测/运行错误（可展示）
  },
  "fallbackReason": ""           // 非空 = 本次启动 WSL 探测失败已回落 local 的原因
}
```

- **异步实现**（探测含 spawn wsl.exe，上限见 §4.4），不得阻塞 IPC 线程。
- local 模式（未配置或已回落）：`status.configured=false`，`lastError=""`
  （local 不探测；回落态的错误在 `fallbackReason`）。

### 2.2 `wsl_config_save`（`dsh:wsl-config-save` → `saveConfig`）

入参：`{backend, wslDistro, wslInstallDir}`（均 string，服务端 trim）。

- 校验：§1.3 规则。失败 → `{"ok":false,"error":"<人话>"}`（不 Err——插件
  消费 `r.error` 展示）。
- `backend="wsl"`：**先全量预检**（= §4.1 configure 探测链，异步上限 120s）。
  预检失败 → `{"ok":false,"code":"E_WSL_*","error":"<人话>"}`，**不落盘**。
  预检通过 → 落盘三键 → `{"ok":true,"restartRequired":true}`。
- `backend="local"`：直接落盘（不探测）→ `{"ok":true,"restartRequired":true}`。
- 061a8ba 的「暂未支持」拒绝随实装移除（解锁条件：supervisor WSL 分支
  落地，见 design 文档 §里程碑 M1）。

### 2.3 `wsl_recheck`（`dsh:wsl-recheck` → `recheck`）

用**已保存配置**强制重新探测（= `wsl_config_get` 同形态；`status` 为
force-refresh 结果）。预检失败不改变已保存配置，错误进 `status.lastError`。

## 3. 错误码（WSL 域，新增——落地时追加进 error-codes.md §7）

按 error-codes.md 口径（`{code, message, detail?}`；**新增码只追加**）：

| code | 语义 | 典型场景 |
|------|------|----------|
| `E_WSL_UNAVAILABLE` | WSL 不可用：wsl.exe 缺失 / `wsl -l -q` 无发行版 / 发行版启动失败 | 未装 WSL、仅 docker-desktop 系统发行版 |
| `E_WSL_NO_NODE` | 发行版内缺可用 node/npm | configure 探活 `node --version` 失败 |
| `E_WSL_DIR_INVALID` | 安装目录非法（§1.3） | 含空白/shell 元字符、非绝对路径 |
| `E_WSL_PROBE` | WSL 探活失败（configure 之外的探测） | `$HOME` 解析失败、版本读取失败 |
| `E_WSL_INSTALL` | WSL 内 npm 安装/升级失败（ensure_installed / 版本对齐） | staging 安装超时、入口校验失败 |

规则（沿 error-codes.md §6）：

1. `wsl_config_save` 的预检失败以 `{"ok":false,"code","error"}` 返回（插件
   展示 `error`，`code` 供程序识别）。
2. **启动期探测失败不是 command 错误**：走 §5 回落路径，原因进
   `fallbackReason`（状态值，不入错误码表——同「恢复页状态值不入表」口径）。
3. 恢复页触达走 `SupervisorEvent::CrashLoop` 事件路由 + `recovery_state` 状态值（非错误码；§6 规则 4 同口径——WSL 模式崩溃环/假死/看门狗与 local 共用同一链）。
4. `E_WSL_INSTALL` 仅 M2（版本对齐安装）起用；M1 的 ensure_installed 失败
   同码（首装即安装）。

## 4. 运行时契约（supervisor WSL 模式）

### 4.1 configure 探测链（保存预检 / 启动解析 / recheck 共用）

```text
wsl -l -q（30s）
  ├─ wsl.exe 缺失/退出非零/用法文本 → E_WSL_UNAVAILABLE
  ├─ 解码：BOM UTF-16LE / 无 BOM UTF-16LE（奇偶 NUL 启发式）/ UTF-8 三形态
  ├─ 名单过滤：剥离 NUL 残留、剔控制字符行；空名单 → E_WSL_UNAVAILABLE
  └─ distro 解析：显式配置值（须在名单内）｜自动 = 首个非 docker-desktop 系发行版
$HOME 解析：sh -lc 'printf %s "$HOME"'（60s）→ 失败 E_WSL_PROBE
installDir：§1.3 校验 + ~ 展开 + 默认 <home>/.dsh-desktop
node/npm 探活：sh -lc 'node --version' / 'npm --version'（各 90s）→ 失败 E_WSL_NO_NODE
UNC 映射：\\wsl.localhost（探测失败回落 \\wsl$）+ distro + installDir 反斜杠化
```

- 全部经 `wsl.exe -d <distro> -e sh -lc <cmd>`：`-e` 跳过默认 shell 二次
  解析；`sh -lc` 登录 shell 使 fnm/nvm 的 node 进 PATH（**不双重嵌套登录
  shell**——Electron 已清理过该问题）。
- 非登录态命令（如 `wsl --status`）不得用作可用性判定（061a8ba 实证：
  VM 起不来时 exit 0 = 假阳性）；可用性以 `wsl -l -q` 名单为准。

### 4.2 boot 链（Windows 侧执行，home=UNC）

WSL 模式下守护瀑布步骤调整（其余逻辑——快照/二层修复/三层回滚/崩溃环/
看门狗——**两模式共用，零变更**）：

| 步骤 | local | WSL | 依据（Electron main.js） |
|------|-------|-----|--------------------------|
| **[0] ensure_installed** | ——（payload 自带） | 预检 `<installDir>/agent/.../bin.js` 存在且版本 == 客户端 payload 内核版本；缺失/漂移 → WSL 内 npm staging 安装 + 原子切换（§4.5）。**必须先于插件/补丁链**：补丁目标含 `<home>/agent/node_modules`，agent 未就位则补丁锚点全空 | `await wslBackend.ensureInstalled()` 先于 `syncPlugins()`（main.js 4957-4958） |
| farm-repair（junction 去材料化） | 跑 | **跳过**（WSL 内 profile fallback 由内核自行 heal；junction 是 Windows 本地概念） | `if (isWslMode())` 分支跳过 repairProfileFallback |
| sidecar boot（repair/sync/patches/compat-pin/preflight 五步） | `--app-dir <app>` | `--app-dir <app> --home <UNC> --wsl`：integration `wslMode:true` 走 `wslLayout` 布局（`<home>/agent/node_modules` + profile 两副本——patch-target-resolver.js 已实现，本契约只接线） | ensurePluginIntegration 的 `wslMode: () => isWslMode()` |
| koffi 预检 + picker overlay | 跑 | **跳过**（只作用于本地内置 dsh 的 win32 预编译二进制） | WSL 分支不调 runKoffiPreflight |
| guard 快照/体检/回滚 | home=本地 | home=**UNC**（plugin-guard 纯 Node fs，UNC 可用） | ensureGuard 的 `getHome: () => effectiveDshHome()` |
| 端口 choose_stable_port | 跑 | **跳过**（`--port 0`，实际端口从就绪行解析） | `expectedPort: null`（稳定端口持久化只作用于本地 spawn） |

**顺序红线**（Electron 同款）：先建 loading 窗（用户可见反馈，首装数分钟
必须有反馈）→ configure 探测 → **ensure_installed** → 插件/补丁链（sidecar
boot）→ guard 快照 → 端口（跳过）→ 内核 spawn。boot 看门狗（5 分钟）对
WSL 模式须放宽为 35 分钟（npm 首装 30 分钟超时 + boot 链）——或安装期发
进度事件另计（M1 取简单值 35 分钟）。

### 4.3 内核 spawn 与就绪

命令形态（与 Electron `spawnServer()` 逐参一致）：

```text
wsl.exe -d <distro> -e sh -lc
  "cd <installDir> && rm -f dsh.pid && echo $$ > dsh.pid \
   && exec env -u DSH_WEB_URL -u DSH_SESSION_ID -u DSH_SESSION_JSONL \
      -u DSH_SHELL \
      DSH_HOME=<installDir> \
      node --expose-internals \
      <installDir>/agent/node_modules/@deepseek-ai/dsh/lib/bin.js \
      web [--no-open] --host 127.0.0.1 --port 0"
```

- `--no-open` 按内核版本门控（`semver::needs_no_open_flag`，rc.8 起）。
- `--expose-internals`（W1 问题一，2026-08）：node 级参数（bin.js 之前，
  进 `process.execArgv`）——内核 cordis-plugin-loader 据此取 Node 内部 ESM
  loader；缺失则 HMR 插件启动即抛
  "--expose-internals is required for HMR service"，且 profiles/web 插件
  裸包名 import 解析不到（internal loader 依赖）。local 模式同款（spawn_spec
  `node_args()`）。
- `echo $$ > dsh.pid`：登录 shell 自身 pid 写文件，`exec` 后即内核 pid。
- **环境净化在命令串内完成**（`env -u`）：WSL 模式不适用 ENV_ALLOWLIST
  （Windows 环境块不传进 WSL；wsl.exe 只透传 WSLENV 白名单变量）。
  `env -u` 清单**不含 NODE_OPTIONS**（W1 问题二）：登录 shell 加载用户
  profile 后 NODE_OPTIONS 是用户 WSL 侧自己的堆设置，清掉会让大依赖树
  npm/内核解析 OOM；宿主 Windows 环境块本就不传进 WSL，无「宿主残留」可清。
- 就绪行：内核 stdout 经 wsl.exe 管道透传（UTF-8），`ReadyLineParser`
  照常解析 `dsh web: http://127.0.0.1:<port>`。
- **实际端口 = 就绪行 URL 的端口**（非 spawn 传入值）。spawn_and_wait_ready
  的 port 参数在 WSL 模式仅作日志/事件参考；探活（probe_loop/http_alive
  热探）必须用 actual port。
- 就绪 URL 端口落在 Chromium 受限端口表（`UNSAFE_PORTS`）→ 按本次拉起
  失败处理（杀掉重试，瀑布二/三层承接；对齐 Electron `restrictedPortOf`
  两模式共用语义）。稳定端口持久化（`last_port`）**不写** WSL 模式的
  actual port（Electron `expectedPort:null` 语义）。
- Job Object：照常绑定 wsl.exe 包装进程（壳被强杀时至少收割 wsl.exe；
  WSL 内进程收割见 §4.6 残余风险）。

### 4.4 探活

- HTTP 应用层探活（`http_alive`）与假死判定（TCP 通 + HTTP 20×3s 无响应）
  在 WSL 模式**逻辑零变更**，仅端口源改为就绪行 actual port。
- 连通性依赖 WSL2 localhost 转发（Windows → WSL 内 127.0.0.1 监听），
  Electron 线已实证。mirrored 网络模式同样兼容。`.wslconfig` 显式关闭
  `localhostForwarding` 的环境属不支持配置（探活恒失败 → 崩溃环 → 恢复页，
  `fallbackReason`/恢复页文案指路）。

### 4.5 ensure_installed 与版本锚（D1 决策的 WSL 等价物）

D1 决策「内核版本随客户端发版」在 WSL 模式的等价：**WSL 内 agent 的目标
版本 = 客户端 payload 内核版本**（`dsh-desktop/node_modules/@deepseek-ai/dsh`
的 version，即 `Supervisor::kernel_version` 来源）。无独立 npm 更新链。

```text
预检：sh -lc 'test -f <agentBin> && cat <agentDir>/package.json'
  ├─ 不存在 → 安装 <pkg>@<payload 版本>
  ├─ 版本 == payload 版本 → 通过
  └─ 版本漂移（客户端升级后首次启动）→ 安装新版本（staging + 原子切换）
安装（installAgent，30 分钟超时）：
  set -eu; rm -rf <dir>/agent-staging; mkdir -p …; cd …
  export NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false \
         NPM_CONFIG_AUDIT=false NODE_OPTIONS=--max-old-space-size=8192
  npm install --save-exact --omit=dev --no-audit --no-fund --no-update-notifier @deepseek-ai/dsh@<v>
  test -f <staging>/…/bin.js                       ← 入口校验（防半装）
  cd <dir>; [ -d agent ] && { rm -rf agent-prev; mv agent agent-prev; }
  mv agent-staging agent; echo WSL_INSTALL_OK
（NODE_OPTIONS 堆上限为 W1 问题二修复：600+ 依赖解析默认 ~2GB 堆 OOM，
2026-08 真实 WSL2 实机实证。）
失败：清理 staging（15s 短超时），保留现状，报 E_WSL_INSTALL。
版本号白名单 [A-Za-z0-9._-]+（拼进命令串的注入防御）。
成功判定必须含 stdout WSL_INSTALL_OK 标记（exit 0 ≠ 成功，issue #87 教训）。
```

回退（agent-prev → agent）：M2 就绪失败路径（Electron 1889 行对话框语义
→ Tauri 恢复页动作），M1 仅保留 agent-prev 目录不消费。

### 4.6 收割（kill_kernel / shutdown）

**绝不 `wsl --terminate`**（会终结整个发行版内用户的其他进程）。

- `kill_kernel`（restart / 恢复页重试 / 探活失败 / 应用退出共用）：
  1. `wsl.exe -d <distro> -e sh -lc 'p=<dir>/dsh.pid; if [ -f "$p" ]; then
     kill $(cat "$p") 2>/dev/null || true; fi; rm -f <dir>/dsh.pid'`（30s 上限）；
  2. kill wsl.exe 包装 child + wait（kill_tree 的 taskkill 分支不适用于
     WSL——WSL 内进程不在 Windows 进程树，/T 枚举不到）；
  3. 语义与 Electron `killTree` WSL 分支一致（stop → 杀包装进程 → 300ms
     缓冲后再进入端口探测）。
- `shutdown`（应用退出同步路径）：fire-and-forget 触发上述 stop（不等
  WSL 内退出）+ 杀 wsl.exe 包装进程（Electron `killTreeSync` 同款）。
- 内核退出检测：wsl.exe 包装进程退出（stdout EOF / try_wait）== WSL 内
  内核退出（`-e` + `exec` 语义下生命周期绑定）→ 现有 `on_kernel_exit`
  崩溃环/自动重启逻辑零变更。
- **已知残余风险**（Electron 同款，登记不修复）：壳被强杀时 Job Object
  只收割 wsl.exe，WSL 内内核可能残留。缓解：每次 spawn 前 `rm -f dsh.pid`+
  启动期 ensure 前 stop 旧 pid（§4.3 命令串已含）；下次启动的瀑布重试
  兜底。

## 5. 降级路径（探测失败）

**照抄 Electron issue #54**：启动期 WSL 探测（configure 链）失败 →
**回落 local 模式继续启动**，绝不阻塞、绝不恢复页。

- 已保存的 WSL 配置原样保留；`fallbackReason` 记录人话原因（本次运行期
  有效），`wsl_config_get` 载荷带回设置页展示。
- 回落后的 local 模式行为与「从未配置 WSL」完全一致。
- 用户修复环境（装发行版/装 node）后「重新检测」通过 → 保存或直接重启
  切回 WSL。
- 设置保存期预检失败**不回落**（未落盘，配置未变）。

## 6. effective home（Windows 侧进程的数据落点）

WSL 模式下，Windows 侧一切「读内核数据」的组件必须把 home 从本地
`~/.dsh` 切到 **UNC 路径**（Electron `effectiveDshHome()` 语义）：

| 组件 | 消费 | M 级 |
|------|------|------|
| session-watcher（会话完成通知） | `<home>/sessions` | M1 |
| sidecar boot / guard-* / safe-overlay（`--home`） | profile/补丁/快照 | M1 |
| 插件管理六通道（plugin_list 等 sidecar 命令） | profile patch + bundles | M1（同一 `--home` 通道） |
| 诊断 / 备份 / fence file-open | profile / 会话日志 | M2 |

统一出口：`Supervisor::effective_home() -> PathBuf`（local →
`DshPaths::dsh_home`；wsl → `wsl.unc_home()`），各 sidecar 命令构造点
经此取 home（详见 design §文件级清单）。

## 7. 不变量（防回退锚点）

1. local 模式全链行为**零变更**（所有分支以 `wsl.is_some()` 守卫；不配置
   WSL 的用户无任何可观测差异）。
2. WSL 模式下绝不调用：`wsl --terminate` / `wsl --shutdown`、
   taskkill 对 wsl.exe 的 /T 依赖、本地 vendor node、本地 `bin_js`。
3. 就绪行是**唯一**换页源（KernelReady 单源不变）；WSL 模式 actual port
   在就绪行线程内解析并写入状态，探活环与热探共用。
4. `{"ok":false}` 载荷错误不落盘配置；启动回落不改配置。
5. wsl.exe 输出解码三形态覆盖（BOM / 无 BOM UTF-16LE / UTF-8）是
   `wsl -l -q` 消费的强制前置（issue #126 回归锚点：无 BOM 形态漏判会把
   `d\x00o\x00…` 当发行版名传给 `-d`）。
6. 命令串拼接的每个外部输入（installDir、版本号、distro）必须过白名单
   校验后才允许进入 `sh -lc` 参数。
