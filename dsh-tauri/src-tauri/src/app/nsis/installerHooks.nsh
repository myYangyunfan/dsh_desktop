; DSH Desktop（Tauri 版）NSIS 安装钩子
; ==========================================================================
; v0.5.0 发布教训：多轮迭代 PREINSTALL 钩子（进程检测 + 注册表扫描 +
; 旧版卸载 + 目录采纳）始终在部分用户机上卡死（NSIS 栈序/strip 引号/
; 模式变量/ExecWait UAC/C# 卸载器自提权——五轮修五轮还有新根因）。
;
; 终极方案：PREINSTALL 钩子置空。Tauri NSIS 模板已自带：
;   · 进程检测（CheckIfAppIsRunning）——检测当前 productName 进程
;   · 安装位置复用（RestorePreviousInstallLocation）——读自身旧键
;   · 文件覆盖安装——旧版目录直接覆盖，数据目录（~/.dsh 与
;     %APPDATA%\dsh-desktop）天然不受影响
;
; v0.5.1 追加（本文件 DSH_DETECT_LEGACY_INSTALLDIR 宏）：
;   Tauri 模板的 RestorePreviousInstallLocation 只认 Tauri 自己写的
;   HKCU\Software\<manufacturer>\<productName> 键。Electron 线（0.3.x/
;   0.4.x，electron-builder NSIS）写的是完全不同的键，于是 0.4.x → 0.5.0
;   升级时目录页默认到 %LOCALAPPDATA%\DSH Desktop，老用户装出双目录。
;   修复：经 vendor 模板 installer-template.nsi 的挂载点，在该函数尾部
;   调用本文件的 DSH_DETECT_LEGACY_INSTALLDIR 宏——Tauri 自身键为空时，
;   只读探测 Electron 线注册表，预填 $INSTDIR 为旧安装目录。
;
; 【铁律】本宏运行在 .onInit（UI 线程），只允许：
;   ReadRegStr / StrCpy / ${If} / ${FileExists} / DetailPrint
; 禁止出现（历史上任一即卡死安装器）：
;   MessageBox / Exec / ExecWait / ExecShell / nsExec / nsDialogs /
;   Push / Pop / Exch（栈操作）/ FindWindow / SendMessage / kill /
;   Sleep / CopyFiles / Delete / RMDir / RenName / 任何写注册表
;
; 需要清理旧版注册表键的场景（Electron→Tauri 升级）由应用首次启动时
; 的 sidecar boot 链处理（sync/companion-profile 自愈），不再由
; 安装器承担。这消除了 ALL 可能的安装器卡死点。

Var DshLegacyDir
Var DshLegacyTmp

; Electron 线（electron-builder，appId=com.deepseek.dsh.desktop）的注册表事实：
;   · 卸载键名 = UUID.v5(appId) = 62276e9d-c5f3-5091-b4ee-c7144d6db450
;     （出处为 dsh-desktop/uninstaller/DSH_Desktop_Uninstaller.cs 里的
;       LegacyUninstallRegKey；该目录已随 Electron 线下线由 02981194 从工作树
;       移除，需核对原文时执行
;       `git show 02981194^:dsh-desktop/uninstaller/DSH_Desktop_Uninstaller.cs`。
;       本机 Log.log 卸载记录亦实证该键曾存在于 HKCU）
;   · 安装键 = Software\DSH Desktop（INSTALL_REGISTRY_KEY，
;     APP_FILENAME = productName「DSH Desktop」，oneClick:false → 保留空格）
;   · 两处都写 InstallLocation；per-user 构建落 HKCU，防御性补读 HKLM/WOW6432Node
;   · 旧目录可识别标记（五选一）：DSH Desktop.exe（0.4.x 主程序）、
;     dsh-desktop.exe（0.3.x 老线主程序名，2026-08-22 NS1 实测补齐）、
;     resources\node\node.exe（内置 Node 运行时）、
;     Uninstall_DSH_Desktop.exe（自研卸载器）、
;     Uninstall DSH Desktop.exe（electron-builder 官方卸载器，空格版兜底）
;
; 【/SD 与超时语义】本宏不含任何 MessageBox / 用户交互 —— /SD 防呆的
; 本质是「静默模式下 MessageBox 不许弹」，无 MessageBox 即零需求。
; 超时语义：每步都是单次同步内核调用（ReadRegStr 本地 hive / FileExists
; 一次 CreateFile），亚毫秒级完成，无轮询、无 Sleep、无等待句柄——
; 不存在「超时」概念，也就不存在悬挂面（v0.5.0 卡死的全部根因
; ——ExecWait UAC / C# 卸载器自提权 / 栈操作 / 枚举中删键——一概不在）。
!macro DSH_DETECT_LEGACY_INSTALLDIR
  ; 仅当 Tauri 自身键为空（$4 是调用方 RestorePreviousInstallLocation 刚读的
  ; MANUPRODUCTKEY 值）时探测——0.5.0+ 之间的升级仍走原生逻辑。
  ${If} $4 == ""
    StrCpy $DshLegacyDir ""

    ; 1) electron-builder 卸载键（InstallLocation 未被旧版卸载器清掉时的主来源）
    ReadRegStr $DshLegacyDir HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\62276e9d-c5f3-5091-b4ee-c7144d6db450" "InstallLocation"
    ${If} $DshLegacyDir == ""
      ReadRegStr $DshLegacyDir HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\62276e9d-c5f3-5091-b4ee-c7144d6db450" "InstallLocation"
    ${EndIf}
    ${If} $DshLegacyDir == ""
      ReadRegStr $DshLegacyDir HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\62276e9d-c5f3-5091-b4ee-c7144d6db450" "InstallLocation"
    ${EndIf}

    ; 2) electron-builder 安装键（卸载键被清但软件还在的兜底）
    ${If} $DshLegacyDir == ""
      ReadRegStr $DshLegacyDir HKCU "Software\DSH Desktop" "InstallLocation"
    ${EndIf}
    ${If} $DshLegacyDir == ""
      ReadRegStr $DshLegacyDir HKLM "Software\WOW6432Node\DSH Desktop" "InstallLocation"
    ${EndIf}

    ; 归一化：去成对引号（部分写入方带引号），去尾部反斜杠
    StrCpy $DshLegacyTmp $DshLegacyDir 1
    ${If} $DshLegacyTmp == '"'
      StrCpy $DshLegacyDir $DshLegacyDir "" 1
      StrCpy $DshLegacyDir $DshLegacyDir -1
    ${EndIf}
    StrCpy $DshLegacyTmp $DshLegacyDir "" 1
    ${If} $DshLegacyTmp == "\"
      StrCpy $DshLegacyDir $DshLegacyDir -1
    ${EndIf}

    ; 3) 校验：目录存在且含 Electron 线标记才采纳，防止指向已改名/残留空壳目录
    ;    标记集（2026-08-22 补齐，NS1 实测发现 0.3.x 老线漏网）：
    ;      DSH Desktop.exe            —— 0.4.x 主程序（productName，本机 dist 实证）
    ;      dsh-desktop.exe            —— 0.3.x 老线主程序（package.json name 命名，
    ;                                   23802d38 漏收致老线用户仍装双目录，本次补）
    ;      resources\node\node.exe    —— 内置 Node 运行时（跨版本）
    ;      Uninstall_DSH_Desktop.exe  —— 自研卸载器（下划线版）
    ;      Uninstall DSH Desktop.exe  —— electron-builder 官方卸载器（空格版，兜底）
    ${If} $DshLegacyDir != ""
      ${If} ${FileExists} "$DshLegacyDir\DSH Desktop.exe"
      ${OrIf} ${FileExists} "$DshLegacyDir\dsh-desktop.exe"
      ${OrIf} ${FileExists} "$DshLegacyDir\resources\node\node.exe"
      ${OrIf} ${FileExists} "$DshLegacyDir\Uninstall_DSH_Desktop.exe"
      ${OrIf} ${FileExists} "$DshLegacyDir\Uninstall DSH Desktop.exe"
        StrCpy $INSTDIR $DshLegacyDir
        DetailPrint "DSH: legacy Electron install dir adopted: $INSTDIR"
      ${Else}
        DetailPrint "DSH: legacy install dir found but no marker, ignored: $DshLegacyDir"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; v0.5.1：PREINSTALL 置空（五轮修复后仍有用户卡死的教训——安装器
  ; 的唯一职责是装文件，清理逻辑交给应用运行时）。
  ; 旧版目录识别在 .onInit 阶段由 DSH_DETECT_LEGACY_INSTALLDIR 完成。
  DetailPrint "PREINSTALL: skip (Tauri template handles process check & location)"
!macroend
