param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [int]$GreenMin = 140
)

Add-Type -AssemblyName System.Drawing

function Test-GreenKey([byte]$r, [byte]$g, [byte]$b) {
  $rg = [int]$g - [int]$r
  $gb = [int]$g - [int]$b
  return ([int]$g -ge $GreenMin) -and ($rg -ge 35) -and ($gb -ge 35)
}

function Test-CreamKey([byte]$r, [byte]$g, [byte]$b) {
  return ([int]$r -ge 228) -and ([int]$g -ge 220) -and ([int]$b -ge 205) -and ([Math]::Abs([int]$r - [int]$g) -le 28)
}

$srcPath = (Resolve-Path $InputPath).Path
$src = [System.Drawing.Bitmap]::FromFile($srcPath)
$rect = New-Object System.Drawing.Rectangle 0, 0, $src.Width, $src.Height
$srcData = $src.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$out = New-Object System.Drawing.Bitmap($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$outData = $out.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

try {
  $bytes = New-Object byte[] ($srcData.Stride * $src.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($srcData.Scan0, $bytes, 0, $bytes.Length) | Out-Null
  $outBytes = New-Object byte[] $bytes.Length

  for ($i = 0; $i -lt $bytes.Length; $i += 4) {
    $b = $bytes[$i]
    $g = $bytes[$i + 1]
    $r = $bytes[$i + 2]

    if ((Test-GreenKey $r $g $b) -or (Test-CreamKey $r $g $b)) {
      $outBytes[$i] = 0
      $outBytes[$i + 1] = 0
      $outBytes[$i + 2] = 0
      $outBytes[$i + 3] = 0
    } else {
      $outBytes[$i] = $b
      $outBytes[$i + 1] = $g
      $outBytes[$i + 2] = $r
      $outBytes[$i + 3] = 255
    }
  }

  [System.Runtime.InteropServices.Marshal]::Copy($outBytes, 0, $outData.Scan0, $outBytes.Length) | Out-Null
}
finally {
  $src.UnlockBits($srcData) | Out-Null
  $out.UnlockBits($outData) | Out-Null
  $src.Dispose()
}

$dir = Split-Path $OutputPath -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$out.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$out.Dispose()
Write-Output "Wrote $OutputPath"
