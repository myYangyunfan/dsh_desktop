# DSH-Mobile（手机桥）

把 Codex-Mini 的「手机 ↔ 电脑端 AI 会话」桥接体验复刻到 **DeepSeek Harness Desktop（DSH）**：手机发文字 / 图片 / 文件，实时看到 DSH agent 的思考、工具调用与回复，并能管理会话、切换模型、停止生成。

所有会话都是**电脑端 DSH 里的真实 agent 会话**——手机只是其中一个远程参与方，电脑桌面与手机双向可见、双向可控。

> 技术文档与决策记录见 [`SPEC.md`](./SPEC.md)（第 14 节为 1.2.0 实现记录、第 15 节为 1.3.0 实现记录）。本文件只讲用法。

## 一、开发机热装配（注入器工作流，改代码即时生效）

```powershell
# 依赖：工作区 node_modules 里建了官方包 junction（见 scripts/link-deps.ps1）
pwsh scripts/link-deps.ps1      # 首次/换机时建 @deepseek-ai/dsh-{llm,session,agent} junction
# 之后在 DSH 里直接调用注入器工具：
#   dev_build_plugin {dir: "E:\DSH Zone\dsh-mini"}   → bash scripts/build.sh（零构建：client 组装 + 语法校验）
#   dev_inject_plugin {dir: "E:\DSH Zone\dsh-mini"}  → 注入（host + client UI 一并生效）
#   dev_reload_package {packageName: "dsh-mini"}     → 热重载（lib 指纹自动 watch，编辑即生效）
#   dev_uninject_plugin {match: "dsh-mini"}          → 卸载
```

## 二、正式安装（install.ps1 双通道，随 DSH 更新可重跑）

```powershell
# 在仓库根目录 dsh-mini/ 执行（自动探测 DSH Desktop 安装位置）
pwsh scripts/install.ps1

# 或指定 DSH Desktop 的 resources\app 目录
pwsh scripts/install.ps1 -Target "C:\Program Files\DSH Desktop\resources\app"
```

脚本会：① 复制插件到 `assets/plugins/dsh-mini`；② 同步到 `~/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-mini`；③ 向 `cordis.patch.yml` 追加 `insert` 块；④（v1.4.1 起）两个通道同时拷贝 `gui/` 运行时 GUI 资产（保证网关根路径的官方前端可用）。**装完默认「允许外网访问」关闭**（安全默认：只本机 + 局域网；要外网按「三·外网穿透」在设置里开启）。装完重启 DSH Desktop。启动日志：

```
[dsh-mini] v1.4.1 mounted at /dsh-mini/ (api: /dsh-mini/api/)
[dsh-mini] webServer bind: 127.0.0.1:46321; LAN gateway disabled; ...
[dsh-mini] bridge token (share with the phone app): <token>
[dsh-mini] external access disabled by default (安全默认：仅本机/局域网)
```

## 三、开启局域网网关 + 远程控制（1.3.0 流程）

1. **打开网关**：DSH 桌面 → 设置 → 「DSH Mini 手机桥」→ 开启「局域网网关」（可改网关端口 1024–65535）。
2. **确认绑定**：设置卡里实时显示绑定地址与端口。手机可达要求 DSH web 以 `--host 0.0.0.0` 启动（绑 `127.0.0.1` 时会显示黄色告警与指引）。
3. **弹二维码**：点左侧栏左下角「远程控制」图标（在「临时会话」上方）→ 弹出二维码。**网关未开启时点击会自动跳转设置页**。
4. **手机扫码**：
   - 装 **DSH Mini APK**（`apk/` 工程，见 `apk/README-APK.md`）→ 应用内「📷 扫码连接」；
   - 或手机浏览器直接开 `http://<电脑IP>:<端口>/dsh-mini/`，在「连接设置 → 📷 扫码连接」里扫；
   - 或直接让**手机系统相机**扫桌面二维码 → 浏览器/应用自动打开。
5. 手机浏览器/APK 里还能：发文字与附件（图片会提示 agent 用 `view_image` 查看）、切换模型与推理档、看余额徽章、停止生成、接管电脑上任意 DSH 会话（双向同步）。

> 说明：余额徽章数据来自 Desktop 壳（`dsh-balance` 无 host API）——桌面端开着 DSH 即会经 client 半边推送；未推送时显示「余额待同步」。

## 三·外网穿透（把局域网网关暴露到公网）

> **「允许外网访问」默认关闭**（安全默认：只允许本机/局域网）。需要外网时按下面步骤在设置里手动开启；关闭时外网来源（公网域名/公网 IP，含隧道转出的连接）一律 403，即便带 token。

> 要求：插件代码零改动方案 = **独立隧道代理**（推荐 cloudflared，免费、无账号、自动 HTTPS）。隧道进程与 DSH 同机时会把外网请求转成对 `127.0.0.1` 的连接，这与「本机直连」在 DSH 眼里几乎无法区分——所以**必须**同时开启插件侧「允许外网访问」（`publicMode`），由它收回网关上所有回环免鉴权豁免并拒绝关闭态的外网来源（详见 `SPEC-v5-连接方案与同步修复.md` §2.7 与 `SPEC-v4-外网穿透.md`）。

1. **起一条隧道指向网关端口**（红线：**绝不能指 DSH 主端口**，只指网关 `0.0.0.0:<gatewayPort>`，默认 46322）：
   ```bash
   cloudflared tunnel --url http://127.0.0.1:46322
   # 启动后得到公网地址，形如 https://xxx-xxx.trycloudflare.com
   ```
2. **开启「允许外网访问」**：DSH 桌面 → 设置 → 「DSH Mini 手机桥」→ 开启「允许外网访问」（绑定 `publicMode`；关闭时来自公网域名/公网 IP 的请求【含隧道转出的连接】一律 403，仅本机与局域网可用）。
3. **填公网地址**（上面得到的 `https://xxx-xxx.trycloudflare.com`，不要带 `?token=`、不要带尾部斜杠）→ 保存。设置卡会显示「✓ 外网入口已配置」，二维码自动切换为公网地址。
4. **外网设备访问**：打开 `https://xxx-xxx.trycloudflare.com/?token=<你的令牌>`（首次需带 token；成功后写 30 天 HttpOnly cookie），或在 DSH-Mobile 应用内扫码连接。

开启后行为变化（关闭即恢复原样）：
- 网关对**一切**请求（含隧道转成的回环连接）强制要求连接令牌——封死「隧道被误判为本机直连而免鉴权」的洞。
- 上传单文件上限自动**钳制到 50MB**（不写盘，仅生效层；关掉 publicMode 自动恢复）。对齐 Cloudflare Tunnel 免费档单请求 ~100MB。
- 可选收紧 RPC 面：`publicRpcAllow` 白名单（如 `["session.list"]`），白名单外方法网关直接返回 `rpc-not-allowed`。默认 `null`=全开（与局域网一致）。
- **管理端点不受影响**：`/gateway/config`、`/gateway/token/reset` 仍仅本机直连可调（隧道经网关转发必被 403）。

### 三·持久化与备用隧道（本机常驻，脱离开发会话）

想让外网通道在你关闭开发会话/重启电脑后仍在跑，用仓库外的常驻 watchdog 接管（已部署）：

- **常驻**：`E:\DSH Zone\.tools\tunnel-watchdog.ps1`（Task Scheduler `DSH Mini Tunnel Watchdog`（开机）+ `...Every5`（每5分钟兜底）+ 启动文件夹），自起/自愈 cloudflared，进程挂了自动重拉、假死自动重启。
- **地址自动同步**：隧道重启后公网地址会变，watchdog 自动把最新地址同步进 dsh-mini 的 `publicUrl`（桌面设置卡/二维码实时更新），并写入 `E:\DSH Zone\.tools\tunnel-url.txt` 供查看。
- **国内备用隧道**：万一 trycloudflare 在手机所在网络不可达，把国内隧道（樱花frp / cpolar 等）的公网地址填入 `E:\DSH Zone\.tools\manual-url.txt`，watchdog 即转交该地址并持续同步；清空该文件自动回切 cloudflared。详见 [`docs/外网穿透-备用隧道.md`](./docs/外网穿透-备用隧道.md)。

## 四、API 速览（1.3.0）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/dsh-mini/api/health` | 健康检查 |
| GET | `/dsh-mini/api/gateway` | 网关状态（token/lanEnabled/host/port/lanIps/reachable/url） |
| POST | `/dsh-mini/api/gateway/config` | `{lanEnabled?, maxUploadMb?, gatewayPort?, publicMode?, publicUrl?, publicRpcAllow?}`（仅回环） |
| POST | `/dsh-mini/api/gateway/token/reset` | 重置 token（仅回环） |
| GET | `/dsh-mini/api/models` | 模型目录（含推理档） |
| POST | `/dsh-mini/api/upload?session=&name=` | 附件上传（原始 body） |
| GET | `/dsh-mini/api/threads` | 会话列表（zstd 日志折叠标题/模型/时间） |
| POST | `/dsh-mini/api/threads/new` | 新建电脑端真实会话 |
| POST | `/dsh-mini/api/threads/:id/attach` | 接管已有会话 |
| GET | `/dsh-mini/api/threads/:id/history` | 历史（live 双源去重 / 存储会话读日志） |
| GET | `/dsh-mini/api/threads/:id/stream` | SSE：`meta` + `step`（thinking/tool/assistant/user/title/model/status） |
| POST | `/dsh-mini/api/threads/:id/send` | `{text, attachments:[{name,path}]}` → 202 |
| POST | `/dsh-mini/api/threads/:id/stop` | 停止本轮 |
| GET/POST | `/dsh-mini/api/threads/:id/model` | 查询 / 按会话切换模型（provider/model/reasoningEffort） |
| GET | `/dsh-mini/api/balance` | 余额缓存 |
| GET | `/dsh-mini/*` | 手机 UI 静态托管 |

鉴权：回环免 token；非回环 `Authorization: Bearer <token>` / `x-dsh-mini-token` / SSE `?token=`。**「允许外网访问」（publicMode）开启后，网关对一切请求（含隧道转成的回环连接）强制要求 token；关闭后，来自公网域名/公网 IP 的请求（含隧道转出的连接，即使带 token）在网关入口一律 403——只允许本机与局域网。**

> 提示：`GET /gateway` 返回的新字段 `publicMode` / `publicUrl` / `publicRpcAllow` / `external{enabled,url,up}` 用于桌面设置卡展示外网穿透状态。

## 五、验证

### 1. 一键冒烟（本机回环，免手机免 token）

```powershell
pwsh scripts/smoke.ps1        # v1.4.0 网关 RPC 面基线回归；日志 smoke.txt
pwsh scripts/pubmode.ps1      # publicMode 正/负矩阵（开→验证→自动还原）；日志 pubmode.txt
node scripts/test-allow-external.cjs   # 「允许外网访问」开关专项（关闭=仅局域网 / 开启=强制token），自动还原
powershell -ExecutionPolicy Bypass -File scripts\pubmode.ps1   # PS5.1 亦可
```

`smoke.ps1` 覆盖：health / gateway 状态 / gateway 根（v3 GUI）/ `host.describe` / `session.list` / `llm.*` / `workspace.*` / `agentPreset.*` / `skill.*` / `settings.describe` / `goals/list` / balance，期望末尾 `RESULT: PASS`。
`pubmode.ps1` 覆盖：publicMode 下的 无/错 token 拒绝、管理端点经网关代理 403、上传上限钳制 50/恢复、`publicRpcAllow` 白名单外 `rpc-not-allowed`、WS `/api/events.mux`+`/api/events.host` 无 cookie 403 / 有 cookie 101，并自动还原配置；加 `-KeepOn` 则保留 publicMode（供真网隧道联调）。

### 2. 真机复测清单（用户）

- [ ] 桌面设置 → 「DSH Mini 手机桥」分节可见；网关开关/绑定/二维码预览正常
- [ ] 网关关闭时点侧栏手机图标 → 自动跳设置页；开启后点击 → 二维码弹窗
- [ ] 手机系统相机扫二维码 → 打开手机页面（或 APK 内扫码连接）
- [ ] 手机发文字/图片/文件 → 桌面与手机双向实时同步（思考·工具·回复）
- [ ] 手机切换模型 + 推理档 → 生效且桌面徽章同步变化
- [ ] 余额徽章显示（桌面端打开余额页后）
- [ ] APK 构建安装（`apk/README-APK.md`）

### 已知风险 / 排查

- `503 no model configured`：DSH 没设默认模型。
- 手机连不上：几乎都是绑定回环；改 `--host 0.0.0.0`（设置卡有提示）。
- 插件没挂载：查 `cordis.patch.yml` 是否含 `id: dsh-mini`。
- 余额一直「待同步」：桌面壳只在余额数据变化时推事件，打开一次桌面余额页即可触发。

## 变更记录

- **1.4.1**（本地打包产物 `deepseek-ai-dsh-mini-1.4.1.tgz`，未推 npm registry；外网穿透 M2+M3，见 [`SPEC-v4-外网穿透.md`](./SPEC-v4-外网穿透.md)）：新增「外网穿透（publicMode）」——`GET/POST /gateway/config` 支持 `publicMode/publicUrl/publicRpcAllow`；开启后网关对一切请求（含同机隧道转成的回环连接）强制 token，封死「隧道被误判为本机直连而免鉴权」；二维码/连接 URL 自动切公网地址；上传上限生效层钳制 50MB（不写盘）；RPC 白名单外方法返 `rpc-not-allowed`；清理 `ws-debug.log` 调试残留；验证通过（含真网、无残留）：重写 `scripts/smoke.ps1` 到 v1.4.0 网关 RPC 面、新增 `scripts/pubmode.ps1`（publicMode 矩阵，自动还原）；真网隧道（cloudflared）端到端：HTTP 无/错 token 403、`?token=`→200 发 cookie、RPC 带 cookie `ok:true`、WS `/api/events.mux`+`/api/events.host` 无 cookie `403`/带 cookie `101`。另部署常驻 watchdog（Task Scheduler 托管）自愈云flared 并自动同步 publicUrl，支持 `manual-url.txt` 手动模式切换国内备用隧道（见 `docs/外网穿透-备用隧道.md`）。`/gateway/config` 的 `publicRpcAllow` 校验器现接受 `null | [] | array`（与 saveConfig「null/[] 全开」契约一致）。按 DSH-Desktop 插件开发指南复查并加固：`package.json files` 补 `gui/`（打包必须包含运行时 GUI 资产，npm pack 验证 141 文件 / gui 128 条目）；token.txt 与 config.json 写入改原子写 `tmp+rename`（指南 §10.11，避免半截文件）；源码均无 BOM（§9.4）。外网/局域网某机器此前报「GUI 资产未采集」= 该部署使用修复前（`files` 缺 `gui/`）旧包；已把缺失占位页改成可行动提示（GUI 资产缺失 + 重装指引），`scripts/build.sh` 增加 `gui/dist/index.html`/`gui/manifest.json`/`gui/bundles` 缺失即 fail 的闸门，防范再次产出缺 gui 的坏包；重新 `npm pack` 产出 `deepseek-ai-dsh-mini-1.4.0.tgz`（2.3MB，已核验内含 gui 128 条目）。局域网行为（publicMode=false）与 1.4.0 等价。`「允许外网访问」开关`（2026-08-18，SPEC v5 §2.7）：设置里「外网穿透」改名为「允许外网访问」并收紧语义——关闭时网关**入口层**按 Host 头判定来源，来自公网域名/公网 IP 的请求（含 cloudflared 等隧道转出的回环连接，即使带 token）一律 `403 external access disabled`，只允许回环/本机/局域网（私有 IPv4 + 内网 IPv6）；开启时行为同原 publicMode（一切强制 token）。HTTP 与 WS（events.mux/host upgrade）双拦截；`lib/index.js` 新增 `isExternalHost/isPrivateIp`，`authGuiWs` 首行加来源拒绝。专项验证 `scripts/test-allow-external.cjs` **22/22 PASS**（关闭：回环/LAN/私有/内网IPv6→200，隧道域名/公网IP/自定义域名/带token/根路径/RPC/旧协议/WS→403；开启：无token全403，公网+token→302/WS 101），测完自动还原 config。**P0 会话同步修复 + 审查优化**（2026-08-18，SPEC-v5 §6）：①修复「电脑端新建会话→手机端不同步」——补全 `gui-ws.js` host 流 `domain/changed` → `host/workspace-changed` 增量转发、`session/created` 帧 cwd 改从 `session.header` 提取、`API_REMOTE_FORWARDED_EVENTS` 白名单转发（11 事件）；真凶实为验证脚本时序 bug（`await wsCollect` 挂起 8s 致会话操作在 socket 销毁后执行）+ 调试期 ESM `require` 崩溃，非插件逻辑。②`scripts/verify-p0-sync.cjs` 重构 `startCollect`（共享帧数组先收后 rpc 再收口 + cookie 鉴权），**PASS 8/8**（session-added 带 cwd 实时到达）。③消除调试残留（internal/dispatch、SVCCTX 泄漏监听、内联 debug；`lib/gui-ws.js`）——曾致每次 WS 连接泄漏 3 个永久全局 listener。④审查优化：移除 `buildGuiledIndex` 的 `__wsProbeLog` WebSocket 调试 hook；网关 RPC body 上限固定 16MB → `max(24MB, maxUploadMb×1.6)`（防 base64 图片上传被 413）；`proxyToUpstream` 剥离 hop-by-hop 头（RFC 7230）。回归全绿：`smoke.ps1` PASS、`pubmode.ps1` 24 项 PASS、`verify-p0-sync.cjs` 8/8 PASS、`test-allow-external.cjs` 22/22 PASS。
  - **默认关闭落地 + 安装通道收口（1.4.1）**：`package.json version → 1.4.1`；「允许外网访问」默认关闭三层确认（`loadConfig` 无配置→`false`、`saveConfig` 无 true 默认、设置卡 UI `useState(gw.publicMode === true)` 跟随）已随产物打包；`scripts/install.ps1` 两个拷贝通道（assets/plugins + profile node_modules）补拷 `gui/` 运行时资产（修复 1.4.0 只修了 `package.json files` 打包通道、而 install 直拷通道缺 gui 的缺口），安装结束提示「安全默认：外网穿透默认关闭」；重新 `npm pack` 产出 `deepseek-ai-dsh-mini-1.4.1.tgz`（141 文件 / gui 128 条目，解包核验含 `isExternalHost`/关闭态 403 与 P0 的 `workspaceView`/`domain/changed`）。
- **1.3.0**（2026-08-16）：第三阶段 UI 打磨。手机端 UI 全面液态玻璃化（深色渐变 + 光斑层 + 半透明毛玻璃 topbar/菜单/composer/用户气泡/代码块/表格 + 高光描边）；沉浸式安全区（APK `getSafeTop()` 桥 → 页面 `--dsh-safe-top`，避开刘海/状态栏/导航栏，connect.html 同步）；字体与中文渲染优化（antialiased / text-size-adjust / Noto Sans SC）。APK 重封装：**Native 实时扫码**（CameraX 后置预览 + ZXing 解码，`ScanActivity`，免 GMS 华为机可用）、透明系统栏主题、connect.html 玻璃门面（「📷 扫码连接」→ 原生相机 / 无相机模拟器走地址输入 + lastUrl 回填 + 原生连通自检）；本机 Android 构建工具链落地（JDK 21 + Gradle 8.9 + SDK）；真机（华为 nova7se）CDP 实测玻璃样式与沉浸式全绿；SPEC 第 15 节记录。第四阶段（功能扩展）见 SPEC。
- **1.2.0**（2026-08-16）：M2 + M3。运行时兼容修复（标题/模型改 zstd 日志折叠、live 历史双源去重、turn/end reason 全集、路由热重载自愈）；附件上传+路径引用（图片提示 `view_image`）；模型目录 + 按会话切换（installModelSelection 可变 selection + sessions.json 持久化）；`/attach` 接管；桌面 client 半边（侧栏手机图标→二维码/未配置跳设置页 + 设置分节网关卡 + 余额转发）；手机 UI（附件胶囊/模型菜单/推理档/余额徽章/扫码连接）；网关 API（config.json + token 重置）；APK 壳工程（含应用内扫码，源码 + CI 交付）。
- **1.1.0**（2026-08-16）：手机端 UI 全面重制为 GPT Mini（Codex-Mini v5.5.4）同款液态玻璃风格——顶栏状态呼吸点 + 状态圆环 + 线程下拉菜单（live spinner/模型徽章）+ 保持亮屏（Wake Lock）+ 线路徽章（本地/远程）+ markdown 渲染 + 工具胶囊 + 键盘适配 + iPad 双栏布局 + PWA（manifest/图标）；修复 `/threads/new` 的 `commit is not a function`（setup 回调返回清理函数与 agent-loop `.commit()` 契约冲突，改为不返回值）；`GET /threads/:id/model` 返回当前模型信息；history 补充 `reasoningEffort`；扫码 URL `?token=` 自动保存。
- **1.0.0**（2026-08-16）：初版（M1 闭环：线程列表 / 新建 / 发文字 / 双向 SSE / 停止）。

## 许可

MIT。灵感来源：Codex-Mini by CoimgRain（架构思路借鉴）。内置第三方库：`qrcode-generator`（Kazuhiko Arase，MIT，`vendor/qrcode.js`）、`jsQR`（cozmo，Apache-2.0，`vendor/jsQR.js`）。
