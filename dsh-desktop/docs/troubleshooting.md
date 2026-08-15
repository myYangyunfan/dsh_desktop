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
