param(
  [string]$OutDir = (Join-Path $PSScriptRoot "..\assets\stages")
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
}

$w = 1920
$h = 1080

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# Background — flat theater wall + simple proscenium arch
$bg = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bg)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(255, 28, 32, 48))
$wall = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
  [System.Drawing.Point]::new(0, 0),
  [System.Drawing.Point]::new(0, $h),
  [System.Drawing.Color]::FromArgb(255, 36, 40, 58),
  [System.Drawing.Color]::FromArgb(255, 18, 20, 32)
)
$g.FillRectangle($wall, 0, 0, $w, $h)
$archPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 210, 180, 120)), 6
$g.DrawArc($archPen, 460, 40, 1000, 520, 180, 180)
$linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 255, 220, 160)), 2
$g.DrawLine($linePen, 120, 900, 1800, 900)
$g.Dispose()
Save-Png $bg (Join-Path $OutDir "stage-layer-bg.png")

# Middle — simple wooden stage floor
$mg = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($mg)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)
$floorPoints = @(
  [System.Drawing.Point]::new(0, 820),
  [System.Drawing.Point]::new($w, 820),
  [System.Drawing.Point]::new(1680, $h),
  [System.Drawing.Point]::new(240, $h)
)
$floorBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
  [System.Drawing.Point]::new(960, 820),
  [System.Drawing.Point]::new(960, $h),
  [System.Drawing.Color]::FromArgb(255, 92, 62, 38),
  [System.Drawing.Color]::FromArgb(255, 58, 38, 24)
)
$g.FillPolygon($floorBrush, $floorPoints)
$plankPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(80, 20, 12, 8)), 2
for ($x = 280; $x -le 1640; $x += 80) {
  $g.DrawLine($plankPen, $x, 860, ($x + 120), $h)
}
$g.Dispose()
Save-Png $mg (Join-Path $OutDir "stage-layer-mg.png")

# Foreground — side curtains with transparency
$fg = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($fg)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)
$leftPoints = @(
  [System.Drawing.Point]::new(0, 0),
  [System.Drawing.Point]::new(320, 0),
  [System.Drawing.Point]::new(420, $h),
  [System.Drawing.Point]::new(0, $h)
)
$rightPoints = @(
  [System.Drawing.Point]::new($w, 0),
  [System.Drawing.Point]::new(1600, 0),
  [System.Drawing.Point]::new(1500, $h),
  [System.Drawing.Point]::new($w, $h)
)
$curtain = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
  [System.Drawing.Point]::new(0, 0),
  [System.Drawing.Point]::new(0, $h),
  [System.Drawing.Color]::FromArgb(220, 120, 24, 32),
  [System.Drawing.Color]::FromArgb(220, 72, 12, 20)
)
$g.FillPolygon($curtain, $leftPoints)
$g.FillPolygon($curtain, $rightPoints)
$foldPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 40, 8, 12)), 3
for ($y = 40; $y -lt $h; $y += 70) {
  $g.DrawLine($foldPen, 40, $y, 300, ($y + 20))
  $g.DrawLine($foldPen, ($w - 40), $y, ($w - 300), ($y + 20))
}
$g.Dispose()
Save-Png $fg (Join-Path $OutDir "stage-layer-fg.png")

Write-Output "Wrote stage layers to $OutDir"
