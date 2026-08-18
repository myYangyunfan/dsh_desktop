param(
    [Parameter(Mandatory = $true)][string]$ExePath,
    [Parameter(Mandatory = $true)][string]$IconPath
)

# Embed an .ico file into an existing PE executable using UpdateResource.
# Only icon resources are added/replaced; all other executable data is preserved.

$ErrorActionPreference = 'Stop'

$icoBytes = [System.IO.File]::ReadAllBytes($IconPath)
if ($icoBytes.Length -lt 6) { throw "Not a valid ICO file: $IconPath" }

$count = [BitConverter]::ToUInt16($icoBytes, 4)
if ($count -eq 0 -or $count -gt 64) { throw "Unexpected icon count: $count" }

$entries = @()
for ($i = 0; $i -lt $count; $i++) {
    $off = 6 + $i * 16
    $width = $icoBytes[$off]
    $height = $icoBytes[$off + 1]
    $planes = [BitConverter]::ToUInt16($icoBytes, $off + 4)
    $bitCount = [BitConverter]::ToUInt16($icoBytes, $off + 6)
    $dataLen = [BitConverter]::ToUInt32($icoBytes, $off + 8)
    $dataOff = [BitConverter]::ToUInt32($icoBytes, $off + 12)
    if (($dataOff + $dataLen) -gt $icoBytes.Length) { throw "ICO image $i out of range" }
    $image = New-Object byte[] $dataLen
    [System.Array]::Copy($icoBytes, $dataOff, $image, 0, $dataLen)
    $entries += [pscustomobject]@{
        Width    = if ($width -eq 0) { 256 } else { $width }
        Height   = if ($height -eq 0) { 256 } else { $height }
        Planes   = $planes
        BitCount = $bitCount
        DataLen  = $dataLen
        Data     = $image
    }
}

# Build GRPICONDIR (RT_GROUP_ICON payload).
$grp = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($grp)
$bw.Write([uint16]0)          # reserved
$bw.Write([uint16]1)          # type: icon
$bw.Write([uint16]$count)     # count
for ($i = 0; $i -lt $count; $i++) {
    $e = $entries[$i]
    $bw.Write([byte]($(if ($e.Width -ge 256) { 0 } else { $e.Width })))
    $bw.Write([byte]($(if ($e.Height -ge 256) { 0 } else { $e.Height })))
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]$e.Planes)
    $bw.Write([uint16]$e.BitCount)
    $bw.Write([uint32]$e.DataLen)
    $bw.Write([uint16]($i + 1))  # RT_ICON resource id
}
$bw.Flush()
$groupData = $grp.ToArray()
$bw.Dispose()
$grp.Dispose()

$code = @"
using System;
using System.Runtime.InteropServices;
public static class IconResourceUpdater {
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern IntPtr BeginUpdateResource(string pFileName, bool bDeleteExistingResources);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool UpdateResource(IntPtr hUpdate, IntPtr lpType, IntPtr lpName, ushort wLanguage, byte[] lpData, uint cbData);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool EndUpdateResource(IntPtr hUpdate, bool fDiscard);
}
"@
Add-Type -TypeDefinition $code

$hUpdate = [IconResourceUpdater]::BeginUpdateResource($ExePath, $false)
if ($hUpdate -eq [IntPtr]::Zero) {
    throw "BeginUpdateResource failed for $ExePath (error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
}

try {
    # Add each RT_ICON image.
    for ($i = 0; $i -lt $entries.Count; $i++) {
        $ok = [IconResourceUpdater]::UpdateResource(
            $hUpdate,
            [IntPtr]3,              # RT_ICON
            [IntPtr]($i + 1),
            0,
            $entries[$i].Data,
            [uint32]$entries[$i].DataLen)
        if (-not $ok) {
            throw "UpdateResource RT_ICON #$($i+1) failed (error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
        }
    }

    # Add/replace RT_GROUP_ICON #1.
    $ok = [IconResourceUpdater]::UpdateResource(
        $hUpdate,
        [IntPtr]14,             # RT_GROUP_ICON
        [IntPtr]1,
        0,
        $groupData,
        [uint32]$groupData.Length)
    if (-not $ok) {
        throw "UpdateResource RT_GROUP_ICON failed (error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
    }

    if (-not [IconResourceUpdater]::EndUpdateResource($hUpdate, $false)) {
        throw "EndUpdateResource failed (error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
    }
    $hUpdate = [IntPtr]::Zero
}
finally {
    if ($hUpdate -ne [IntPtr]::Zero) {
        [IconResourceUpdater]::EndUpdateResource($hUpdate, $true) | Out-Null
    }
}

Write-Host "Embedded $count icon image(s) into $ExePath"
