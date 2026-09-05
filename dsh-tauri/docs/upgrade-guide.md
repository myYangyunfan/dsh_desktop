# Electron → Tauri 无痛升级指南（用户视角 + 技术契约）

> 设计目标：旧用户（DSH Desktop 0.4.x Electron 版）升级到 Tauri 版，
> **双击安装包 → 下一步 → 完成**，全部数据原样保留，零手动操作。

## 1. 用户数据清单与处置（逐项）

| 数据 | 位置 | 升级处置 | 验证方式 |
|------|------|----------|----------|
| 会话/密钥/API 配置 | `~/.dsh`（内核直管） | **原样共用**（两版同 DSH_HOME 语义，Tauri 版直接读写） | 升级后首启会话列表/密钥完好 |
| 插件与启用状态 | `~/.dsh/profiles/web/`（cordis.patch.yml + node_modules） | 原样共用；首启 sidecar boot 对账到新版伴随插件（幂等，rc.7→rc.8 双锚点兼容） | `sidecar boot` 步骤全绿；插件列表 37 项 |
| 应用设置 | `%APPDATA%\dsh-desktop\settings.json` | 同路径同 schema 直读；**裁撤键（kernelUpdate/客户端更新键）识别后忽略、绝不删除**（可安全回退 Electron） | 首启日志 `[upgrade] 识别到…已忽略` |
| 窗口位置 | `%APPDATA%\dsh-desktop\window-state.json` | **同文件同 schema 双向兼容**（Tauri 保存也写 Electron 格式——回退 Electron 位置也不丢） | 单测 `electron_window_state_upgrades_verbatim` |
| 端口记忆（origin 稳定） | settings.lastWebPort | 直读，保 localStorage 偏好（会话分组/主题） | 实测两轮同端口 63283 |
| 日志/自愈历史/隔离区 | `%APPDATA%\dsh-desktop\{logs,self-heal-history.json,plugin-quarantine}` | 同路径直读 | sidecar diag 同源 |
| 便携版数据 | exe 同目录 `data/` | `PORTABLE_EXECUTABLE_DIR` 检测 → userData 重定向（Electron main.js:5317 同语义） | 单测 + 便携版实测 |

**结论：零迁移。** 全部数据「同路径同 schema 直读」，没有任何 copy/convert 步骤——
这是把兼容做进设计（shell-core/src/upgrade.rs 数据契约表）而不是做迁移脚本。

## 2. 安装器升级链（NSIS）

### 2.1 v0.5.0 实际形态（历史教训）

`src-tauri/src/app/nsis/installerHooks.nsh` 的 `NSIS_HOOK_PREINSTALL` **置空**
（仅一行 DetailPrint）：五轮「进程检测 + 注册表扫描 + 静默卸旧」迭代在部分
用户机上反复卡死（NSIS 栈序 / strip 引号 / 模式变量 / ExecWait UAC / C#
卸载器自提权，五轮修五轮仍有新根因），最终裁决是**安装器只装文件**：

- 进程占用检测交给 Tauri 模板自带 `CheckIfAppIsRunning`；
- 旧注册表键清理交给应用首启 sidecar boot 链（companion-profile 自愈）；
- 数据目录（`~/.dsh` 与 `%APPDATA%\dsh-desktop`）不在安装目录内，天然不受影响。

### 2.2 升级目录识别（v0.5.1 起补齐的缺口）

**问题**：Tauri 模板的 `RestorePreviousInstallLocation` 只认 Tauri 自己写的
`HKCU\Software\deepseek\DSH Desktop` 默认值。Electron 线（0.3.x/0.4.x，
electron-builder NSIS）写的是另一套键——于是 0.4.x → 0.5.0 升级时目录页
默认落到 `%LOCALAPPDATA%\DSH Desktop`，老用户装出**双安装/数据割裂**
（本机实测取证：Electron 装在 `D:\app\dsh\DSH Desktop`，v0.5.0 却装到
`D:\app\DSH Desktop`）。

**Electron 线注册表事实**（由 `dsh-desktop/electron-builder.yml` +
`uninstaller/DSH_Desktop_Uninstaller.cs` 推导，本机 `Log.log` 卸载记录实证。
两者已随 Electron 线下线从工作树删除，但事实仍成立（注册表键名不随源码移动），
需核对原文时从历史取回：`git show 6ff0cc83^:dsh-desktop/electron-builder.yml`、
`git show 02981194^:dsh-desktop/uninstaller/DSH_Desktop_Uninstaller.cs`）：

| 键 | 名称 | 来源 |
|----|------|------|
| 卸载键 | `HKCU/HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\62276e9d-c5f3-5091-b4ee-c7144d6db450` | `UUID.v5(appId="com.deepseek.dsh.desktop")`（nsis.guid 未显式配置） |
| 安装键 | `HKCU\Software\DSH Desktop` | electron-builder `INSTALL_REGISTRY_KEY`（APP_FILENAME，oneClick:false → 保留空格） |
| 值 | 两键均写 `InstallLocation` | per-user 默认 HKCU，防御性补读 HKLM/WOW6432Node |

**修复机制**（三层，全部只读，绝不移动/删除旧目录内容）：

1. **vendor 模板** `src-tauri/src/app/nsis/installer-template.nsi`（基线
   tauri-cli-v2.11.4 的 `crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi`，
   经 `tauri.conf.json` 的 `bundle.windows.nsis.template` 挂载）：与上游的
   全部差异仅一处——`RestorePreviousInstallLocation` 尾部追加对
   `DSH_DETECT_LEGACY_INSTALLDIR` 宏的 `!ifmacrodef` 守卫调用；
2. **检测宏**（`installerHooks.nsh`）：仅当 Tauri 自身键为空时，依次读上表
   两键的 `InstallLocation`，归一化（去成对引号/尾反斜杠）后校验旧目录标记
   ——`DSH Desktop.exe` / `resources\node\node.exe` /
   `Uninstall_DSH_Desktop.exe` 三者其一存在才采纳，把 `$INSTDIR` 预填为旧目录；
   目录页仍可手动改（`.onInit` 先于目录页，不覆盖用户选择）；
3. **优先级**：Tauri 自身键 > Electron 旧键——0.5.0+ 之间升级走原生逻辑，
   已双装的 v0.5.0 用户继续留在 0.5.0 目录（旧 Electron 目录原样保留，
   由首启 sidecar 自愈链处理，不做意外搬家）。

**安全边界（.onInit 铁律）**：宏体只允许
`ReadRegStr / StrCpy / LogicLib ${If} / ${FileExists} / DetailPrint`；
`MessageBox / Exec* / Push/Pop / Sleep / CopyFiles / 写注册表` 等任何可能
阻塞 UI 线程的调用一律禁止（v0.5.0 五轮卡死的教训）。

**已验证**（2026-08-21，本机，`%LOCALAPPDATA%\tauri\NSIS\Bin\makensis.exe`）：

- 完整 82k 行 installer.nsi（0.5.1 实际产物 + 本改动）实编译：0 error / 0 warning；
- 注册表场景夹具 6/6 通过：带引号+尾斜杠采纳、无标记拒绝、无旧键默认、
  Tauri 键优先、安装键兜底、裸值采纳；
- passive 端到端（改名 `DSH LegacyTest` 隔离真机状态）：种旧键 → `/P`
  安装 → 文件落在**采纳的旧目录**、Tauri 恢复键/ARP `InstallLocation`
  均记录旧目录 → 自带卸载器只清自身文件，**旧目录残留标记文件原样未动**。

## 3. 运行时行为对齐（升级用户无感差异）

| Electron 行为 | Tauri 版对齐实现 |
|---------------|------------------|
| koffi 预检 + 目录选择器降级 overlay | sidecar `koffi-preflight`（vendor node 冒烟，settings 布尔缓存）+ `picker-overlay`（内容与 main.js 逐行一致）→ spawn `--patch` 注入 |
| 安全启动 overlay（坏插件自动禁用再试） | sidecar `safe-overlay`（parseFailedLoaderIds 解析 dsh-web.log 尾部，幂等合并）→ 内核崩溃自动重启前注入 |
| 端口稳定化（origin 不漂移） | `choose_stable_port(settings.lastWebPort)` 优先复用 |
| DSH_DESKTOP_SUPERVISED=1（禁插件自杀式重启） | supervisor spawn 同标识 |
| 单实例锁 | `single-instance.lock` + 陈锁 pid 回收（强杀残留自动恢复） |

## 4. 回退保障

- 裁撤键不删除：Tauri 版用一段时间后回退 Electron，旧版更新设置原样可用；
- window-state.json 双向：回退后窗口位置不丢；
- `~/.dsh` 若已被新版内核升级过（rc.8 布局）：Electron 0.4.1+ 同样兼容 rc.8
  （kernel/dsh-rc8 分支）；更早 Electron 版需先升 0.4.1 再回退。

## 5. 已知边界

- **v0.5.0 双安装受害者**（目录识别修复前升级）：0.5.0 装在了新目录、旧
  Electron 目录还在。数据不受影响（`~/.dsh` 与 `%APPDATA%\dsh-desktop`
  全程共用），但请手动卸载其中一个目录的多余一份（控制面板/设置里的
  「DSH Desktop」条目对应 0.5.x，旧目录的 `Uninstall_DSH_Desktop.exe`
  对应 Electron 版）——两个卸载器互不认识对方，任卸其一只清自身；
- 极旧版本（0.4.0 及更早）卸载器无 `/KEEP_APP_DATA` 参数识别：建议先用
  Electron 版内置更新到 0.4.1+ 再升 Tauri；
- WSL 托管模式用户：Tauri 版暂未实装 WSL 后端，v0.5.1 起设置项**诚实提示
  「暂未实装」**（不再呈现可切换的假开关）；#132 pnpm 结构误判已修
  （resolveViaPnpmStore 回落 + WSL UNC 防误删 + 历史误隔离自愈）。完整托管
  见 roadmap 遗留细目。
