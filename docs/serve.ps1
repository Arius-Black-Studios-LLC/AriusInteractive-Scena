# Scena local preview server (magic links need http://, not file://)
param([int]$Port = 5500)

$Root = $PSScriptRoot
$Prefix = "http://127.0.0.1:$Port/"

$Mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".woff2" = "font/woff2"
}

# Mirror Netlify clean URLs for local preview
$Rewrites = @{
  "studio"              = "studio.html"
  "learn"               = "learn.html"
  "play"                = "play.html"
  "series"              = "series.html"
  "account"             = "account.html"
  "help"                = "help.html"
  "about"               = "about.html"
  "blog"                = "blog.html"
  "contact"             = "contact.html"
  "privacy"             = "privacy.html"
  "terms"               = "terms.html"
  "content-guidelines"  = "content-guidelines.html"
}

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add($Prefix)
$Listener.Start()

Write-Host ""
Write-Host "Arleco preview running" -ForegroundColor Green
Write-Host "  Home:     ${Prefix}"
Write-Host "  Studio:   ${Prefix}studio"
Write-Host "  Account:  ${Prefix}account"
Write-Host "  Deploy:   see docs/DOMAIN.md and docs/DEPLOY.md"
Write-Host ""
Write-Host "Press Ctrl+C to stop."
Write-Host ""

try {
  while ($Listener.IsListening) {
    $Context = $Listener.GetContext()
    $Request = $Context.Request
    $Response = $Context.Response

    $Relative = [Uri]::UnescapeDataString($Request.Url.LocalPath).TrimStart("/")
    if ([string]::IsNullOrWhiteSpace($Relative)) {
      $Relative = "index.html"
    } elseif ($Rewrites.ContainsKey($Relative)) {
      $Relative = $Rewrites[$Relative]
    }

    $File = Join-Path $Root ($Relative -replace "/", [IO.Path]::DirectorySeparatorChar)
    $File = [IO.Path]::GetFullPath($File)

    if (-not $File.StartsWith([IO.Path]::GetFullPath($Root), [StringComparison]::OrdinalIgnoreCase)) {
      $Response.StatusCode = 403
      $Bytes = [Text.Encoding]::UTF8.GetBytes("Forbidden")
      $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
      $Response.Close()
      continue
    }

    if (Test-Path $File -PathType Leaf) {
      $Ext = [IO.Path]::GetExtension($File).ToLowerInvariant()
      $Response.ContentType = if ($Mime.ContainsKey($Ext)) { $Mime[$Ext] } else { "application/octet-stream" }
      $Bytes = [IO.File]::ReadAllBytes($File)
      $Response.StatusCode = 200
      $Response.ContentLength64 = $Bytes.Length
      $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    } else {
      $Response.StatusCode = 404
      $Body = "Not found: $Relative"
      $Bytes = [Text.Encoding]::UTF8.GetBytes($Body)
      $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    }

    $Response.Close()
  }
} finally {
  $Listener.Stop()
}
