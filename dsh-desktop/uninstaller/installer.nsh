; DSH Desktop custom NSIS hooks.
;
; Replaces the default Electron-builder NSIS uninstaller with our custom
; Uninstall_DSH_Desktop.exe (built by scripts/build-uninstaller.ps1):
;   1. extraResources ships the exe into resources/Uninstall_DSH_Desktop.exe
;   2. this install hook copies it to $INSTDIR\Uninstall_DSH_Desktop.exe
;   3. both normal and quiet Add/Remove Programs entries are repointed to it.
;
; The custom uninstaller performs generic registry scanning, process shutdown,
; shortcut removal and optional user-data retention.

!macro customInstall
  SetOutPath "$INSTDIR"
  CopyFiles /SILENT "$INSTDIR\resources\Uninstall_DSH_Desktop.exe" "$INSTDIR\Uninstall_DSH_Desktop.exe"
  Delete "$INSTDIR\resources\Uninstall_DSH_Desktop.exe"

  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "UninstallString" '"$INSTDIR\Uninstall_DSH_Desktop.exe"'
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall_DSH_Desktop.exe" /S'
!macroend