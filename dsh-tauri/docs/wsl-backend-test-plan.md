# WSL 托管后端 — 测试策略

> 被测对象：`contracts/wsl-backend.md`（语义）+ `docs/wsl-backend-design.md`
> （实现清单）。背景约束：**本机 WSL VM 当前损坏**——M1 落地以 mock 单测
> 为准绿门槛，真机清单延后执行（VM 修复后按 §3 逐项打勾，缺项不得发版
> 宣称「WSL 模式已验证」）。

## 1. Mock 单测面（CI 可跑，M1 全绿门槛）

### 1.1 `wsl-backend` crate（纯函数 + 注桩，参照 Electron 线
`wsl-backend.js` 单测思路——internals.* 注桩）

**text.rs（无进程，纯字节）**——issue #126 回归锚点：

| 用例 | 输入形态 | 期望 |
|------|----------|------|
| BOM UTF-16LE | `FF FE 55 00 62 00…`（"Ub…"） | 正确解出 `Ubuntu…` |
| 无 BOM UTF-16LE | `55 00 62 00 75 00…`（Store 版 `wsl -l -q` 实测形态） | 奇偶 NUL 启发式命中，utf16le 解码 |
| UTF-8（WSL 内 Linux 程序输出） | `76 20 31 38 …` | 走 utf8，启发式不命中 |
| GBK/ANSI 帮助文本 | 中文系统 `wsl -?` 输出 | 不含 NUL，安全 utf8（乱码无害） |
| 空 / <4 字节 / 奇数长度 | 边界 | 不 panic，空串 |
| parse：用法文本 | `Usage:` / `用法:` / `Copyright` 行 | → 空列表 |
| parse：NUL 残留名 | `U\x00b\x00u\x00…`（误按单字节解码形态） | 剥 NUL 自愈出 `Ubuntu` |
| parse：控制字符行 | 含 `\x01`/`\x7f` 的行 | 整行剔除（防 `-d` 参数带控制字符） |
| parse：含空格发行版名 | `Ubuntu-24.04 LTS` | 保留（distro 允许空格） |

**spec.rs（命令串构造快照断言）**——注入面防御：

- `server_cmd`：与契约 §4.3 形态逐字符比对（`cd` → `rm -f dsh.pid` →
  `echo $$ > dsh.pid` → `exec env -u DSH_WEB_URL -u DSH_SESSION_ID -u
  DSH_SESSION_JSONL -u DSH_SHELL -u NODE_OPTIONS DSH_HOME=<dir> node
  <bin> web [--no-open] --host 127.0.0.1 --port 0`）；`--no-open` 门控
  （rc.7 无 / rc.8 有——复用 semver 用例）。
- `stop_cmd`：pid 在/不在两形态幂等（`2>/dev/null || true` + `rm -f`）。
- `install_cmd`：staging → 入口校验 → prev 保留 → 原子 mv →
  `WSL_INSTALL_OK` 尾标记全在场。
- `dir_forbidden` 表：空白/`` $ ``/反引号/`;`/`&`/`|`/`<>`/引号/括号/反斜杠/
  CR/LF/TAB 全拒；`/opt/dsh`、`~/.dsh-desktop` 过。
- `version_valid`：`0.1.0-rc.8`/`latest` 过；`1.0.0; rm -rf /` 拒。
- `unc_dir`：`/home/u/.dsh-desktop` → `\\wsl.localhost\Ubuntu\home\u\.dsh-desktop`。
- `wsl_spawn_args`：`["-d",D,"-e","sh","-lc",cmd]` 严格 argv（无空格拼接）。

**WslBackend + WslInvoker 桩（行为分支）**：

| 场景 | 桩形态 | 期望 |
|------|--------|------|
| configure：自动选 distro | 名单 `[docker-desktop, Ubuntu]` | 选 Ubuntu（系统发行版跳过） |
| configure：全系统发行版 | 名单 `[docker-desktop-data]` | 取第一个，后续 node 探活给出可读错误 |
| configure：无发行版 | 空名单 / wsl.exe ENOENT | `E_WSL_UNAVAILABLE` |
| configure：显式 distro 不在名单 | 名单无 `Debian` | 配置错误（含人话） |
| configure：缺 node | `node --version` exit 127 | `E_WSL_NO_NODE`（含 stderr 摘要） |
| configure：$HOME 解析失败 | 输出非 `/` 开头 | `E_WSL_PROBE` |
| configure：成功 | 全绿 | configured + node/npm 版本 + UNC 就位 |
| ensure_installed：已装且版本齐 | package.json version==payload | 零安装调用（幂等） |
| ensure_installed：版本漂移 | 旧版本 | 走 install_cmd（payload 版本） |
| ensure_installed：安装失败 | exit 1 / 无 OK 标记 | staging 清理命令发出 + 现状保留 + `E_WSL_INSTALL`（**exit 0 但无 WSL_INSTALL_OK 也算失败**——issue #87 锚点） |
| stop：pid 文件缺失 | — | 命令仍发出（幂等），不报错 |
| active_version：坏 JSON | cat 输出垃圾 | None（不 panic） |

### 1.2 supervisor WSL 分支（注桩 WslBackend）

- **actual port 语义**：就绪行 `dsh web: http://127.0.0.1:51731` 出现后
  `Inner.port==51731`（spawn 传入 0）；KernelReady 事件 port==51731；
  probe_loop 消费同一端口（探活线程对 127.0.0.1:51731 发 HTTP）。
- **受限端口**：就绪行端口 ∈ UNSAFE_PORTS → 本次拉起按失败收链（不换页）。
- **kill_kernel 分支派发**：wsl 模式 → invoker 收到 stop_cmd + child 被
  kill/wait；local 模式 → taskkill 路径不变（现有测试锚点不破）。
- **boot 瀑布 wsl 步序**：ensure_installed 先于 sidecar boot；sidecar 调用
  args 含 `--home <UNC> --wsl`；farm/koffi 未调用（Command 构造计数断言或
  invoker/进程工厂注桩）。
- **回落**：configure 失败 → `wsl=None` + fallback_reason 非空 + local 链
  照常走到 KernelReady（端到端注桩级）。
- **看门狗**：wsl 分支超时阈值 35 分钟（参数化注入短值验证判定）。
- **回归锚点**：`regression_v051_restart_whitescreen_anchors` 等
  include_str 断言若因新增分支行漂移，须同步修正而**不得删除断言**。

### 1.3 commands/wsl.rs（契约形态）

- get/recheck/save 载荷逐字段（沿用现有 `wsl_config_payload_contract_shape`
  改写：configured 语义从「恒 false」改为运行态真值 + 探测中形态）。
- save：预检失败 → `{ok:false,code,error}` 且 settings **未落盘**（读回
  验证）；local 直存；非法目录/枚举外 backend 拒绝（现有
  `wsl_config_validate_rules` 保留）。
- 异步语义：command 不阻塞（超时上限注入短值，验证超时路径返回
  `{ok:false,...}` 而非挂死）。

### 1.4 sidecar（node --test）

- `--wsl` 接线：`ctxFromArgs(['--wsl','--home',X])` → integration 构造的
  `wslMode()` 为 true、anchor 指向 `<X>/agent/node_modules/@deepseek-ai/dsh`
  （经 boot 在沙箱 UNC 形态目录上跑 sync/patches 步验证锚点切换，或 spy 断言；
  v1.0.0 纯净线拆除了 presets 步，落点验证改由 sync 半边承担）。
- 五步顺序契约不破（现有 cli.test.js boot 顺序例继续跑，--wsl 变体补一例）。
- 共享层既有单测（patch-target-resolver wslLayout 族）继续全绿——接线不
  改语义。

## 2. 集成测试（Windows CI / 开发机，无需 WSL）

- **local 模式零回归**：现有 `full_boot_to_kernel_ready_integration` /
  `sidecar_boot_sandbox_integration` / stability_tests 全部不动、全绿——
  这是「未配置 WSL 用户无感知」的机器证明。
- wsl.exe 缺失环境（CI 容器/linux）：configure 快速失败回落 local（防
  wsl.exe 调用在非 Windows 平台 panic——`#[cfg(windows)]` 守卫 + 其余平台
  Ok(false) 分支保留）。

## 3. 真机验证清单（VM 修复后执行；M1 出「实验性」、M2 转正的门槛）

编号打勾制，每项附日志锚点（desktop.log / dsh-web.log / BootStep ms）：

1. **编码**：`wsl -l -q` 三版本 wsl.exe（内置旧版 / Store 版 / 最新 Store）
   的输出解码正确，distro 名单无 NUL/乱码形态。
2. **configure 全链**：显式 distro / 自动检测（含 docker-desktop 首位机）/
   `~` 展开 / UNC `\\wsl.localhost` 与 `\\wsl$` 回落。
3. **首装**：全新 `<installDir>` 上 ensure_installed 全链（时长记录、
   npm 进度行透出、staging 原子切换后 agent-prev 在场）。
4. **boot 链 UNC**：sidecar `--home <UNC> --wsl` 五步全绿 + 33 伴随插件/
   22 补丁在 UNC 上的耗时（R1 风险量化：与 local 模式同机对比）。
5. **就绪与连通**：就绪行 actual port 解析；Windows 侧
   `curl http://127.0.0.1:<port>` 经 localhost 转发可达；WebView2 换页无
   chrome-error。
6. **探活/假死**：WSL 内 kill -STOP 内核 → 60s 假死判定 → 受控重启；
   WSL 整体挂起/恢复后探活恢复。
7. **收割**：恢复页重启（pid 文件 kill 生效、端口可复用）；应用正常退出
   （WSL 内进程消失 `ps aux | grep dsh`）；**确认无 `wsl --terminate` 调用**
   （发行版内 sleep 等无关进程存活）。
8. **强杀孤儿**：任务管理器杀壳 → wsl.exe 消失；WSL 内可能残留 → 再次
   启动 ensure/spawn 前清 pid 成功拉起（R3 缓解验证）。
9. **回落**：坏 distro 名 / 删 node / `wsl --unregister` 后启动 → local
   回落 + fallbackReason 在设置页可见 + 配置未丢。
10. **数据隔离**：WSL 模式 `~/.dsh-desktop`（DSH_HOME）与本地 `~/.dsh`
    互不污染；切回 local 后本地数据原样。
11. **版本对齐**：模拟 payload 版本前进（改本地 payload package.json）→
    启动触发 agent 重装 → agent-prev 保留；M2：手工破坏新 agent → 回退
    动作恢复旧版可用。
12. **会话通知**：effective home=UNC 下会话完成通知触发（原并列的
    `balance-fetch` 取数项已随 Electron 余额遗留线整体拆除——余额由内置插件
    `dsh-balance` 的宿主半边在内核 Node 进程内自取，home 天然随内核）。
13. **`.wslconfig` 异常**：`localhostForwarding=false` 机器 → 恢复页文案
    指路（R2 验证）；mirrored 网络模式兼容。
14. **冷启动**：`wsl --shutdown` 后首启（探测/首装含 WSL 冷启动耗时段，
    看门狗 35 分钟内完成）。

## 4. 门槛矩阵

| 阶段 | Mock 单测 | 集成（无 WSL） | 真机清单 |
|------|-----------|----------------|----------|
| M1 合入 | §1 全绿 + §2 全绿 | 必须 | 可延后（合入说明注明「真机待验」） |
| M1 转正（默认可选用） | — | — | §3.1-3.10 全勾 |
| M2 转正 | — | — | §3 全勾 |
