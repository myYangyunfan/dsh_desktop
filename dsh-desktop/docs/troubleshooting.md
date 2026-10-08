# DSH Desktop 排障手册（v0.3.4）

> 面向客户与技术支持。所有路径以实际机器为准：安装版数据目录为
> `%APPDATA%\DSH Desktop\`，日志位于 `%APPDATA%\DSH Desktop\logs\`。

## 报障时先取三件套

让用户把以下内容一起发来，可以覆盖绝大多数问题：

1. `logs\desktop.log` —— 桌面壳日志（启动、端口、更新、退出）
2. `logs\dsh-web.log` —— dsh web 完整输出（**最重要**，启动失败根因在这里）
3. `run-state.json` —— 上次退出是否干净
4. 如有 `crash-dumps\` 目录，一并打包

## 症状对照表（v0.3.4 已修复项）

| 症状 | 日志关键字 | 根因 | v0.3.4 行为 |
|---|---|---|---|
| 选择工作区 / 添加文件夹弹「无法打开文件夹 directory picker failed: ... worker exited...」 | `win32 folder dialog worker exited` | koffi 3.1.3/3.1.4 坏二进制 | 锁定 koffi@3.1.5；启动前 FFI 预检，失败自动切浏览器内目录选择器 |
| 启动弹「dsh web 启动失败（退出码 1）」 | `plugin tree failed to load` / `failed to apply loader entry` | profile patch 层插件不兼容 | 自动禁用问题插件（safe-boot.overlay.yml）并重试，弹窗显示日志 |
| 启动弹「dsh web 启动失败（退出码 1）」 | `EPERM: operation not permitted, symlink ... profiles\node_modules` | 目录联接创建被拒/半成品缓存 | 自动改名备份 `profiles\node_modules`、重建联接并重试 |
| 设置页看不到识图/自定义提示词/思考强度/插件市场 | 无明显报错 | apiproxy 白名单未覆盖更新后的 agent overlay | 启动时同时补内置 app、profile fallback、agent overlay 三处副本（v1.0.0 现状：识图与插件市场已随内置插件退役，白名单补丁仍服务自定义提示词 / 思考强度等在册插件） |
| 客户端更新点了「立即重启」仍提示有待安装 | `apply-update.log`、`desktop.log` 中 `clientUpdateAttempt` | 更新脚本未完成（安装器被取消/拦截、文件占用） | 识别为「客户端更新未完成」，可重试安装 / 打开日志 / 24h 稍后；安装器失败自动拉起旧版 |
| 进程无声消失 / 页面无响应 | `run-state.json cleanExit:false`、WER AppHang | 渲染挂起/崩溃 | watchdog + 渲染自恢复 + 崩溃转储（0.3.3 起） |

## 客户可执行的最短验证

```powershell
# 1. 服务是否起来了
Get-NetTCPConnection -LocalPort <端口> -State Listen
curl.exe -sS -o NUL -w "HTTP=%{http_code}`n" --max-time 5 http://127.0.0.1:<端口>/

# 2. 启动日志尾部（贴给技术支持）
Get-Content -LiteralPath "$env:APPDATA\DSH Desktop\logs\dsh-web.log" -Tail 80
Get-Content -LiteralPath "$env:APPDATA\DSH Desktop\logs\desktop.log" -Tail 80
```

## v0.3.4 新增的自愈文件（不要手动删除，除非技术支持确认）

- `%APPDATA%\DSH Desktop\safe-boot.overlay.yml` —— 自动禁用的启动失败插件；修复插件后可删除恢复。
- `%APPDATA%\DSH Desktop\picker-browse.overlay.yml` —— koffi 预检失败时自动启用浏览器内目录选择器；预检恢复后自动移除。
- `<DSH_HOME>\profiles\node_modules.backup-*` —— EPERM 自愈时自动备份的半成品依赖缓存，可用于回滚。

## macOS 专章：提示“已损坏，无法打开”或“无法验证开发者”

> 适用：从浏览器/网盘下载的 dmg/zip 包。**这不是安装包数据损坏**，
> 而是 Apple 代码签名体系的问题。我们无 Apple Developer 证书
> （未做签名公证，仅 ad-hoc），macOS 给下载文件打隔离属性
> `com.apple.quarantine` 后，Gatekeeper 对它的处置分两型，
> 修复手段完全不同——先用下面的判定步骤分型，再对症下药。

### 第 0 步：分型判定（在终端执行，看输出）

```bash
codesign --verify --deep --strict "/Applications/DSH Desktop.app" && echo OK
```

- 输出 `OK` → **A 型（隔离属性型）**：签名密封完好，只是被 Gatekeeper 拦；
  `xattr` 移除隔离属性即可，见步骤 1。
- 报 `code object is not signed at all` / 其他失败 → **B 型（签名缺失/密封破坏型）**：
  `xattr` 救不了，必须重新签名，见步骤 2。

### A 型：隔离属性型（签名完好，xattr 可解）

- **移除隔离属性**：
   ```bash
   sudo xattr -cr "/Applications/DSH Desktop.app"
   ```
   （把 app 拖到 `/Applications` 后再执行；若装在其他位置换成实际路径。
   注意：直接双击挂载 dmg 后在 dmg 里右键打开是**只读卷，xattr 会失败**，
   一定要先拷贝到 `/Applications`。）

- **提示“无法验证开发者”** → macOS 15 (Sequoia) 起右键打开的绕过方式已被
   Apple 移除，请改走：系统设置 → 隐私与安全性 → 页面底部“仍要打开”。

### B 型：签名缺失/密封破坏型（xattr 无效，必须重签）

> v0.5.0 的 macOS 包即属此型：构建流水线未对 .app 做任何 bundle 级签名
> （`_CodeSignature` 缺失），仅主二进制带链接期 ad-hoc 签名。arm64 内核
> 强制代码签名 + Gatekeeper 双重校验下表现为「已损坏」，且
> `xattr -cr` 与右键打开都无效。**下一个修复版本起构建时已内置 ad-hoc
> 密封，此型不再出现**（届时只剩 A 型，`xattr` 即可解决）。

- **重新做 ad-hoc 签名，再清隔离属性**：
   ```bash
   sudo codesign --force --deep --sign - "/Applications/DSH Desktop.app"
   sudo xattr -cr "/Applications/DSH Desktop.app"
   ```
   （`--sign -` 中的 `-` 就是 ad-hoc 身份，不需要任何证书。）

### 通用兜底

- 仍不行 → 在终端直接启动看真实报错（绕过 Gatekeeper 弹窗）：

   ```bash
   "/Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop"
   ```

   把终端输出连同 `~/Library/Application Support/DSH Desktop/logs/dsh-web.log`
   尾部 80 行一起发给技术支持。

### 说明与长期方案

- 每次从网上重新下载覆盖安装后，隔离属性会重新打上，需再次执行 A 型步骤。
- `xattr -cr` 与 ad-hoc 重签只影响本机该副本，不会改动安装包本身。
- 长期方案：取得 Apple Developer ID 证书并做签名 + 公证（notarization）后，
  下载即开，无需上述任何步骤。

## Windows 专章：覆盖安装弹「Error opening file for writing」（v0.6.5）

症状：安装过程走到一半弹窗

```
Error opening file for writing:
<安装目录>\dsh-desktop\node_modules\@img\sharp-win32-x64\lib\libvips-42.dll
```

这不是权限问题、也不是杀软误报。**点右上角 × 关窗口不等于退出应用**：默认设置下窗口
只是隐藏到系统托盘，内核进程仍在后台运行，它把 `sharp` 的原生库 `libvips-42.dll`
加载在内存里；而 Windows 不允许覆盖「已经被加载的映像」，所以只有 DLL / EXE 这类
文件会报错（其它成千上万个 `.js` 都能正常覆盖）。

处理顺序：

1. 从**系统托盘图标右键 → 退出**（不是关窗口），然后点安装器上的「重试」。
   若不确定是否干净退出，直接在任务管理器里结束 `dsh-tauri-app.exe` 以及任何路径位于
   该安装目录下的 `node.exe`，再重试。
2. 仍然报错就重启一次机器再装（保证没有任何文件句柄残留）。
3. 还是不行再查三样：安全软件对该目录加白名单（有的会把 `libvips` 这类 DLL 按住）；
   安装目标盘是本地固定盘且有空间、不是云同步目录；必要时换个空目录安装。

关于「忽略」：新装时跳过这个 DLL 会让图像/附件相关功能失效，别点；只有该文件本来就
存在且版本一致时才勉强可用。

v0.6.5 起安装器已自带加固：覆盖安装前会按安装目录前缀精确结束遗留的内核 `node`
进程（不会误伤你机器上其它 node 程序），并最多等 15 秒直到目标文件真的可写；15 秒后
仍被占用会明确提示「请从托盘退出或重启后再装」，而不是让你对着一个没有上下文的
错误框反复点重试。另外，安装包**不要指向便携版的解压目录**（那种目录没有卸载记录），
装机请用默认位置或另建空目录。

## 症状：左侧栏「没了」，只剩一个新建会话图标（v0.6.4 起）

用户原话通常是「左侧工作区和历史对话 UI 没有渲染，只能看到新对话按钮」。
**不是没渲染，是左侧栏按窗口宽度自动收成了 56px 的图标条。**

判定依据在内核 `@deepseek-ai/dsh-client-ui-layout/lib/client.js`：

```js
/** Viewport width below which the sidebar auto-collapses to the rail (deepsuite LG breakpoint) */
const SIDEBAR_AUTO_COLLAPSE = 1024;
```

视口宽度 **< 1024 CSS px**（注意是 CSS 像素，不是物理像素）时，左侧栏只剩图标：
新建会话 / 添加工作区 / 搜索会话 / 设置 —— 文字标签、工作区分组、
历史会话列表**全部不渲染**，所以看上去像「UI 挂了」。宽度 ≥ 1024 时恢复成 280px 完整侧栏。
（2026-10-07 前这一串还包括「插件市场」「知识中心」两个入口，它们由内置的
`dsh-community-market` / `dsh-cardian` 注册，已随插件退役消失；塌栏机制与阈值不变。）

新装机特别容易撞上：Windows 新机常见 125%/150% 缩放，1920 物理宽在 150% 下只有
1280 CSS px；窗口没最大化、或屏幕更小（1366×768 的机器在 125% 下仅约 1092 CSS px），
就掉到阈值以下。实测对照：窗口 1152 CSS px（dpr 1.75）→ 侧栏 280px 正常；
1020 CSS px → 塌成 56px。

**恢复办法（任选其一）**：

1. 点图标条**最上面那个图标**「打开侧边栏」—— 阈值以下它是覆盖式展开（内核里走
   `narrowExpanded`，不是改宽度），点一下侧栏就铺在内容之上，工作区与历史都回来；
2. 把窗口拉宽到 1024 CSS px 以上，侧栏自动恢复常驻；
3. 或者用顶部「收起侧边栏 / 打开侧边栏」那个按钮切换。

注意一个已知的交互细节：**跨过 1024 阈值时内核会把 `narrowExpanded` 重置为 false**
（`setViewportWidth` 里 `if (prev < 1024 !== width < 1024) narrowExpanded = false`），
所以「先拉宽让它常驻、再拉窄」之后需要重新点一次「打开侧边栏」，这不是故障。
