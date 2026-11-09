# dsh-network-proxy

DeepSeek Harness（DSH）插件：在 **设置 → 通用设置** 增加一行 **HTTP 代理**，支持 **直连 / 跟随系统 / 自定义** 三种模式，**保存后立即生效，无需重启 Harness**。

[![topic: dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-2b7489)](https://github.com/topics/dsh-plugin)


- 包名：`@local/dsh-network-proxy`
- 平台：Windows（系统代理读取 WinINET）、macOS（`scutil --proxy`）
- 许可：MIT

## 为什么需要它

Harness 自带的 `@deepseek-ai/dsh-http-proxy` 只在启动时读一次 `HTTPS_PROXY` 等环境变量，且明确不读取操作系统代理设置（见其 README 的 “Known Limitations”）。于是：

- 只在代理软件里打开了“系统代理”的用户，模型请求仍然直连；
- 想换代理就得改环境变量并重启 Harness；
- MCP、命令工具、网页抓取各自为政。

本插件补上这一段运行时能力：读取操作系统代理（含 PAC），把它装到进程级 `fetch` dispatcher 上，并且**原地热切换**。

## 功能

1. **系统代理检测**
   - Windows：读取 `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` 的 `ProxyEnable` / `ProxyServer` / `ProxyOverride` / `AutoConfigURL` / `AutoDetect`；
   - 支持 `http=…;https=…` 分协议代理与 PAC 脚本（内置精简 PAC 求值器，在无宿主对象的 vm 上下文中求值、禁用字符串代码生成，单次求值 100ms 超时，脚本死循环或抛错只会退回直连）；
   - PAC 是独立开关：只启用“自动配置脚本”而没勾“代理服务器”时同样生效；
   - macOS：`scutil --proxy`（含 `ExceptionsList` 旁路列表与 PAC）；
   - 系统代理开关关闭时，界面会显示检测到的代理地址，方便你去系统里打开；
   - WPAD 自动检测暂不支持，会显示一条提示而不是静默直连。
2. **热切换**：从 Harness 自带的 `undici` 取全局 dispatcher，用 `ProxyAgent` 按目标 origin 路由；保存时直接替换，下一次请求即生效。策略没变化时不会重复重建 dispatcher，连接池保持不动。模型、MCP HTTP、web 搜索/抓取、各命令工具里的 `fetch()` 全部覆盖。
3. **旁路**：`localhost`、`127.0.0.0/8`、`::1`、`0.0.0.0` 永远直连；系统旁路列表（`<local>`、`*.example.com`、`10.0.0.0/8`、`127.*` 等）一并生效。
4. **子进程**：直连/自定义/静态系统代理会把策略同步到 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` / `NODE_USE_ENV_PROXY`，命令工具里的 `curl`、`git`、`pnpm` 会跟随；PAC 是按域名求值的，无法压成一个代理地址，因此不会发布伪环境变量（子进程沿用启动环境）。
5. **持久化**：选择写入 `$DSH_HOME/network-proxy.json`（文件权限 0600，内含代理凭据，请勿分享），下次启动由 Host 半自动应用；插件卸载/停用会恢复启动时的 dispatcher 与环境变量。

## 安装

### 方式一：让 Agent 用插件管理器安装

在 Harness 会话里说：

> 安装插件 https://github.com/baizhizzl/dsh-network-proxy

Agent 会调用 `plugin_manager` 的 `install_bundle`，参数为：

```
git+https://github.com/baizhizzl/dsh-network-proxy.git
```

### 方式二：本地目录

```text
plugin_manager install_bundle  target: /path/to/dsh-network-proxy
```

安装后打开 **设置 → 通用设置**，在“会话显示”下方即可看到 **HTTP 代理**。

## 三种模式

| 模式 | 行为 |
|---|---|
| 直连 | 丢弃代理；进程内 `fetch()` 与子进程都直连 |
| 跟随系统 | 读操作系统当前代理；系统代理没开（或只有 SOCKS）时沿用启动时的代理策略（`HTTP_PROXY` 等环境变量），界面上分别显示检测到的地址或 `当前生效：启动时的代理策略` |
| 自定义 | 使用填写的 `http://host:port`（可带 `user:pass@`），保存后立即生效 |

默认是 **跟随系统**。

## 影响范围

- 覆盖：Harness 进程内所有走 Node 内置 `fetch()` 的出口（模型、MCP HTTP、web fetch/search、插件）。
- 子进程：同步代理环境变量（见上）。
- 不覆盖：桌面窗口自身的 Chromium 网络栈（它本来就跟随系统代理）；遥测（走 `node:http`，设计上直连）；模型生成的 PTC/workflow 子进程（其环境由 Harness 自己的代理策略管理）。

## 项目结构

```
index.js            Host 半：系统代理检测、dispatcher 安装与恢复、/api/network-proxy 路由
client.js           Client 半：settings.general.item 中的偏好行（中英文文案、状态展示）
cordis.patch.yml    插入 network-proxy 插件行
locale/{zh,en}.json 插件标题与描述（Plugin Manager 展示）
icon.svg            插件图标
test/host.test.mjs  Host 半验证脚本（需要 Harness 运行时）
test/unit.test.mjs  纯 Host 解析/匹配单元测试（普通 Node 即可）
test/client.test.mjs Client 半纯函数单元测试（stub ModuleLoader 与 React）
```

## 本地验证

纯解析与匹配逻辑（注册表输出、`scutil` 输出、URL 归一化、旁路匹配、PAC 求值）以及 Client 半的校验/文案投影不依赖 Harness，用普通 Node 跑：

```powershell
npm test
```

CI（`.github/workflows/unit.yml`）在 Linux 与 Windows 上跑同一套测试。

Host 半的验证脚本在真实的 Harness 运行时（Electron as Node）里执行，用本地假代理验证 HTTP 转发、HTTPS CONNECT、loopback 旁路、环境变量发布、持久化与卸载恢复；配置只写临时目录。

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& '<Harness 安装目录>\DeepSeek Harness.exe' '<仓库目录>\test\host.test.mjs'
```

## 已知限制

- 只接受 `http://` / `https://` 代理；SOCKS 会被识别并在界面上提示“暂不支持”。用户名/密码里含非法百分号转义（如 `%zz`）的地址会被拒绝，因为 undici 在请求时解码会抛 `URIError`。
- PAC 求值器覆盖常见的 `shExpMatch` / `dnsDomainIs` / `isInNet` / `isPlainHostName` 等辅助函数；`dnsResolve` 返回空串（避免在同步求值里做 DNS），复杂 PAC 可能退化。单次求值有 100ms 超时，超时或抛错会回退到静态代理（有的话）或直连，并显示 `pac-failed`。脚本下载与编译上限为 1 MiB：编译是同步且无法中断的，这个上限把最坏阻塞控制在几十毫秒。
- PAC 脚本缓存 60 秒；点“重新检测”会强制重新读取系统设置并重新下载。求值器运行在无宿主对象的 Node `vm` 上下文里（禁用字符串代码生成），但 Node 明确说明 `vm` 不是安全边界，仍不应把不可信 PAC 当作可信输入。
- PAC 按 origin（scheme + host + port）求值，undici 的 dispatcher 工厂拿不到请求路径，所以依赖路径的 PAC 规则不会生效；目前只采用第一个 `PROXY`/`HTTPS` 项，不做多代理故障转移。
- WPAD 自动检测（`AutoDetect=1` 且没有 PAC URL）暂不支持，会在界面上显示提示，而不是静默直连。
- 自定义模式必须写明端口；`http://host:80`、`https://host:443` 这类默认端口也算写明，但省略端口的 `http://host` 会被拒绝。系统 `ProxyServer` 里形如 `http://user:pass@host:port` 或无 scheme 的 `user:pass@host:port` 凭据都会被保留，界面与日志只显示去掉凭据的地址。
- 跟随系统模式在系统没有可用代理（关闭、或只配了 SOCKS）时，会沿用启动时的代理策略：恢复 Harness 启动时装好的 dispatcher 与 `HTTP_PROXY` 等环境变量，而不是强制直连。想强制直连请选择“直连”。
- 旁路列表支持 IPv4/IPv6 CIDR、`<local>`、`*.example.com`、`127.*` 与端口；IPv6 字面量按数值比较，`::ffff:1.2.3.4` 与 URL 序列化后的 `::ffff:102:304` 等价。裸 IPv6 带端口（`fd00::1:8080`）会优先按“主机 + 端口”解释，要匹配完整地址请写 `[fd00::1:8080]`。子进程的 `NO_PROXY` 只能表达主机/域名，无法表达整个 `127.0.0.0/8`。如果系统旁路列表是 `*`，所有请求直连，状态会显示 `bypass-all` 而不是“代理已生效”。
- 设置写入失败时仍会生效，但状态会显示 `persist-failed`（重启后会丢失）；配置文件是明文 JSON（权限 0600）。
- 客户端调用 Host 有 15 秒超时与“重试”按钮；Host 端每个动作另有 12 秒预算，超时返回 `timeout`（已生效的切换仍会在下一次读取时显示），不会留下挂起的连接。自定义输入框在输入法组合状态下按 Enter 不会误保存。
- 修改系统代理本身（例如在代理软件里开关“系统代理”）不会被实时感知，点“重新检测”或重新打开设置即可刷新。

## License

[MIT](LICENSE)

---

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

