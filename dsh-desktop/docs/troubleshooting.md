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
| 设置页看不到识图/自定义提示词/思考强度/插件市场 | 无明显报错 | apiproxy 白名单未覆盖更新后的 agent overlay | 启动时同时补内置 app、profile fallback、agent overlay 三处副本 |
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
