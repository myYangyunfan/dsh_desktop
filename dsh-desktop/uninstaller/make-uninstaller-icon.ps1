param(
    [string]$SourcePng = "F:\DSH Desktop\resources\app\assets\icon.png",
    [string]$OutputIco = "Uninstall_DSH_Desktop_icon.ico",
    [string]$PreviewPng = "Uninstall_DSH_Desktop_icon_preview.png"
)

Add-Type -AssemblyName System.Drawing

function Convert-BitmapToIcoDib([System.Drawing.Bitmap]$bmp) {
    $w = $bmp.Width
    $h = $bmp.Height
    $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $stride = $data.Stride
        $raw = New-Object byte[] ($stride * $h)
        [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $raw, 0, $raw.Length)
    } finally {
        $bmp.UnlockBits($data)
    }

    # ICO DIB is bottom-up; GDI+ LockBits gives top-down rows here.
    $pixelBytes = New-Object byte[] ($w * $h * 4)
    for ($y = 0; $y -lt $h; $y++) {
        $srcRow = $y * $stride
        $dstRow = ($h - 1 - $y) * ($w * 4)
        [System.Array]::Copy($raw, $srcRow, $pixelBytes, $dstRow, $w * 4)
    }

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)
    # BITMAPINFOHEADER
    $bw.Write([int32]40)
    $bw.Write([int32]$w)
    $bw.Write([int32]($h * 2))
    $bw.Write([int16]1)
    $bw.Write([int16]32)
    $bw.Write([int32]0)
    $bw.Write([int32]($w * $h * 4))
    $bw.Write([int32]0)
    $bw.Write([int32]0)
    $bw.Write([int32]0)
    $bw.Write([int32]0)
    $bw.Write($pixelBytes)

    # AND mask (all zero; alpha channel supplies transparency)
    $maskRowBytes = [int]([Math]::Ceiling($w / 32.0) * 4)
    $mask = New-Object byte[] ($maskRowBytes * $h)
    $bw.Write($mask)

    $bw.Flush()
    return $ms.ToArray()
}

function New-MultiSizeIcon([System.Drawing.Bitmap]$source, [int[]]$sizes, [string]$outputPath) {
    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)

    $count = $sizes.Length
    $bw.Write([uint16]0)      # reserved
    $bw.Write([uint16]1)      # type: icon
    $bw.Write([uint16]$count) # image count

    $entries = New-Object System.Collections.Generic.List[object]
    $imageBlobs = New-Object System.Collections.Generic.List[byte[]]
    $offset = 6 + 16 * $count

    foreach ($s in $sizes) {
        $small = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($small)
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.DrawImage($source, 0, 0, $s, $s)
        $g.Dispose()

        $blob = Convert-BitmapToIcoDib $small
        $small.Dispose()

        $entryWidth = if ($s -ge 256) { 0 } else { $s }
        $entryHeight = if ($s -ge 256) { 0 } else { $s }

        $bw.Write([byte]$entryWidth)
        $bw.Write([byte]$entryHeight)
        $bw.Write([byte]0)
        $bw.Write([byte]0)
        $bw.Write([uint16]1)
        $bw.Write([uint16]32)
        $bw.Write([uint32]$blob.Length)
        $bw.Write([uint32]$offset)
        $offset += $blob.Length

        $imageBlobs.Add($blob)
    }

    foreach ($blob in $imageBlobs) {
        $bw.Write($blob)
    }

    $bw.Flush()
    [System.IO.File]::WriteAllBytes($outputPath, $ms.ToArray())
    $bw.Dispose()
    $ms.Dispose()
}

$src = [System.Drawing.Bitmap]::FromFile($SourcePng)
try {
    $size = 256
    $canvas = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # DSH icon scaled onto a 256x256 canvas.
    $g.DrawImage($src, 0, 0, $size, $size)

    # Red "x" overlay: white outline first for contrast, then red core.
    $white = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(230, 255, 255, 255), 30)
    $red = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(240, 220, 30, 30), 20)
    foreach ($pen in @($white, $red)) {
        $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    }

    $inset = 34
    $g.DrawLine($white, $inset, $inset, $size - $inset, $size - $inset)
    $g.DrawLine($white, $inset, $size - $inset, $size - $inset, $inset)
    $g.DrawLine($red, $inset, $inset, $size - $inset, $size - $inset)
    $g.DrawLine($red, $inset, $size - $inset, $size - $inset, $inset)

    $g.Dispose()
    $white.Dispose()
    $red.Dispose()

    if ($PreviewPng) {
        $canvas.Save($PreviewPng, [System.Drawing.Imaging.ImageFormat]::Png)
    }

    New-MultiSizeIcon -source $canvas -sizes @(16, 24, 32, 48, 64, 128, 256) -outputPath $OutputIco
    $canvas.Dispose()
}
finally {
    $src.Dispose()
}

Write-Host "Created $OutputIco"
