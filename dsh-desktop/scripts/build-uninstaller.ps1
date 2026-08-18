# Build the custom DSH Desktop uninstaller (C# / .NET Framework 4.x) and embed
# the DSH uninstaller icon. Produces dsh-desktop/build/Uninstall_DSH_Desktop.exe.
#
# The generated exe is consumed by electron-builder:
#   - extraResources copies it into resources/Uninstall_DSH_Desktop.exe
#   - uninstaller/installer.nsh copies it to $INSTDIR and repoints the Windows
#     "Add or Remove Programs" uninstall entry to use it instead of the default
#     NSIS-generated uninstaller.
#
# Usage (from dsh-desktop/): pwsh -File scripts/build-uninstaller.ps1

$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot
$unDir   = Join-Path $root 'uninstaller'
$outDir  = Join-Path $root 'build'
$src     = Join-Path $unDir 'DSH_Desktop_Uninstaller.cs'
$icon    = Join-Path $unDir 'Uninstall_DSH_Desktop_icon.ico'
$tmpOut  = Join-Path $outDir 'Uninstall_DSH_Desktop.new.exe'
$finalOut = Join-Path $outDir 'Uninstall_DSH_Desktop.exe'

if (-not (Test-Path -LiteralPath $src)) { throw "Missing source: $src" }
if (-not (Test-Path -LiteralPath $icon)) { throw "Missing icon: $icon" }

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Locate the .NET Framework 4.x C# compiler (x64 first, then x86).
$cscCandidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$csc = $cscCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $csc) { throw 'csc.exe (.NET Framework 4.x) not found' }
$fwDir = Split-Path -Parent $csc

$args = @(
    '/nologo',
    '/target:winexe',
    "/out:$tmpOut",
    "/r:$fwDir\System.Windows.Forms.dll",
    "/r:$fwDir\System.Drawing.dll",
    $src
)

Write-Host "Compiling: $csc" -ForegroundColor Cyan
& $csc @args
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }

Write-Host 'Embedding icon...' -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $unDir 'embed-icon-in-exe.ps1') -ExePath $tmpOut -IconPath $icon
if ($LASTEXITCODE -ne 0) {
    Remove-Item -LiteralPath $tmpOut -Force -ErrorAction SilentlyContinue
    throw "Icon embedding failed with exit code $LASTEXITCODE"
}

Move-Item -LiteralPath $tmpOut -Destination $finalOut -Force
Write-Host "Built: $finalOut" -ForegroundColor Green